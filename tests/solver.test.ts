import { describe, expect, it } from 'vitest';
import { attachPlug, deleteCable, unplug } from '../src/domain/connections';
import { settleProtection } from '../src/electrical/circuit/protection';
import { meterDisplay } from '../src/instruments/multimeter';
import { instantiateEquipment } from '../src/equipment/registry';
import type { Workbench } from '../src/domain/models';
import { createBench, power, setMeter, setValue, solve, wire, wiredBench } from './helpers';

const display = (b: Workbench) => meterDisplay('meter', b.instrumentSettings.meter, solve(b));
const withResistor = (b: Workbench, id: string, ohms: number): Workbench => {
  const r = instantiateEquipment(
    'resistor-v1',
    id,
    { x: 0, y: 0 },
    { values: { resistanceOhms: ohms } },
  );
  return {
    ...b,
    equipment: [...b.equipment, r.equipment],
    terminals: [...b.terminals, ...r.terminals],
    components: [...b.components, ...r.components],
  };
};

describe('linear DC solver and actual instrument connections', () => {
  it('explains the reported 41.5 V / 2500 Ω reading with VΩ and mA leads, then measures in series', () => {
    let b = setMeter(power(createBench()), { rangeId: 'dca-200µ' });
    b = setValue(b, 'supply.source', { voltageVolts: 41.5 });
    b = setValue(b, 'load.resistor', { resistanceOhms: 2500 });
    b = wire(b, 'supply.positive', 'meter.mA', 'input');
    b = wire(b, 'meter.V', 'load.A', 'output');
    b = wire(b, 'load.B', 'supply.negative', 'return');
    expect(solve(b).measurements.meter.value).toBeCloseTo(41.5 / (10e6 + 1000 + 2500), 10);
    expect(display(b)).toMatchObject({ text: '4.1', unit: 'µA' });
    b = attachPlug(b, 'output:a', { kind: 'terminal', terminalId: 'meter.COM' });
    expect(display(b).text).toBe('OL');
    b = setMeter(b, { rangeId: 'dca-20m' });
    expect(solve(b).measurements.meter.value).toBeCloseTo(41.5 / 2510, 10);
    expect(display(b)).toMatchObject({ text: '16.53', unit: 'mA' });
  });
  it('calculates 12 V and 12 mA from the assembled circuit', () => {
    const r = solve(wiredBench());
    expect(r.revision).toBe(7);
    expect(r.measurements.meter).toEqual({ status: 'valid', value: 12 });
    expect(r.componentCurrents['load.resistor']).toBeCloseTo(0.012, 10);
    // The supply also feeds the meter's 10 MΩ input.
    expect(r.componentCurrents['supply.source']).toBeCloseTo(-(0.012 + 12 / 10e6), 12);
    expect(r.sourceModes['supply.source']).toBe('CV');
    expect(r.diagnostics).toEqual([]);
  });
  it('reversing meter leads produces a negative voltage', () => {
    let b = deleteCable(deleteCable(wiredBench(), 'meter-positive'), 'meter-negative');
    b = wire(b, 'load.A', 'meter.COM', 'reversed-com');
    b = wire(b, 'load.B', 'meter.V', 'reversed-v');
    expect(solve(b).measurements.meter.value).toBe(-12);
    expect(display(b).text).toBe('-12.00');
  });
  it('power off opens the source and a connected resistive load reads 0 V', () => {
    const r = solve(wiredBench(false));
    expect(r.measurements.meter.value).toBe(0);
    expect(r.componentCurrents['load.resistor']).toBe(0);
    expect(r.sourceModes['supply.source']).toBe('off');
  });
  it('unconnected meter leads are floating, not a fake zero', () => {
    expect(solve(createBench()).measurements.meter).toEqual({ status: 'floating', value: null });
  });
  it('one lead on the circuit and the other floating is still floating', () => {
    const b = wire(power(createBench()), 'supply.positive', 'meter.V', 'v');
    expect(solve(b).measurements.meter.status).toBe('floating');
  });
  it('meter leads on the same isolated net give zero', () => {
    expect(
      solve(wire(createBench(), 'meter.V', 'meter.COM', 'same-net')).measurements.meter.value,
    ).toBe(0);
  });
  it('open return carries zero current and uses actual remaining meter attachments', () => {
    const b = unplug(wiredBench(), 'return-lead:b'); // Source-side plug: meter remains across load.
    const r = solve(b);
    expect(r.componentCurrents['load.resistor']).toBeCloseTo(0, 10);
    expect(r.measurements.meter.value).toBeCloseTo(0, 10);
    expect(r.diagnostics.some((d) => d.code === 'open-load')).toBe(true);
  });
  it('does not silently fix a lifted meter stack: it can still read the source across an open load', () => {
    const r = solve(unplug(wiredBench(), 'supply-lead:b'));
    expect(r.measurements.meter.value).toBe(12);
    expect(r.componentCurrents['load.resistor']).toBeCloseTo(0, 10);
  });
  it('a bench supply short holds its current limit at 0 V and reports a fault', () => {
    const r = solve(wire(wiredBench(), 'supply.positive', 'supply.negative', 'short'));
    expect(r.diagnostics.some((d) => d.code === 'short-circuit' && d.severity === 'fault')).toBe(
      true,
    );
    expect(r.sourceModes['supply.source']).toBe('CC');
    expect(r.componentCurrents['supply.source']).toBeCloseTo(-1, 12);
    expect(r.measurements.meter).toEqual({ status: 'valid', value: 0 });
  });
  it('an ideal source short reports a fault without inventing finite current', () => {
    let b = wire(wiredBench(), 'supply.positive', 'supply.negative', 'short');
    b.components = b.components.map((c) =>
      c.kind === 'dc-source' ? { ...c, currentLimitAmps: undefined } : c,
    );
    const r = solve(b);
    expect(r.diagnostics.some((d) => d.code === 'short-circuit')).toBe(true);
    expect(r.measurements.meter).toEqual({ status: 'fault', value: null });
    expect(r.componentCurrents['supply.source']).toBeUndefined();
  });
  it('shorted supply with power off is not an energized source fault', () => {
    expect(
      solve(
        wire(wiredBench(false), 'supply.positive', 'supply.negative', 'short'),
      ).diagnostics.some((d) => d.severity === 'fault'),
    ).toBe(false);
  });
  it('responds to values rather than recognizing the expected circuit', () => {
    let b = setValue(wiredBench(), 'supply.source', { voltageVolts: 24 });
    b = setValue(b, 'load.resistor', { resistanceOhms: 2000 });
    const r = solve(b);
    expect(r.measurements.meter.value).toBe(24);
    expect(r.componentCurrents['load.resistor']).toBeCloseTo(0.012, 10);
  });
  it('solves a series voltage divider not present in the initial experiment', () => {
    let b = withResistor(power(createBench()), 'r2', 2000);
    b = wire(b, 'supply.positive', 'load.A', 'a');
    b = wire(b, 'load.B', 'r2.A', 'b');
    b = wire(b, 'r2.B', 'supply.negative', 'c');
    b = wire(b, 'load.A', 'meter.V', 'v');
    b = wire(b, 'load.B', 'meter.COM', 'com');
    const r = solve(b);
    // 1 kΩ in parallel with the 10 MΩ meter input.
    expect(r.measurements.meter.value).toBeCloseTo(4, 2);
    expect(r.componentCurrents['load.resistor']).toBeCloseTo(0.004, 5);
  });
  it('shows voltmeter loading on a high-impedance divider', () => {
    let b = setValue(withResistor(power(createBench()), 'r2', 1e6), 'load.resistor', {
      resistanceOhms: 1e6,
    });
    b = wire(b, 'supply.positive', 'load.A', 'a');
    b = wire(b, 'load.B', 'r2.A', 'b');
    b = wire(b, 'r2.B', 'supply.negative', 'c');
    b = wire(b, 'r2.A', 'meter.V', 'v');
    b = wire(b, 'r2.B', 'meter.COM', 'com');
    const parallel = 1 / (1 / 1e6 + 1 / 10e6);
    expect(solve(b).measurements.meter.value).toBeCloseTo((12 * parallel) / (1e6 + parallel), 9);
    expect(display(b).text).toBe('5.71');
  });
  it('separates independent powered islands instead of adding a fictitious shared ground', () => {
    let b = wiredBench();
    b = deleteCable(b, 'meter-negative');
    b.terminals.push(
      { ...b.terminals[0], id: 'isolated.positive' },
      { ...b.terminals[1], id: 'isolated.negative' },
    );
    b.components.push({
      id: 'isolated',
      kind: 'dc-source',
      positive: 'isolated.positive',
      negative: 'isolated.negative',
      voltageVolts: 5,
      enabled: true,
    });
    b = wire(b, 'isolated.negative', 'meter.COM', 'isolated-com');
    expect(solve(b).measurements.meter.status).toBe('floating');
  });
  it('reports inconsistent ideal sources as a solver error, not a short circuit', () => {
    const b = wiredBench();
    b.components.push({
      id: 'conflict',
      kind: 'dc-source',
      positive: 'supply.positive',
      negative: 'supply.negative',
      voltageVolts: 24,
      enabled: true,
    });
    const r = solve(b);
    expect(r.diagnostics.some((d) => d.code === 'solver-error')).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'short-circuit')).toBe(false);
    expect(r.measurements.meter.status).toBe('error');
  });
  it('rejects invalid resistances rather than leaking NaN into displays', () => {
    const b = setValue(wiredBench(), 'load.resistor', { resistanceOhms: -5 });
    expect(solve(b).measurements.meter.status).toBe('error');
  });
});

