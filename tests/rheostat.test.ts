import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { benchSolver } from '../src/electrical/solvers/machine-dc';
import {
  RHEOSTATS,
  rheostatDelta,
  setSlider,
  SLIDER_CONTACT_OHMS,
  sliderPosition,
} from '../src/equipment/machineLab';
import { stepContext } from '../src/experiments/context';
import { generatorOcc } from '../src/experiments/generator';
import { parseBench } from '../src/persistence/bench';
import { setMeter, wire } from './helpers';

const FIELD = RHEOSTATS['rheostat-field-v1'].ohms;
const LOAD = RHEOSTATS['rheostat-load-v1'].ohms;
const ctxOf = (b: Workbench) => {
  const circuit = assembleCircuit(b);
  return stepContext(b, circuit, benchSolver.solve(circuit, 0));
};
/** Ohmmeter (meter2) across two sockets, everything switched off. */
const ohms = (b: Workbench, a: string, c: string, rangeId: string) => {
  let x = wire(b, a, 'meter2.V', 'o1');
  x = wire(x, c, 'meter2.COM', 'o2', 'black');
  return ctxOf(setMeter(x, { rangeId }, 'meter2')).meter('meter2').value!;
};

describe('slide rheostats', () => {
  it('the slider position survives the stored form exactly', () => {
    for (const x of [0, 0.0005, 0.1, 0.333, 0.5, 0.9, 1]) {
      const d = rheostatDelta(FIELD, x);
      expect(sliderPosition(d.ab, d.ac, d.cb)).toBeCloseTo(x, 4);
    }
  });

  it('an ohmmeter reads A–B = R at any slider position, and A–C, C–B as the slider sets them', () => {
    const base = generatorOcc.createBench();
    for (const x of [0.1, 0.5, 0.9]) {
      const b = setSlider(base, 'rf', FIELD, x);
      expect(ohms(b, 'rf.A', 'rf.B', 'ohm-20k')).toBeCloseTo(FIELD, -1);
      expect(ohms(b, 'rf.A', 'rf.C', 'ohm-20k')).toBeCloseTo(x * FIELD + SLIDER_CONTACT_OHMS, -1);
      expect(ohms(b, 'rf.C', 'rf.B', 'ohm-20k')).toBeCloseTo(
        (1 - x) * FIELD + SLIDER_CONTACT_OHMS,
        -1,
      );
    }
    const load = setSlider(base, 'rl', LOAD, 0.25);
    expect(ohms(load, 'rl.A', 'rl.B', 'ohm-2k')).toBeCloseTo(LOAD, 0);
    expect(ohms(load, 'rl.A', 'rl.C', 'ohm-200')).toBeCloseTo(0.25 * LOAD + SLIDER_CONTACT_OHMS, 0);
  });

  it('persists at any slider position', () => {
    const b = setSlider(
      setSlider(generatorOcc.createBench(), 'rf', FIELD, 0.0735),
      'rl',
      LOAD,
      0.6,
    );
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('field rheostat: every If on the sheets is reachable to the ammeter’s 0.01 A with the fine steps', () => {
    // 220 V across the 250 Ω field + the rheostat's A–C: If = 220 / (250 + A–C).
    const fine = 0.0005; // Alt + arrow
    for (const target of [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6]) {
      let best = Infinity;
      for (let x = 0; x <= 1; x += fine) {
        const i = 220 / (250 + x * FIELD + SLIDER_CONTACT_OHMS);
        best = Math.min(best, Math.abs(i - target));
      }
      expect(best, `If = ${target} A`).toBeLessThan(0.002);
    }
  });

  it('load rheostat: IL = 1 … 3 A is reachable on the normal 0.5 % steps at 220 V', () => {
    const step = 0.005;
    for (const target of [1, 1.5, 2, 2.5, 3]) {
      let best = Infinity;
      for (let x = 0; x <= 1; x += step) {
        const i = 220 / (x * LOAD + SLIDER_CONTACT_OHMS + 4);
        best = Math.min(best, Math.abs(i - target));
      }
      expect(best, `IL = ${target} A`).toBeLessThan(0.03);
    }
  });

  it('reports the current in the winding, and the field ammeter reads it', () => {
    let b = generatorOcc.createBench();
    b = {
      ...b,
      components: b.components.map((c) =>
        c.kind === 'dc-source' && c.id === 'console.dc220' ? { ...c, enabled: true } : c,
      ),
    };
    b = wire(b, 'console.P220', 'rf.A', 'l1');
    b = wire(b, 'rf.C', 'meter.20A', 'l2');
    b = wire(b, 'meter.COM', 'mg.F1', 'l3');
    b = wire(b, 'mg.F2', 'console.N220', 'l4', 'black');
    b = setSlider(b, 'rf', FIELD, 190 / FIELD);
    const c = ctxOf(b);
    const winding = c.current('rf.ab') + c.current('rf.ac');
    expect(c.meter('meter').value).toBeCloseTo(winding, 4);
    expect(winding).toBeCloseTo(220 / (250 + 190 + SLIDER_CONTACT_OHMS + 0.01), 3);
  });
});
