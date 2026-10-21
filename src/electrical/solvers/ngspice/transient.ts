import type {
  Component,
  Diagnostic,
  ElectricalCircuit,
  MeasurementResult,
  SimulationResult,
  WaveStats,
} from '../../../domain/models';
import { componentPins, isActive } from '../../../domain/models';
import { DisjointSet } from '../../connectivity/buildCircuit';

/**
 * Pure translation between the solver-neutral circuit and an ngspice transient run.
 * `planTransient` writes the netlist; `interpretTransient` turns ngspice vectors back into a
 * SimulationResult. Neither touches the engine, so both run in tests and in the worker.
 */

/** Series resistance of a bench DC supply's current limiter (keeps CV within 1 mV). */
const SUPPLY_LIMITER_OHMS = 0.01;
/** Assumed rating of each 12 V transformer winding, for overload diagnostics. */
export const WINDING_RATING_AMPS = 2;
const MODELS: Record<string, string> = {
  '1N4007':
    '.model D1N4007 D(IS=7.02767n RS=0.0341512 N=1.80803 EG=1.05743 XTI=5 BV=1000 IBV=0.1 CJO=1e-11 VJ=0.7 M=0.5 FC=0.5 TT=1e-7)',
  'ZENER-5V1': '.model DZ5V1 D(IS=1e-14 N=1 RS=5 BV=5.1 IBV=5m CJO=100p)',
  BC547B:
    '.model BC547B NPN(IS=2.39E-14 NF=1.008 ISE=3.545E-15 NE=1.541 BF=294.3 IKF=0.1357 VAF=63.2 NR=1.004 ISC=6.272E-14 NC=1.243 BR=7.946 IKR=0.1144 VAR=25.9 RB=1 IRB=1.00E-06 RBM=1 RE=0.4683 RC=0.85 XTB=0 EG=1.11 XTI=3 CJE=1.358E-11 VJE=0.65 MJE=0.3279 TF=4.391E-10 XTF=120 VTF=2.643 ITF=0.7495 PTF=0 CJC=3.728E-12 VJC=0.3997 MJC=0.2955 XCJC=0.6193 TR=1.00E-32 CJS=0 VJS=0.75 MJS=0.333 FC=0.9579)',
};
const SPICE_MODEL_NAME: Record<string, string> = {
  '1N4007': 'D1N4007',
  'ZENER-5V1': 'DZ5V1',
  BC547B: 'BC547B',
};

export interface TransientPlan {
  netlist: string;
  /** Net ID → ngspice node name. */
  nodeNames: Map<string, string>;
  /** Component ID → ngspice vector holding the current into its first pin (sources only). */
  currentVectors: Map<string, string>;
  /** Inductor ID → internal node between the inductance and its winding resistance. */
  inductorNodes: Map<string, { node: string; ohms: number }>;
  settleSeconds: number;
  windowSeconds: number;
  stepSeconds: number;
  /** Diagnostics known before simulation (shorts, invalid values). */
  diagnostics: Diagnostic[];
  /** Domains that cannot be simulated; their measurements are faults. */
  faultedDomains: Set<string>;
  domains: DisjointSet;
  external: DisjointSet;
  /** False when nothing active remains to simulate. */
  runnable: boolean;
}

const fmt = (n: number) => Number(n.toPrecision(8)).toString();
const isInstrument = (c: Component) => c.origin === 'instrument';
const energized = (c: Component) =>
  (c.kind === 'dc-source' && c.enabled && c.voltageVolts !== 0) ||
  (c.kind === 'ac-source' && c.enabled && c.rmsVolts !== 0);

/** Circuits with anything beyond resistors and DC sources need a transient analysis. */
export function needsTransient(circuit: ElectricalCircuit) {
  return circuit.components.some(
    (c) => c.kind !== 'resistor' && c.kind !== 'dc-source' && isActive(c),
  );
}

