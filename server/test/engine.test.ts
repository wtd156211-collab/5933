import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runWorkflow } from '../src/engine.js';
import type { Workflow } from '../src/types.js';

const normal: Workflow = {
  id: 'normal',
  name: 'normal',
  nodes: [
    { id: 'a', name: 'A', dependsOn: [] },
    { id: 'b', name: 'B', dependsOn: ['a'] },
    { id: 'c', name: 'C', dependsOn: ['a'] },
    { id: 'd', name: 'D', dependsOn: ['b', 'c'] },
  ],
};

describe('runWorkflow', () => {
  it('runs a normal workflow in dependency order and records events', async () => {
    const started: string[] = [];
    const execution = await runWorkflow(normal, 'exec-1', {
      runNode: async (id) => {
        started.push(id);
      },
    });
    assert.equal(execution.status, 'success');
    assert.ok(started.indexOf('a') < started.indexOf('b'));
    assert.ok(started.indexOf('b') < started.indexOf('d'));
    assert.ok(started.indexOf('c') < started.indexOf('d'));
    for (const node of normal.nodes) {
      assert.equal(execution.nodeStatus[node.id], 'success');
    }
    const types = execution.events.map((e) => e.type);
    assert.equal(types[0], 'execution_started');
    assert.equal(types[types.length - 1], 'execution_succeeded');
    assert.deepEqual([...new Set(execution.events.map((e) => e.seq))].length, execution.events.length);
  });

  it('fails fast: failed node failed, unstarted nodes skipped, completed nodes kept', async () => {
    const failing: Workflow = {
      id: 'failing',
      name: 'failing',
      nodes: [
        { id: 'a', name: 'A', dependsOn: [], fail: true },
        { id: 'b', name: 'B', dependsOn: ['a'] },
        { id: 'c', name: 'C', dependsOn: ['b'] },
      ],
    };
    const execution = await runWorkflow(failing, 'exec-2', {
      runNode: async (id) => {
        if (id === 'a') throw new Error('boom');
      },
    });
    assert.equal(execution.status, 'failed');
    assert.equal(execution.nodeStatus.a, 'failed');
    assert.equal(execution.nodeStatus.b, 'skipped');
    assert.equal(execution.nodeStatus.c, 'skipped');
    assert.ok(execution.events.some((e) => e.type === 'execution_failed'));
  });

  it('refuses to run a cyclic workflow', async () => {
    const cyclic: Workflow = {
      id: 'cyclic',
      name: 'cyclic',
      nodes: [
        { id: 'a', name: 'A', dependsOn: ['b'] },
        { id: 'b', name: 'B', dependsOn: ['a'] },
      ],
    };
    await assert.rejects(
      () => runWorkflow(cyclic, 'exec-3'),
      /Cannot run invalid workflow/,
    );
  });

  it('emits an update after every event', async () => {
    let updates = 0;
    const execution = await runWorkflow(normal, 'exec-4', {
      onUpdate: () => {
        updates += 1;
      },
    });
    assert.ok(updates >= execution.events.length);
    assert.equal(updates, execution.events.length);
  });
});
