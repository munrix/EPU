import { describe, expect, it } from 'vitest';
import {
  bendInsertIndex,
  cableCorners,
  cablePath,
  cableRoute,
  snapToGrid,
} from '../src/bench/geometry/coordinates';
import {
  colorEachCable,
  DISTINCT_COLORS,
  paintAllCables,
  setAllCableStyles,
  setBends,
  setCableStyle,
} from '../src/domain/cables';
import { assembleCircuit } from '../src/electrical/circuit/assemble';
import { generatorOcc } from '../src/experiments/generator';
import { parseBench } from '../src/persistence/bench';

const wired = () => generatorOcc.presets![0].build();

describe('cable management', () => {
  it('the preset has leads to work with', () => {
    expect(wired().cables.length).toBeGreaterThan(3);
  });

  it('paints every lead one colour, or each lead a different one', () => {
    const one = paintAllCables(wired(), 'purple');
    expect(new Set(one.cables.map((c) => c.color))).toEqual(new Set(['purple']));
    const each = colorEachCable(wired());
    each.cables.forEach((c, i) =>
      expect(c.color).toBe(DISTINCT_COLORS[i % DISTINCT_COLORS.length]),
    );
    const n = Math.min(each.cables.length, DISTINCT_COLORS.length);
    expect(new Set(each.cables.slice(0, n).map((c) => c.color)).size).toBe(n);
  });

  it('colours, bends and styles never change the circuit', () => {
    const b = wired();
    const id = b.cables[0].id;
    const changed = setCableStyle(
      setBends(colorEachCable(setAllCableStyles(b, 'straight')), id, [{ x: 100, y: 500 }]),
      id,
      'curved',
    );
    expect(assembleCircuit(changed)).toEqual(assembleCircuit(b));
  });

  it('bends and styles survive saving', () => {
    const b = setBends(setAllCableStyles(wired(), 'straight'), wired().cables[1].id, [
      { x: 120, y: 480 },
      { x: 300, y: 480 },
    ]);
    expect(parseBench(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('routes: the plain lead still hangs, bends are passed through, straight runs line up', () => {
    const a = { x: 0, y: 0 },
      b = { x: 200, y: 40 };
    expect(cableRoute(a, b, { slack: 80, waypoints: [] })).toBe(cablePath(a, b, 80));
    const bends = [{ x: 100, y: 200 }];
    expect(cableRoute(a, b, { slack: 80, waypoints: bends })).toContain('100 200');
    // Two straight leads with the same slack run along the same tray height.
    const tray = (from: { x: number; y: number }) =>
      cableCorners(from, b, { slack: 80, waypoints: [], style: 'straight' })[1].y;
    expect(tray({ x: 50, y: 10 })).toBe(tray(a));
  });

  it('snaps to the grid and inserts a new bend into the nearest segment', () => {
    expect(snapToGrid({ x: 29, y: 31 })).toEqual({ x: 20, y: 40 });
    const a = { x: 0, y: 0 },
      b = { x: 400, y: 0 };
    const bends = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ];
    expect(bendInsertIndex(a, b, bends, { x: 40, y: 50 })).toBe(0);
    expect(bendInsertIndex(a, b, bends, { x: 200, y: 105 })).toBe(1);
    expect(bendInsertIndex(a, b, bends, { x: 360, y: 50 })).toBe(2);
  });
});
