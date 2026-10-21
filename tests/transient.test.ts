import { describe, expect, it } from 'vitest';
import type { Component, ElectricalCircuit } from '../src/domain/models';
import { planTransient, interpretTransient } from '../src/electrical/solvers/ngspice/transient';
import { runNetlist } from '../src/electrical/solvers/ngspice/engine';

/** A hand-built circuit: every terminal is its own net, named after the terminal. */
function circuit(components: Component[], measurements: ElectricalCircuit['measurements'] = []) {
  const terminals = [
    ...new Set(
      components.flatMap(
        (c) =>
          Object.values(c).filter((v) => typeof v === 'string' && v.startsWith('t.')) as string[],
      ),
    ),
  ];
  return {
    nodes: terminals.map((t) => ({ id: `net:${t}`, terminalIds: [t], plugIds: [] })),
    terminalToNode: Object.fromEntries(terminals.map((t) => [t, `net:${t}`])),
    components,
    measurements,
    protections: [],
  } satisfies ElectricalCircuit;
}
const winding = (id: string, a: string, b: string, phase: number): Component => ({
  id,
  kind: 'ac-source',
  a,
  b,
  rmsVolts: 12,
  frequencyHz: 50,
  phaseDegrees: phase,
  seriesOhms: 0.5,
  enabled: true,
});
const diode = (id: string, anode: string, cathode: string): Component => ({
  id,
  kind: 'diode',
  anode,
  cathode,
  model: '1N4007',
});
async function solve(c: ElectricalCircuit) {
  const plan = planTransient(c);
  return interpretTransient(c, plan, await runNetlist(plan.netlist), 1);
}

describe('ngspice transient adapter', () => {
  it('a three-phase bridge on 12 V windings gives about 26 V DC with 300 Hz ripple', async () => {
    const c = circuit(
      [
        winding('u', 't.U', 't.N', 0),
        winding('v', 't.V', 't.N', -120),
        winding('w', 't.W', 't.N', 120),
        diode('d1', 't.U', 't.P'),
        diode('d2', 't.V', 't.P'),
        diode('d3', 't.W', 't.P'),
        diode('d4', 't.M', 't.U'),
        diode('d5', 't.M', 't.V'),
        diode('d6', 't.M', 't.W'),
        { id: 'load', kind: 'resistor', a: 't.P', b: 't.M', resistanceOhms: 1000 },
      ],
      [
        {
          id: 'm',
          kind: 'voltage',
          equipmentId: 'x',
          positiveTerminalId: 't.P',
          negativeTerminalId: 't.M',
          requireExternalReference: false,
        },
      ],
    );
    const r = await solve(c);
    const m = r.measurements.m;
    expect(m.status).toBe('valid');
    // Ideal: 1.654 × 12√2 = 28.1 V, less two 1N4007 drops.
    expect(m.value!).toBeGreaterThan(25.5);
    expect(m.value!).toBeLessThan(27.5);
    expect(m.stats!.max - m.stats!.min).toBeGreaterThan(2);
    expect(r.waveforms!.time.at(-1)).toBeCloseTo(0.2, 3);
  }, 30000);
  it('a half-wave rectifier with a 100 µF reservoir has small ripple', async () => {
    const c = circuit(
      [
        winding('u', 't.U', 't.X', 0),
        diode('d1', 't.U', 't.P'),
        {
          id: 'c',
          kind: 'capacitor',
          a: 't.P',
          b: 't.X',
          capacitanceFarads: 100e-6,
          polarized: true,
        },
        { id: 'load', kind: 'resistor', a: 't.P', b: 't.X', resistanceOhms: 10000 },
      ],
      [
        {
          id: 'm',
          kind: 'voltage',
          equipmentId: 'x',
          positiveTerminalId: 't.P',
          negativeTerminalId: 't.X',
          requireExternalReference: false,
        },
      ],
    );
    const m = (await solve(c)).measurements.m;
    expect(m.value!).toBeGreaterThan(15.5);
    expect(m.stats!.max - m.stats!.min).toBeLessThan(0.4);
  }, 30000);
  it('a bench supply limits current into a short-like load', async () => {
    const c = circuit([
      {
        id: 's',
        kind: 'dc-source',
        positive: 't.P',
        negative: 't.N',
        voltageVolts: 12,
        currentLimitAmps: 1,
        enabled: true,
      },
      { id: 'r', kind: 'resistor', a: 't.P', b: 't.N', resistanceOhms: 2 },
      { id: 'c', kind: 'capacitor', a: 't.P', b: 't.N', capacitanceFarads: 1e-6 },
    ]);
    const r = await solve(c);
    expect(r.componentCurrents.s).toBeCloseTo(-1, 1);
    expect(r.sourceModes.s).toBe('CC');
  }, 30000);
});
