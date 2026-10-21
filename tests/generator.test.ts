import { describe, expect, it } from 'vitest';
import type { Workbench } from '../src/domain/models';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { settleMachines } from '../src/electrical/circuit/machines';
import { benchSolver } from '../src/electrical/solvers/machine-dc';
import { sectionOhms, RHEOSTATS, SWITCH_CLOSED_OHMS } from '../src/equipment/machineLab';
import { stepContext } from '../src/experiments/context';
import { excitationMode, generatorOcc } from '../src/experiments/generator';
import { GENERATOR, risingOcc } from '../src/machines/dcGenerator';
import { parseBench } from '../src/persistence/bench';
import { wire } from './helpers';

const base = () => generatorOcc.createBench();
const run = (b: Workbench, rpm = 1400): Workbench => ({
  ...b,
  machines: { mg: { ...b.machines!.mg, running: rpm > 0, speedSetRpm: rpm } },
});
const consoleOn = (b: Workbench): Workbench => ({
  ...b,
  components: b.components.map((c) =>
    c.kind === 'dc-source' && c.id.startsWith('console.') ? { ...c, enabled: true } : c,
  ),
});
/** Puts the rheostat's A–C section at the given resistance. */
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
const solved = (b: Workbench) => {
  const circuit = assembleCircuit(b);
  const result = benchSolver.solve(circuit, 0);
  return { result, ctx: stepContext(b, circuit, result), m: result.machines!.mg };
};
const armature = (b: Workbench) => {
  const { result, ctx } = solved(b);
  return (
    result.nodeVoltages[ctx.circuit.terminalToNode['mg.A1']] -
    result.nodeVoltages[ctx.circuit.terminalToNode['mg.A2']]
  );
};

/** Sheet 2 figure A: 220 V DC + → rheostat A–C → ammeter → F1, F2 → 220 V DC −; V across A1–A2. */
function separatelyExcited(rheostatOhms: number, rpm = 1400) {
  let b = consoleOn(run(base(), rpm));
  b = wire(b, 'console.P220', 'rf.A', 'l1');
  b = wire(b, 'rf.C', 'meter.20A', 'l2');
  b = wire(b, 'meter.COM', 'mg.F1', 'l3');
  b = wire(b, 'mg.F2', 'console.N220', 'l4', 'black');
  b = wire(b, 'mg.A1', 'meter2.V', 'l5');
  b = wire(b, 'mg.A2', 'meter2.COM', 'l6', 'black');
  return slider(b, 'rf', rheostatOhms);
}
/** Sheet 2 figure B: A1 → rheostat → ammeter → F1, F2 → A2. */
function selfExcited(rheostatOhms: number, rpm = 1400, reversed = false) {
  let b = run(base(), rpm);
  b = wire(b, 'mg.A1', 'rf.A', 'l1');
  b = wire(b, 'rf.C', 'meter.20A', 'l2');
  b = wire(b, 'meter.COM', reversed ? 'mg.F2' : 'mg.F1', 'l3');
  b = wire(b, reversed ? 'mg.F1' : 'mg.F2', 'mg.A2', 'l4', 'black');
  b = wire(b, 'mg.A1', 'meter2.V', 'l5');
  b = wire(b, 'mg.A2', 'meter2.COM', 'l6', 'black');
  return slider(b, 'rf', rheostatOhms);
}

