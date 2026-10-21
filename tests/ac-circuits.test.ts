import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { interpretTransient, planTransient } from '../src/electrical/solvers/ngspice/transient';
import { runNetlist } from '../src/electrical/solvers/ngspice/engine';
import { rcSeries, rlSeries } from '../src/experiments/catalog';
import { stepContext } from '../src/experiments/context';
import { parseBench } from '../src/persistence/bench';
import { setValue, wire } from './helpers';

async function context(b: Workbench) {
  const circuit = assembleCircuit(b);
  const plan = planTransient(circuit);
  const output = plan.runnable ? await runNetlist(plan.netlist) : null;
  return stepContext(b, circuit, interpretTransient(circuit, plan, output, 1));
}
const generatorOn = (b: Workbench, hz: number) =>
  setValue(
    {
      ...b,
      components: b.components.map((c) => (c.id === 'gen.out' ? { ...c, enabled: true } : c)),
    },
    'gen.out',
    { frequencyHz: hz, rmsVolts: 10 / (2 * Math.SQRT2) },
  );
/** Generator → X → R → generator ⏚, R at the grounded end; scope CH1 on the source, CH2 on R. */
function series(b: Workbench, box: 'lbox' | 'cbox') {
  let w = wire(b, 'gen.OUT', `${box}.A`, 'a');
  w = wire(w, `${box}.B`, 'rbox.A', 'b');
  w = wire(w, 'rbox.B', 'gen.GND', 'c');
  w = wire(w, 'gen.OUT', 'scope.ch1', 's1');
  w = wire(w, 'rbox.A', 'scope.ch2', 's2');
  w = wire(w, 'gen.GND', 'scope.ch1.gnd', 'g1');
  return wire(w, 'gen.GND', 'scope.ch2.gnd', 'g2');
}

describe('A.C. circuits lab (R-L and R-C series sheets)', () => {
  it('both benches persist, including decade and generator settings', () => {
    for (const e of [rlSeries, rcSeries]) {
      const b = setValue(generatorOn(e.createBench(), 440), 'rbox.R', { resistanceOhms: 560 });
      expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
    }
  });

  it('R-L at 1 kHz: VR, VL and φ match the sheet’s formulas within the generator and coil losses', async () => {
    let b = setValue(generatorOn(rlSeries.createBench(), 1000), 'rbox.R', { resistanceOhms: 560 });
    b = setValue(b, 'lbox.L', { inductanceHenries: 0.072 });
    b = series(b, 'lbox');
    const ctx = await context(wire(wire(b, 'lbox.A', 'meter.V', 'v'), 'lbox.B', 'meter.COM', 'm'));
    for (const [i, step] of rlSeries.steps.entries())
      expect([i, step.check(ctx)]).toEqual([i, true]);
    // Terminal voltage behind the 50 Ω output: I = 3.536 / |50 + 560 + 5 + jXL|.
    const xl = 2 * Math.PI * 1000 * 0.072;
    const current = 3.5355 / Math.hypot(615, xl);
    expect(ctx.meter().value!).toBeCloseTo(current * Math.hypot(5, xl), 1);
    const phase = Math.abs(ctx.scope().phaseDegrees!);
    // CH1 sees the generator terminals (after its 50 Ω), so φ = atan(XL / (R + coil)).
    expect(phase).toBeCloseTo((Math.atan(xl / 565) * 180) / Math.PI, 0);
    const vl = rlSeries.tables![0].rows.find((r) => r.id === 'VL')!.capture!(ctx)!;
    expect(vl).toBeCloseTo(ctx.meter().value!, 6);
    expect(rlSeries.tables![0].column(ctx)).toBe('1000');
  }, 30000);

  it('R-C at 440 Hz: the current leads, with XC recovered from the recorded voltages', async () => {
    let b = setValue(generatorOn(rcSeries.createBench(), 440), 'rbox.R', { resistanceOhms: 1000 });
    b = setValue(b, 'cbox.C', { capacitanceFarads: 0.5e-6 });
    b = series(b, 'cbox');
    const across = async (box: string) =>
      context(wire(wire(b, `${box}.A`, 'meter.V', 'v'), `${box}.B`, 'meter.COM', 'm'));
    const onR = await across('rbox');
    const onC = await across('cbox');
    const table = rcSeries.tables![0];
    const cells = {
      VR: table.rows.find((r) => r.id === 'VR')!.capture!(onR)!,
      VC: table.rows.find((r) => r.id === 'VC')!.capture!(onC)!,
    };
    const xc = 1 / (2 * Math.PI * 440 * 0.5e-6);
    expect(table.rows.find((r) => r.id === 'XC')!.derive!(cells, '440')!).toBeCloseTo(xc, -1);
    const phase = onR.scope().phaseDegrees!;
    expect(phase).toBeGreaterThan(0);
    expect(phase).toBeCloseTo((Math.atan(xc / 1000) * 180) / Math.PI, 0);
  }, 30000);

  it('a scope ground on the wrong side of R shorts the inductor through earth', async () => {
    let b = setValue(generatorOn(rlSeries.createBench(), 1000), 'rbox.R', { resistanceOhms: 560 });
    b = wire(b, 'gen.OUT', 'rbox.A', 'a');
    b = wire(b, 'rbox.B', 'lbox.A', 'b');
    b = wire(b, 'lbox.B', 'gen.GND', 'c');
    // CH2 across R with its ground on the R–L junction: that junction is now earthed.
    b = wire(wire(b, 'rbox.A', 'scope.ch2', 's'), 'rbox.B', 'scope.ch2.gnd', 'g');
    const ctx = await context(b);
    expect(ctx.connected('lbox.A', 'lbox.B')).toBe(true);
    expect(rlSeries.steps[3].check(ctx)).toBe(false);
  }, 30000);
});
