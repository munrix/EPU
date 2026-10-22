import { z } from 'zod';
import type { Component, ValueField, Workbench } from '../domain/models';
import { definitionOf, equipmentRegistry, instantiateEquipment } from '../equipment/registry';
import { defaultMeterSettings, meterRanges, migrateRangeId } from '../instruments/multimeter';
import { defaultExperiment, experimentById } from '../experiments/catalog';
import { defaultMachineState } from '../machines/dcGenerator';

const id = z.string().min(1).max(160);
const finite = z.number().finite();
const point = z.object({ x: finite.min(-10000).max(10000), y: finite.min(-10000).max(10000) });
const color = z.enum(['red', 'black', 'yellow', 'blue', 'green']);
const attachment = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('terminal'), terminalId: id }),
  z.object({ kind: z.literal('plug-back'), plugId: id }),
  z.object({ kind: z.literal('loose'), position: point }),
]);
const plugs = z
  .array(z.object({ id, cableId: id, attachedTo: attachment, stackable: z.boolean() }))
  .max(2000);
const cables = z
  .array(
    z.object({
      id,
      color,
      plugIds: z.tuple([id, id]),
      routing: z.object({ slack: finite.min(0).max(500), waypoints: z.array(point).max(100) }),
    }),
  )
  .max(1000);
const schema = z.object({
  schemaVersion: z.literal(3),
  instrumentSettings: z.record(
    z.object({
      kind: z.literal('multimeter'),
      powered: z.boolean(),
      rangeId: z.string().refine((r) => meterRanges.some((x) => x.id === r), 'Unknown meter range'),
      fuseBlown: z.boolean(),
    }),
  ),
  profileId: id,
  experimentId: id,
  equipment: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/, 'Invalid equipment ID'),
        definitionId: z.string().refine((d) => d in equipmentRegistry, 'Unknown equipment type'),
        label: z.string().max(12).optional(),
        position: point,
        movable: z.boolean(),
        removable: z.boolean().optional(),
        terminalIds: z.array(id),
        componentIds: z.array(id),
      }),
    )
    .max(40),
  terminals: z
    .array(
      z.object({
        id,
        equipmentId: id,
        label: z.string().max(60),
        position: point,
        connector: z.literal('banana-4mm'),
        color,
        stackable: z.boolean(),
        earthed: z.boolean().optional(),
      }),
    )
    .max(1000),
  components: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({
          id,
          kind: z.literal('resistor'),
          a: id,
          b: id,
          resistanceOhms: finite.min(0).max(1e9),
        }),
        z.object({
          id,
          kind: z.literal('dc-source'),
          positive: id,
          negative: id,
          voltageVolts: finite.min(-1000).max(1000),
          currentLimitAmps: finite.positive().max(100).optional(),
          enabled: z.boolean(),
        }),
        // Parts with fixed values: everything except the source switch comes from the definition.
        z.object({ id, kind: z.literal('capacitor') }).passthrough(),
        z.object({ id, kind: z.literal('diode') }).passthrough(),
        z.object({ id, kind: z.literal('npn') }).passthrough(),
        z.object({ id, kind: z.literal('inductor') }).passthrough(),
        z.object({ id, kind: z.literal('ac-source'), enabled: z.boolean() }).passthrough(),
      ]),
    )
    .max(1000),
  internalLinks: z.array(z.tuple([id, id])).max(2000),
  plugs,
  cables,
  machines: z
    .record(
      z.object({
        peakFieldAmps: finite.min(0).max(10),
        meterMode: z.enum(['motor', 'generator']),
      }),
    )
    .optional(),
  threePhase: z
    .record(
      z.object({
        on: z.boolean(),
        trip: z.string().max(300).optional(),
        hz: finite.min(0).max(60).optional(),
      }),
    )
    .optional(),
});

