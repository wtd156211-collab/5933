import { validateWorkflow } from './workflow.js';
import type {
  Execution,
  ExecutionEvent,
  NodeStatus,
  ValidationResult,
  Workflow,
} from './types.js';

export type ReplayWarningCode =
  | 'CYCLE'
  | 'MISSING_DEPENDENCY'
  | 'MISSING_NODE_RECORDS'
  | 'UNKNOWN_NODE_EVENT'
  | 'OUT_OF_ORDER_NODE_EVENT'
  | 'EVENT_NODE_WITHOUT_ID';

export interface ReplayWarning {
  code: ReplayWarningCode;
  message: string;
  nodeIds?: string[];
}

export interface ReplayFrame {
  /** Number of events applied so far. */
  step: number;
  /** Status of every workflow node after applying `step` events. */
  nodeStatus: Record<string, NodeStatus>;
  /** Last applied event (undefined for the initial frame). */
  event: ExecutionEvent | null;
}

export interface Replay {
  /** false when the workflow is invalid; replay must be blocked. */
  playable: boolean;
  validation: ValidationResult;
  warnings: ReplayWarning[];
  /** Frames: length === events.length + 1 (frame 0 is pre-start). */
  frames: ReplayFrame[];
}

const EVENT_STATUS: Partial<Record<ExecutionEvent['type'], NodeStatus>> = {
  node_started: 'running',
  node_succeeded: 'success',
  node_failed: 'failed',
  node_skipped: 'skipped',
};

/**
 * Build a frame-by-frame replay from an execution event log.
 *
 * Event order in the log is authoritative (timestamps can even disagree
 * with the topological order); we replay the log faithfully and surface
 * anomalies as warnings rather than failing:
 *  - nodes defined in the workflow but never seen in the log
 *  - events referencing nodes absent from the workflow
 *  - node lifecycle events that are not a legal forward transition given
 *    the topological ordering of the workflow definition
 */
export function buildReplay(workflow: Workflow, execution: Execution): Replay {
  const validation = validateWorkflow(workflow);
  const warnings: ReplayWarning[] = [];

  for (const issue of validation.issues) {
    warnings.push({
      code: issue.code as ReplayWarningCode,
      message: issue.message,
      nodeIds: issue.nodeIds,
    });
  }
  if (!validation.valid) {
    return { playable: false, validation, warnings, frames: [] };
  }

  const topoIndex = new Map(validation.order.map((id, index) => [id, index]));
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));
  const dependencies = new Map(workflow.nodes.map((n) => [n.id, n.dependsOn]));

  const seen = new Set<string>();
  const status: Record<string, NodeStatus> = {};
  for (const id of nodeIds) status[id] = 'pending';

  const frames: ReplayFrame[] = [
    { step: 0, nodeStatus: clone(status), event: null },
  ];

  for (const event of execution.events) {
    if (event.nodeId !== undefined) {
      const nodeId = event.nodeId;
      if (!nodeIds.has(nodeId)) {
        warnings.push({
          code: 'UNKNOWN_NODE_EVENT',
          message: `Event ${event.type} references unknown node "${nodeId}".`,
          nodeIds: [nodeId],
        });
      } else {
        seen.add(nodeId);
        const next = EVENT_STATUS[event.type];
        if (next) {
          if (event.type === 'node_started') {
            const unfinishedDeps = (dependencies.get(nodeId) ?? []).filter(
              (dep) => status[dep] !== 'success' && status[dep] !== 'skipped',
            );
            if (unfinishedDeps.length > 0) {
              warnings.push({
                code: 'OUT_OF_ORDER_NODE_EVENT',
                message: `Node "${nodeId}" started before dependencies finished: ${unfinishedDeps.join(', ')} (log order differs from topological order).`,
                nodeIds: [nodeId, ...unfinishedDeps],
              });
            }
          }
          status[nodeId] = next;
        }
      }
    } else if (event.type.startsWith('node_')) {
      warnings.push({
        code: 'EVENT_NODE_WITHOUT_ID',
        message: `Event ${event.type} is missing a nodeId.`,
      });
    }
    frames.push({
      step: frames.length,
      nodeStatus: clone(status),
      event,
    });
  }

  const missing = validation.order.filter(
    (id) => !seen.has(id) && execution.events.some((e) => e.nodeId !== undefined),
  );
  if (missing.length > 0) {
    warnings.push({
      code: 'MISSING_NODE_RECORDS',
      message: `Execution record has no node events for: ${missing.join(', ')}.`,
      nodeIds: missing,
    });
  }
  void topoIndex;

  return { playable: true, validation, warnings: dedupe(warnings), frames };
}

function clone(status: Record<string, NodeStatus>): Record<string, NodeStatus> {
  return { ...status };
}

function dedupe(warnings: ReplayWarning[]): ReplayWarning[] {
  const seenKeys = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.code}:${(w.nodeIds ?? []).join(',')}:${w.message}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}
