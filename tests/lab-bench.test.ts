import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { transientTrips } from '../src/electrical/circuit/protection';
import { interpretTransient, planTransient } from '../src/electrical/solvers/ngspice/transient';
import { runNetlist } from '../src/electrical/solvers/ngspice/engine';
import { powerBench, threePhaseRectifier, transistorBench } from '../src/experiments/catalog';
import { stepContext } from '../src/experiments/context';
import { meterDisplay } from '../src/instruments/multimeter';
import { channelTrace, measureChannel } from '../src/instruments/oscilloscope';
import { parseBench } from '../src/persistence/bench';
import { setMeter, wire } from './helpers';

const on = (b: Workbench): Workbench => ({
  ...b,
  components: b.components.map((c) =>
    (c.kind === 'dc-source' || c.kind === 'ac-source') && c.id.startsWith('bench.')
      ? { ...c, enabled: true }
      : c,
  ),
});
async function solve(b: Workbench) {
  const circuit = assembleCircuit(b);
  const plan = planTransient(circuit);
  const output = plan.runnable ? await runNetlist(plan.netlist) : null;
  return { circuit, plan, result: interpretTransient(circuit, plan, output, 1) };
}
const reading = (b: Workbench, r: Awaited<ReturnType<typeof solve>>['result']) =>
  meterDisplay('meter', b.instrumentSettings.meter, r);

/** Star-connected secondary into the six-diode bridge on the rectifier board, 1 kΩ load. */
function bridge() {
  let b = on(powerBench.createBench());
  b = wire(b, 'bench.X', 'bench.Y', 'n1');
  b = wire(b, 'bench.Y', 'bench.Z', 'n2');
  (['A', 'B', 'C'] as const).forEach((col, i) => {
    const phase = ['U', 'V', 'W'][i];
    b = wire(b, `bench.${phase}`, `rect.${col}2`, `${phase}1`);
    b = wire(b, `rect.${col}2`, `rect.${col}3`, `${phase}2`);
  });
  b = wire(b, 'rect.A1', 'rect.B1', 'p1');
  b = wire(b, 'rect.B1', 'rect.C1', 'p2');
  b = wire(b, 'rect.C1', 'rect.F1', 'p3');
  b = wire(b, 'rect.A4', 'rect.B4', 'm1');
  b = wire(b, 'rect.B4', 'rect.C4', 'm2');
  b = wire(b, 'rect.C4', 'rect.F4', 'm3');
  return b;
}

describe('EPU lab bench', () => {
  it('both lab stations are valid, persistable benches', () => {
    for (const station of [powerBench, transistorBench]) {
      const b = station.createBench();
      expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
    }
  });

  it('with the bench switched off nothing is simulated and every reading is zero', async () => {
    const b = wire(
      wire(powerBench.createBench(), 'rect.F1', 'meter.V', 'v'),
      'rect.F4',
      'meter.COM',
      'c',
    );
    const { plan, result } = await solve(b);
    expect(plan.runnable).toBe(false);
    expect(reading(b, result).text).toBe('0.00');
  });

  it('a transformer winding reads 12 V on the AC range', async () => {
    let b = setMeter(on(powerBench.createBench()), { rangeId: 'acv-20' });
    b = wire(wire(b, 'bench.U', 'meter.V', 'v'), 'bench.X', 'meter.COM', 'c');
    const { result } = await solve(b);
    expect(reading(b, result).text).toBe('12.00');
  }, 30000);

  it('a three-phase bridge gives about 26.6 V DC with 300 Hz ripple on meter and scope', async () => {
    let b = setMeter(bridge(), { rangeId: 'dc-200' });
    b = wire(wire(b, 'rect.F1', 'meter.V', 'v'), 'rect.F4', 'meter.COM', 'c');
    b = wire(wire(b, 'rect.F1', 'scope.ch1', 's'), 'rect.F4', 'scope.ch1.gnd', 'g');
    const { circuit, result } = await solve(b);
    const value = Number(reading(b, result).text);
    expect(value).toBeGreaterThan(25.8);
    expect(value).toBeLessThan(27.3);
    const trace = channelTrace('scope', 'ch1', circuit, result);
    expect(trace.referenced).toBe(true);
    const m = measureChannel(trace.time, trace.values);
    expect(m.frequency).toBeCloseTo(300, 0);
    expect(m.vpp).toBeGreaterThan(3);
    expect(m.vpp).toBeLessThan(4.5);
  }, 30000);

  it('the 100 µF reservoir capacitor cuts the ripple', async () => {
    let b = bridge();
    b = wire(b, 'rect.F1', 'rect.D1', 'c1');
    b = wire(b, 'rect.F4', 'rect.D4', 'c2');
    b = wire(wire(b, 'rect.F1', 'scope.ch1', 's'), 'rect.F4', 'scope.ch1.gnd', 'g');
    const { circuit, result } = await solve(b);
    const trace = channelTrace('scope', 'ch1', circuit, result);
    // Theory ΔV ≈ I / (f·C) = 26.6 mA / (300 Hz × 100 µF) ≈ 0.89 V; without it, about 3.9 V.
    const vpp = measureChannel(trace.time, trace.values).vpp;
    expect(vpp).toBeGreaterThan(0.3);
    expect(vpp).toBeLessThan(0.95);
  }, 30000);

  it('two scope grounds on different points short through earth and overload a winding', async () => {
    let b = bridge();
    b = wire(wire(b, 'rect.F1', 'scope.ch1', 's1'), 'rect.F4', 'scope.ch1.gnd', 'g1');
    // CH2 ground clipped onto phase U: U is now tied to the − bus through protective earth.
    b = wire(wire(b, 'bench.V', 'scope.ch2', 's2'), 'bench.U', 'scope.ch2.gnd', 'g2');
    const { circuit, result } = await solve(b);
    expect(result.diagnostics.some((d) => d.code === 'overcurrent')).toBe(true);
    expect(circuit.terminalToNode['bench.U']).toBe(circuit.terminalToNode['rect.F4']);
  }, 30000);

  it('the ±12 V common is earthed, so the scope reads each rail against it', async () => {
    let b = on(powerBench.createBench());
    b = wire(b, 'bench.dc2.pos', 'scope.ch1', 'a');
    b = wire(b, 'bench.dc1.neg', 'scope.ch2', 'b');
    const { circuit, result } = await solve(b);
    const up = measureChannel(
      ...(Object.values(channelTrace('scope', 'ch1', circuit, result)).slice(0, 2) as [
        number[],
        number[],
      ]),
    );
    const down = measureChannel(
      ...(Object.values(channelTrace('scope', 'ch2', circuit, result)).slice(0, 2) as [
        number[],
        number[],
      ]),
    );
    expect(up.mean).toBeCloseTo(12, 1);
    expect(down.mean).toBeCloseTo(-12, 1);
  }, 30000);

  it('a BC547 biased from +12 V through 10 kΩ saturates against a 1 kΩ collector load', async () => {
    let b = on(transistorBench.createBench());
    b = wire(b, 'bench.dc2.pos', 'amp.R2.a', 'vcc');
    b = wire(b, 'amp.R2.b', 'amp.C', 'rc');
    b = wire(b, 'bench.dc2.pos', 'amp.R1.a', 'rb1');
    b = wire(b, 'amp.R1.b', 'amp.B', 'rb2');
    b = wire(b, 'amp.E', 'bench.dc2.neg', 'e');
    b = wire(wire(b, 'amp.C', 'meter.V', 'v'), 'amp.E', 'meter.COM', 'c');
    const { result } = await solve(b);
    const vce = Number(reading(b, result).text);
    expect(vce).toBeGreaterThan(0);
    expect(vce).toBeLessThan(0.3);
  }, 30000);

  it('an ammeter across a winding blows the mA fuse', async () => {
    let b = setMeter(on(powerBench.createBench()), { rangeId: 'aca-200m' });
    b = wire(wire(b, 'bench.U', 'meter.mA', 'a'), 'bench.X', 'meter.COM', 'c');
    const { circuit, result } = await solve(b);
    expect(transientTrips(circuit, result)).toHaveLength(1);
  }, 30000);
});

