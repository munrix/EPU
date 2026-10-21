import type { ElectricalCircuit, SimulationResult } from '../domain/models';
import { phaseBetween } from './oscilloscope';

/**
 * Analog panel meters of the electrical network lab. Each reads the simulated waveforms the way
 * the real movement responds: a dynamometer wattmeter averages v·i, a moving-iron ammeter or
 * voltmeter reads true RMS, and the power-factor meter shows P ÷ (V·I) with lead or lag.
 */
function wave(circuit: ElectricalCircuit, result: SimulationResult, terminal: string) {
  const net = circuit.terminalToNode[terminal];
  const waves = result.waveforms;
  if (waves?.time.length) return waves.nodes[net] ?? new Array<number>(waves.time.length).fill(0);
  return [result.nodeVoltages[net] ?? 0];
}
function current(result: SimulationResult, componentId: string) {
  const waves = result.waveforms;
  if (waves?.time.length)
    return waves.currents[componentId] ?? new Array<number>(waves.time.length).fill(0);
  return [result.componentCurrents[componentId] ?? 0];
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const rms = (xs: number[]) => Math.sqrt(mean(xs.map((x) => x * x)));

export interface CoilReading {
  watts: number;
  vrms: number;
  irms: number;
  /** cos φ in [0, 1], or null when there is too little voltage or current to tell. */
  powerFactor: number | null;
  /** Positive when the current leads the voltage (capacitive). */
  phaseDegrees: number | null;
}
/** Current coil COM→C, voltage coil COM→V. */
export function coilMeterReading(
  meterId: string,
  circuit: ElectricalCircuit,
  result: SimulationResult,
): CoilReading {
  const com = wave(circuit, result, `${meterId}.COM`);
  const v = wave(circuit, result, `${meterId}.V`);
  const voltage = com.map((x, k) => x - (v[k] ?? 0));
  const i = current(result, `${meterId}.current`);
  const watts = mean(voltage.map((x, k) => x * (i[k] ?? 0)));
  const vrms = rms(voltage),
    irms = rms(i);
  const apparent = vrms * irms;
  const time = result.waveforms?.time ?? [];
  const phase = time.length && irms > 1e-4 && vrms > 1 ? phaseBetween(time, voltage, i) : null;
  return {
    watts,
    vrms,
    irms,
    powerFactor: apparent > 1e-3 ? Math.min(1, Math.abs(watts) / apparent) : null,
    phaseDegrees: phase?.degrees ?? null,
  };
}
export function ammeterReading(meterId: string, result: SimulationResult) {
  return rms(current(result, `${meterId}.coil`));
}
export function voltmeterReading(
  meterId: string,
  circuit: ElectricalCircuit,
  result: SimulationResult,
) {
  const a = wave(circuit, result, `${meterId}.A`),
    b = wave(circuit, result, `${meterId}.B`);
  return rms(a.map((x, k) => x - (b[k] ?? 0)));
}