export function planTransient(circuit: ElectricalCircuit): TransientPlan {
  const net = (terminal: string) => circuit.terminalToNode[terminal];
  const active = circuit.components.filter(isActive);
  const diagnostics: Diagnostic[] = [];
  const domains = new DisjointSet();
  const external = new DisjointSet();
  for (const c of active) {
    const [first, ...rest] = componentPins(c).map(net);
    domains.find(first);
    external.find(first);
    rest.forEach((n) => {
      domains.union(first, n);
      if (!isInstrument(c)) external.union(first, n);
    });
  }
  const faultedDomains = new Set<string>();
  const skip = new Set<string>();
  for (const c of active) {
    const invalid =
      (c.kind === 'resistor' && !(c.resistanceOhms >= 0 && Number.isFinite(c.resistanceOhms))) ||
      (c.kind === 'capacitor' && !(c.capacitanceFarads >= 0)) ||
      (c.kind === 'inductor' && !(c.inductanceHenries >= 0 && c.seriesOhms >= 0)) ||
      (c.kind === 'dc-source' && !Number.isFinite(c.voltageVolts)) ||
      (c.kind === 'ac-source' && !(c.rmsVolts >= 0 && c.frequencyHz > 0));
    if (invalid) {
      faultedDomains.add(domains.find(net(componentPins(c)[0])));
      diagnostics.push({
        code: 'invalid-parameter',
        severity: 'error',
        message: 'A component has an invalid electrical value.',
        terminalIds: [],
      });
    }
    const [p, n] = componentPins(c);
    const shorted =
      (c.kind === 'dc-source' || c.kind === 'ac-source') && energized(c) && net(p) === net(n);
    if (!shorted) continue;
    if (c.kind === 'dc-source' && c.currentLimitAmps !== undefined) {
      diagnostics.push({
        code: 'short-circuit',
        severity: 'fault',
        message: `Supply output is shorted. The supply is holding its current limit at 0 V. Remove the shorting lead.`,
        terminalIds: [p, n],
      });
      // Its current is known (the limit) and it adds nothing to the node equations.
      skip.add(c.id);
      continue;
    }
    skip.add(c.id);
    faultedDomains.add(domains.find(net(p)));
    diagnostics.push({
      code: 'short-circuit',
      severity: 'fault',
      message:
        c.kind === 'ac-source'
          ? 'A transformer winding is shorted by a lead. On the real bench this blows the supply fuse. Remove the shorting lead.'
          : 'Supply output is shorted. This ideal source has no finite current solution. Remove the shorting lead.',
      terminalIds: [p, n],
    });
  }

  // Only parts coupled to a powered source are simulated. Everything else sits at 0 V, which
  // also keeps unwired boards (a diode between two empty sockets) out of the equations.
  const live = new Set(
    active
      .filter((c) => energized(c) && !skip.has(c.id))
      .map((c) => domains.find(net(componentPins(c)[0]))),
  );
  const simulated = active.filter((c) => {
    const domain = domains.find(net(componentPins(c)[0]));
    return !skip.has(c.id) && !faultedDomains.has(domain) && live.has(domain);
  });
  // Name nets. Protective earth becomes ngspice ground; otherwise any simulated net does.
  const nets = [...new Set(simulated.flatMap((c) => componentPins(c).map(net)))];
  const earthNet = nets.find((n) => n === circuit.earthNodeId);
  const nodeNames = new Map<string, string>();
  const ground = earthNet ?? nets[0];
  nets.forEach((n, i) => nodeNames.set(n, n === ground ? '0' : `n${i + 1}`));
  const node = (terminal: string) => nodeNames.get(net(terminal))!;

  const lines: string[] = ['* EPU Lab bench'];
  const usedModels = new Set<string>();
  const currentVectors = new Map<string, string>();
  const inductorNodes = new Map<string, { node: string; ohms: number }>();
  const saves = new Set<string>();
  simulated.forEach((c, i) => {
    const k = i + 1;
    switch (c.kind) {
      case 'resistor':
        // A decade box set to 0 Ω is a contact resistance, not an ideal short.
        lines.push(`R${k} ${node(c.a)} ${node(c.b)} ${fmt(Math.max(c.resistanceOhms, 1e-3))}`);
        break;
      case 'capacitor':
        // A capacitor box set to 0 F is open.
        if (c.capacitanceFarads > 0)
          lines.push(`C${k} ${node(c.a)} ${node(c.b)} ${fmt(c.capacitanceFarads)}`);
        break;
      case 'inductor': {
        const ohms = Math.max(c.seriesOhms, 1e-3);
        lines.push(
          `L${k} ${node(c.a)} l${k} ${fmt(Math.max(c.inductanceHenries, 1e-9))}`,
          `R${k}w l${k} ${node(c.b)} ${fmt(ohms)}`,
        );
        inductorNodes.set(c.id, { node: `l${k}`, ohms });
        saves.add(`v(l${k})`);
        break;
      }
      case 'diode':
        usedModels.add(c.model);
        lines.push(`D${k} ${node(c.anode)} ${node(c.cathode)} ${SPICE_MODEL_NAME[c.model]}`);
        break;
      case 'npn':
        usedModels.add(c.model);
        lines.push(
          `Q${k} ${node(c.collector)} ${node(c.base)} ${node(c.emitter)} ${SPICE_MODEL_NAME[c.model]}`,
        );
        break;
      case 'ac-source': {
        const peak = c.rmsVolts * Math.SQRT2;
        lines.push(
          `V${k} ${node(c.a)} w${k} SIN(0 ${fmt(peak)} ${fmt(c.frequencyHz)} 0 0 ${fmt(c.phaseDegrees)})`,
          `R${k}w w${k} ${node(c.b)} ${fmt(c.seriesOhms)}`,
        );
        currentVectors.set(c.id, `i(v${k})`);
        break;
      }
      case 'dc-source': {
        const p = node(c.positive),
          n = node(c.negative);
        if (c.currentLimitAmps === undefined) {
          lines.push(`V${k} ${p} ${n} DC ${fmt(c.voltageVolts)}`);
        } else {
          // CV/CC supply: a smooth current clamp. Near CV it behaves as V behind 10 mΩ;
          // beyond the limit it delivers the limit. A 0 V sense source measures its current.
          const limit = c.currentLimitAmps;
          lines.push(
            `V${k} ${p} s${k} DC 0`,
            `B${k} ${n} s${k} I=${fmt(limit)}*tanh((${fmt(c.voltageVolts)}-V(${p},${n}))/${fmt(SUPPLY_LIMITER_OHMS * limit)})`,
            // Output bleeder inside the supply, ahead of the current sense, as in real units.
            `R${k}b s${k} ${n} 10k`,
          );
        }
        currentVectors.set(c.id, `i(v${k})`);
        break;
      }
    }
  });
  // A tiny leak from every node keeps nodes behind capacitors or reverse diodes defined.
  nodeNames.forEach((name) => {
    if (name === '0') return;
    saves.add(`v(${name})`);
    lines.push(`Rleak_${name} ${name} 0 1e12`);
  });
  currentVectors.forEach((v) => saves.add(v));

  // Timing: AC benches settle for several periods, then record ten; DC benches settle their RC.
  const frequencies = simulated.flatMap((c) => (c.kind === 'ac-source' ? [c.frequencyHz] : []));
  const period = frequencies.length ? 1 / Math.max(...frequencies) : 0.02;
  const capacitance = Math.max(
    0,
    ...simulated.flatMap((c) => (c.kind === 'capacitor' ? [c.capacitanceFarads] : [])),
  );
  const resistance = Math.max(
    1000,
    ...simulated.flatMap((c) =>
      c.kind === 'resistor' && !c.measurementInput && !isInstrument(c) ? [c.resistanceOhms] : [],
    ),
  );
  // L/R time constants settle through the winding and circuit resistance.
  const lOverR = Math.max(
    0,
    ...simulated.flatMap((c) =>
      c.kind === 'inductor' ? [c.inductanceHenries / Math.max(1, c.seriesOhms)] : [],
    ),
  );
  const settleSeconds = Math.min(
    1.5,
    Math.max(frequencies.length ? 5 * period : 0.005, 3 * capacitance * resistance, 3 * lOverR),
  );
  const windowSeconds = frequencies.length ? 10 * period : 0.02;
  const stepSeconds = period / 400;
  usedModels.forEach((m) => lines.push(MODELS[m]));
  lines.push(
    '.options method=gear interp',
    `.save ${[...saves].join(' ')}`,
    `.tran ${fmt(stepSeconds)} ${fmt(settleSeconds + windowSeconds)} ${fmt(settleSeconds)} ${fmt(stepSeconds)}`,
    '.end',
  );
  return {
    netlist: lines.join('\n'),
    nodeNames,
    currentVectors,
    inductorNodes,
    settleSeconds,
    windowSeconds,
    stepSeconds,
    diagnostics,
    faultedDomains,
    domains,
    external,
    runnable: simulated.length > 0 && saves.size > 0,
  };
}

