import type { ElectricalCircuit, Equipment, SimulationResult } from '../domain/models';
import { componentPins, isActive } from '../domain/models';
import { DisjointSet } from '../electrical/connectivity/buildCircuit';
import type { InstrumentModel } from './multimeter';

/**
 * UNI-T UTD2052CL. Each channel is 1 MΩ from its input to its ground, and every channel
 * ground is bonded to protective earth through the mains lead. Clipping two grounds onto
 * different points of a circuit therefore shorts those points together, as on the real bench.
 */
export const SCOPE_INPUT_OHMS = 1e6;
export type Coupling = 'DC' | 'AC' | 'GND';
export interface ChannelSettings {
  on: boolean;
  voltsPerDiv: number;
  /** Trace position in divisions from the centre line. */
  position: number;
  coupling: Coupling;
}
export interface ScopeSettings {
  ch1: ChannelSettings;
  ch2: ChannelSettings;
  secondsPerDiv: number;
  trigger: { source: 'ch1' | 'ch2'; level: number };
  running: boolean;
  measure: boolean;
  /** The channel the VOLTS/DIV, POSITION and F1 controls act on. */
  selected?: 'ch1' | 'ch2';
}
export const VOLTS_PER_DIV = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
export const SECONDS_PER_DIV = [
  5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3,
];
export const defaultScopeSettings: ScopeSettings = {
  ch1: { on: true, voltsPerDiv: 5, position: 1, coupling: 'DC' },
  ch2: { on: false, voltsPerDiv: 5, position: -2, coupling: 'DC' },
  secondsPerDiv: 5e-3,
  trigger: { source: 'ch1', level: 0 },
  running: true,
  measure: true,
};
export const DIVISIONS = { x: 10, y: 8 };

export function oscilloscopeModel(scope: Equipment): InstrumentModel {
  return {
    components: (['ch1', 'ch2'] as const).map((ch) => ({
      id: `${scope.id}.${ch}.input`,
      kind: 'resistor' as const,
      a: `${scope.id}.${ch}`,
      b: `${scope.id}.${ch}.gnd`,
      resistanceOhms: SCOPE_INPUT_OHMS,
      measurementInput: true,
      origin: 'instrument' as const,
    })),
    measurements: [],
    protections: [],
    internalTerminals: [],
  };
}

export interface ChannelTrace {
  time: number[];
  /** Volts, after coupling. */
  values: number[];
  /** False when the probe ground does not share a path with the probed point. */
  referenced: boolean;
  connected: boolean;
}

/** Raw channel voltage (input relative to its ground) over the recorded window. */
export function channelTrace(
  scopeId: string,
  channel: 'ch1' | 'ch2',
  circuit: ElectricalCircuit,
  result: SimulationResult,
): ChannelTrace {
  const signal = circuit.terminalToNode[`${scopeId}.${channel}`];
  const ground = circuit.terminalToNode[`${scopeId}.${channel}.gnd`];
  const external = new DisjointSet();
  const connected = circuit.nodes.some(
    (n) => n.id === signal && (n.plugIds.length > 0 || n.terminalIds.length > 1),
  );
  for (const c of circuit.components) {
    if (!isActive(c) || c.origin === 'instrument') continue;
    const [first, ...rest] = componentPins(c).map((t) => circuit.terminalToNode[t]);
    rest.forEach((n) => external.union(first, n));
  }
  const referenced = connected && external.find(signal) === external.find(ground);
  const waves = result.waveforms;
  if (waves && waves.time.length) {
    const zero = new Array<number>(waves.time.length).fill(0);
    const vs = waves.nodes[signal] ?? zero,
      vg = waves.nodes[ground] ?? zero;
    return { time: waves.time, values: vs.map((v, i) => v - vg[i]), referenced, connected };
  }
  // DC analysis: a flat trace across a nominal 200 ms window.
  const level = (result.nodeVoltages[signal] ?? 0) - (result.nodeVoltages[ground] ?? 0);
  const time = Array.from({ length: 201 }, (_, i) => i * 1e-3);
  return { time, values: time.map(() => level), referenced, connected };
}

export function coupled(values: number[], coupling: Coupling) {
  if (coupling === 'GND') return values.map(() => 0);
  if (coupling === 'DC') return values;
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  return values.map((v) => v - mean);
}

/** Start time of the displayed sweep: the first rising crossing of the trigger level. */
export function triggerStart(time: number[], values: number[], level: number, span: number) {
  const end = time.at(-1) ?? 0;
  for (let i = 1; i < values.length; i++) {
    if (time[i] + span > end) break;
    if (values[i - 1] < level && values[i] >= level) return { start: time[i], triggered: true };
  }
  return { start: Math.max(0, end - span), triggered: false };
}

