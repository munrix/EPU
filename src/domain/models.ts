import type { MeterSettings } from '../instruments/multimeter';
import type { MachineCircuit, MachineReading, MachineState } from '../machines/dcGenerator';
import type { PolyphaseSupply } from '../electrical/circuit/polyphase';
export interface ThreePhaseState {
  /** Mains breaker closed, or inverter running. */
  on: boolean;
  /** Inverter output frequency setting. */
  hz?: number;
  /** Why the breaker last tripped, shown until it is switched on again. */
  trip?: string;
}
export type Id = string;
export interface Point {
  x: number;
  y: number;
}
export type CableColor =
  'red' | 'black' | 'yellow' | 'blue' | 'green' | 'orange' | 'purple' | 'brown' | 'white' | 'grey';
export const cableColors: Record<CableColor, string> = {
  red: '#cf5149',
  black: '#3d4348',
  yellow: '#d4a62f',
  blue: '#417eae',
  green: '#458762',
  orange: '#e0812f',
  purple: '#8a5bb0',
  brown: '#8b5e3c',
  white: '#e9ecee',
  grey: '#8f989f',
};

export interface Terminal {
  id: Id;
  equipmentId: Id;
  label: string;
  position: Point;
  connector: 'banana-4mm';
  color: CableColor;
  stackable: boolean;
  /** Bonded to protective earth inside the equipment (bench common, scope channel grounds). */
  earthed?: boolean;
}
export type Attachment =
  | { kind: 'terminal'; terminalId: Id }
  | { kind: 'plug-back'; plugId: Id }
  | { kind: 'loose'; position: Point };
export type ConnectionTarget = Exclude<Attachment, { kind: 'loose' }>;
export interface Plug {
  id: Id;
  cableId: Id;
  attachedTo: Attachment;
  stackable: boolean;
}
export interface Cable {
  id: Id;
  color: CableColor;
  plugIds: [Id, Id];
  /**
   * How the lead is laid: its sag, the bend points it passes through, and whether it hangs in a
   * curve or runs straight between bends (the default is a curve).
   */
  routing: { slack: number; waypoints: Point[]; style?: 'curved' | 'straight' };
}

/** Where a component comes from. Instrument components are derived from settings, never saved. */
export type ComponentOrigin = 'equipment' | 'instrument';
export type Component =
  | {
      id: Id;
      kind: 'resistor';
      a: Id;
      b: Id;
      resistanceOhms: number;
      origin?: ComponentOrigin;
      /** A voltmeter input: a real conductive path, but never a load's return path. */
      measurementInput?: boolean;
      /** One section of a tapped part (rheostat end-to-slider, switch pole): an unused section is normal. */
      section?: boolean;
    }
  | {
      id: Id;
      kind: 'dc-source';
      positive: Id;
      negative: Id;
      voltageVolts: number;
      /** Constant-current limit of a bench supply. Undefined means an ideal source. */
      currentLimitAmps?: number;
      enabled: boolean;
      origin?: ComponentOrigin;
    }
  | {
      id: Id;
      kind: 'capacitor';
      /** Positive pin for an electrolytic capacitor. */
      a: Id;
      b: Id;
      capacitanceFarads: number;
      polarized?: boolean;
      origin?: ComponentOrigin;
    }
  | {
      id: Id;
      kind: 'inductor';
      a: Id;
      b: Id;
      inductanceHenries: number;
      /** Winding (copper) resistance in series with the inductance. */
      seriesOhms: number;
      origin?: ComponentOrigin;
    }
  | { id: Id; kind: 'diode'; anode: Id; cathode: Id; model: DiodeModel; origin?: ComponentOrigin }
  | {
      id: Id;
      kind: 'npn';
      collector: Id;
      base: Id;
      emitter: Id;
      model: 'BC547B';
      origin?: ComponentOrigin;
    }
  | {
      id: Id;
      kind: 'ac-source';
      /** Winding start (dotted end) and finish. */
      a: Id;
      b: Id;
      rmsVolts: number;
      frequencyHz: number;
      phaseDegrees: number;
      /** Winding resistance. */
      seriesOhms: number;
      enabled: boolean;
      origin?: ComponentOrigin;
    };
