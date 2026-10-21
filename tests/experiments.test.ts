import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { deleteCable } from '../src/domain/connections';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { settleProtection } from '../src/electrical/circuit/protection';
import { linearDcSolver } from '../src/electrical/solvers/linear-dc';
import { stepContext } from '../src/experiments/context';
import { experimentById, experiments } from '../src/experiments/catalog';
import type { ExperimentDefinition } from '../src/experiments/types';
import { parseBench } from '../src/persistence/bench';
import { power, setMeter, setValue, wire } from './helpers';

/** Replays a sequence of bench states the way the notebook does: steps latch when first met. */
function notebook(experiment: ExperimentDefinition, states: Workbench[]) {
  const achieved = new Set<number>();
  const records: Record<number, string> = {};
  for (const state of states) {
    const bench = settleProtection(state).bench;
    const circuit = assembleCircuit(bench);
    const ctx = stepContext(bench, circuit, linearDcSolver.solve(circuit, 0));
    experiment.steps.forEach((step, i) => {
      if (achieved.has(i) || !step.check(ctx)) return;
      achieved.add(i);
      if (step.record) records[i] = step.record(ctx);
    });
  }
  return { achieved: [...achieved].sort(), records };
}

describe('experiment catalog', () => {
  it.each(['high', 'low'])(
    'DC 04: equal branch currents do not pass the wrong branch (%s side meter)',
    (side) => {
      const e = experimentById('dc-parallel')!;
      let b = setValue(power(e.createBench()), 'r2.resistor', { resistanceOhms: 1001 });
      b = wire(b, 'supply.positive', 'r2.A', 'other-a');
      b = wire(b, 'r2.B', 'supply.negative', 'other-b');
      if (side === 'high') {
        b = wire(b, 'supply.positive', 'meter.mA', 'a');
        b = wire(b, 'meter.COM', 'r1.A', 'b');
        b = wire(b, 'r1.B', 'supply.negative', 'c');
      } else {
        b = wire(b, 'supply.positive', 'r1.A', 'a');
        b = wire(b, 'r1.B', 'meter.mA', 'b');
        b = wire(b, 'meter.COM', 'supply.negative', 'c');
      }
      const circuit = assembleCircuit(b);
      const ctx = stepContext(b, circuit, linearDcSolver.solve(circuit, 0));
      expect(ctx.meterReads(ctx.current('r1.resistor'))).toBe(true);
      expect(ctx.meterReads(ctx.current('r2.resistor'))).toBe(true);
      expect(e.steps[2].check(ctx)).toBe(true);
      expect(e.steps[3].check(ctx)).toBe(false);
      expect(e.steps[1].check(ctx)).toBe(false);
      const bypass = wire(b, 'meter.mA', 'meter.COM', 'bypass');
      expect(notebook(e, [bypass]).achieved).not.toContain(2);
    },
  );

  it('every experiment creates a valid, persistable bench', () => {
    for (const e of experiments) {
      const bench = e.createBench();
      expect(bench.experimentId).toBe(e.id);
      expect(parseBench(JSON.parse(JSON.stringify(bench)))).toEqual(bench);
    }
  });
  it('an empty bench satisfies no step', () => {
    for (const e of experiments) expect(notebook(e, [e.createBench()]).achieved).toEqual([]);
  });

  it('DC 03: series divider records V R1, V R2 and the supply voltage', () => {
    const e = experimentById('dc-series')!;
    let b = power(e.createBench());
    b = wire(b, 'supply.positive', 'r1.A', 'a');
    b = wire(b, 'r1.B', 'r2.A', 'b');
    b = wire(b, 'r2.B', 'supply.negative', 'c');
    const acrossR1 = wire(wire(b, 'r1.A', 'meter.V', 'v'), 'r1.B', 'meter.COM', 'com');
    const acrossR2 = wire(wire(b, 'r2.A', 'meter.V', 'v'), 'r2.B', 'meter.COM', 'com');
    const acrossSupply = wire(
      wire(b, 'supply.positive', 'meter.V', 'v'),
      'supply.negative',
      'meter.COM',
      'com',
    );
    const result = notebook(e, [b, acrossR1, acrossR2, acrossSupply]);
    expect(result.achieved).toEqual([0, 1, 2, 3]);
    expect(result.records).toEqual({
      1: 'V R1 = 4.00 V',
      2: 'V R2 = 8.00 V',
      3: 'V supply = 12.00 V',
    });
  });

  it('DC 04: parallel branches record currents that add up (KCL)', () => {
    const e = experimentById('dc-parallel')!;
    const base = power(e.createBench());
    const parallel = wire(
      wire(
        wire(wire(base, 'supply.positive', 'r1.A', 'a1'), 'r1.A', 'r2.A', 'a2'),
        'supply.negative',
        'r1.B',
        'b1',
      ),
      'r1.B',
      'r2.B',
      'b2',
    );
    // Total current: supply + → mA, COM → both resistor A terminals.
    let total = wire(base, 'supply.positive', 'meter.mA', 't1');
    total = wire(total, 'meter.COM', 'r1.A', 't2');
    total = wire(total, 'r1.A', 'r2.A', 't3');
    total = wire(wire(total, 'r1.B', 'supply.negative', 't4'), 'r2.B', 'supply.negative', 't5');
    // R1 branch only: supply + feeds R2 directly and R1 through the meter.
    let branch1 = wire(base, 'supply.positive', 'r2.A', 'u1');
    branch1 = wire(branch1, 'supply.positive', 'meter.mA', 'u2');
    branch1 = wire(branch1, 'meter.COM', 'r1.A', 'u3');
    branch1 = wire(wire(branch1, 'r1.B', 'supply.negative', 'u4'), 'r2.B', 'supply.negative', 'u5');
    let branch2 = wire(base, 'supply.positive', 'r1.A', 'w1');
    branch2 = wire(branch2, 'supply.positive', 'meter.mA', 'w2');
    branch2 = wire(branch2, 'meter.COM', 'r2.A', 'w3');
    branch2 = wire(wire(branch2, 'r1.B', 'supply.negative', 'w4'), 'r2.B', 'supply.negative', 'w5');
    const result = notebook(e, [parallel, total, branch1, branch2]);
    expect(result.achieved).toEqual([0, 1, 2, 3]);
    // 200 mA range: 1 Ω shunt. 12/1000 + 12/2000 ≈ 18 mA.
    expect(result.records).toEqual({
      1: 'I total = 18.0 mA',
      2: 'I R1 = 12.0 mA',
      3: 'I R2 = 6.0 mA',
    });
  });

  it('DC 04: a meter left across the supply blows the fuse instead of passing a step', () => {
    const e = experimentById('dc-parallel')!;
    let b = power(e.createBench());
    b = wire(wire(b, 'supply.positive', 'meter.mA', 'x'), 'meter.COM', 'supply.negative', 'y');
    expect(settleProtection(b).bench.instrumentSettings.meter.fuseBlown).toBe(true);
    expect(notebook(e, [b]).achieved).toEqual([]);
  });

  it('DC 02: the ammeter steps need a series connection, not a lucky reading', () => {
    const e = experimentById('dc-ammeter')!;
    let b = setMeter(power(e.createBench()), { rangeId: 'dca-200m' });
    b = wire(b, 'supply.positive', 'meter.mA', 'a');
    b = wire(b, 'meter.COM', 'load.A', 'b');
    b = wire(b, 'load.B', 'supply.negative', 'c');
    const halved = setValue(b, 'supply.source', { voltageVolts: 6 });
    const result = notebook(e, [b, halved]);
    expect(result.achieved).toEqual([0, 1, 2, 3, 4]);
    expect(result.records).toEqual({ 3: 'I at 12 V = 12.0 mA', 4: 'I at 6 V = 6.0 mA' });
    // Bypassing the meter with a direct lead breaks the series condition.
    expect(
      notebook(e, [wire(deleteCable(b, 'a'), 'supply.positive', 'load.A', 'd')]).achieved,
    ).toEqual([0, 2]);
  });
});
