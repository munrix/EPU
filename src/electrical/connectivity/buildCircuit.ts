import type { ElectricalCircuit, ElectricalNode, Workbench } from '../../domain/models';

export class DisjointSet {
  private parents = new Map<string, string>();
  find(id: string): string {
    if (!this.parents.has(id)) this.parents.set(id, id);
    const parent = this.parents.get(id)!;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parents.set(id, root);
    return root;
  }
  union(a: string, b: string) {
    this.parents.set(this.find(a), this.find(b));
  }
}

/** Physical connectivity only: equipment components, no instrument models. */
export function buildCircuit(
  bench: Pick<Workbench, 'terminals' | 'plugs' | 'cables' | 'internalLinks' | 'components'>,
): ElectricalCircuit {
  const sets = new DisjointSet();
  bench.cables.forEach((c) => sets.union(`p:${c.plugIds[0]}`, `p:${c.plugIds[1]}`));
  bench.plugs.forEach((p) => {
    const a = p.attachedTo;
    if (a.kind === 'terminal') sets.union(`p:${p.id}`, `t:${a.terminalId}`);
    if (a.kind === 'plug-back') sets.union(`p:${p.id}`, `p:${a.plugId}`);
  });
  bench.internalLinks.forEach(([a, b]) => sets.union(`t:${a}`, `t:${b}`));
  // Everything bonded to protective earth shares one conductor through the building wiring.
  const earthed = bench.terminals.filter((t) => t.earthed);
  earthed.slice(1).forEach((t) => sets.union(`t:${earthed[0].id}`, `t:${t.id}`));
  const groups = new Map<string, ElectricalNode>();
  function group(id: string) {
    const root = sets.find(id);
    if (!groups.has(root)) groups.set(root, { id: '', terminalIds: [], plugIds: [] });
    return groups.get(root)!;
  }
  bench.terminals.forEach((t) => group(`t:${t.id}`).terminalIds.push(t.id));
  bench.plugs.forEach((p) => group(`p:${p.id}`).plugIds.push(p.id));
  const nodes = [...groups.values()].map((n) => ({
    ...n,
    id: `net:${[...n.terminalIds.map((id) => `t:${id}`), ...n.plugIds.map((id) => `p:${id}`)].sort()[0]}`,
  }));
  const terminalToNode: Record<string, string> = {};
  nodes.forEach((n) =>
    n.terminalIds.forEach((id) => {
      terminalToNode[id] = n.id;
    }),
  );
  return {
    nodes,
    terminalToNode,
    components: bench.components,
    measurements: [],
    protections: [],
    earthNodeId: earthed.length ? terminalToNode[earthed[0].id] : undefined,
  };
}