describe('Power electronics experiment 4: three-phase full-wave rectifier', () => {
  it('completes every step through real wiring and fills the output table', async () => {
    const e = threePhaseRectifier;
    let b = setMeter(on(e.createBench()), { rangeId: 'dc-200' });
    b = wire(b, 'bench.X', 'bench.Y', 'n1');
    b = wire(b, 'bench.Y', 'bench.Z', 'n2');
    (['A', 'B', 'C'] as const).forEach((col, i) => {
      const phase = ['U', 'V', 'W'][i];
      b = wire(b, `bench.${phase}`, `rect.${col}2`, `${phase}1`);
      b = wire(b, `rect.${col}2`, `rect.${col}3`, `${phase}2`);
    });
    b = wire(wire(b, 'rect.A1', 'rect.B1', 'p1'), 'rect.B1', 'rect.C1', 'p2');
    b = wire(wire(b, 'rect.A4', 'rect.B4', 'm1'), 'rect.B4', 'rect.C4', 'm2');
    b = wire(wire(b, 'rect.C1', 'rect.F1', 'l1'), 'rect.C4', 'rect.F4', 'l2');
    b = wire(wire(b, 'rect.F1', 'scope.ch1', 's'), 'rect.F4', 'scope.ch1.gnd', 'g');
    b = wire(wire(b, 'rect.F1', 'meter.V', 'v'), 'rect.F4', 'meter.COM', 'c');
    const { circuit, result } = await solve(b);
    const ctx = stepContext(b, circuit, result);
    e.steps.forEach((step, i) => expect([i, step.check(ctx)]).toEqual([i, true]));
    const table = e.tables![0];
    expect(table.column(ctx)).toBe('Measured');
    const cells = Object.fromEntries(
      table.rows.filter((r) => r.capture).map((r) => [r.id, r.capture!(ctx)!]),
    );
    const derived = (id: string) =>
      table.rows.find((r) => r.id === id)!.derive!(cells, 'Measured')!;
    // Theory 28.07 V less two 1N4007 drops; efficiency and form factor match the sheet closely.
    expect(cells.Vdc).toBeGreaterThan(25.8);
    expect(cells.Vdc).toBeLessThan(27.3);
    expect(cells.f).toBeCloseTo(300, 0);
    expect(derived('eta')).toBeGreaterThan(99.5);
    expect(derived('FF')).toBeCloseTo(1.001, 2);
    expect(derived('RF')).toBeGreaterThan(3);
    expect(derived('RF')).toBeLessThan(6);
  }, 30000);
});
