import type { Cable, Point } from '../../domain/models';

export function cablePath(a: Point, b: Point, slack = 80): string {
  const drop = Math.min(180, slack + Math.abs(a.x - b.x) * 0.13);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + drop}, ${b.x} ${b.y + drop}, ${b.x} ${b.y}`;
}

/** Spacing of the grid that bend points snap to, so neighbouring leads line up. */
export const BEND_GRID = 20;
export const snapToGrid = (p: Point): Point => ({
  x: Math.round(p.x / BEND_GRID) * BEND_GRID,
  y: Math.round(p.y / BEND_GRID) * BEND_GRID,
});

/**
 * The points a lead passes through in order: its two plugs and its bend points. A straight lead
 * without bend points drops below the lower plug and runs across, like a lead laid along a tray.
 */
export function cableCorners(a: Point, b: Point, routing: Cable['routing']): Point[] {
  if (routing.waypoints.length || routing.style !== 'straight') return [a, ...routing.waypoints, b];
  const y = Math.max(a.y, b.y) + 24 + routing.slack * 0.3;
  return [a, { x: a.x, y }, { x: b.x, y }, b];
}

/** SVG path of a lead: a hanging curve, a smooth curve through its bends, or straight runs. */
export function cableRoute(a: Point, b: Point, routing: Cable['routing']): string {
  if (routing.style !== 'straight' && !routing.waypoints.length)
    return cablePath(a, b, routing.slack);
  const points = cableCorners(a, b, routing);
  return routing.style === 'straight' ? roundedPolyline(points, 12) : smoothThrough(points);
}

/** Straight segments with rounded corners. */
function roundedPolyline(points: Point[], radius: number): string {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [p, q, r] = [points[i - 1], points[i], points[i + 1]];
    const inLen = Math.hypot(q.x - p.x, q.y - p.y),
      outLen = Math.hypot(r.x - q.x, r.y - q.y);
    const k = Math.min(radius, inLen / 2, outLen / 2);
    if (k < 0.5) {
      d += ` L ${q.x} ${q.y}`;
      continue;
    }
    const before = { x: q.x - ((q.x - p.x) / inLen) * k, y: q.y - ((q.y - p.y) / inLen) * k };
    const after = { x: q.x + ((r.x - q.x) / outLen) * k, y: q.y + ((r.y - q.y) / outLen) * k };
    d += ` L ${before.x} ${before.y} Q ${q.x} ${q.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** A smooth curve through every point (Catmull–Rom as cubic Béziers). */
function smoothThrough(points: Point[]): string {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Where a new bend point belongs: the index in the bend list of the segment nearest the click. */
export function bendInsertIndex(a: Point, b: Point, waypoints: Point[], at: Point): number {
  const points = [a, ...waypoints, b];
  let best = 0,
    bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(at, points[i], points[i + 1]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
