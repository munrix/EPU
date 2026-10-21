import type { ElectricalCircuit, SimulationResult, Workbench } from '../domain/models';
import { componentPins, isActive } from '../domain/models';
import { meterDisplay, meterIds } from '../instruments/multimeter';
import { channelTrace, coupled, phaseBetween } from '../instruments/oscilloscope';
import type { StepContext } from './types';

export function stepContext(
  bench: Workbench,
  circuit: ElectricalCircuit,
  result: SimulationResult,
): StepContext {
  const net = (id: string) => circuit.terminalToNode[id];
  const source = (supplyId: string) =>
    bench.components.find((c) => c.id === `${supplyId}.source` && c.kind === 'dc-source');
  const ctx: StepContext = {
    bench,
    circuit,
    result,
    connected: (a, b) => net(a) !== undefined && net(a) === net(b),
    stacked: (terminalId) =>
      bench.plugs.some(
        (p) =>
          p.attachedTo.kind === 'terminal' &&
          p.attachedTo.terminalId === terminalId &&
          bench.plugs.some(
            (q) => q.attachedTo.kind === 'plug-back' && q.attachedTo.plugId === p.id,
          ),
      ),
    powered: (supplyId = 'supply') => {
      const s = source(supplyId);
      return s?.kind === 'dc-source' && s.enabled;
    },
    sourceVolts: (supplyId = 'supply') => {
      const s = source(supplyId);
      return s?.kind === 'dc-source' ? s.voltageVolts : 0;
    },
    suppliedAmps: (supplyId = 'supply') => -(result.componentCurrents[`${supplyId}.source`] ?? 0),
    meter: (meterId = 'meter') => meterDisplay(meterId, bench.instrumentSettings[meterId], result),
    current: (componentId) => result.componentCurrents[componentId] ?? 0,
    meterAcross: (a, b, meterId = 'meter') => {
      const ids = meterIds(meterId);
      return (
        (ctx.connected(ids.V, a) && ctx.connected(ids.COM, b)) ||
        (ctx.connected(ids.V, b) && ctx.connected(ids.COM, a))
      );
    },
    part: (componentId) => bench.components.find((c) => c.id === componentId),
    scope: (scopeId = 'scope') => {
      const ch1 = channelTrace(scopeId, 'ch1', circuit, result);
      const ch2 = channelTrace(scopeId, 'ch2', circuit, result);
      const phase =
        ch1.connected && ch2.connected && ch1.referenced && ch2.referenced
          ? phaseBetween(ch1.time, coupled(ch1.values, 'AC'), coupled(ch2.values, 'AC'))
          : null;
      return { ch1, ch2, phaseDegrees: phase?.degrees ?? null };
    },
    meterReads: (amps, meterId = 'meter') => {
      const m = ctx.meter(meterId);
      return (
        m.range.mode === 'dc-current' &&
        m.status === 'valid' &&
        m.value !== null &&
        Math.abs(amps) > 1e-9 &&
        Math.abs(Math.abs(m.value) - Math.abs(amps)) <= Math.abs(amps) * 1e-6
      );
    },
    meterInSeries: (componentId, meterId = 'meter') => {
      const meter = ctx.meter(meterId);
      if (meter.range.mode !== 'dc-current') return false;
      const ids = meterIds(meterId);
      const shuntId = meter.range.jack === '20A' ? ids.shunt20A : ids.shuntMa;
      const component = circuit.components.find((c) => c.id === componentId);
      const shunt = circuit.components.find((c) => c.id === shuntId);
      if (!component || !shunt || shunt.kind !== 'resistor') return false;
      const pins = componentPins(component);
      // Remove both elements. Their endpoints must span the same two disconnected
      // regions. A branch or bypass reconnects those regions and fails this check.
      const adjacency = new Map<string, string[]>();
      for (const c of circuit.components) {
        if (c.id === componentId || c.id === shuntId || !isActive(c)) continue;
        const [a, ...rest] = componentPins(c).map(net);
        for (const b of rest) {
          adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
          adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
        }
      }
      const region = (start: string) => {
        const visited = new Set<string>();
        const pending = [net(start)];
        while (pending.length) {
          const node = pending.pop()!;
          if (visited.has(node)) continue;
          visited.add(node);
          pending.push(...(adjacency.get(node) ?? []));
        }
        return visited;
      };
      const left = region(shunt.a),
        right = region(shunt.b);
      return (
        !left.has(net(shunt.b)) &&
        ((left.has(net(pins[0])) && right.has(net(pins[1]))) ||
          (left.has(net(pins[1])) && right.has(net(pins[0]))))
      );
    },
  };
  return ctx;
}
