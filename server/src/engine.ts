import { validateWorkflow } from './workflow.js';
import type {
  Execution,
  ExecutionEvent,
  NodeStatus,
  Workflow,
} from './types.js';

export interface EngineHooks {
  /** Persist the execution after every event. */
  onUpdate?: (execution: Execution) => void;
  now?: () => number;
  /** Per-node task runner; defaults to a duration/fail based simulator. */
  runNode?: (nodeId: string) => Promise<void>;
}

class AbortWave extends Error {}

function defaultRunNode(workflow: Workflow, nodeId: string): Promise<void> {
  const node = workflow.nodes.find((n) => n.id === nodeId);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (node?.fail) reject(new Error(`Node ${nodeId} failed intentionally`));
      else resolve();
    }, node?.durationMs ?? 10);
  });
}

/**
 * Execute a workflow with dependency-aware wave scheduling.
 *
 * A node starts only after every dependency reached a terminal state.
 * On failure the failing node is marked failed, nodes that were still
 * pending are marked skipped (they never ran) and the execution ends as
 * failed; already successful nodes keep their status.
 */
export async function runWorkflow(
  workflow: Workflow,
  executionId: string,
  hooks: EngineHooks = {},
): Promise<Execution> {
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    throw new Error(
      `Cannot run invalid workflow: ${validation.issues.map((i) => i.message).join('; ')}`,
    );
  }

  const start = hooks.now ? hooks.now() : Date.now();
  const elapsed = () => (hooks.now ? hooks.now() : Date.now()) - start;
  let seq = 0;

  const execution: Execution = {
    id: executionId,
    workflowId: workflow.id,
    status: 'running',
    startedAt: new Date(start).toISOString(),
    nodeStatus: {},
    events: [],
  };

  const record = (event: Omit<ExecutionEvent, 'seq' | 't'>) => {
    execution.events.push({ ...event, seq: seq++, t: elapsed() });
    hooks.onUpdate?.(execution);
  };

  record({ type: 'execution_started' });

  const statusOf = (id: string) => execution.nodeStatus[id] ?? 'pending';
  const terminal = new Set<NodeStatus>(['success', 'failed', 'skipped']);

  let failed = false;
  const inFlight = new Set<string>();

  const dependencies = new Map(workflow.nodes.map((n) => [n.id, [...n.dependsOn]]));

  const ready = (id: string) =>
    !inFlight.has(id) &&
    !terminal.has(statusOf(id)) &&
    dependencies.get(id)!.every((dep) => terminal.has(statusOf(dep)));

  const launch = async (nodeId: string): Promise<void> => {
    inFlight.add(nodeId);
    execution.nodeStatus[nodeId] = 'running';
    record({ type: 'node_started', nodeId });
    try {
      await (hooks.runNode
        ? hooks.runNode(nodeId)
        : defaultRunNode(workflow, nodeId));
      execution.nodeStatus[nodeId] = 'success';
      record({ type: 'node_succeeded', nodeId });
    } catch (error) {
      failed = true;
      execution.nodeStatus[nodeId] = 'failed';
      record({
        type: 'node_failed',
        nodeId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.delete(nodeId);
    }
  };

  try {
    while (workflow.nodes.some((n) => !terminal.has(statusOf(n.id)))) {
      if (failed) throw new AbortWave();
      const batch = workflow.nodes
        .map((n) => n.id)
        .filter((id) => ready(id));
      if (batch.length === 0) {
        throw new Error('Scheduler stall: no runnable nodes (unexpected).');
      }
      await Promise.all(batch.map(launch));
    }
  } catch (error) {
    if (!(error instanceof AbortWave)) throw error;
  }

  if (failed) {
    for (const node of workflow.nodes) {
      if (!terminal.has(statusOf(node.id))) {
        execution.nodeStatus[node.id] = 'skipped';
        record({ type: 'node_skipped', nodeId: node.id });
      }
    }
    execution.status = 'failed';
    const end = elapsed();
    record({ type: 'execution_failed', message: 'One or more nodes failed.' });
    execution.finishedAt = new Date(start + end).toISOString();
  } else {
    execution.status = 'success';
    const end = elapsed();
    record({ type: 'execution_succeeded' });
    execution.finishedAt = new Date(start + end).toISOString();
  }

  return execution;
}
