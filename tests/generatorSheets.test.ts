import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { benchSolver } from '../src/electrical/solvers/machine-dc';
import { RHEOSTATS, sectionOhms, SWITCH_CLOSED_OHMS } from '../src/equipment/machineLab';
import { stepContext } from '../src/experiments/context';
import { excitationMode } from '../src/experiments/generator';
import {
  generatorCritical,
  generatorLoad,
  generatorSpeed,
} from '../src/experiments/generatorSheets';
import type { ExperimentDefinition, ExperimentTable } from '../src/experiments/types';
import { GENERATOR } from '../src/machines/dcGenerator';
import { parseBench } from '../src/persistence/bench';

const solved = (b: Workbench) => {
  const circuit = assembleCircuit(b);
  const result = benchSolver.solve(circuit, 0);
  return { ctx: stepContext(b, circuit, result), m: result.machines!.mg };
};
const volts = (b: Workbench) => solved(b).ctx.meter('meter2').value ?? 0;
const preset = (e: ExperimentDefinition, id: string) =>
  e.presets!.find((p) => p.id === id)!.build();
/** Breaker on and console START, as a student would after wiring. */
const powerUp = (b: Workbench): Workbench => ({
  ...b,
  threePhase: { ...b.threePhase, rst: { on: true } },
  components: b.components.map((c) =>
    c.kind === 'dc-source' && c.id.startsWith('console.') ? { ...c, enabled: true } : c,
  ),
});
const closeSwitch = (b: Workbench): Workbench => ({
  ...b,
  components: b.components.map((c) =>
    c.id.startsWith('sw.pole') && c.kind === 'resistor'
      ? { ...c, resistanceOhms: SWITCH_CLOSED_OHMS }
      : c,
  ),
});
const slider = (b: Workbench, id: 'rf' | 'rl', ohms: number): Workbench => {
  const total = RHEOSTATS[id === 'rf' ? 'rheostat-field-v1' : 'rheostat-load-v1'].ohms;
  const s = sectionOhms(total, ohms / total);
  return {
    ...b,
    components: b.components.map((c) =>
      c.id === `${id}.ac` && c.kind === 'resistor'
        ? { ...c, resistanceOhms: s.ac }
        : c.id === `${id}.cb` && c.kind === 'resistor'
          ? { ...c, resistanceOhms: s.cb }
          : c,
    ),
  };
};
/** Adjusts a control until a reading reaches a target (the reading rises with the control). */
function tune(
  set: (x: number) => Workbench,
  read: (b: Workbench) => number,
  target: number,
  lo: number,
  hi: number,
) {
  let best = set((lo + hi) / 2);
  for (let i = 0; i < 40; i++) {
    const x = (lo + hi) / 2;
    best = set(x);
    if (read(best) < target) lo = x;
    else hi = x;
  }
  return best;
}
/** The inverter frequency for a speed, found by turning the knob. */
const setSpeed = (b: Workbench, rpm: number) =>
  tune(
    (hz) => ({ ...b, threePhase: { ...b.threePhase, vfd: { on: true, hz } } }),
    (x) => solved(x).m.rpm,
    rpm,
    1,
    55,
  );
const column = (table: ExperimentTable, b: Workbench) => table.column(solved(b).ctx);
const tableOf = (e: ExperimentDefinition, id: string) => e.tables!.find((t) => t.id === id)!;

