import type { Attachment, Point, Workbench } from './models';

/** Pure physical coordinates. No rendering or electrical assumptions. */
export function attachmentPosition(
  bench: Workbench,
  attachment: Attachment,
  visited = new Set<string>(),
): Point {
  if (attachment.kind === 'loose') return attachment.position;
  if (attachment.kind === 'terminal') {
    const terminal = bench.terminals.find((t) => t.id === attachment.terminalId);
    const equipment = bench.equipment.find((e) => e.id === terminal?.equipmentId);
    if (!terminal || !equipment) throw new Error('Unknown terminal');
    return {
      x: equipment.position.x + terminal.position.x,
      y: equipment.position.y + terminal.position.y,
    };
  }
  if (visited.has(attachment.plugId)) throw new Error('Cyclic plug attachment');
  visited.add(attachment.plugId);
  const plug = bench.plugs.find((p) => p.id === attachment.plugId);
  if (!plug) throw new Error('Unknown plug');
  const base = attachmentPosition(bench, plug.attachedTo, visited);
  return { x: base.x + 6, y: base.y - 9 };
}
