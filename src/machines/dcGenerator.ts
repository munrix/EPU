/**
 * DC machine of the Esselte Studium motor–generator set, run as a generator.
 *
 * The ASEA nameplate is unreadable in the photos, so the constants below are assumptions chosen
 * to fit the lab sheets: rated 1400 rpm (sheets 2 and 4), Eo up to ~260 V on the 0–300 V meter
 * with If up to 0.6 A (sheet 2), Ra = 4 Ω (sheet 5). See docs/devices/dc-machine-set.md.
 *
 * Open-circuit characteristic at rated speed, for an equivalent field current x in amperes:
 *   up(x) = Er + Es · tanh(x / k)                         (rising curve, x ≥ 0 or any x < 0)
 *   down(x) = up(x) + h · Es · tanh(p / k) · (1 − x / p)  (0 ≤ x < p, after reaching a peak p)
 * so the falling curve lies above the rising one and meets it at the peak (sheet 2, table 2), and
 * the voltage left at If = 0 grows after the poles have been magnetized. A negative field current
 * (reversed F1–F2) drives the flux through zero, which is why a reversed self-excited machine
 * cannot build up. EMF scales with speed: E = OCC(x) · N / N_rated.
 */
import type { MotorTerminals } from '../electrical/circuit/polyphase';
import type { MotorStatus } from './inductionMotor';

export const GENERATOR = {
  ratedRpm: 1400,
  /** Sheet 5: "If the resistance of armature is (4 Ω)". */
  armatureOhms: 4,
  shuntFieldOhms: 250,
  seriesFieldOhms: 0.8,
  residualVolts: 8,
  saturationVolts: 262,
  kneeAmps: 0.33,
  hysteresis: 0.06,
  /** Series field (D1–D2) ampere-turns, as equivalent shunt-field amps per ampere. */
  seriesTurnsRatio: 0.04,
  /** Demagnetizing armature reaction, volts lost per ampere of armature current. */
  armatureReactionVoltsPerAmp: 1.5,
  /** Tachogenerator output. */
  tachoVoltsPerRpm: 0.02,
  tachoOhms: 50,
};

export interface MachineState {
  /** Highest equivalent field current reached since the poles were last reversed. */
  peakFieldAmps: number;
  /** Panel toggle under the speed meter: MOTOR (+) or GENERATOR (−). */
  meterMode: 'motor' | 'generator';
}
export const defaultMachineState: MachineState = {
  peakFieldAmps: 0,
  meterMode: 'generator',
};

/** Component IDs of one machine inside the assembled circuit. */
export interface MachineCircuit {
  equipmentId: string;
  /** Armature EMF source (internal node → A2). */
  emfId: string;
  /** Armature resistance (internal node → A1). Current a→b is current out of A1. */
  armatureId: string;
  /** Shunt field winding F1–F2. */
  shuntId: string;
  /** Series field winding D1–D2. */
  seriesId: string;
  /** Tachogenerator EMF source. */
  tachoId: string;
  /** The prime mover's terminal box. */
  motor: MotorTerminals;
  state: MachineState;
}
export interface MachineReading {
  /** Signed shaft speed: positive in the forward direction (R S T on U1 V1 W1). */
  rpm: number;
  motorStatus: MotorStatus;
  /** Prime-mover line current (approximate), A. */
  motorAmps: number;
  /** Voltage across each prime-mover winding U, V, W. */
  windingVolts: number[];
  emfVolts: number;
  /** Equivalent field current (shunt + series contribution), A. */
  excitationAmps: number;
  shuntAmps: number;
  seriesAmps: number;
  /** Current out of A1 (positive when generating into an external load). */
  armatureAmps: number;
  converged: boolean;
}

export function risingOcc(x: number): number {
  const g = GENERATOR;
  return g.residualVolts + g.saturationVolts * Math.tanh(x / g.kneeAmps);
}

/** Open-circuit voltage at rated speed for equivalent field current x, with magnetic history. */
export function occVolts(x: number, peakAmps: number): number {
  const g = GENERATOR;
  const up = risingOcc(x);
  if (x < 0 || peakAmps <= 0 || x >= peakAmps) return up;
  const lift = g.hysteresis * g.saturationVolts * Math.tanh(peakAmps / g.kneeAmps);
  return up + lift * (1 - x / peakAmps);
}

/** Armature EMF for the given excitation, speed and armature current. */
export function emfVolts(x: number, rpm: number, peakAmps: number, armatureAmps: number): number {
  const g = GENERATOR;
  // Running backwards reverses the EMF for the same flux.
  const e = (occVolts(x, peakAmps) * rpm) / g.ratedRpm;
  // Armature reaction weakens the field in proportion to the load current, never reversing it.
  const reaction =
    g.armatureReactionVoltsPerAmp * Math.abs(armatureAmps) * (Math.abs(rpm) / g.ratedRpm);
  return Math.sign(e) * Math.max(0, Math.abs(e) - reaction);
}

export const excitation = (shuntAmps: number, seriesAmps: number) =>
  shuntAmps + GENERATOR.seriesTurnsRatio * seriesAmps;

/** New magnetic history after the machine has settled at excitation x. */
export function nextPeak(state: MachineState, x: number): number {
  if (x < -0.02) return 0; // the poles were driven the other way: the old history is wiped
  return x > state.peakFieldAmps + 1e-4 ? x : state.peakFieldAmps;
}
