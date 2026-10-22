import type { Component, ElectricalCircuit, SimulationResult, Workbench } from '../domain/models';
import type { MeterDisplay } from '../instruments/multimeter';
import type { ChannelTrace } from '../instruments/oscilloscope';

/** Read-only view of the solved bench used by experiment checks. Checks never alter wiring. */
export interface StepContext {
  bench: Workbench;
  circuit: ElectricalCircuit;
  result: SimulationResult;
  /** Two terminals share an electrical net. */
  connected(a: string, b: string): boolean;
  /** A terminal carries a base plug with at least one plug stacked on its back. */
  stacked(terminalId: string): boolean;
  powered(supplyId?: string): boolean;
  sourceVolts(supplyId?: string): number;
  /** Delivered supply current (positive when the supply is sourcing). */
  suppliedAmps(supplyId?: string): number;
  meter(meterId?: string): MeterDisplay;
  /** Signed current through an equipment component. */
  current(componentId: string): number;
  /** The meter's VΩ/COM leads are on the nets of a and b, in either orientation. */
  meterAcross(a: string, b: string, meterId?: string): boolean;
  /** A component on the bench, for reading its current setting. */
  part(componentId: string): Component | undefined;
  /** Oscilloscope channels as displayed, and the phase of CH2 relative to CH1 in degrees. */
  scope(scopeId?: string): {
    ch1: ChannelTrace;
    ch2: ChannelTrace;
    phaseDegrees: number | null;
  };
  /** A valid DC current reading that equals the given current. */
  meterReads(amps: number, meterId?: string): boolean;
  /** Meter shunt and named component share an unbranched electrical path. */
  meterInSeries(componentId: string, meterId?: string): boolean;
}

export interface ExperimentStep {
  text: string;
  hint?: string;
  check(ctx: StepContext): boolean;
  /** Captured into the lab notebook the moment the step is first satisfied. */
  record?(ctx: StepContext): string;
}

/**
 * A results table as printed on the lab sheet. Columns are usually frequencies or load types.
 * Pressing Record copies every row that can be measured right now into the current column;
 * derived rows are calculated from recorded cells, never from the simulator.
 */
export interface TableRow {
  id: string;
  label: string;
  unit?: string;
  decimals?: number;
  capture?(ctx: StepContext): number | null;
  derive?(cells: Record<string, number>, column: string): number | null;
  /** Custom display, e.g. a terminal pair or a winding name. */
  format?(value: number): string;
}
export interface ExperimentTable {
  id: string;
  title: string;
  columnLabel: string;
  columns: string[];
  /** Which column the bench is currently set up for, or null. */
  column(ctx: StepContext): string | null;
  rows: TableRow[];
  note?: string;
  /** With numbered slots (Pair 1, Pair 2…): a row whose value identifies the slot to overwrite. */
  slotKey?: string;
}

/** A sheet's figure already wired on the bench, for demonstration or to check one's own wiring. */
export interface ExperimentPreset {
  id: string;
  title: string;
  description: string;
  /** The bench as the figure shows it, with every supply switched off. */
  build(): Workbench;
}

/**
 * One part of a sheet with its own figure (for example separately and self-excited). The guide
 * shows the selected part's steps and tables; the bench can be switched to its figure.
 */
export interface ExperimentPart {
  id: string;
  /** Short name on the switch, e.g. 'Separately excited'. */
  title: string;
  /** Letter or number the sheet uses, e.g. 'A'. */
  label: string;
  /** What feeds what, in one line. */
  summary: string;
  presetId: string;
  /** Indexes into the experiment's steps, in the order to show them. */
  steps: number[];
  tableIds: string[];
  /** The bench is wired as this part's figure (judged from the wiring, never from the preset). */
  connected(ctx: StepContext): boolean;
  /** Something the student still has to do before this part works, or null. */
  pending?(ctx: StepContext): string | null;
}

export interface ExperimentDefinition {
  id: string;
  profileId: string;
  code: string;
  title: string;
  summary: string;
  objective: string;
  /** Short theory reminder shown with the steps. */
  theory?: string;
  steps: ExperimentStep[];
  tables?: ExperimentTable[];
  /** Ideal values from the sheet's formulas, shown for comparison. */
  theoryValues?(ctx: StepContext): { label: string; value: string }[];
  /** Free play: no steps, equipment can be added from the drawer. */
  openBench?: boolean;
  /** What the equipment drawer offers on an open bench. */
  drawer?: 'resistors' | 'lab-boards';
  /** Ready-made wirings of the sheet's figures. */
  presets?: ExperimentPreset[];
  parts?: ExperimentPart[];
  /** Bench stations reproduce a real lab bench rather than teach one exercise. */
  station?: boolean;
  createBench(): Workbench;
}
