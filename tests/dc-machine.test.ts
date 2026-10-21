import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { interpretTransient, planTransient } from '../src/electrical/solvers/ngspice/transient';
import { runNetlist } from '../src/electrical/solvers/ngspice/engine';
import { linearDcSolver } from '../src/electrical/solvers/linear-dc';
import { needsTransient } from '../src/electrical/solvers/ngspice/transient';
import { dcMachineTerminals } from '../src/experiments/catalog';
import { stepContext } from '../src/experiments/context';
import { MACHINE_VARIANTS, WINDINGS, type Winding } from '../src/equipment/machines';
import { instantiateEquipment } from '../src/equipment/registry';
import { parseBench } from '../src/persistence/bench';
import { setMeter, setValue, wire } from './helpers';

async function ctxOf(b: Workbench) {
  const circuit = assembleCircuit(b);
  if (!needsTransient(circuit)) return stepContext(b, circuit, linearDcSolver.solve(circuit, 0));
  const plan = planTransient(circuit);
  const output = plan.runnable ? await runNetlist(plan.netlist) : null;
  return stepContext(b, circuit, interpretTransient(circuit, plan, output, 1));
}
/** A bench with a chosen internal wiring. */
function bench(variant: string): Workbench {
  const b = dcMachineTerminals.createBench();
  const current = b.equipment.find((e) => e.id === 'dcm')!;
  const replacement = instantiateEquipment(variant, 'dcm', current.position);
  return {
    ...b,
    equipment: b.equipment.map((e) => (e.id === 'dcm' ? replacement.equipment : e)),
    components: [
      ...b.components.filter((c) => !c.id.startsWith('dcm.')),
      ...replacement.components,
    ],
  };
}
const capture = (ctx: Awaited<ReturnType<typeof ctxOf>>, tableId: string) => {
  const table = dcMachineTerminals.tables!.find((t) => t.id === tableId)!;
  const cells = Object.fromEntries(
    table.rows.filter((r) => r.capture).map((r) => [r.id, r.capture!(ctx)]),
  ) as Record<string, number>;
  const derived = Object.fromEntries(
    table.rows.filter((r) => r.derive).map((r) => [r.id, r.derive!(cells, 'Pair 1')]),
  );
  return { column: table.column(ctx), cells, derived, table };
};

describe('DC machines experiment 1: terminal identification', () => {
  it('the bench persists, whichever internal wiring it got', () => {
    const b = dcMachineTerminals.createBench();
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  for (const variant of Object.keys(MACHINE_VARIANTS)) {
    const map = MACHINE_VARIANTS[variant];
    it(`${variant}: the ohmmeter finds and names every winding`, async () => {
      for (const w of Object.keys(map) as Winding[]) {
        const [a, b] = map[w];
        // 220 Ω is over range on 200 Ω, so the shunt field needs the 2k range, as on the real meter.
        const b0 = setMeter(bench(variant), { rangeId: w === 'shunt' ? 'ohm-2k' : 'ohm-200' });
        const ctx = await ctxOf(
          wire(wire(b0, `dcm.T${a}`, 'meter.V', 'v'), `dcm.T${b}`, 'meter.COM', 'c'),
        );
        const { column, cells, table } = capture(ctx, 'ohm');
        expect(column).toBe('Pair');
        expect(cells.pair).toBe(Math.min(a, b) * 10 + Math.max(a, b));
        expect(cells.R).toBeCloseTo(WINDINGS[w].ohms, 1);
        expect(table.rows.find((r) => r.id === 'id')!.format!(cells.R)).toBe(WINDINGS[w].label);
      }
    });
  }

  it('the series lamp glows bright on the armature and stays dark on the shunt field', async () => {
    const map = MACHINE_VARIANTS['dc-machine-v1'];
    const lamp = async (w: Winding) => {
      let b = bench('dc-machine-v1');
      b = {
        ...b,
        components: b.components.map((c) =>
          c.id === 'mains.source' ? { ...c, enabled: true } : c,
        ),
      };
      b = wire(b, 'mains.L', `dcm.T${map[w][0]}`, 'l');
      b = wire(b, `dcm.T${map[w][1]}`, 'lamp.A', 'm');
      b = wire(b, 'lamp.B', 'mains.N', 'n');
      return capture(await ctxOf(b), 'lamp');
    };
    const armature = await lamp('armature');
    const shunt = await lamp('shunt');
    expect(armature.column).toBe('Pair');
    expect(armature.cells.P).toBeGreaterThan(90);
    expect(shunt.cells.P).toBeLessThan(1);
    expect(dcMachineTerminals.steps[1].check(await ctxOfLampShunt())).toBe(true);
    async function ctxOfLampShunt() {
      let b = bench('dc-machine-v1');
      b = {
        ...b,
        components: b.components.map((c) =>
          c.id === 'mains.source' ? { ...c, enabled: true } : c,
        ),
      };
      b = wire(
        wire(wire(b, 'mains.L', 'dcm.T3', 'l'), 'dcm.T5', 'lamp.A', 'm'),
        'lamp.B',
        'mains.N',
        'n',
      );
      return ctxOf(b);
    }
  }, 60000);

  it('method 3 on DC gives R = V ÷ I; on AC the shunt field takes almost no current', async () => {
    const map = MACHINE_VARIANTS['dc-machine-v2'];
    const vi = async (w: Winding, source: 'dc' | 'ac') => {
      // Low-resistance coils take amps: the 20 A socket and range, as a student must choose.
      const big = source === 'dc' && w !== 'shunt';
      let b = setMeter(bench('dc-machine-v2'), {
        rangeId: big ? 'dca-20' : source === 'dc' ? 'dca-200m' : 'aca-200m',
      });
      b = setMeter(b, { rangeId: source === 'dc' ? 'dc-20' : 'acv-20' }, 'meter2');
      const [p, n] =
        source === 'dc' ? ['supply.positive', 'supply.negative'] : ['variac.L', 'variac.N'];
      b =
        source === 'dc'
          ? setValue(b, 'supply.source', { voltageVolts: 3, enabled: 1 as unknown as number })
          : setValue(b, 'variac.out', { rmsVolts: 5 });
      b = {
        ...b,
        components: b.components.map((c) =>
          (c.id === 'supply.source' && source === 'dc') ||
          (c.id === 'variac.out' && source === 'ac')
            ? { ...c, enabled: true }
            : c,
        ),
      };
      const [a, z] = map[w];
      b = wire(b, p, big ? 'meter.20A' : 'meter.mA', 'a');
      b = wire(b, 'meter.COM', `dcm.T${a}`, 'b');
      b = wire(b, `dcm.T${z}`, n, 'c');
      b = wire(wire(b, `dcm.T${a}`, 'meter2.V', 'v'), `dcm.T${z}`, 'meter2.COM', 'm');
      return capture(await ctxOf(b), source);
    };
    const armature = await vi('armature', 'dc');
    expect(armature.column).toBe('Pair');
    expect(armature.derived.R!).toBeCloseTo(2.5, 1);
    const shuntDc = await vi('shunt', 'dc');
    expect(shuntDc.derived.R!).toBeCloseTo(220, 0);
    const shuntAc = await vi('shunt', 'ac');
    // |Z| = √(220² + (2π·50·20)²) ≈ 6.29 kΩ: under 1 mA at 5 V.
    expect(shuntAc.derived.Z!).toBeGreaterThan(6000);
    expect(shuntAc.cells.I!).toBeLessThan(0.001);
  }, 60000);
});
