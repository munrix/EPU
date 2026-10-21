import { describe, expect, it } from 'vitest';
import { attachPlug, connectCable, deleteCable, unplug } from '../src/domain/connections';
import { buildCircuit } from '../src/electrical/connectivity/buildCircuit';
import { createBench, wire, wiredBench } from './helpers';

describe('physical connections and derived electrical nets', () => {
  it('starts with eight isolated sockets and does not merge component pins', () => {
    const c = buildCircuit(createBench());
    expect(c.nodes).toHaveLength(8);
    expect(c.terminalToNode['load.A']).not.toBe(c.terminalToNode['load.B']);
  });
  it('makes two nets through four actual cables with stacked meter leads', () => {
    const b = wiredBench();
    const c = buildCircuit(b);
    // Two wired nets plus the unused mA and 20A sockets.
    expect(c.nodes).toHaveLength(4);
    expect(c.terminalToNode['meter.COM']).toBe(c.terminalToNode['supply.negative']);
    expect(b.plugs.find((p) => p.id === 'meter-positive:a')?.attachedTo).toEqual({
      kind: 'plug-back',
      plugId: 'supply-lead:b',
    });
    expect(c.terminalToNode['meter.V']).toBe(c.terminalToNode['supply.positive']);
  });
  it('allows repeated stacking without a one-wire restriction', () => {
    let b = wire(createBench(), 'supply.positive', 'load.A', 'first');
    for (let i = 0; i < 15; i++) b = wire(b, 'supply.positive', 'load.B', `extra-${i}`);
    expect(b.cables).toHaveLength(16);
    expect(buildCircuit(b).terminalToNode['load.A']).toBe(buildCircuit(b).terminalToNode['load.B']);
  });
  it('does not use cable color or position for electrical connectivity', () => {
    const b = wiredBench();
    const changed = {
      ...b,
      equipment: b.equipment.map((e) => ({ ...e, position: { x: 0, y: 0 } })),
      cables: b.cables.map((c) => ({ ...c, color: 'green' as const })),
    };
    expect(buildCircuit(changed)).toEqual(buildCircuit(b));
  });
  it('unplugging the base lifts the entire stack while preserving its internal connection', () => {
    const b = unplug(wiredBench(), 'supply-lead:b');
    const c = buildCircuit(b);
    expect(c.terminalToNode['meter.V']).toBe(c.terminalToNode['supply.positive']);
    expect(c.terminalToNode['load.A']).not.toBe(c.terminalToNode['supply.positive']);
    expect(b.plugs.find((p) => p.id === 'meter-positive:a')?.attachedTo.kind).toBe('plug-back');
  });
  it('deleting a supporting lead leaves the child plug loose, not reparented', () => {
    const b = deleteCable(wiredBench(), 'supply-lead');
    expect(b.plugs.find((p) => p.id === 'meter-positive:a')?.attachedTo.kind).toBe('loose');
    const c = buildCircuit(b);
    expect(c.terminalToNode['meter.V']).not.toBe(c.terminalToNode['load.A']);
  });
  it('reconnecting a loose stack restores all contacts', () => {
    const original = wiredBench();
    const b = attachPlug(unplug(original, 'supply-lead:b'), 'supply-lead:b', {
      kind: 'terminal',
      terminalId: 'load.A',
    });
    expect(buildCircuit(b)).toEqual(buildCircuit(original));
  });
  it('rejects mechanical self-attachment cycles while allowing electrical shorts', () => {
    const b = wiredBench();
    expect(() =>
      attachPlug(b, 'supply-lead:b', { kind: 'plug-back', plugId: 'meter-positive:a' }),
    ).toThrow('itself');
    const shorted = wire(b, 'supply.positive', 'supply.negative', 'short');
    expect(buildCircuit(shorted).nodes).toHaveLength(3);
    expect(buildCircuit(shorted).terminalToNode['supply.positive']).toBe(
      buildCircuit(shorted).terminalToNode['supply.negative'],
    );
  });
  it('does not create a connection when both endpoints choose the same exposed receptacle', () => {
    expect(() =>
      connectCable(
        createBench(),
        { kind: 'terminal', terminalId: 'load.A' },
        { kind: 'terminal', terminalId: 'load.A' },
        'red',
        'same',
      ),
    ).toThrow('different');
  });
});
