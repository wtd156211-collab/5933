import type { NodeEvent, NodeStatus, WorkflowDef } from './types';
import { topoLevels } from './workflow';

export interface ReplayWarning {
  kind: 'out-of-order' | 'missing-records';
  message: string;
  nodeIds: string[];
}

export interface ReplayFrame {
  /** number of events applied */
  step: number;
  /** latest status per node after applying `step` events */
  statuses: Record<string, NodeStatus>;
  warnings: ReplayWarning[];
}

/**
 * Apply the first `step` events of an execution record and compute the
 * resulting per-node status map. Events are applied in recorded order even
 * when that order differs from the workflow's topological order; the
 * discrepancy is surfaced as a warning instead of failing.
 */
export function computeReplayFrame(
  def: WorkflowDef,
  events: NodeEvent[],
  step: number,
): ReplayFrame {
  const clamped = Math.max(0, Math.min(step, events.length));
  const statuses: Record<string, NodeStatus> = {};
  for (const node of def.nodes) statuses[node.id] = 'pending';
  for (let i = 0; i < clamped; i++) {
    const ev = events[i];
    if (ev.nodeId in statuses) statuses[ev.nodeId] = ev.status;
  }
  return { step: clamped, statuses, warnings: computeWarnings(def, events) };
}

export function computeWarnings(
  def: WorkflowDef,
  events: NodeEvent[],
): ReplayWarning[] {
  const warnings: ReplayWarning[] = [];

  // Nodes of the workflow that never appear in the execution record.
  const recorded = new Set(events.map((e) => e.nodeId));
  const missing = def.nodes.filter((n) => !recorded.has(n.id)).map((n) => n.id);
  if (missing.length > 0) {
    warnings.push({
      kind: 'missing-records',
      message: `以下节点缺少执行记录，回放中将保持 pending: ${missing.join(', ')}`,
      nodeIds: missing,
    });
  }

  // Detect recorded start order that violates topological order: a node
  // started before one of its dependencies had finished in the record.
  let levels: string[][] | null = null;
  try {
    levels = topoLevels(def);
  } catch {
    levels = null; // invalid graph: ordering check not applicable
  }
  if (levels) {
    const levelOf = new Map<string, number>();
    levels.forEach((ids, idx) => ids.forEach((id) => levelOf.set(id, idx)));
    const firstStart = new Map<string, number>();
    events.forEach((ev, idx) => {
      if (ev.status === 'running' && !firstStart.has(ev.nodeId)) {
        firstStart.set(ev.nodeId, idx);
      }
    });
    const outOfOrder: string[] = [];
    for (const node of def.nodes) {
      const start = firstStart.get(node.id);
      if (start === undefined) continue;
      for (const dep of node.dependsOn) {
        const depStart = firstStart.get(dep);
        if (depStart !== undefined && depStart > start) {
          outOfOrder.push(node.id);
          break;
        }
      }
    }
    if (outOfOrder.length > 0) {
      warnings.push({
        kind: 'out-of-order',
        message: `执行记录中的节点顺序与拓扑顺序不一致（按记录顺序回放）: ${outOfOrder.join(', ')}`,
        nodeIds: outOfOrder,
      });
    }
  }

  return warnings;
}
