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
  /** Bench stations reproduce a real lab bench rather than teach one exercise. */
  station?: boolean;
  createBench(): Workbench;
}
