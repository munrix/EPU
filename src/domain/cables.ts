import type { Cable, CableColor, Id, Point, Workbench } from './models';

/** Colours in the order they are handed out, so neighbouring leads stand apart. */
export const DISTINCT_COLORS: CableColor[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'black',
  'orange',
  'purple',
  'brown',
  'white',
  'grey',
];

const mapCable = (bench: Workbench, id: Id, change: (c: Cable) => Cable): Workbench => ({
  ...bench,
  cables: bench.cables.map((c) => (c.id === id ? change(c) : c)),
});

/** Replaces a lead's bend points. Bends never change what the lead connects. */
export const setBends = (bench: Workbench, id: Id, waypoints: Point[]) =>
  mapCable(bench, id, (c) => ({ ...c, routing: { ...c.routing, waypoints } }));

export const setCableStyle = (bench: Workbench, id: Id, style: 'curved' | 'straight') =>
  mapCable(bench, id, (c) => ({ ...c, routing: { ...c.routing, style } }));

/** Every lead in one colour. */
export const paintAllCables = (bench: Workbench, color: CableColor): Workbench => ({
  ...bench,
  cables: bench.cables.map((c) => ({ ...c, color })),
});

/** Each lead a different colour (repeating only past the number of colours). */
export const colorEachCable = (bench: Workbench): Workbench => ({
  ...bench,
  cables: bench.cables.map((c, i) => ({
    ...c,
    color: DISTINCT_COLORS[i % DISTINCT_COLORS.length],
  })),
});

/** Every lead laid straight (tidy runs) or hanging in curves. */
export const setAllCableStyles = (bench: Workbench, style: 'curved' | 'straight'): Workbench => ({
  ...bench,
  cables: bench.cables.map((c) => ({ ...c, routing: { ...c.routing, style } })),
});
