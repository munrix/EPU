import type { ElectricalCircuit, Workbench } from '../../domain/models';
import { definitionOf } from '../../equipment/registry';
import { defaultMeterSettings, multimeterModel } from '../../instruments/multimeter';
import { oscilloscopeModel } from '../../instruments/oscilloscope';
import { buildCircuit } from '../connectivity/buildCircuit';
import { MAINS_BREAKER_AMPS } from '../../equipment/network';

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
  for (const equipment of bench.equipment) {
    const kind = definitionOf(equipment).kind;
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
  return { ...circuit, nodes, terminalToNode, components, measurements, protections };
}
