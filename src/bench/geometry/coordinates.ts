import type { Point } from '../../domain/models';

export function cablePath(a: Point, b: Point, slack = 80): string {
  const drop = Math.min(180, slack + Math.abs(a.x - b.x) * 0.13);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + drop}, ${b.x} ${b.y + drop}, ${b.x} ${b.y}`;
}
