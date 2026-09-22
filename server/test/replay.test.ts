import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReplay } from '../src/replay.js';
import type { Execution, Workflow } from '../src/types.js';

const workflow: Workflow = {
  id: 'wf',
  name: 'wf',
  nodes: [
    { id: 'a', name: 'A', dependsOn: [] },
    { id: 'b', name: 'B', dependsOn: ['a'] },
    { id: 'c', name: 'C', dependsOn: ['b'] },
  ],
};

function execution(events: Execution['events']): Execution {
  return {
    id: 'e',
    workflowId: 'wf',
    status: 'success',
    startedAt: new Date(0).toISOString(),
    nodeStatus: {},
    events,
  };
}

describe('buildReplay', () => {
  it('replays a successful history frame by frame through all four core states', () => {
    const replay = buildReplay(
      workflow,
      execution([
        { seq: 0, t: 0, type: 'execution_started' },
        { seq: 1, t: 1, type: 'node_started', nodeId: 'a' },
        { seq: 2, t: 2, type: 'node_succeeded', nodeId: 'a' },
        { seq: 3, t: 3, type: 'node_started', nodeId: 'b' },
        { seq: 4, t: 4, type: 'node_succeeded', nodeId: 'b' },
        { seq: 5, t: 5, type: 'node_started', nodeId: 'c' },
        { seq: 6, t: 6, type: 'node_succeeded', nodeId: 'c' },
        { seq: 7, t: 7, type: 'execution_succeeded' },
      ]),
    );
    assert.equal(replay.playable, true);
    assert.deepEqual(replay.warnings, []);
    assert.equal(replay.frames.length, 9);

    const initial = replay.frames[0];
    assert.deepEqual(initial.nodeStatus, { a: 'pending', b: 'pending', c: 'pending' });

    const running = replay.frames[2];
    assert.equal(running.nodeStatus.a, 'running');
    assert.equal(running.event?.type, 'node_started');

    const finalFrame = replay.frames[replay.frames.length - 1];
    assert.deepEqual(finalFrame.nodeStatus, {
      a: 'success',
      b: 'success',
      c: 'success',
    });
  });

  it('replays a failed execution with downstream nodes skipped', () => {
    const replay = buildReplay(
      workflow,
      execution([
        { seq: 0, t: 0, type: 'execution_started' },
        { seq: 1, t: 1, type: 'node_started', nodeId: 'a' },
        { seq: 2, t: 2, type: 'node_failed', nodeId: 'a', message: 'boom' },
        { seq: 3, t: 3, type: 'node_skipped', nodeId: 'b' },
        { seq: 4, t: 4, type: 'node_skipped', nodeId: 'c' },
        { seq: 5, t: 5, type: 'execution_failed' },
      ]),
    );
    assert.equal(replay.playable, true);
    const frame = replay.frames.at(-1)!;
    assert.equal(frame.nodeStatus.a, 'failed');
    assert.equal(frame.nodeStatus.b, 'skipped');
    assert.equal(frame.nodeStatus.c, 'skipped');
  });

  it('warns about missing node records while keeping replay playable', () => {
    const replay = buildReplay(
      workflow,
      execution([
        { seq: 0, t: 0, type: 'execution_started' },
        { seq: 1, t: 1, type: 'node_started', nodeId: 'a' },
        { seq: 2, t: 2, type: 'node_succeeded', nodeId: 'a' },
        // b and c never produced any records
        { seq: 3, t: 3, type: 'execution_succeeded' },
      ]),
    );
    assert.equal(replay.playable, true);
    const warning = replay.warnings.find((w) => w.code === 'MISSING_NODE_RECORDS');
    assert.ok(warning, 'expected MISSING_NODE_RECORDS warning');
    assert.deepEqual(warning.nodeIds!.sort(), ['b', 'c']);
    const last = replay.frames.at(-1)!;
    assert.equal(last.nodeStatus.b, 'pending');
    assert.equal(last.nodeStatus.c, 'pending');
  });

  it('warns when log order disagrees with topological order but replays faithfully', () => {
    const replay = buildReplay(
      workflow,
      execution([
        { seq: 0, t: 0, type: 'execution_started' },
        // b starts before a finished
        { seq: 1, t: 1, type: 'node_started', nodeId: 'a' },
        { seq: 2, t: 2, type: 'node_started', nodeId: 'b' },
        { seq: 3, t: 3, type: 'node_succeeded', nodeId: 'a' },
        { seq: 4, t: 4, type: 'node_succeeded', nodeId: 'b' },
        { seq: 5, t: 5, type: 'node_started', nodeId: 'c' },
        { seq: 6, t: 6, type: 'node_succeeded', nodeId: 'c' },
        { seq: 7, t: 7, type: 'execution_succeeded' },
      ]),
    );
    assert.equal(replay.playable, true);
    assert.ok(
      replay.warnings.some((w) => w.code === 'OUT_OF_ORDER_NODE_EVENT'),
      'expected an out-of-order warning',
    );
  });

  it('warns about events for nodes unknown to the workflow', () => {
    const replay = buildReplay(
      workflow,
      execution([
        { seq: 0, t: 0, type: 'execution_started' },
        { seq: 1, t: 1, type: 'node_started', nodeId: 'ghost' },
      ]),
    );
    assert.ok(replay.warnings.some((w) => w.code === 'UNKNOWN_NODE_EVENT'));
  });

  it('blocks replay for a cyclic workflow', () => {
    const cyclic: Workflow = {
      id: 'cyc',
      name: 'cyc',
      nodes: [
        { id: 'a', name: 'A', dependsOn: ['b'] },
        { id: 'b', name: 'B', dependsOn: ['a'] },
      ],
    };
    const replay = buildReplay(
      cyclic,
      execution([{ seq: 0, t: 0, type: 'execution_started' }]),
    );
    assert.equal(replay.playable, false);
    assert.deepEqual(replay.frames, []);
    assert.ok(replay.warnings.some((w) => w.code === 'CYCLE'));
  });

  it('blocks replay when a dependency is missing from the definition', () => {
    const broken: Workflow = {
      id: 'broken',
      name: 'broken',
      nodes: [{ id: 'a', name: 'A', dependsOn: ['ghost'] }],
    };
    const replay = buildReplay(
      broken,
      execution([{ seq: 0, t: 0, type: 'execution_started' }]),
    );
    assert.equal(replay.playable, false);
    assert.ok(replay.warnings.some((w) => w.code === 'MISSING_DEPENDENCY'));
  });
});