export type DiodeModel = '1N4007' | 'ZENER-5V1';
export type ComponentKind = Component['kind'];
/** Terminal IDs a component is connected to, in a fixed order per kind. */
export function componentPins(c: Component): Id[] {
  switch (c.kind) {
    case 'resistor':
    case 'capacitor':
    case 'inductor':
    case 'ac-source':
      return [c.a, c.b];
    case 'dc-source':
      return [c.positive, c.negative];
    case 'diode':
      return [c.anode, c.cathode];
    case 'npn':
      return [c.collector, c.base, c.emitter];
  }
}
/** Sources that are switched off conduct nothing; every passive part is always present. */
export const isActive = (c: Component) =>
  c.kind === 'dc-source' || c.kind === 'ac-source' ? c.enabled : true;

export interface Equipment {
  id: Id;
  definitionId: Id;
  /** Short name printed on the panel, e.g. R1. */
  label?: string;
  position: Point;
  movable: boolean;
  removable?: boolean;
  terminalIds: Id[];
  componentIds: Id[];
}
export type EquipmentKind =
  | 'dc-supply'
  | 'resistor'
  | 'multimeter'
  | 'bench-panel'
  | 'rectifier-board'
  | 'transistor-board'
  | 'oscilloscope'
  | 'function-generator'
  | 'decade-box'
  | 'mains-supply'
  | 'wattmeter'
  | 'pf-meter'
  | 'ac-ammeter'
  | 'ac-voltmeter'
  | 'load'
  | 'dc-machine'
  | 'lamp'
  | 'variac'
  | 'mg-set'
  | 'slide-rheostat'
  | 'supply-console'
  | 'load-switch'
  | 'three-phase-supply'
  | 'frequency-inverter';
export interface TerminalTemplate {
  key: string;
  label: string;
  x: number;
  y: number;
  color: CableColor;
  earthed?: boolean;
}
export type ComponentTemplate =
  | {
      key: string;
      kind: 'resistor';
      a: string;
      b: string;
      resistanceOhms: number;
      measurementInput?: boolean;
      section?: boolean;
    }
  | {
      key: string;
      kind: 'dc-source';
      positive: string;
      negative: string;
      voltageVolts: number;
      currentLimitAmps: number;
      /** Fixed outputs cannot be adjusted by the student. */
      fixed?: boolean;
    }
  | {
      key: string;
      kind: 'capacitor';
      a: string;
      b: string;
      capacitanceFarads: number;
      polarized?: boolean;
    }
  | {
      key: string;
      kind: 'inductor';
      a: string;
      b: string;
      inductanceHenries: number;
      seriesOhms: number;
    }
  | { key: string; kind: 'diode'; anode: string; cathode: string; model: DiodeModel }
  | { key: string; kind: 'npn'; collector: string; base: string; emitter: string; model: 'BC547B' }
  | {
      key: string;
      kind: 'ac-source';
      a: string;
      b: string;
      rmsVolts: number;
      frequencyHz: number;
      phaseDegrees: number;
      seriesOhms: number;
    };
export interface ParameterLimits {
  voltageVolts?: [number, number];
  currentLimitAmps?: [number, number];
  resistanceOhms?: [number, number];
  capacitanceFarads?: [number, number];
  inductanceHenries?: [number, number];
  rmsVolts?: [number, number];
  frequencyHz?: [number, number];
}
export type ValueField = keyof ParameterLimits;
export interface EquipmentDefinition {
  id: Id;
  name: string;
  kind: EquipmentKind;
  size: { width: number; height: number };
  terminals: TerminalTemplate[];
  components: ComponentTemplate[];
  limits: ParameterLimits;
  /** Hides component values on the panel, e.g. an unknown resistor for measurement practice. */
  concealValues?: boolean;
  fixedValues?: boolean;
  /** Fixed connections between socket keys, supplied only by the equipment definition. */
  internalLinks?: [string, string][];
}
export interface LabProfile {
  id: Id;
  title: string;
  equipmentDefinitionIds: Id[];
  experimentIds: Id[];
}
export interface Workbench {
  schemaVersion: 3;
  instrumentSettings: Record<Id, MeterSettings>;
  profileId: Id;
  experimentId: Id;
  equipment: Equipment[];
  terminals: Terminal[];
  components: Component[];
  internalLinks: [Id, Id][];
  plugs: Plug[];
  cables: Cable[];
  /** Magnetic history and meter switch of motor–generator sets, by equipment ID. */
  machines?: Record<Id, MachineState>;
  /** Breaker state of three-phase R S T supplies, by equipment ID. */
  threePhase?: Record<Id, ThreePhaseState>;
}

