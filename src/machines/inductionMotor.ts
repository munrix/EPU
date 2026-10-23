/**
 * Prime mover of the motor–generator set: a three-phase squirrel-cage induction motor with a
 * six-terminal box (U1 V1 W1 / W2 U2 V2). Its nameplate is not photographed; assumed: 4 poles,
 * 50 Hz, 1.1 kW, 1400 rpm, Δ 220 V / Y 380 V (each winding rated 220 V), breakdown torque 2.5 ×
 * rated. On the lab's 380 V R S T supply it must therefore be connected in star.
 *
 * The motor is driven by the symmetrical components of its three winding voltages: the
 * positive-sequence part turns it forward, the negative-sequence part brakes it (and turns it
 * the other way when it dominates, which is what swapping two phases does). With one phase
 * missing both parts are equal and there is no starting torque: the motor hums and stays still.
 */
export const MOTOR = {
  poles: 4,
  hz: 50,
  windingVolts: 220,
  ratedWatts: 1100,
  ratedRpm: 1400,
  breakdownRatio: 2.5,
  /** Rated line current in star at 380 V, and locked-rotor multiple. */
  ratedAmps: 2.6,
  lockedRotorRatio: 6,
  /** Friction and windage of the whole set (both machines and the coupling), N·m. */
  frictionNm: 0.25,
  viscousNmPerRpm: 0.0002,
};
export const SYNC_RPM = (120 * MOTOR.hz) / MOTOR.poles;
const RATED_SLIP = 1 - MOTOR.ratedRpm / SYNC_RPM;
const RATED_TORQUE = MOTOR.ratedWatts / ((2 * Math.PI * MOTOR.ratedRpm) / 60);
const BREAKDOWN_TORQUE = MOTOR.breakdownRatio * RATED_TORQUE;
/** Slip at breakdown torque, from Kloss's formula at the rated point. */
const BREAKDOWN_SLIP =
  RATED_SLIP * (MOTOR.breakdownRatio + Math.sqrt(MOTOR.breakdownRatio ** 2 - 1));

export interface Phasor {
  re: number;
  im: number;
}
export const phasor = (magnitude: number, degrees: number): Phasor => ({
  re: magnitude * Math.cos((degrees * Math.PI) / 180),
  im: magnitude * Math.sin((degrees * Math.PI) / 180),
});
const add = (a: Phasor, b: Phasor): Phasor => ({ re: a.re + b.re, im: a.im + b.im });
const rotate = (a: Phasor, degrees: number): Phasor => {
  const r = phasor(1, degrees);
  return { re: a.re * r.re - a.im * r.im, im: a.re * r.im + a.im * r.re };
};
export const magnitude = (a: Phasor) => Math.hypot(a.re, a.im);

/** Positive- and negative-sequence voltage of the windings U, V, W, per unit of 220 V. */
export function sequences(u: Phasor, v: Phasor, w: Phasor) {
  const third = (p: Phasor) => magnitude(p) / 3 / MOTOR.windingVolts;
  return {
    positive: third(add(add(u, rotate(v, 120)), rotate(w, 240))),
    negative: third(add(add(u, rotate(v, 240)), rotate(w, 120))),
  };
}

/**
 * Kloss torque for a slip speed (rpm below synchronous) at rated V/f, N·m. With V/f held, as an
 * inverter does, the breakdown torque and the slip speed at which it occurs stay the same at
 * every frequency: the curve just moves with the synchronous speed.
 */
const BREAKDOWN_SLIP_RPM = BREAKDOWN_SLIP * SYNC_RPM;
const kloss = (slipRpm: number) =>
  slipRpm === 0
    ? 0
    : (2 * BREAKDOWN_TORQUE) / (slipRpm / BREAKDOWN_SLIP_RPM + BREAKDOWN_SLIP_RPM / slipRpm);
export const syncRpm = (hz: number) => (120 * hz) / MOTOR.poles;

/**
 * Motor torque at a forward speed (rpm) for the given sequence voltages, each per unit of the
 * rated V/f at the supply frequency.
 */
export function motorTorque(
  rpm: number,
  positive: number,
  negative: number,
  hz: number = MOTOR.hz,
): number {
  const sync = syncRpm(hz);
  return positive ** 2 * kloss(sync - rpm) - negative ** 2 * kloss(sync + rpm);
}

export type MotorStatus = 'off' | 'running' | 'humming' | 'stalled';
export interface MotorOperatingPoint {
  /** Signed shaft speed: positive is the forward direction (R S T on U1 V1 W1). */
  rpm: number;
  status: MotorStatus;
  /** Approximate line current, A. */
  lineAmps: number;
}

/**
 * Steady speed of the set from standstill, given the generator's load torque (N·m, opposing
 * rotation). The operating point is on the stable side of the breakdown torque.
 */
export function steadyState(
  positive: number,
  negative: number,
  generatorTorque: number,
  hz: number = MOTOR.hz,
): MotorOperatingPoint {
  if ((positive < 0.05 && negative < 0.05) || hz < 0.5)
    return { rpm: 0, status: 'off', lineAmps: 0 };
  const forward = positive >= negative;
  const [p, n] = forward ? [positive, negative] : [negative, positive];
  const load = (rpm: number) => MOTOR.frictionNm + MOTOR.viscousNmPerRpm * rpm + generatorTorque;
  const locked = MOTOR.lockedRotorRatio * MOTOR.ratedAmps * Math.max(p, n);
  // Starting torque must overcome friction (the generator gives no torque at rest).
  if (motorTorque(0, p, n, hz) <= MOTOR.frictionNm)
    return { rpm: 0, status: p - n < 0.05 ? 'humming' : 'stalled', lineAmps: locked };
  // Search the stable branch, from synchronous speed down to breakdown, for torque balance.
  const sync = syncRpm(hz);
  let lo = Math.max(0, sync - BREAKDOWN_SLIP_RPM),
    hi = sync;
  if (motorTorque(lo, p, n, hz) < load(lo)) return { rpm: 0, status: 'stalled', lineAmps: locked };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (motorTorque(mid, p, n, hz) >= load(mid)) lo = mid;
    else hi = mid;
  }
  const rpm = lo;
  const slipRpm = sync - rpm;
  // Line current rises with slip from about 40 % (magnetizing) at no load, scaled by voltage.
  const lineAmps =
    MOTOR.ratedAmps * p * Math.hypot(0.4, (slipRpm / (RATED_SLIP * SYNC_RPM)) * 0.9) * (1 + n);
  return { rpm: forward ? rpm : -rpm, status: 'running', lineAmps };
}
