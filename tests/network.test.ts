import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { transientTrips } from '../src/electrical/circuit/protection';
import { interpretTransient, planTransient } from '../src/electrical/solvers/ngspice/transient';
import { runNetlist } from '../src/electrical/solvers/ngspice/engine';
import { singlePhasePower } from '../src/experiments/catalog';
import { stepContext } from '../src/experiments/context';
import { parseBench } from '../src/persistence/bench';
import { setValue, wire } from './helpers';

async function solve(b: Workbench) {
  const circuit = assembleCircuit(b);
  const plan = planTransient(circuit);
  const output = plan.runnable ? await runNetlist(plan.netlist) : null;
  const result = interpretTransient(circuit, plan, output, 1);
  return { circuit, result, ctx: stepContext(b, circuit, result) };
}
/** The sheet's figure with one load, breaker closed. */
function wired(box: 'rload' | 'lload' | 'cload') {
  let b = singlePhasePower.createBench();
  b = {
    ...b,
    components: b.components.map((c) => (c.id === 'mains.source' ? { ...c, enabled: true } : c)),
  };
  b = wire(b, 'mains.L', 'watt.COM', 'l');
  b = wire(b, 'watt.C', 'pf.COM', 'wp');
  b = wire(b, 'pf.C', 'amm.A', 'pa');
  b = wire(b, 'amm.B', `${box}.A`, 'al');
  b = wire(b, `${box}.B`, 'mains.N', 'ln');
  b = wire(b, 'watt.V', 'mains.N', 'wv');
  b = wire(b, 'pf.V', 'mains.N', 'pv');
  b = wire(b, 'amm.B', 'volt.B', 'vb');
  return wire(b, 'mains.N', 'volt.A', 'va');
}
const capture = (ctx: Awaited<ReturnType<typeof solve>>['ctx']) => {
  const table = singlePhasePower.tables![0];
  return Object.fromEntries(
    table.rows.filter((r) => r.capture).map((r) => [r.id, r.capture!(ctx)]),
  );
};

describe('Electrical network experiment 1: power in single-phase circuits', () => {
  it('the bench persists with load settings', () => {
    const b = setValue(singlePhasePower.createBench(), 'lload.L', { inductanceHenries: 1.2 });
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('R load: unity power factor and P = VI', async () => {
    const { ctx } = await solve(wired('rload'));
    singlePhasePower.steps.forEach((s, i) => expect([i, s.check(ctx)]).toEqual([i, true]));
    expect(singlePhasePower.tables![0].column(ctx)).toBe('R');
    const x = capture(ctx);
    expect(x.I!).toBeCloseTo(220 / 150.4, 1);
    expect(x.pf!).toBeGreaterThan(0.999);
    expect(x.W!).toBeCloseTo(x.I! * x.V!, -1);
  }, 30000);

  it('L load: lagging power factor, plus the meters’ own loading', async () => {
    const { circuit, result, ctx } = await solve(wired('lload'));
    const x = capture(ctx);
    const z = Math.hypot(10, 2 * Math.PI * 50 * 0.5);
    expect(x.I!).toBeCloseTo(220 / z, 1);
    // The wattmeter's current coil also carries the voltmeter (10 kΩ) and the PF meter's voltage
    // coil (20 kΩ): about 7 W on top of I²R. A real low-power-factor reading shows the same error.
    const loading = (220 * 220) / 10000 + (220 * 220) / 20000;
    expect(x.W!).toBeCloseTo((220 / z) ** 2 * 10 + loading, 0);
    expect(x.pf!).toBeGreaterThan(10 / z);
    expect(x.pf!).toBeLessThan(10 / z + 0.025);
    const { coilMeterReading } = await import('../src/instruments/panelMeters');
    expect(coilMeterReading('pf', circuit, result).phaseDegrees!).toBeLessThan(-80);
  }, 30000);

  it('C load: leading current and almost no real power', async () => {
    const { circuit, result, ctx } = await solve(wired('cload'));
    const x = capture(ctx);
    expect(x.I!).toBeCloseTo(220 * 2 * Math.PI * 50 * 10e-6, 1);
    expect(x.pf!).toBeLessThan(0.05);
    const { coilMeterReading } = await import('../src/instruments/panelMeters');
    expect(coilMeterReading('pf', circuit, result).phaseDegrees!).toBeGreaterThan(80);
  }, 30000);

  it('a 10 Ω rheostat draws 22 A and trips the 6.3 A breaker', async () => {
    const b = setValue(wired('rload'), 'rload.R', { resistanceOhms: 10 });
    const { circuit, result } = await solve(b);
    expect(transientTrips(circuit, result).map((t) => t.kind)).toEqual(['breaker']);
  }, 30000);
});