describe('sheets 3–5 on the generator bench', () => {
  it('every part has a preset that loads, persists, starts with the supplies off and is recognised', () => {
    for (const e of [generatorSpeed, generatorCritical, generatorLoad])
      for (const part of e.parts!) {
        const b = preset(e, part.presetId);
        expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
        expect(b.threePhase!.rst.on).toBe(false);
        expect(b.threePhase!.vfd.on).toBe(false);
        expect(solved(b).m.rpm).toBe(0);
        expect(part.connected(solved(b).ctx)).toBe(true);
      }
  });

  it('the inverter sets the speed: about 30 rpm per hertz, nothing without R S T', () => {
    const b = powerUp(preset(generatorSpeed, 'part-a'));
    expect(solved(setSpeed(b, 750)).m.rpm).toBeCloseTo(750, -1);
    const starved = setSpeed({ ...b, threePhase: { ...b.threePhase, rst: { on: false } } }, 750);
    expect(solved(starved).m.rpm).toBe(0);
  });

  it('sheet 3 A: at constant If, Eg is proportional to N, and each speed fills its column', () => {
    const b = slider(powerUp(preset(generatorSpeed, 'part-a')), 'rf', 220 / 0.5 - 250);
    const at1400 = setSpeed(b, 1400);
    const at800 = setSpeed(b, 800);
    expect(solved(at800).ctx.meter('meter').value).toBeCloseTo(0.5, 2);
    expect(volts(at800) / volts(at1400)).toBeCloseTo(800 / 1400, 2);
    expect(column(tableOf(generatorSpeed, 'A-05'), at800)).toBe('800');
    expect(column(tableOf(generatorSpeed, 'A-025'), at800)).toBeNull();
  });

  it('sheet 3 B: self-excited with the rheostat fixed, Eg falls faster than N and collapses', () => {
    const b = slider(closeSwitch(powerUp(preset(generatorSpeed, 'part-b'))), 'rf', 150);
    const e1400 = volts(setSpeed(b, 1400));
    const e1000 = volts(setSpeed(b, 1000));
    expect(e1400).toBeGreaterThan(200);
    expect(e1000 / e1400).toBeLessThan(1000 / 1400);
    expect(volts(setSpeed(b, 400))).toBeLessThan(30);
    expect(column(tableOf(generatorSpeed, 'B-vary'), setSpeed(b, 1000))).toBe('1000');
  });

  it('sheet 4 A: Eo ÷ If on the straight part scales with speed (critical resistance)', () => {
    const b = powerUp(preset(generatorCritical, 'part-a'));
    const at = (rpm: number) => {
      const x = setSpeed(slider(b, 'rf', 220 / 0.1 - 250 - 1), rpm);
      const { ctx } = solved(x);
      return {
        r: volts(x) / ctx.meter('meter').value!,
        col: column(tableOf(generatorCritical, rpm === 750 ? 'A-750' : 'A-1400'), x),
      };
    };
    const fast = at(1400),
      slow = at(750);
    expect(fast.col).toBe('0.1');
    expect(slow.col).toBe('0.1');
    expect(fast.r).toBeGreaterThan(700);
    expect(slow.r / fast.r).toBeCloseTo(750 / 1400, 1);
  });

  it('sheet 4 B: with the rheostat fixed, lowering the speed collapses the voltage (critical speed)', () => {
    const b = slider(closeSwitch(powerUp(preset(generatorCritical, 'part-b'))), 'rf', 150);
    const built = setSpeed(b, 1400);
    expect(generatorCritical.steps[6].check(solved(built).ctx)).toBe(true);
    const collapsed = setSpeed(b, 600);
    expect(generatorCritical.steps[7].check(solved(collapsed).ctx)).toBe(true);
    expect(generatorCritical.steps[7].record!(solved(collapsed).ctx)).toMatch(
      /Collapsed at about 6\d\d rpm/,
    );
  });

  describe('sheet 5: load test', { timeout: 60000 }, () => {
    /** No load at 1400 rpm with the field set for 220 V, then the switch closed and IL set. */
    const loaded = (partId: 'part-a' | 'part-b', amps: number) => {
      const meter3 = (x: Workbench) => solved(x).ctx.meter('meter3').value ?? 0;
      let b = setSpeed(powerUp(preset(generatorLoad, partId)), 1400);
      // Field for 220 V, then correct the speed, twice (as at the bench).
      for (let round = 0; round < 2; round++) {
        const at = b;
        b = setSpeed(
          tune((r) => slider(at, 'rf', 600 - r), volts, 220, 0, 600),
          1400,
        );
      }
      const noLoad = b;
      if (amps === 0) return { b, noLoad };
      b = closeSwitch(b);
      for (let round = 0; round < 2; round++) {
        const at = b;
        b = setSpeed(
          tune((r) => slider(at, 'rl', 300 - r), meter3, amps, 0, 299),
          1400,
        );
      }
      return { b, noLoad };
    };

    it('A: 220 V at no load, and at 2 A the table works out Ia and Eg = VL + Ia·Ra', () => {
      const { b, noLoad } = loaded('part-a', 2);
      expect(volts(noLoad)).toBeCloseTo(220, 0);
      expect(column(tableOf(generatorLoad, 'A-load'), noLoad)).toBe('0');
      const { ctx, m } = solved(b);
      expect(excitationMode(ctx)).toBe('separate');
      const table = tableOf(generatorLoad, 'A-load');
      expect(table.column(ctx)).toBe('2');
      const cells = Object.fromEntries(
        table.rows.filter((r) => r.capture).map((r) => [r.id, r.capture!(ctx)!]),
      ) as Record<string, number>;
      const derive = (id: string) => table.rows.find((r) => r.id === id)!.derive!(cells, '2')!;
      expect(derive('Ia')).toBeCloseTo(cells.IL, 6);
      expect(derive('Eg')).toBeCloseTo(cells.VL + cells.IL * GENERATOR.armatureOhms, 6);
      expect(derive('Eg')).toBeCloseTo(m.emfVolts, 0);
      expect(cells.VL).toBeLessThan(220 - 8);
    });

    it('B: self-excited, the voltage falls further at 3 A than separately excited, Ia = IL + If', () => {
      const a = loaded('part-a', 3).b;
      const s = loaded('part-b', 3).b;
      expect(excitationMode(solved(s).ctx)).toBe('self');
      expect(volts(s)).toBeLessThan(volts(a) - 5);
      const table = tableOf(generatorLoad, 'B-load');
      const { ctx } = solved(s);
      expect(table.column(ctx)).toBe('3');
      const cells = Object.fromEntries(
        table.rows.filter((r) => r.capture).map((r) => [r.id, r.capture!(ctx)!]),
      ) as Record<string, number>;
      expect(table.rows.find((r) => r.id === 'Ia')!.derive!(cells, '3')).toBeCloseTo(
        cells.IL + cells.If,
        6,
      );
      expect(generatorLoad.steps[8].check(ctx)).toBe(true);
    });
  });
});