export interface EngineOutput {
  variableNames: string[];
  data: number[][];
}

export function waveStats(values: number[]): WaveStats {
  if (!values.length) return { mean: 0, rms: 0, acMeanAbs: 0, min: 0, max: 0 };
  let sum = 0,
    squares = 0,
    min = Infinity,
    max = -Infinity;
  for (const v of values) {
    sum += v;
    squares += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / values.length;
  let deviation = 0;
  for (const v of values) deviation += Math.abs(v - mean);
  return {
    mean,
    rms: Math.sqrt(squares / values.length),
    acMeanAbs: deviation / values.length,
    min,
    max,
  };
}

export function interpretTransient(
  circuit: ElectricalCircuit,
  plan: TransientPlan,
  output: EngineOutput | null,
  revision: number,
): SimulationResult {
  const result: SimulationResult = {
    revision,
    nodeVoltages: {},
    componentCurrents: {},
    sourceModes: {},
    measurements: {},
    diagnostics: [...plan.diagnostics],
    analysis: 'transient',
    waveforms: { time: [], nodes: {}, currents: {} },
    rmsCurrents: {},
  };
  const waves = result.waveforms!;
  const net = (terminal: string) => circuit.terminalToNode[terminal];
  const vector = (name: string) => {
    const i = output?.variableNames.indexOf(name) ?? -1;
    return i >= 0 ? output!.data[i] : undefined;
  };
  const time = vector('time') ?? [];
  // Drop the settling interval that `interp` can leave at the start of the window.
  const first = time.findIndex((t) => t >= plan.settleSeconds - plan.stepSeconds / 2);
  const start = first < 0 ? 0 : first;
  waves.time = time.slice(start).map((t) => t - plan.settleSeconds);
  const samples = waves.time.length;
  const zeros = () => new Array<number>(samples).fill(0);
  plan.nodeNames.forEach((name, netId) => {
    const values = name === '0' ? zeros() : (vector(`v(${name})`)?.slice(start) ?? zeros());
    waves.nodes[netId] = values;
    result.nodeVoltages[netId] = waveStats(values).mean;
  });
  const nodeWave = (terminal: string) => waves.nodes[net(terminal)];
  const setCurrent = (id: string, values: number[]) => {
    waves.currents[id] = values;
    const stats = waveStats(values);
    result.componentCurrents[id] = stats.mean;
    result.rmsCurrents![id] = stats.rms;
  };
  for (const c of circuit.components) {
    if (!isActive(c)) {
      if (c.kind === 'dc-source' || c.kind === 'ac-source') {
        result.componentCurrents[c.id] = 0;
        result.sourceModes[c.id] = 'off';
      }
      continue;
    }
    if (c.kind === 'resistor') {
      const a = nodeWave(c.a),
        b = nodeWave(c.b);
      const ohms = Math.max(c.resistanceOhms, 1e-3);
      if (a && b)
        setCurrent(
          c.id,
          a.map((v, i) => (v - b[i]) / ohms),
        );
    } else if (c.kind === 'inductor') {
      const inner = plan.inductorNodes.get(c.id);
      const m = inner ? vector(`v(${inner.node})`)?.slice(start) : undefined;
      const b = nodeWave(c.b);
      if (inner && m && b)
        setCurrent(
          c.id,
          m.map((v, i) => (v - b[i]) / inner.ohms),
        );
    } else if (c.kind === 'dc-source' || c.kind === 'ac-source') {
      const v = plan.currentVectors.get(c.id);
      const values = v ? vector(v)?.slice(start) : undefined;
      const shortedLimited =
        c.kind === 'dc-source' &&
        c.currentLimitAmps !== undefined &&
        net(c.positive) === net(c.negative) &&
        energized(c);
      if (shortedLimited) {
        setCurrent(c.id, new Array(samples).fill(-Math.sign(c.voltageVolts) * c.currentLimitAmps!));
        result.sourceModes[c.id] = 'CC';
        continue;
      }
      if (!values) continue;
      setCurrent(c.id, values);
      result.sourceModes[c.id] = 'CV';
      if (c.kind === 'dc-source' && c.currentLimitAmps !== undefined) {
        const peak = Math.max(...values.map(Math.abs));
        if (peak >= 0.98 * c.currentLimitAmps) {
          result.sourceModes[c.id] = 'CC';
          if (!isInstrument(c))
            result.diagnostics.push({
              code: 'current-limit',
              severity: 'warning',
              message: `The supply reached its ${c.currentLimitAmps.toFixed(2)} A current limit (CC). Its output voltage dropped below the setting.`,
              terminalIds: [c.positive, c.negative],
            });
        }
      }
      if (c.kind === 'ac-source' && result.rmsCurrents![c.id] > WINDING_RATING_AMPS)
        result.diagnostics.push({
          code: 'overcurrent',
          severity: 'fault',
          message: `A transformer winding is carrying ${result.rmsCurrents![c.id].toFixed(1)} A RMS, far above its rating. Look for a short, such as two oscilloscope grounds on different points.`,
          terminalIds: [c.a, c.b],
        });
    }
  }
  const domainOf = (terminal: string) => plan.domains.find(net(terminal));
  // An ohmmeter's own test source shares a circuit with an energized source.
  for (const c of circuit.components) {
    if (!isInstrument(c) || c.kind !== 'dc-source') continue;
    const domain = domainOf(c.negative);
    const live = circuit.components.some(
      (o) => !isInstrument(o) && energized(o) && domainOf(componentPins(o)[0]) === domain,
    );
    if (live)
      result.diagnostics.push({
        code: 'ohmmeter-energized',
        severity: 'warning',
        message:
          'The ohmmeter is connected to a powered circuit. Resistance readings are only valid with the supply off, and a real meter can be damaged.',
        terminalIds: [c.positive, c.negative],
      });
  }
  const failed = output === null && plan.runnable;
  if (failed)
    result.diagnostics.push({
      code: 'solver-error',
      severity: 'error',
      message:
        'The simulator could not find a solution for this circuit. Check for conflicting sources.',
      terminalIds: [],
    });
  for (const m of circuit.measurements) {
    const terminals = m.kind === 'voltage' ? [m.positiveTerminalId, m.negativeTerminalId] : [];
    if (m.kind === 'current') {
      const c = circuit.components.find((x) => x.id === m.componentId);
      if (c) terminals.push(componentPins(c)[0]);
    }
    const faulted = terminals.some((t) => plan.faultedDomains.has(domainOf(t)));
    const measurement = (values: number[] | undefined): MeasurementResult => {
      if (faulted) return { value: null, status: 'fault' };
      if (failed) return { value: null, status: 'error' };
      const stats = waveStats(values ?? []);
      return { value: Math.abs(stats.mean) < 1e-10 ? 0 : stats.mean, status: 'valid', stats };
    };
    if (m.kind === 'current') {
      result.measurements[m.id] = measurement(waves.currents[m.componentId] ?? zeros());
      continue;
    }
    const a = net(m.positiveTerminalId),
      b = net(m.negativeTerminalId);
    const floating =
      a !== b &&
      (plan.domains.find(a) !== plan.domains.find(b) ||
        (m.requireExternalReference && plan.external.find(a) !== plan.external.find(b)));
    if (floating && !faulted) {
      result.measurements[m.id] = { value: null, status: 'floating' };
      result.diagnostics.push({
        code: 'floating-meter',
        severity: 'warning',
        message:
          'Meter leads do not share an electrical reference. Connect V and COM across the part you are measuring.',
        terminalIds: [m.positiveTerminalId, m.negativeTerminalId],
      });
      continue;
    }
    const va = waves.nodes[a] ?? zeros(),
      vb = waves.nodes[b] ?? zeros();
    result.measurements[m.id] = measurement(a === b ? zeros() : va.map((v, i) => v - vb[i]));
  }
  return result;
}