/** Schema 1 and 2 saves hold the Phase 1 inventory. Rebuild it and keep every physical choice. */
const legacySchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  instrumentSettings: z
    .record(z.object({ powered: z.boolean(), rangeId: z.string() }).passthrough())
    .optional(),
  equipment: z.array(z.object({ id, position: point }).passthrough()),
  components: z.array(z.object({ id, kind: z.string() }).passthrough()),
  plugs,
  cables,
});
function migrateLegacy(raw: unknown): unknown {
  const legacy = legacySchema.parse(raw);
  const bench = experimentById('dc-foundations')!.createBench();
  const position = new Map(legacy.equipment.map((e) => [e.id, e.position]));
  const source = legacy.components.find((c) => c.kind === 'dc-source') as
    { voltageVolts?: number; enabled?: boolean } | undefined;
  const resistor = legacy.components.find((c) => c.kind === 'resistor') as
    { resistanceOhms?: number } | undefined;
  const meter = legacy.instrumentSettings?.meter;
  return {
    ...bench,
    equipment: bench.equipment.map((e) => ({ ...e, position: position.get(e.id) ?? e.position })),
    components: bench.components.map((c) =>
      c.kind === 'dc-source'
        ? {
            ...c,
            voltageVolts: source?.voltageVolts ?? c.voltageVolts,
            enabled: source?.enabled ?? false,
          }
        : c.kind === 'resistor'
          ? { ...c, resistanceOhms: resistor?.resistanceOhms ?? c.resistanceOhms }
          : c,
    ),
    instrumentSettings: {
      meter: {
        ...defaultMeterSettings,
        powered: meter?.powered ?? true,
        rangeId: migrateRangeId(meter?.rangeId ?? defaultMeterSettings.rangeId),
      },
    },
    plugs: legacy.plugs,
    cables: legacy.cables,
  };
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

export function parseBench(raw: unknown): Workbench {
  const version =
    raw && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : undefined;
  // Fixed-value parts are only checked for kind here and rebuilt from their definitions below.
  const bench = schema.parse(
    version === 1 || version === 2 ? migrateLegacy(raw) : raw,
  ) as unknown as Workbench;
  const unique = <T extends { id: string }>(items: T[]) => {
    const set = new Set(items.map((i) => i.id));
    if (set.size !== items.length) throw new Error('Duplicate IDs in saved bench');
    return set;
  };
  const equipment = unique(bench.equipment),
    terminals = unique(bench.terminals),
    plugIds = unique(bench.plugs),
    cableIds = unique(bench.cables);
  unique(bench.components);
  const requireId = (set: Set<string>, key: string) => {
    if (!set.has(key)) throw new Error(`Missing reference: ${key}`);
  };
  bench.terminals.forEach((t) => requireId(equipment, t.equipmentId));
  bench.equipment.forEach((e) => e.terminalIds.forEach((t) => requireId(terminals, t)));
  bench.internalLinks.flat().forEach((t) => requireId(terminals, t));

  // Every socket and component must be exactly what the equipment definition provides.
  // Socket positions and labels come from the definition, never from the file.
  const normalized = bench.equipment.map((e) =>
    instantiateEquipment(e.definitionId, e.id, e.position, {
      label: e.label,
      removable: e.removable,
    }),
  );
  const internalLinks = normalized.flatMap((n) => n.internalLinks);
  const linkKeys = (links: [string, string][]) =>
    links.map((pair) => JSON.stringify([...pair].sort()));
  if (!sameSet(linkKeys(bench.internalLinks), linkKeys(internalLinks)))
    throw new Error(
      'Internal connections do not match the equipment definitions. Use patch leads between devices.',
    );
  const owned = new Set<string>();
  normalized.forEach((expected, i) => {
    const e = bench.equipment[i];
    if (
      !sameSet(e.terminalIds, expected.equipment.terminalIds) ||
      !sameSet(e.componentIds, expected.equipment.componentIds)
    )
      throw new Error(`Equipment ${e.id} does not match its definition.`);
    expected.equipment.terminalIds.forEach((t) => owned.add(t));
  });
  if (bench.terminals.some((t) => !owned.has(t.id)))
    throw new Error('A socket does not belong to any equipment definition.');
  const expectedComponents = new Map(
    normalized.flatMap((n) =>
      n.components.map((c) => [c.id, { component: c, equipment: n.equipment }]),
    ),
  );
  const components: Component[] = bench.components.map((c) => {
    const expected = expectedComponents.get(c.id);
    if (!expected) throw new Error(`Unexpected component: ${c.id}`);
    const template = expected.component;
    const limits = definitionOf(expected.equipment).limits;
    const within = (value: number, range?: [number, number]) =>
      !range || (value >= range[0] && value <= range[1]);
    if (c.kind === 'resistor' && template.kind === 'resistor') {
      if (
        definitionOf(expected.equipment).fixedValues &&
        c.resistanceOhms !== template.resistanceOhms
      )
        throw new Error('Fixed trainer component values cannot be changed.');
      if (c.a !== template.a || c.b !== template.b)
        throw new Error(`Component ${c.id} pins changed.`);
      if (!within(c.resistanceOhms, limits.resistanceOhms))
        throw new Error('Component values exceed the equipment controls.');
      return { ...template, resistanceOhms: c.resistanceOhms };
    }
    if (c.kind === 'dc-source' && template.kind === 'dc-source') {
      if (c.positive !== template.positive || c.negative !== template.negative)
        throw new Error(`Component ${c.id} pins changed.`);
      // Fixed outputs (the bench's 12 V supplies) always take the definition's values.
      const fixed = definitionOf(expected.equipment).components.some(
        (t) => t.kind === 'dc-source' && t.fixed && c.id === `${expected.equipment.id}.${t.key}`,
      );
      if (fixed) return { ...template, enabled: c.enabled };
      const currentLimitAmps = c.currentLimitAmps ?? template.currentLimitAmps;
      if (
        !within(c.voltageVolts, limits.voltageVolts) ||
        !within(currentLimitAmps!, limits.currentLimitAmps)
      )
        throw new Error('Component values exceed the equipment controls.');
      return { ...template, voltageVolts: c.voltageVolts, currentLimitAmps, enabled: c.enabled };
    }
    if (c.kind !== template.kind) throw new Error(`Component ${c.id} has the wrong kind.`);
    // Adjustable values (decade boxes, generator dials) are kept when the definition allows them.
    const adjustable = (field: ValueField, value: unknown, fallback: number) => {
      const range = limits[field];
      if (!range || typeof value !== 'number') return fallback;
      if (!within(value, range)) throw new Error('Component values exceed the equipment controls.');
      return value;
    };
    if (template.kind === 'ac-source' && c.kind === 'ac-source')
      return {
        ...template,
        enabled: c.enabled,
        rmsVolts: adjustable('rmsVolts', c.rmsVolts, template.rmsVolts),
        frequencyHz: adjustable('frequencyHz', c.frequencyHz, template.frequencyHz),
      };
    if (template.kind === 'capacitor' && c.kind === 'capacitor')
      return {
        ...template,
        capacitanceFarads: adjustable(
          'capacitanceFarads',
          c.capacitanceFarads,
          template.capacitanceFarads,
        ),
      };
    if (template.kind === 'inductor' && c.kind === 'inductor')
      return {
        ...template,
        inductanceHenries: adjustable(
          'inductanceHenries',
          c.inductanceHenries,
          template.inductanceHenries,
        ),
      };
    return template;
  });
  if (components.length !== expectedComponents.size)
    throw new Error('Equipment components are missing.');

  const meters = bench.equipment
    .filter((e) => definitionOf(e).kind === 'multimeter')
    .map((e) => e.id);
  if (!sameSet(Object.keys(bench.instrumentSettings), meters))
    throw new Error('Instrument settings do not match the multimeters on the bench.');
  // Machine state belongs to motor–generator sets only; a set without saved state starts at rest.
  const sets = bench.equipment.filter((e) => definitionOf(e).kind === 'mg-set').map((e) => e.id);
  if (Object.keys(bench.machines ?? {}).some((id) => !sets.includes(id)))
    throw new Error('Machine state does not match the machines on the bench.');
  const machines = sets.length
    ? Object.fromEntries(sets.map((id) => [id, bench.machines?.[id] ?? defaultMachineState]))
    : undefined;
  const supplies = bench.equipment
    .filter((e) => ['three-phase-supply', 'frequency-inverter'].includes(definitionOf(e).kind))
    .map((e) => e.id);
  if (Object.keys(bench.threePhase ?? {}).some((id) => !supplies.includes(id)))
    throw new Error('Supply state does not match the three-phase supplies on the bench.');
  const threePhase = supplies.length
    ? Object.fromEntries(supplies.map((id) => [id, bench.threePhase?.[id] ?? { on: false }]))
    : undefined;
  const experiment = experimentById(bench.experimentId);
  if (!experiment || experiment.profileId !== bench.profileId)
    throw new Error('This file is for an experiment this version does not provide.');

  const occupied = new Set<string>();
  bench.plugs.forEach((p) => {
    requireId(cableIds, p.cableId);
    if (!bench.cables.find((c) => c.id === p.cableId)!.plugIds.includes(p.id))
      throw new Error('Plug is not owned by its cable');
    if (p.attachedTo.kind === 'terminal') requireId(terminals, p.attachedTo.terminalId);
    if (p.attachedTo.kind === 'plug-back') requireId(plugIds, p.attachedTo.plugId);
    if (p.attachedTo.kind !== 'loose') {
      const target = JSON.stringify(p.attachedTo);
      if (occupied.has(target)) throw new Error('Two plugs occupy the same receptacle');
      occupied.add(target);
    }
    let current = p;
    const visited = new Set<string>();
    while (current.attachedTo.kind === 'plug-back') {
      if (visited.has(current.id)) throw new Error('Cyclic stack in saved bench');
      visited.add(current.id);
      const parentId = current.attachedTo.plugId;
      current = bench.plugs.find((q) => q.id === parentId)!;
      if (!current || !current.stackable) throw new Error('Invalid stack parent');
    }
  });
  bench.cables.forEach((c) => {
    if (c.plugIds[0] === c.plugIds[1]) throw new Error('Cable must have two distinct plugs');
    c.plugIds.forEach((p) => {
      requireId(plugIds, p);
      if (bench.plugs.find((q) => q.id === p)!.cableId !== c.id)
        throw new Error('Invalid cable ownership');
    });
  });
  return {
    ...bench,
    equipment: normalized.map((n) => n.equipment),
    terminals: normalized.flatMap((n) => n.terminals),
    components,
    internalLinks,
    ...(machines ? { machines } : {}),
    ...(threePhase ? { threePhase } : {}),
  };
}

const LEGACY_KEY = 'epu-lab.bench.v1';
const EXPERIMENT_KEY = 'epu-lab.experiment';
const benchKey = (experimentId: string) => `epu-lab.bench.v3.${experimentId}`;

export function loadBench(experimentId: string): Workbench | null {
  try {
    const raw = localStorage.getItem(benchKey(experimentId));
    if (raw) {
      const bench = parseBench(JSON.parse(raw));
      if (bench.experimentId !== experimentId) return null;
      // A lab station whose equipment has changed since it was saved starts afresh, so a new
      // device (for example the R S T supply) is never missing from an old save.
      const experiment = experimentById(experimentId);
      if (experiment?.station) {
        // By kind, so DCM 01's randomly chosen machine wiring still counts as the same bench.
        const kinds = (b: Workbench) => b.equipment.map((e) => definitionOf(e).kind);
        const expected = kinds(experiment.createBench());
        const saved = kinds(bench);
        if (expected.sort().join() !== saved.sort().join()) return null;
      }
      return bench;
    }
    const legacy = experimentId === 'dc-foundations' ? localStorage.getItem(LEGACY_KEY) : null;
    return legacy ? parseBench(JSON.parse(legacy)) : null;
  } catch {
    return null;
  }
}
export function saveBench(bench: Workbench): boolean {
  try {
    localStorage.setItem(benchKey(bench.experimentId), JSON.stringify(bench));
    localStorage.setItem(EXPERIMENT_KEY, bench.experimentId);
    return true;
  } catch {
    return false;
  }
}
export function lastExperimentId(): string {
  try {
    const id = localStorage.getItem(EXPERIMENT_KEY);
    return id && experimentById(id) ? id : defaultExperiment.id;
  } catch {
    return defaultExperiment.id;
  }
}

export interface NotebookState {
  achieved: number[];
  records: Record<number, string>;
  /** Table ID → column → row ID → value. */
  tables?: Record<string, Record<string, Record<string, number>>>;
}
const notebookKey = (experimentId: string) => `epu-lab.notebook.${experimentId}`;
export function loadNotebook(experimentId: string): NotebookState {
  try {
    const parsed = z
      .object({
        achieved: z.array(z.number().int().min(0).max(50)).max(50),
        records: z.record(z.string().max(120)),
        tables: z.record(z.record(z.record(z.number().finite()))).optional(),
      })
      .parse(JSON.parse(localStorage.getItem(notebookKey(experimentId)) ?? 'null'));
    return { achieved: parsed.achieved, records: parsed.records, tables: parsed.tables ?? {} };
  } catch {
    return { achieved: [], records: {}, tables: {} };
  }
}
export function saveNotebook(experimentId: string, notebook: NotebookState) {
  try {
    localStorage.setItem(notebookKey(experimentId), JSON.stringify(notebook));
  } catch {
    /* Notebook saving is optional. */
  }
}
