import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { settleMachines } from '../src/electrical/circuit/machines';
import { benchSolver } from '../src/electrical/solvers/machine-dc';
import { RHEOSTATS, setSlider, SWITCH_CLOSED_OHMS } from '../src/equipment/machineLab';
import { stepContext } from '../src/experiments/context';
import { excitationMode, generatorOcc } from '../src/experiments/generator';
import { GENERATOR, risingOcc } from '../src/machines/dcGenerator';
import { parseBench } from '../src/persistence/bench';
import { setMeter, wire } from './helpers';

const base = () => generatorOcc.createBench();
/** Prime mover in star on R S T, breaker on. Options make the classic wiring mistakes. */
function run(
  b: Workbench,
  options: { swap?: boolean; delta?: boolean; missing?: 'T'; viaSwitch?: boolean } = {},
): Workbench {
  if (options.delta) {
    b = wire(b, 'mg.U1', 'mg.W2', 'm1');
    b = wire(b, 'mg.V1', 'mg.U2', 'm2');
    b = wire(b, 'mg.W1', 'mg.V2', 'm3');
  } else {
    b = wire(b, 'mg.W2', 'mg.U2', 'm1');
    b = wire(b, 'mg.U2', 'mg.V2', 'm2');
  }
  const feed: [string, string][] = [
    ['rst.R', 'mg.U1'],
    ['rst.S', options.swap ? 'mg.W1' : 'mg.V1'],
    ['rst.T', options.swap ? 'mg.V1' : 'mg.W1'],
  ];
  feed.forEach(([from, to], i) => {
    if (options.missing === 'T' && from === 'rst.T') return;
    if (options.viaSwitch) {
      b = wire(b, from, `sw.${2 * i + 1}`, `f${i}a`);
      b = wire(b, `sw.${2 * i + 2}`, to, `f${i}b`);
    } else b = wire(b, from, to, `f${i}`);
  });
  return { ...b, threePhase: { ...b.threePhase, rst: { on: true } } };
}
const closeSwitch = (b: Workbench): Workbench => ({
  ...b,
  components: b.components.map((c) =>
    c.id.startsWith('sw.pole') && c.kind === 'resistor'
      ? { ...c, resistanceOhms: SWITCH_CLOSED_OHMS }
      : c,
  ),
});
const consoleOn = (b: Workbench): Workbench => ({
  ...b,
  components: b.components.map((c) =>
    c.kind === 'dc-source' && c.id.startsWith('console.') ? { ...c, enabled: true } : c,
  ),
});
/** Puts the rheostat's A–C section at the given resistance. */
/** Sets a rheostat so that A–C is the given resistance (as on an ohmmeter). */
const slider = (b: Workbench, id: 'rf' | 'rl', ohms: number): Workbench => {
  const total = RHEOSTATS[id === 'rf' ? 'rheostat-field-v1' : 'rheostat-load-v1'].ohms;
  return setSlider(b, id, total, ohms / total);
};
const solved = (b: Workbench) => {
  const circuit = assembleCircuit(b);
  const result = benchSolver.solve(circuit, 0);
  return { result, ctx: stepContext(b, circuit, result), m: result.machines!.mg };
};
const armature = (b: Workbench) => {
  const { result, ctx } = solved(b);
  return (
    result.nodeVoltages[ctx.circuit.terminalToNode['mg.A1']] -
    result.nodeVoltages[ctx.circuit.terminalToNode['mg.A2']]
  );
};

/** Sheet 2 figure A: 220 V DC + → rheostat A–C → ammeter → F1, F2 → 220 V DC −; V across A1–A2. */
function separatelyExcited(rheostatOhms: number) {
  let b = consoleOn(run(base()));
  b = wire(b, 'console.P220', 'rf.A', 'l1');
  b = wire(b, 'rf.C', 'meter.20A', 'l2');
  b = wire(b, 'meter.COM', 'mg.F1', 'l3');
  b = wire(b, 'mg.F2', 'console.N220', 'l4', 'black');
  b = wire(b, 'mg.A1', 'meter2.V', 'l5');
  b = wire(b, 'mg.A2', 'meter2.COM', 'l6', 'black');
  return slider(b, 'rf', rheostatOhms);
}
/** Sheet 2 figure B: A1 → rheostat → ammeter → F1, F2 → A2. */
function selfExcited(rheostatOhms: number, reversed = false) {
  let b = run(base());
  b = wire(b, 'mg.A1', 'rf.A', 'l1');
  b = wire(b, 'rf.C', 'meter.20A', 'l2');
  b = wire(b, 'meter.COM', reversed ? 'mg.F2' : 'mg.F1', 'l3');
  b = wire(b, reversed ? 'mg.F1' : 'mg.F2', 'mg.A2', 'l4', 'black');
  b = wire(b, 'mg.A1', 'meter2.V', 'l5');
  b = wire(b, 'mg.A2', 'meter2.COM', 'l6', 'black');
  return slider(b, 'rf', rheostatOhms);
}

