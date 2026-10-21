import type { Attachment, CableColor, ConnectionTarget, Id, Point, Workbench } from './models';
import { attachmentPosition } from './positions';

export function sameAttachment(a: Attachment, b: Attachment): boolean {
  return a.kind === 'terminal' && b.kind === 'terminal'
    ? a.terminalId === b.terminalId
    : a.kind === 'plug-back' && b.kind === 'plug-back'
      ? a.plugId === b.plugId
      : false;
}

export function exposedTarget(bench: Workbench, target: ConnectionTarget): ConnectionTarget {
  let current = target;
  const visited = new Set<string>();
  while (true) {
    const child = bench.plugs.find((p) => sameAttachment(p.attachedTo, current));
    if (!child) return current;
    if (visited.has(child.id)) throw new Error('Cyclic plug attachment');
    visited.add(child.id);
    current = { kind: 'plug-back', plugId: child.id };
  }
}

function validateTarget(bench: Workbench, target: ConnectionTarget) {
  if (target.kind === 'terminal') {
    if (!bench.terminals.some((t) => t.id === target.terminalId)) throw new Error('Unknown socket');
  } else if (!bench.plugs.find((p) => p.id === target.plugId)?.stackable) {
    throw new Error('Plug has no stackable receptacle');
  }
}

export function connectCable(
  bench: Workbench,
  start: ConnectionTarget,
  end: ConnectionTarget,
  color: CableColor,
  id: string = crypto.randomUUID(),
): Workbench {
  const a = exposedTarget(bench, start);
  const b = exposedTarget(bench, end);
  validateTarget(bench, a);
  validateTarget(bench, b);
  if (sameAttachment(a, b)) throw new Error('Choose a different physical receptacle');
  if (bench.cables.some((c) => c.id === id)) throw new Error('Duplicate cable ID');
  const plugA = `${id}:a`,
    plugB = `${id}:b`;
  return {
    ...bench,
    cables: [
      ...bench.cables,
      {
        id,
        color,
        plugIds: [plugA, plugB],
        routing: { slack: 65 + (bench.cables.length % 4) * 18, waypoints: [] },
      },
    ],
    plugs: [
      ...bench.plugs,
      { id: plugA, cableId: id, attachedTo: a, stackable: true },
      { id: plugB, cableId: id, attachedTo: b, stackable: true },
    ],
  };
}

export function unplug(bench: Workbench, plugId: Id): Workbench {
  const point = attachmentPosition(bench, { kind: 'plug-back', plugId });
  return {
    ...bench,
    plugs: bench.plugs.map((p) =>
      p.id === plugId
        ? { ...p, attachedTo: { kind: 'loose', position: { x: point.x + 22, y: point.y + 90 } } }
        : p,
    ),
  };
}

export function attachPlug(bench: Workbench, plugId: Id, target: ConnectionTarget): Workbench {
  const exposed = exposedTarget(bench, target);
  validateTarget(bench, exposed);
  let current: Attachment = exposed;
  const visited = new Set<string>();
  while (current.kind === 'plug-back') {
    if (current.plugId === plugId || visited.has(current.plugId))
      throw new Error('A stack cannot attach to itself');
    visited.add(current.plugId);
    const parent = bench.plugs.find((p) => p.id === (current as { plugId: string }).plugId);
    if (!parent) throw new Error('Unknown plug');
    current = parent.attachedTo;
  }
  return {
    ...bench,
    plugs: bench.plugs.map((p) => (p.id === plugId ? { ...p, attachedTo: exposed } : p)),
  };
}

export function moveLoosePlug(bench: Workbench, plugId: Id, position: Point): Workbench {
  return {
    ...bench,
    plugs: bench.plugs.map((p) =>
      p.id === plugId ? { ...p, attachedTo: { kind: 'loose', position } } : p,
    ),
  };
}

export function deleteCable(bench: Workbench, cableId: Id): Workbench {
  const removed = new Set(bench.cables.find((c) => c.id === cableId)?.plugIds ?? []);
  const plugs = bench.plugs
    .filter((p) => !removed.has(p.id))
    .map((p) => {
      if (p.attachedTo.kind !== 'plug-back' || !removed.has(p.attachedTo.plugId)) return p;
      const point = attachmentPosition(bench, p.attachedTo);
      return {
        ...p,
        attachedTo: { kind: 'loose' as const, position: { x: point.x + 20, y: point.y + 65 } },
      };
    });
  return { ...bench, cables: bench.cables.filter((c) => c.id !== cableId), plugs };
}

export function describeAttachment(bench: Workbench, attachment: Attachment): string {
  if (attachment.kind === 'loose') return 'Loose plug';
  if (attachment.kind === 'terminal') return attachment.terminalId;
  const parent = bench.plugs.find((p) => p.id === attachment.plugId);
  return parent ? `${describeAttachment(bench, parent.attachedTo)} · stacked` : 'Missing plug';
}

/**
 * Removes equipment from the bench. Plugs in its sockets are left loose where they were;
 * anything stacked on those plugs stays attached to them, as when a module is pulled away.
 */
export function removeEquipment(bench: Workbench, equipmentId: Id): Workbench {
  const equipment = bench.equipment.find((e) => e.id === equipmentId);
  if (!equipment) return bench;
  const terminals = new Set(equipment.terminalIds);
  const components = new Set(equipment.componentIds);
  const plugs = bench.plugs.map((p) => {
    if (p.attachedTo.kind !== 'terminal' || !terminals.has(p.attachedTo.terminalId)) return p;
    const point = attachmentPosition(bench, p.attachedTo);
    return {
      ...p,
      attachedTo: { kind: 'loose' as const, position: { x: point.x, y: point.y + 40 } },
    };
  });
  const { [equipmentId]: _removed, ...instrumentSettings } = bench.instrumentSettings;
  return {
    ...bench,
    instrumentSettings,
    equipment: bench.equipment.filter((e) => e.id !== equipmentId),
    terminals: bench.terminals.filter((t) => !terminals.has(t.id)),
    components: bench.components.filter((c) => !components.has(c.id)),
    internalLinks: bench.internalLinks.filter(([a, b]) => !terminals.has(a) && !terminals.has(b)),
    plugs,
  };
}