describe('bench supply regulation', () => {
  const loaded = (ohms: number, limit = 1) => {
    let b = setValue(power(createBench()), 'load.resistor', { resistanceOhms: ohms });
    b = setValue(b, 'supply.source', { currentLimitAmps: limit });
    b = wire(b, 'supply.positive', 'load.A', 'a');
    b = wire(b, 'load.B', 'supply.negative', 'b');
    b = wire(b, 'load.A', 'meter.V', 'v');
    return wire(b, 'load.B', 'meter.COM', 'com');
  };
  it('switches to constant current when the load demands more than the limit', () => {
    const r = solve(loaded(10, 0.5));
    expect(r.sourceModes['supply.source']).toBe('CC');
    expect(r.componentCurrents['load.resistor']).toBeCloseTo(0.5 * (10e6 / (10e6 + 10)), 9);
    expect(r.measurements.meter.value).toBeCloseTo(5, 4);
    expect(r.diagnostics.some((d) => d.code === 'current-limit')).toBe(true);
  });
  it('stays in constant voltage below the limit', () => {
    const r = solve(loaded(100, 0.5));
    expect(r.sourceModes['supply.source']).toBe('CV');
    expect(r.measurements.meter.value).toBe(12);
  });
});

describe('DT-9205A electrical model', () => {
  const ammeterInSeries = (rangeId: string) => {
    let b = setMeter(power(createBench()), { rangeId });
    b = wire(b, 'supply.positive', 'meter.mA', 'a');
    b = wire(b, 'meter.COM', 'load.A', 'b');
    return wire(b, 'load.B', 'supply.negative', 'c');
  };
  it('measures series current through the range shunt, including its burden', () => {
    const b = ammeterInSeries('dca-20m');
    const r = solve(b);
    expect(r.measurements.meter.value).toBeCloseTo(12 / 1010, 12);
    expect(r.measurements.meter.value).toBeCloseTo(r.componentCurrents['load.resistor'], 12);
    expect(display(b)).toMatchObject({ text: '11.88', unit: 'mA', status: 'valid' });
    expect(display(ammeterInSeries('dca-200m')).text).toBe('12.0');
    expect(display(ammeterInSeries('dca-2m')).text).toBe('OL');
  });
  it('reads zero on a current range when the leads are in VΩ and COM', () => {
    const b = setMeter(wiredBench(), { rangeId: 'dca-200m' });
    expect(display(b).text).toBe('0.0');
  });
  it('an ammeter placed across the supply blows the mA fuse', () => {
    let b = setMeter(power(createBench()), { rangeId: 'dca-200m' });
    b = wire(b, 'supply.positive', 'meter.mA', 'a');
    b = wire(b, 'meter.COM', 'supply.negative', 'b');
    const { bench, trips } = settleProtection(b);
    expect(trips).toEqual([
      {
        equipmentId: 'meter',
        kind: 'fuse',
        componentId: 'meter.shunt-mA',
        amps: 1,
        ratingAmps: 0.2,
      },
    ]);
    expect(bench.instrumentSettings.meter.fuseBlown).toBe(true);
    expect(solve(bench).sourceModes['supply.source']).toBe('CV');
    expect(display(bench).text).toBe('0.0');
  });
  it('a lead left in the mA socket shorts the load while measuring voltage', () => {
    let b = wire(power(createBench()), 'supply.positive', 'load.A', 'a');
    b = wire(b, 'load.B', 'supply.negative', 'b');
    b = wire(b, 'load.A', 'meter.mA', 'wrong');
    b = wire(b, 'load.B', 'meter.COM', 'com');
    expect(solve(b).sourceModes['supply.source']).toBe('CC');
    expect(settleProtection(b).bench.instrumentSettings.meter.fuseBlown).toBe(true);
  });
  it('the unfused 20 A input across the supply drives it into current limit', () => {
    let b = setMeter(power(createBench()), { rangeId: 'dca-20' });
    b = wire(b, 'supply.positive', 'meter.20A', 'a');
    b = wire(b, 'meter.COM', 'supply.negative', 'b');
    const settled = settleProtection(b);
    expect(settled.trips).toEqual([]);
    expect(display(settled.bench).text).toBe('1.00');
    expect(solve(b).sourceModes['supply.source']).toBe('CC');
  });
  it('measures resistance with the supply off, and reports over-range', () => {
    let b = wire(createBench(), 'load.A', 'meter.V', 'v');
    b = wire(b, 'load.B', 'meter.COM', 'com');
    expect(display(setMeter(b, { rangeId: 'ohm-2k' }))).toMatchObject({
      text: '1.000',
      unit: 'kΩ',
      status: 'valid',
    });
    expect(display(setMeter(b, { rangeId: 'ohm-20k' })).text).toBe('1.00');
    expect(display(setMeter(b, { rangeId: 'ohm-200' }))).toMatchObject({
      text: '1',
      status: 'over-range',
    });
    expect(display(setMeter(createBench(), { rangeId: 'ohm-200M' })).text).toBe('1');
  });
  it('a de-energized supply in the circuit does not disturb the ohmmeter', () => {
    const b = setMeter(wiredBench(false), { rangeId: 'ohm-2k' });
    expect(display(b).text).toBe('1.000');
  });
  it('an ohmmeter on a powered circuit is flagged as invalid', () => {
    const b = setMeter(wiredBench(true), { rangeId: 'ohm-2k' });
    const r = solve(b);
    expect(r.diagnostics.some((d) => d.code === 'ohmmeter-energized')).toBe(true);
    expect(display(b).status).not.toBe('valid');
  });
  it('a switched-off meter shows nothing but its shunts still conduct', () => {
    let b = setMeter(power(createBench()), { powered: false });
    b = wire(b, 'supply.positive', 'meter.mA', 'a');
    b = wire(b, 'meter.COM', 'supply.negative', 'b');
    expect(display(b).status).toBe('off');
    expect(settleProtection(b).bench.instrumentSettings.meter.fuseBlown).toBe(true);
  });
});
