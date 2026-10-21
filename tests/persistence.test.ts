import { describe, expect, it } from 'vitest';
import { parseBench } from '../src/persistence/bench';
import { addResistor } from '../src/equipment/commands';
import { removeEquipment } from '../src/domain/connections';
import { openBench } from '../src/experiments/catalog';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { setValue, wire, wiredBench } from './helpers';

/** A save written by the schema 2 build (DT-9205A layout, `voltage` measurement). */
function schema2Save() {
  const b = wiredBench();
  return {
    schemaVersion: 2,
    instrumentSettings: { meter: { kind: 'multimeter', powered: true, rangeId: 'DC A-1' } },
    profileId: 'dc',
    experimentId: 'dc-foundations',
    equipment: [
      {
        id: 'supply',
        definitionId: 'dc-supply-v1',
        position: { x: 10, y: 20 },
        movable: true,
        terminalIds: [],
        componentIds: ['source'],
      },
      {
        id: 'load',
        definitionId: 'resistor-v1',
        position: { x: 500, y: 300 },
        movable: true,
        terminalIds: [],
        componentIds: ['resistor'],
      },
      {
        id: 'meter',
        definitionId: 'voltmeter-v1',
        position: { x: 900, y: 100 },
        movable: true,
        terminalIds: [],
        componentIds: [],
      },
    ],
    terminals: b.terminals,
    components: [
      {
        id: 'source',
        kind: 'dc-source',
        positive: 'supply.positive',
        negative: 'supply.negative',
        voltageVolts: 9,
        enabled: true,
      },
      { id: 'resistor', kind: 'resistor', a: 'load.A', b: 'load.B', resistanceOhms: 470 },
    ],
    measurements: [],
    internalLinks: [],
    plugs: b.plugs,
    cables: b.cables,
  };
}

describe('versioned bench persistence', () => {
  it('rejects invisible inter-device and intra-device links from imported files', () => {
    const b = wiredBench();
    expect(() => parseBench({ ...b, internalLinks: [['supply.positive', 'load.A']] })).toThrow(
      /Internal connections/,
    );
    expect(() => parseBench({ ...b, internalLinks: [['load.A', 'load.B']] })).toThrow(
      /Internal connections/,
    );
  });
  it('round trips physical stacks exactly', () => {
    const b = wiredBench();
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
  it('rejects unknown schema versions', () => {
    expect(() => parseBench({ ...wiredBench(), schemaVersion: 9 })).toThrow();
  });
  it('migrates schema 2 saves, keeping positions, values, leads and the meter range', () => {
    const migrated = parseBench(JSON.parse(JSON.stringify(schema2Save())));
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.equipment.find((e) => e.id === 'load')?.position).toEqual({ x: 500, y: 300 });
    expect(migrated.components.find((c) => c.id === 'supply.source')).toMatchObject({
      voltageVolts: 9,
      enabled: true,
      currentLimitAmps: 1,
    });
    expect(migrated.instrumentSettings.meter).toMatchObject({
      rangeId: 'dca-200m',
      fuseBlown: false,
    });
    expect(migrated.plugs).toEqual(wiredBench().plugs);
    const c = assembleCircuit(migrated);
    expect(c.terminalToNode['meter.V']).toBe(c.terminalToNode['supply.positive']);
  });
  it('rejects equipment that does not match its definition', () => {
    const b = wiredBench();
    b.equipment = b.equipment.map((e) =>
      e.id === 'meter' ? { ...e, terminalIds: e.terminalIds.slice(1) } : e,
    );
    expect(() => parseBench(b)).toThrow('does not match its definition');
  });
  it('restores socket layout from the definition rather than the file', () => {
    const b = wiredBench();
    b.terminals = b.terminals.map((t) => ({ ...t, position: { x: 0, y: 0 }, label: 'X' }));
    const parsed = parseBench(b);
    expect(parsed.terminals).toEqual(wiredBench().terminals);
  });
  it('rejects values outside the equipment controls and unknown experiments', () => {
    expect(() =>
      parseBench(setValue(wiredBench(), 'supply.source', { voltageVolts: 400 })),
    ).toThrow('exceed');
    expect(() => parseBench({ ...wiredBench(), experimentId: 'mystery' })).toThrow('experiment');
  });
  it('rejects cyclic plug stacks', () => {
    const b = wiredBench();
    b.plugs[0].attachedTo = { kind: 'plug-back', plugId: b.plugs[0].id };
    expect(() => parseBench(b)).toThrow('Cyclic');
  });
  it('rejects missing terminals and duplicate physical occupancy', () => {
    const missing = wiredBench();
    missing.terminals.pop();
    expect(() => parseBench(missing)).toThrow();
    const occupied = wiredBench();
    occupied.plugs[4].attachedTo = { kind: 'terminal', terminalId: 'load.A' };
    expect(() => parseBench(occupied)).toThrow('same receptacle');
  });
  it('round trips an open bench with added and removed modules', () => {
    let b = addResistor(addResistor(openBench.createBench(), 330));
    b = wire(b, 'r3.A', 'r4.B', 'lead');
    b = removeEquipment(b, 'r1');
    expect(b.equipment.map((e) => e.id)).toEqual(['supply', 'r2', 'meter', 'r3', 'r4']);
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
  it('removing a module leaves its plugs loose but keeps their stacks', () => {
    let b = wire(openBench.createBench(), 'supply.positive', 'r1.A', 'feed');
    b = wire(b, 'r1.A', 'r2.A', 'stacked');
    b = removeEquipment(b, 'r1');
    expect(b.plugs.find((p) => p.id === 'feed:b')?.attachedTo.kind).toBe('loose');
    expect(b.plugs.find((p) => p.id === 'stacked:a')?.attachedTo).toEqual({
      kind: 'plug-back',
      plugId: 'feed:b',
    });
    const c = assembleCircuit(b);
    expect(c.terminalToNode['r2.A']).toBe(c.terminalToNode['supply.positive']);
  });
});
