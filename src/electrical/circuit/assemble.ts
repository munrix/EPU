import type { ElectricalCircuit, Workbench } from '../../domain/models';
import { definitionOf } from '../../equipment/registry';
import { defaultMeterSettings, multimeterModel } from '../../instruments/multimeter';
import { oscilloscopeModel } from '../../instruments/oscilloscope';
import { buildCircuit } from '../connectivity/buildCircuit';
import { MAINS_BREAKER_AMPS } from '../../equipment/network';
import { defaultMachineState, GENERATOR, type MachineCircuit } from '../../machines/dcGenerator';
import { mainsOutputs, PHASE_VOLTS, type PolyphaseSupply } from './polyphase';
import { INVERTER_DEFAULT_HZ } from '../../equipment/machineLab';

/**
 * Solver-neutral circuit for the whole bench: physical nets plus the electrical models of
 * instruments in their current settings (meter input resistance, shunts, ohmmeter source).
 */
export function assembleCircuit(bench: Workbench): ElectricalCircuit {
  const circuit = buildCircuit(bench);
  const nodes = [...circuit.nodes];
  const terminalToNode = { ...circuit.terminalToNode };
  const components = [...circuit.components];
  const measurements = [...circuit.measurements];
  const protections = [...circuit.protections];
  const machines: MachineCircuit[] = [];
  const internalNode = (id: string) => {
    const node = { id: `net:internal:${id}`, terminalIds: [id], plugIds: [], internal: true };
    nodes.push(node);
    terminalToNode[id] = node.id;
  };
  const polyphase: PolyphaseSupply[] = [];
  for (const equipment of bench.equipment) {
    const kind = definitionOf(equipment).kind;
    if (kind === 'three-phase-supply') {
      polyphase.push({
        equipmentId: equipment.id,
        on: bench.threePhase?.[equipment.id]?.on ?? false,
        hz: 50,
        outputs: mainsOutputs(equipment.id),
      });
      continue;
    }
    if (kind === 'frequency-inverter') {
      // V/f control: output voltage rises with frequency up to 380 V line at 50 Hz.
      const state = bench.threePhase?.[equipment.id] ?? { on: false, hz: INVERTER_DEFAULT_HZ };
      const hz = state.hz ?? INVERTER_DEFAULT_HZ;
      const pin = (k: string) => `${equipment.id}.${k}`;
      polyphase.push({
        equipmentId: equipment.id,
        on: state.on && hz > 0,
        hz,
        outputs: (['U', 'V', 'W'] as const).map((name, i) => ({
          name,
          terminalId: pin(name),
          volts: PHASE_VOLTS * Math.min(1, hz / 50),
          degrees: [0, -120, 120][i],
        })),
        inputs: [pin('L1'), pin('L2'), pin('L3')],
      });
      continue;
    }
    if (kind === 'mg-set') {
      // Armature: EMF behind Ra, between A2 and A1. The EMF value is set by the machine solver.
      // Tachogenerator: EMF behind its resistance on the TG pair.
      const id = equipment.id;
      const pin = (k: string) => `${id}.${k}`;
      internalNode(pin('armature-emf'));
      internalNode(pin('tacho-emf'));
      components.push(
        {
          id: pin('emf'),
          kind: 'dc-source',
          positive: pin('armature-emf'),
          negative: pin('A2'),
          voltageVolts: 0,
          enabled: true,
          origin: 'equipment',
        },
        {
          id: pin('armature'),
          kind: 'resistor',
          a: pin('armature-emf'),
          b: pin('A1'),
          resistanceOhms: GENERATOR.armatureOhms,
          origin: 'equipment',
          section: true,
        },
        {
          id: pin('tacho'),
          kind: 'dc-source',
          positive: pin('tacho-emf'),
          negative: pin('TG2'),
          voltageVolts: 0,
          enabled: true,
          origin: 'equipment',
        },
        {
          id: pin('tacho-r'),
          kind: 'resistor',
          a: pin('tacho-emf'),
          b: pin('TG1'),
          resistanceOhms: GENERATOR.tachoOhms,
          origin: 'equipment',
          section: true,
        },
      );
      machines.push({
        equipmentId: id,
        emfId: pin('emf'),
        armatureId: pin('armature'),
        shuntId: pin('shunt'),
        seriesId: pin('series'),
        tachoId: pin('tacho'),
        motor: {
          equipmentId: id,
          U1: pin('U1'),
          V1: pin('V1'),
          W1: pin('W1'),
          U2: pin('U2'),
          V2: pin('V2'),
          W2: pin('W2'),
        },
        state: bench.machines?.[id] ?? defaultMachineState,
      });
      continue;
    }
    if (kind === 'mains-supply')
      protections.push({
        id: `${equipment.id}.breaker`,
        equipmentId: equipment.id,
        kind: 'breaker',
        componentId: `${equipment.id}.source`,
        ratingAmps: MAINS_BREAKER_AMPS,
      });
    if (kind !== 'multimeter' && kind !== 'oscilloscope') continue;
    const model =
      kind === 'oscilloscope'
        ? oscilloscopeModel(equipment)
        : multimeterModel(
            equipment,
            bench.instrumentSettings[equipment.id] ?? defaultMeterSettings,
          );
    model.internalTerminals.forEach((id) => {
      const node = { id: `net:internal:${id}`, terminalIds: [id], plugIds: [], internal: true };
      nodes.push(node);
      terminalToNode[id] = node.id;
    });
    components.push(...model.components);
    measurements.push(...model.measurements);
    protections.push(...model.protections);
  }
  return {
    ...circuit,
    nodes,
    terminalToNode,
    components,
    measurements,
    protections,
    ...(machines.length ? { machines } : {}),
    ...(polyphase.length ? { polyphase } : {}),
  };
}
