import type { Workbench } from '../domain/models';
import { instantiateEquipment } from './registry';

export const MAX_OPEN_BENCH_RESISTORS = 8;

/** Adds a removable resistor module with the next free R number. */
export function addResistor(bench: Workbench, resistanceOhms = 1000): Workbench {
  const used = new Set(bench.equipment.map((e) => e.id));
  let n = 1;
  while (used.has(`r${n}`)) n++;
  const count = bench.equipment.filter((e) => e.definitionId === 'resistor-v1').length;
  if (count >= MAX_OPEN_BENCH_RESISTORS)
    throw new Error('The bench holds up to eight resistor modules.');
  const offset = (count % 5) * 36;
  const item = instantiateEquipment(
    'resistor-v1',
    `r${n}`,
    { x: 640 + offset, y: 120 + offset },
    { label: `R${n}`, removable: true, values: { resistanceOhms } },
  );
  return {
    ...bench,
    equipment: [...bench.equipment, item.equipment],
    terminals: [...bench.terminals, ...item.terminals],
    components: [...bench.components, ...item.components],
    internalLinks: [...bench.internalLinks, ...item.internalLinks],
  };
}

/** Adds a lab plug-in board (rectifier or transistor) once per bench. */
export function addBoard(bench: Workbench, definitionId: string, id: string): Workbench {
  if (bench.equipment.some((e) => e.id === id))
    throw new Error('That board is already on the bench.');
  const item = instantiateEquipment(definitionId, id, { x: 1270, y: 720 }, { removable: true });
  return {
    ...bench,
    equipment: [...bench.equipment, item.equipment],
    terminals: [...bench.terminals, ...item.terminals],
    components: [...bench.components, ...item.components],
    internalLinks: [...bench.internalLinks, ...item.internalLinks],
  };
}