export interface ElectricalNode {
  id: Id;
  terminalIds: Id[];
  plugIds: Id[];
  /** Nodes inside an instrument model (for example an ohmmeter's test source). Not a socket. */
  internal?: boolean;
}
export type Measurement =
  | {
      id: Id;
      kind: 'voltage';
      equipmentId: Id;
      positiveTerminalId: Id;
      negativeTerminalId: Id;
      /** Require both leads to share a path outside the instrument; otherwise report floating. */
      requireExternalReference: boolean;
    }
  | { id: Id; kind: 'current'; equipmentId: Id; componentId: Id };
export interface ProtectionDevice {
  id: Id;
  equipmentId: Id;
  /** A fuse opens a meter input; a breaker switches its supply off. */
  kind: 'fuse' | 'breaker';
  componentId: Id;
  ratingAmps: number;
}
export interface ElectricalCircuit {
  nodes: ElectricalNode[];
  terminalToNode: Record<Id, Id>;
  components: Component[];
  measurements: Measurement[];
  protections: ProtectionDevice[];
  /** The net bonded to protective earth, when any socket on the bench is earthed. */
  earthNodeId?: Id;
  /** Rotating machines whose EMF depends on the solved currents. */
  machines?: MachineCircuit[];
  /** Three-phase supplies, solved as phasors on the AC side of the bench. */
  polyphase?: PolyphaseSupply[];
}
export type DiagnosticCode =
  | 'short-circuit'
  | 'current-limit'
  | 'open-load'
  | 'floating-meter'
  | 'ohmmeter-energized'
  | 'solver-error'
  | 'invalid-parameter'
  | 'overcurrent'
  | 'machine'
  | 'simulating';
export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'fault' | 'error';
  message: string;
  terminalIds: Id[];
}
/** Steady-state statistics of a time-varying quantity over the recorded window. */
export interface WaveStats {
  mean: number;
  rms: number;
  /** Mean absolute deviation from the mean: what an average-responding AC meter rectifies. */
  acMeanAbs: number;
  min: number;
  max: number;
}
export interface MeasurementResult {
  /** DC value (the mean, for a transient analysis). */
  value: number | null;
  status: 'valid' | 'floating' | 'fault' | 'error' | 'pending';
  stats?: WaveStats;
}
export interface Waveforms {
  /** Seconds, starting at 0 at the beginning of the recorded window. */
  time: number[];
  nodes: Record<Id, number[]>;
  /** Signed current, same convention as componentCurrents. */
  currents: Record<Id, number[]>;
}
export interface SimulationResult {
  revision: number;
  nodeVoltages: Record<Id, number>;
  /** Signed current from pin a to b (resistor) or into the positive terminal (source). */
  componentCurrents: Record<Id, number>;
  sourceModes: Record<Id, 'CV' | 'CC' | 'off'>;
  measurements: Record<Id, MeasurementResult>;
  diagnostics: Diagnostic[];
  analysis?: 'dc' | 'transient';
  /** Present for transient analyses. DC values above are window means. */
  waveforms?: Waveforms;
  /** RMS currents over the window, for protection devices. */
  rmsCurrents?: Record<Id, number>;
  /** Operating point of each rotating machine, by equipment ID. */
  machines?: Record<Id, MachineReading>;
  /** Three-phase supplies that see a short circuit (their breakers trip). */
  polyphaseShorts?: { supplyId: Id; between: string[] }[];
  /** Supply frequency reaching each motor–generator set's prime mover. */
  motorHz?: Record<Id, number>;
  /** Supplies whose motor protection sees locked-rotor current. */
  polyphaseOverloads?: { supplyId: Id; reason: string }[];
}
export interface SolverAdapter {
  id: string;
  solve(circuit: ElectricalCircuit, revision: number): SimulationResult;
}