/** Turns the inverter's frequency until the set runs at the given speed, as a student would. */
export function setSpeed(b: Workbench, rpm: number): Workbench {
  let lo = 1,
    hi = 55,
    best = b;
  for (let i = 0; i < 30; i++) {
    const hz = (lo + hi) / 2;
    best = {
      ...b,
      threePhase: { ...b.threePhase, vfd: { on: true, hz: Math.round(hz * 100) / 100 } },
    };
    const now = solved(best).m.rpm;
    if (Math.abs(now - rpm) < 1) break;
    if (now < rpm) lo = hz;
    else hi = hz;
  }
  return best;
}

describe('generator bench', () => {
  it('persists, including the machine and supply state', () => {
    const b = run(base());
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('the set does not turn until the prime mover is wired to R S T and the breaker is on', () => {
    let b = base();
    b = wire(b, 'mg.A1', 'meter2.V', 'v1');
    b = wire(b, 'mg.A2', 'meter2.COM', 'v2', 'black');
    expect(solved(b).m.rpm).toBe(0);
    expect(solved({ ...b, threePhase: { rst: { on: true } } }).m.rpm).toBe(0);
    expect(solved(b).ctx.meter('meter2').value).toBe(0);
    const running = run(b);
    expect(solved({ ...running, threePhase: { rst: { on: false } } }).m.rpm).toBe(0);
    const { m, ctx } = solved(running);
    expect(m.motorStatus).toBe('running');
    expect(m.rpm).toBeGreaterThan(1450);
    expect(m.rpm).toBeLessThan(1500);
    m.windingVolts.forEach((v) => expect(v).toBeCloseTo(220, 0));
    // Residual voltage only, scaled by the actual speed.
    expect(ctx.meter('meter2').value).toBeCloseTo((GENERATOR.residualVolts * m.rpm) / 1400, 0);
  });

  it('through the load switch the motor runs only with the switch at I', () => {
    const open = run(base(), { viaSwitch: true });
    expect(solved(open).m.rpm).toBe(0);
    expect(solved(closeSwitch(open)).m.rpm).toBeGreaterThan(1450);
  });

  it('swapping two phases turns the set backwards and reverses the EMF', () => {
    const forward = armature(separatelyExcited(190));
    let b = consoleOn(run(base(), { swap: true }));
    b = wire(b, 'console.P220', 'rf.A', 'l1');
    b = wire(b, 'rf.C', 'meter.20A', 'l2');
    b = wire(b, 'meter.COM', 'mg.F1', 'l3');
    b = wire(b, 'mg.F2', 'console.N220', 'l4');
    b = slider(b, 'rf', 190);
    const { m } = solved(b);
    expect(m.rpm).toBeLessThan(-1450);
    expect(armature(b)).toBeCloseTo(-forward, 0);
  });

  it('delta on the 380 V supply overvolts the windings and is flagged', () => {
    const { m, result } = solved(run(base(), { delta: true }));
    m.windingVolts.forEach((v) => expect(v).toBeCloseTo(220 * Math.sqrt(3), 0));
    expect(result.diagnostics.some((d) => d.code === 'machine' && /star/.test(d.message))).toBe(
      true,
    );
  });

  it('a missing phase: the motor hums, does not start, and the breaker trips', () => {
    const b = run(base(), { missing: 'T' });
    expect(solved(b).m.motorStatus).toBe('humming');
    const settled = settleMachines(b);
    expect(settled.threePhase!.rst.on).toBe(false);
    expect(settled.threePhase!.rst.trip).toMatch(/single phasing/);
  });

  it('a lead between R and S trips the breaker', () => {
    const b = wire(run(base()), 'rst.R', 'rst.S', 'x1');
    const settled = settleMachines(b);
    expect(settled.threePhase!.rst).toEqual({ on: false, trip: 'Short circuit between R and S' });
    expect(solved(settled).m.rpm).toBe(0);
  });

  it('separately excited: If and Eo follow the wiring and the open-circuit curve', () => {
    // 220 V across 250 Ω field + 190 Ω of rheostat (+ meter shunt) ≈ 0.5 A.
    const b = separatelyExcited(190);
    const { ctx, m } = solved(b);
    expect(excitationMode(ctx)).toBe('separate');
    expect(ctx.meter('meter').value).toBeCloseTo(0.5, 2);
    expect(armature(b)).toBeCloseTo((risingOcc(m.shuntAmps) * m.rpm) / GENERATOR.ratedRpm, 1);
    expect(m.converged).toBe(true);
  });

  it('a rheostat wired across both ends (A–B) does not respond to its slider', () => {
    let b = consoleOn(run(base()));
    b = wire(b, 'console.P220', 'rf.A', 'l1');
    b = wire(b, 'rf.B', 'meter.20A', 'l2');
    b = wire(b, 'meter.COM', 'mg.F1', 'l3');
    b = wire(b, 'mg.F2', 'console.N220', 'l4');
    const at = (ohms: number) => solved(slider(b, 'rf', ohms)).m.shuntAmps;
    expect(at(100)).toBeCloseTo(at(1500), 6);
  });

  it('Eo is proportional to speed at constant field current (sheet 3)', () => {
    const b = separatelyExcited(190);
    const { m } = solved(b);
    expect(armature(b) / risingOcc(m.shuntAmps)).toBeCloseTo(m.rpm / GENERATOR.ratedRpm, 3);
  });

  it('self-excited: builds up below the critical resistance, not above it', () => {
    const built = selfExcited(150);
    const { ctx, m } = solved(built);
    expect(excitationMode(ctx)).toBe('self');
    expect(armature(built)).toBeGreaterThan(200);
    expect(m.shuntAmps).toBeGreaterThan(0.4);
    // Critical resistance ≈ initial slope of the curve, Es / k ≈ 790 Ω at 1400 rpm.
    expect(armature(selfExcited(1500))).toBeLessThan(25);
  });

  it('self-excited: a reversed field cancels the residual flux and cannot build up', () => {
    expect(Math.abs(armature(selfExcited(150, true)))).toBeLessThan(GENERATOR.residualVolts);
  });

  it('the falling magnetization curve lies above the rising one (sheet 2, table 2)', () => {
    const rising = armature(separatelyExcited(480)); // ≈ 0.3 A on the way up
    // Go up to 0.6 A, let the iron remember it, then come back to the same rheostat setting.
    const peak = settleMachines(separatelyExcited(110));
    expect(peak.machines!.mg.peakFieldAmps).toBeGreaterThan(0.59);
    const falling = armature(slider(peak, 'rf', 480));
    expect(falling).toBeGreaterThan(rising + 3);
  });

  it('on load the terminal voltage falls by Ia·Ra plus armature reaction, and the speed droops', () => {
    let b = separatelyExcited(190);
    // Switch pole 1–2 and the load rheostat across the armature, load ammeter in series.
    b = wire(b, 'mg.A1', 'sw.1', 'k1');
    b = wire(b, 'sw.2', 'meter3.20A', 'k2');
    b = wire(b, 'meter3.COM', 'rl.A', 'k3');
    b = wire(b, 'rl.C', 'mg.A2', 'k4', 'black');
    b = slider(b, 'rl', 80);
    const open = armature(b);
    const closed = {
      ...b,
      components: b.components.map((c) =>
        c.id === 'sw.pole1' && c.kind === 'resistor'
          ? { ...c, resistanceOhms: SWITCH_CLOSED_OHMS }
          : c,
      ),
    };
    const { m, ctx } = solved(closed);
    const vl = armature(closed);
    expect(ctx.meter('meter3').value).toBeGreaterThan(2);
    expect(m.armatureAmps).toBeCloseTo(ctx.meter('meter3').value!, 2);
    expect(vl).toBeCloseTo(m.emfVolts - m.armatureAmps * GENERATOR.armatureOhms, 1);
    expect(vl).toBeLessThan(open - 10);
    expect(m.rpm).toBeLessThan(solved(b).m.rpm - 20);
  });

  it('a short across the armature is limited by Ra, not reported as an ideal short', () => {
    let b = separatelyExcited(190);
    b = wire(b, 'mg.A1', 'mg.A2', 's1');
    const { m, result } = solved(b);
    expect(Math.abs(m.armatureAmps)).toBeGreaterThan(10);
    expect(result.diagnostics.some((d) => d.code === 'short-circuit')).toBe(false);
  });

  it('an unwired generator raises no warnings', () => {
    const { result } = solved(base());
    // (Unwired multimeters report "floating", as on every bench.)
    expect(result.diagnostics.filter((d) => d.code !== 'floating-meter')).toEqual([]);
  });

  describe('the multimeters on this bench', () => {
    const meter = (b: Workbench, id = 'meter2') => solved(b).ctx.meter(id);
    const across = (b: Workbench, a: string, c: string, rangeId: string) =>
      setMeter(
        wire(wire(b, a, 'meter2.V', 'p1'), c, 'meter2.COM', 'p2', 'black'),
        { rangeId },
        'meter2',
      );

    it('DC V: the console’s 220 V, 110 V and knob outputs', () => {
      const b = consoleOn(base());
      expect(meter(across(b, 'console.P220', 'console.N220', 'dc-1000')).value).toBeCloseTo(220, 0);
      expect(meter(across(b, 'console.P110', 'console.N110', 'dc-1000')).value).toBeCloseTo(110, 0);
      const knob = {
        ...b,
        components: b.components.map((c) =>
          c.id === 'console.var' && c.kind === 'dc-source' ? { ...c, voltageVolts: 150 } : c,
        ),
      };
      expect(meter(across(knob, 'console.VP', 'console.VN', 'dc-1000')).value).toBeCloseTo(150, 0);
      // Leads reversed: the meter shows the minus sign, as the real one does.
      expect(meter(across(b, 'console.N220', 'console.P220', 'dc-1000')).value).toBeCloseTo(
        -220,
        0,
      );
    });

    it('AC V: 380 V between R S T, 220 V to N, 0 with the breaker off', () => {
      const b = { ...base(), threePhase: { rst: { on: true } } };
      expect(meter(across(b, 'rst.R', 'rst.S', 'acv-700')).value).toBeCloseTo(380, -1);
      expect(meter(across(b, 'rst.T', 'rst.N', 'acv-700')).value).toBeCloseTo(220, 0);
      const off = { ...b, threePhase: { rst: { on: false } } };
      expect(meter(across(off, 'rst.R', 'rst.S', 'acv-700')).value).toBe(0);
    });

    it('AC V: each prime-mover winding in star sees 220 V', () => {
      expect(meter(across(run(base()), 'mg.U1', 'mg.U2', 'acv-700')).value).toBeCloseTo(220, 0);
    });

    it('AC A: an ammeter in a motor line reads the line current', () => {
      // R → 20A, COM → U1 instead of R → U1 directly.
      let b = run(base());
      b = {
        ...b,
        cables: b.cables.filter((c) => c.id !== 'f0'),
        plugs: b.plugs.filter((p) => p.cableId !== 'f0'),
      };
      b = wire(wire(b, 'rst.R', 'meter3.20A', 'a1'), 'meter3.COM', 'mg.U1', 'a2');
      b = setMeter(b, { rangeId: 'aca-20' }, 'meter3');
      const { m } = solved(b);
      expect(m.motorStatus).toBe('running');
      const amps = meter(b, 'meter3').value!;
      expect(amps).toBeGreaterThan(0.5);
      expect(amps).toBeCloseTo(m.motorAmps, 1);
    });

    it('Ω: windings and fields with everything off', () => {
      expect(meter(across(base(), 'mg.U1', 'mg.U2', 'ohm-200')).value).toBeCloseTo(7, 0);
      expect(meter(across(base(), 'mg.F1', 'mg.F2', 'ohm-2k')).value).toBeCloseTo(250, 0);
      expect(meter(across(base(), 'mg.A1', 'mg.A2', 'ohm-200')).value).toBeCloseTo(4, 0);
    });
  });

  describe('presets: the sheet’s figure (1), wired', () => {
    const preset = (id: string) => generatorOcc.presets!.find((p) => p.id === id)!.build();
    const supplies = (b: Workbench) =>
      setSpeed({ ...consoleOn(b), threePhase: { ...b.threePhase, rst: { on: true } } }, 1400);

    it('both presets load, persist, and leave every supply off', () => {
      for (const id of ['part-a', 'part-b']) {
        const b = preset(id);
        expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
        expect(b.threePhase!.rst.on).toBe(false);
        expect(b.components.some((c) => c.kind === 'dc-source' && c.enabled)).toBe(false);
        expect(solved(b).m.rpm).toBe(0);
      }
    });

    it('Part A: separately excited, the guide’s wiring steps pass', () => {
      const b = slider(supplies(preset('part-a')), 'rf', 190);
      const { ctx, m } = solved(b);
      expect(excitationMode(ctx)).toBe('separate');
      expect(ctx.meter('meter').value).toBeCloseTo(0.5, 2);
      expect(armature(b)).toBeCloseTo(risingOcc(0.5), -1);
      expect(m.motorStatus).toBe('running');
      const passed = generatorOcc.steps.slice(0, 3).map((s) => s.check(ctx));
      expect(passed).toEqual([true, true, true]);
    });

    it('Part B: self-excited through the switch, builds up only with the switch closed', () => {
      const open = slider(supplies(preset('part-b')), 'rf', 150);
      expect(armature(open)).toBeLessThan(15);
      const closed = closeSwitch(open);
      const { ctx } = solved(closed);
      expect(excitationMode(ctx)).toBe('self');
      expect(armature(closed)).toBeGreaterThan(200);
      expect(generatorOcc.steps.at(-1)!.check(ctx)).toBe(true);
    });
  });
});