describe('generator bench', () => {
  it('persists, including the machine state', () => {
    const b = run(base());
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('reads the residual voltage at rated speed with no field current, and 0 V at rest', () => {
    let b = run(base());
    b = wire(b, 'mg.A1', 'meter2.V', 'v1');
    b = wire(b, 'mg.A2', 'meter2.COM', 'v2', 'black');
    expect(solved(b).ctx.meter('meter2').value).toBeCloseTo(GENERATOR.residualVolts, 0);
    expect(solved(run(b, 0)).ctx.meter('meter2').value).toBe(0);
  });

  it('separately excited: If and Eo follow the wiring and the open-circuit curve', () => {
    // 220 V across 250 Ω field + 190 Ω of rheostat (+ meter shunt) ≈ 0.5 A.
    const b = separatelyExcited(190);
    const { ctx, m } = solved(b);
    expect(excitationMode(ctx)).toBe('separate');
    expect(ctx.meter('meter').value).toBeCloseTo(0.5, 2);
    expect(armature(b)).toBeCloseTo(risingOcc(m.shuntAmps), 1);
    expect(m.converged).toBe(true);
  });

  it('a rheostat wired across both ends (A–B) does not respond to its slider', () => {
    let b = consoleOn(run(base()));
    b = wire(b, 'console.P220', 'rf.A', 'l1');
    b = wire(b, 'rf.B', 'meter.20A', 'l2');
    b = wire(b, 'meter.COM', 'mg.F1', 'l3');
    b = wire(b, 'mg.F2', 'console.N220', 'l4');
    const at = (ohms: number) => solved(slider(b, 'rf', ohms)).m.shuntAmps;
    expect(at(100)).toBeCloseTo(at(1500), 6);
  });

  it('Eo is proportional to speed at constant field current (sheet 3)', () => {
    const e1400 = armature(separatelyExcited(190, 1400));
    const e700 = armature(separatelyExcited(190, 700));
    expect(e700 / e1400).toBeCloseTo(0.5, 3);
  });

  it('self-excited: builds up below the critical resistance, not above it', () => {
    const built = selfExcited(150);
    const { ctx, m } = solved(built);
    expect(excitationMode(ctx)).toBe('self');
    expect(armature(built)).toBeGreaterThan(200);
    expect(m.shuntAmps).toBeGreaterThan(0.4);
    // Critical resistance ≈ initial slope of the curve, Es / k ≈ 790 Ω at 1400 rpm.
    expect(armature(selfExcited(1500))).toBeLessThan(25);
  });

  it('self-excited: a reversed field cancels the residual flux and cannot build up', () => {
    expect(Math.abs(armature(selfExcited(150, 1400, true)))).toBeLessThan(GENERATOR.residualVolts);
  });

  it('self-excited: below the critical speed it stays near the residual voltage', () => {
    // 400 Ω total: critical at 1400 rpm, but at 600 rpm the critical resistance is ≈ 340 Ω.
    expect(armature(selfExcited(150, 600))).toBeLessThan(25);
    expect(armature(selfExcited(150, 1400))).toBeGreaterThan(200);
  });

  it('the falling magnetization curve lies above the rising one (sheet 2, table 2)', () => {
    const rising = armature(separatelyExcited(480)); // ≈ 0.3 A on the way up
    // Go up to 0.6 A, let the iron remember it, then come back to the same rheostat setting.
    const peak = settleMachines(separatelyExcited(110));
    expect(peak.machines!.mg.peakFieldAmps).toBeGreaterThan(0.59);
    const falling = armature(slider(peak, 'rf', 480));
    expect(falling).toBeGreaterThan(rising + 3);
  });

  it('on load the terminal voltage falls by Ia·Ra plus armature reaction, and the speed droops', () => {
    let b = separatelyExcited(190);
    // Switch pole 1–2 and the load rheostat across the armature, load ammeter in series.
    b = wire(b, 'mg.A1', 'sw.1', 'k1');
    b = wire(b, 'sw.2', 'meter3.20A', 'k2');
    b = wire(b, 'meter3.COM', 'rl.A', 'k3');
    b = wire(b, 'rl.C', 'mg.A2', 'k4', 'black');
    b = slider(b, 'rl', 80);
    const open = armature(b);
    const closed = {
      ...b,
      components: b.components.map((c) =>
        c.id === 'sw.pole1' && c.kind === 'resistor'
          ? { ...c, resistanceOhms: SWITCH_CLOSED_OHMS }
          : c,
      ),
    };
    const { m, ctx } = solved(closed);
    const vl = armature(closed);
    expect(ctx.meter('meter3').value).toBeGreaterThan(2);
    expect(m.armatureAmps).toBeCloseTo(ctx.meter('meter3').value!, 2);
    expect(vl).toBeCloseTo(m.emfVolts - m.armatureAmps * GENERATOR.armatureOhms, 1);
    expect(vl).toBeLessThan(open - 10);
    expect(m.rpm).toBeLessThan(1400);
  });

  it('a short across the armature is limited by Ra, not reported as an ideal short', () => {
    let b = separatelyExcited(190);
    b = wire(b, 'mg.A1', 'mg.A2', 's1');
    const { m, result } = solved(b);
    expect(Math.abs(m.armatureAmps)).toBeGreaterThan(10);
    expect(result.diagnostics.some((d) => d.code === 'short-circuit')).toBe(false);
  });

  it('an unwired generator raises no warnings', () => {
    const { result } = solved(run(base()));
    // (Unwired multimeters report "floating", as on every bench.)
    expect(result.diagnostics.filter((d) => d.code !== 'floating-meter')).toEqual([]);
  });
});