export interface ChannelMeasurements {
  vpp: number;
  mean: number;
  rms: number;
  frequency: number | null;
}
export function measureChannel(time: number[], values: number[]): ChannelMeasurements {
  if (!values.length) return { vpp: 0, mean: 0, rms: 0, frequency: null };
  const min = Math.min(...values),
    max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const rms = Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
  // Frequency from rising crossings of the midpoint, with hysteresis against ripple noise.
  const mid = (min + max) / 2,
    band = (max - min) * 0.1;
  const crossings: number[] = [];
  let armed = false;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < mid - band) armed = true;
    else if (armed && values[i] >= mid) {
      crossings.push(time[i]);
      armed = false;
    }
  }
  const frequency =
    max - min > 1e-3 && crossings.length >= 2
      ? (crossings.length - 1) / (crossings.at(-1)! - crossings[0])
      : null;
  return { vpp: max - min, mean, rms, frequency };
}

/** AUTO: fit each active channel to about six divisions and show two to three cycles. */
export function autoset(
  settings: ScopeSettings,
  traces: Record<'ch1' | 'ch2', ChannelTrace>,
): ScopeSettings {
  const next = structuredClone(settings);
  let frequency: number | null = null;
  for (const ch of ['ch1', 'ch2'] as const) {
    const t = traces[ch];
    if (!t.connected) continue;
    const m = measureChannel(t.time, t.values);
    const min = Math.min(...t.values),
      max = Math.max(...t.values);
    // One-sided signals (rectifier outputs) sit on the bottom line and use the full height.
    const [position, needed] =
      min >= -0.02 * max
        ? [-3.5, max / 6.5]
        : max <= -0.02 * min
          ? [3.5, -min / 6.5]
          : [0, Math.max(-min, max) / 3.4];
    next[ch].on = true;
    next[ch].coupling = 'DC';
    next[ch].voltsPerDiv = VOLTS_PER_DIV.find((v) => v >= Math.max(needed, 0.005)) ?? 20;
    next[ch].position = position;
    frequency ??= m.frequency;
  }
  if (frequency)
    next.secondsPerDiv = SECONDS_PER_DIV.find((s) => s * 10 >= 2.5 / frequency!) ?? 20e-3;
  const source = traces[next.trigger.source].connected ? next.trigger.source : 'ch1';
  const m = measureChannel(traces[source].time, traces[source].values);
  next.trigger = { source, level: m.mean };
  next.running = true;
  return next;
}

export const formatVolts = (v: number) =>
  Math.abs(v) >= 1 ? `${v.toFixed(2)}V` : `${(v * 1000).toFixed(1)}mV`;
export const formatTime = (s: number) =>
  s >= 1e-3 ? `${+(s * 1e3).toPrecision(3)}ms` : `${+(s * 1e6).toPrecision(3)}µs`;

/** Rising crossings of the midpoint, with hysteresis so ripple or noise cannot re-trigger. */
export function risingCrossings(time: number[], values: number[]): number[] {
  if (!values.length) return [];
  let min = Infinity,
    max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 1e-6) return [];
  const mid = (min + max) / 2,
    band = (max - min) * 0.1;
  const crossings: number[] = [];
  let armed = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < mid - band) armed = true;
    else if (armed && values[i - 1] < mid && values[i] >= mid) {
      // Interpolate between samples for a sub-sample crossing time.
      const t =
        time[i - 1] +
        ((mid - values[i - 1]) / (values[i] - values[i - 1])) * (time[i] - time[i - 1]);
      crossings.push(t);
      armed = false;
    }
  }
  return crossings;
}

/**
 * Phase of `signal` relative to `reference` in degrees, in (−180, 180]. Positive means the
 * signal leads (reaches its rising midpoint earlier), as on a phasor diagram.
 */
export function phaseBetween(time: number[], reference: number[], signal: number[]) {
  const a = risingCrossings(time, reference),
    b = risingCrossings(time, signal);
  if (a.length < 2 || b.length < 1) return null;
  const period = (a.at(-1)! - a[0]) / (a.length - 1);
  const phases = b.map((tb) => {
    const nearest = a.reduce((best, ta) => (Math.abs(tb - ta) < Math.abs(tb - best) ? ta : best));
    let phase = (-360 * (tb - nearest)) / period;
    while (phase <= -180) phase += 360;
    while (phase > 180) phase -= 360;
    return phase;
  });
  const mean = phases.reduce((s, p) => s + p, 0) / phases.length;
  return { degrees: mean, delaySeconds: (-mean / 360) * period, frequency: 1 / period };
}
