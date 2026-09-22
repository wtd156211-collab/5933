import type {
  ValidationError,
  WorkflowDef,
  WorkflowEdge,
  WorkflowGraph,
} from './types';

export function validateWorkflow(def: WorkflowDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set(def.nodes.map((n) => n.id));

  for (const node of def.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) {
        errors.push({
          kind: 'missing-dependency',
          message: `节点 "${node.name}" (${node.id}) 依赖了不存在的节点 "${dep}"`,
          nodes: [node.id, dep],
        });
      }
    }
  }

  const cycle = findCycle(def);
  if (cycle) {
    errors.push({
      kind: 'cycle',
      message: `检测到循环依赖: ${cycle.join(' -> ')}`,
      nodes: cycle,
    });
  }

  return errors;
}

export function findCycle(def: WorkflowDef): string[] | null {
  const deps = new Map(def.nodes.map((n) => [n.id, n.dependsOn]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const s = state.get(id);
    if (s === 'done') return null;
    if (s === 'visiting') {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    const nodeDeps = deps.get(id);
    if (!nodeDeps) return null; // missing dep handled separately
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of nodeDeps) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const node of def.nodes) {
    const found = visit(node.id);
    if (found) return found;
  }
  return null;
}

/**
 * Kahn topological sort. Returns node ids grouped by level (nodes in the
 * same level can run in parallel). Throws when the graph cannot be fully
 * sorted (cycle or missing dependency) — callers should validate first.
 */
export function topoLevels(def: WorkflowDef): string[][] {
  const ids = new Set(def.nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of def.nodes) {
    indegree.set(node.id, 0);
    dependents.set(node.id, []);
  }
  for (const node of def.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`missing dependency: ${node.id} depends on ${dep}`);
      }
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      dependents.get(dep)!.push(node.id);
    }
  }

  const levels: string[][] = [];
  let current = def.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  let sorted = 0;
  while (current.length > 0) {
    levels.push(current);
    sorted += current.length;
    const next: string[] = [];
    for (const id of current) {
      for (const down of dependents.get(id) ?? []) {
        const d = indegree.get(down)! - 1;
        indegree.set(down, d);
        if (d === 0) next.push(down);
      }
    }
    current = next;
  }
  if (sorted !== def.nodes.length) {
    throw new Error('workflow graph is not a DAG');
  }
  return levels;
}

export function buildGraph(def: WorkflowDef): WorkflowGraph {
  const edges: WorkflowEdge[] = [];
  for (const node of def.nodes) {
    for (const dep of node.dependsOn) {
      edges.push({ from: dep, to: node.id });
    }
  }
  return { workflow: def, edges, errors: validateWorkflow(def) };
}
