import { topoLevels, validateWorkflow } from '../../shared/workflow';
import type {
  ExecutionRecord,
  NodeEvent,
  WorkflowDef,
  NodeStatus,
} from '../../shared/types';
import type { Store } from './store';

export interface RunOptions {
  /** node ids that should fail when executed (simulated task failure) */
  failNodes?: string[];
  /** simulated per-node work duration in ms */
  nodeDurationMs?: number;
}

export interface RunningExecution {
  record: ExecutionRecord;
  /** resolves when the execution reaches a terminal state */
  done: Promise<ExecutionRecord>;
}

export class WorkflowValidationError extends Error {
  constructor(public readonly messages: string[]) {
    super(`workflow is invalid: ${messages.join('; ')}`);
    this.name = 'WorkflowValidationError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start executing a workflow level-by-level in topological order. The
 * execution record is created synchronously (status `running`) and status
 * events are appended as the async tasks progress, so callers can poll the
 * record while the workflow is still in flight. When a node fails, its
 * transitive dependents are marked `skipped` and the execution ends as
 * `failed`.
 */
export function startWorkflow(
  store: Store,
  def: WorkflowDef,
  options: RunOptions = {},
): RunningExecution {
  const errors = validateWorkflow(def);
  if (errors.length > 0) {
    throw new WorkflowValidationError(errors.map((e) => e.message));
  }

  const record: ExecutionRecord = {
    id: `exec-${store.nextExecutionSeq++}`,
    workflowId: def.id,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    events: [],
  };
  store.executions.set(record.id, record);

  return { record, done: execute(def, record, options) };
}

/** Start a workflow and wait for it to finish. */
export async function runWorkflow(
  store: Store,
  def: WorkflowDef,
  options: RunOptions = {},
): Promise<ExecutionRecord> {
  return startWorkflow(store, def, options).done;
}

async function execute(
  def: WorkflowDef,
  record: ExecutionRecord,
  options: RunOptions,
): Promise<ExecutionRecord> {
  const failNodes = new Set(options.failNodes ?? []);
  const duration = options.nodeDurationMs ?? 300;

  const emit = (nodeId: string, status: NodeStatus) => {
    const ev: NodeEvent = { nodeId, status, at: Date.now() };
    record.events.push(ev);
  };

  const levels = topoLevels(def);
  const skipped = new Set<string>();
  let failed = false;

  for (const level of levels) {
    for (const nodeId of level) {
      if (skipped.has(nodeId)) {
        emit(nodeId, 'skipped');
        continue;
      }
      emit(nodeId, 'running');
      if (duration > 0) await sleep(duration);
      if (failNodes.has(nodeId)) {
        emit(nodeId, 'failed');
        failed = true;
        // skip all transitive dependents
        const markSkipped = (id: string) => {
          for (const n of def.nodes) {
            if (n.dependsOn.includes(id) && !skipped.has(n.id)) {
              skipped.add(n.id);
              markSkipped(n.id);
            }
          }
        };
        markSkipped(nodeId);
      } else {
        emit(nodeId, 'success');
      }
    }
  }

  record.status = failed ? 'failed' : 'success';
  record.finishedAt = Date.now();
  return record;
}
