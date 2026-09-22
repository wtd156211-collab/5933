import { describe, expect, it } from 'vitest';
import { runWorkflow, WorkflowValidationError } from '../src/engine';
import { createStore } from '../src/store';
import type { NodeStatus, WorkflowDef } from '../../shared/types';

const pipeline: WorkflowDef = {
  id: 'pipeline',
  name: 'pipeline',
  nodes: [
    { id: 'fetch', name: 'Fetch', dependsOn: [] },
    { id: 'validate', name: 'Validate', dependsOn: ['fetch'] },
    { id: 'charge', name: 'Charge', dependsOn: ['validate'] },
    { id: 'stock', name: 'Stock', dependsOn: ['validate'] },
    { id: 'notify', name: 'Notify', dependsOn: ['charge', 'stock'] },
  ],
};

function latestStatuses(events: { nodeId: string; status: NodeStatus }[]) {
  const map: Record<string, NodeStatus> = {};
  for (const e of events) map[e.nodeId] = e.status;
  return map;
}

describe('runWorkflow', () => {
  it('runs a valid workflow to success with ordered events', async () => {
    const store = createStore(false);
    const record = await runWorkflow(store, pipeline, { nodeDurationMs: 0 });
    expect(record.status).toBe('success');
    expect(record.finishedAt).not.toBeNull();
    expect(latestStatuses(record.events)).toEqual({
      fetch: 'success',
      validate: 'success',
      charge: 'success',
      stock: 'success',
      notify: 'success',
    });
    // dependencies must start after their dependents finish
    const at = (id: string, status: NodeStatus) =>
      record.events.find((e) => e.nodeId === id && e.status === status)!.at;
    expect(at('validate', 'running')).toBeGreaterThanOrEqual(at('fetch', 'success'));
    expect(at('notify', 'running')).toBeGreaterThanOrEqual(at('charge', 'success'));
    expect(at('notify', 'running')).toBeGreaterThanOrEqual(at('stock', 'success'));
    expect(store.executions.get(record.id)).toBe(record);
  });

  it('marks failed node and skips downstream on failure', async () => {
    const store = createStore(false);
    const record = await runWorkflow(store, pipeline, {
      nodeDurationMs: 0,
      failNodes: ['charge'],
    });
    expect(record.status).toBe('failed');
    expect(latestStatuses(record.events)).toEqual({
      fetch: 'success',
      validate: 'success',
      charge: 'failed',
      stock: 'success',
      notify: 'skipped',
    });
  });

  it('rejects cyclic workflows before executing', async () => {
    const store = createStore(false);
    const cyclic: WorkflowDef = {
      id: 'cyc',
      name: 'cyc',
      nodes: [
        { id: 'a', name: 'A', dependsOn: ['b'] },
        { id: 'b', name: 'B', dependsOn: ['a'] },
      ],
    };
    await expect(runWorkflow(store, cyclic)).rejects.toBeInstanceOf(
      WorkflowValidationError,
    );
    expect(store.executions.size).toBe(0);
  });

  it('rejects workflows with missing dependencies', async () => {
    const store = createStore(false);
    const broken: WorkflowDef = {
      id: 'broken',
      name: 'broken',
      nodes: [{ id: 'a', name: 'A', dependsOn: ['ghost'] }],
    };
    await expect(runWorkflow(store, broken)).rejects.toThrow(/ghost/);
    expect(store.executions.size).toBe(0);
  });
});
