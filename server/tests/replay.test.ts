import { describe, expect, it } from 'vitest';
import { computeReplayFrame, computeWarnings } from '../../shared/replay';
import type { NodeEvent, WorkflowDef } from '../../shared/types';

const def: WorkflowDef = {
  id: 'wf',
  name: 'wf',
  nodes: [
    { id: 'a', name: 'A', dependsOn: [] },
    { id: 'b', name: 'B', dependsOn: ['a'] },
    { id: 'c', name: 'C', dependsOn: ['b'] },
  ],
};

const orderedEvents: NodeEvent[] = [
  { nodeId: 'a', status: 'running', at: 0 },
  { nodeId: 'a', status: 'success', at: 10 },
  { nodeId: 'b', status: 'running', at: 20 },
  { nodeId: 'b', status: 'failed', at: 30 },
  { nodeId: 'c', status: 'skipped', at: 40 },
];

describe('computeReplayFrame', () => {
  it('starts with every node pending at step 0', () => {
    const frame = computeReplayFrame(def, orderedEvents, 0);
    expect(frame.statuses).toEqual({ a: 'pending', b: 'pending', c: 'pending' });
    expect(frame.step).toBe(0);
  });

  it('applies events step by step', () => {
    expect(computeReplayFrame(def, orderedEvents, 1).statuses.a).toBe('running');
    expect(computeReplayFrame(def, orderedEvents, 2).statuses.a).toBe('success');
    const mid = computeReplayFrame(def, orderedEvents, 4);
    expect(mid.statuses).toEqual({ a: 'success', b: 'failed', c: 'pending' });
    const end = computeReplayFrame(def, orderedEvents, 5);
    expect(end.statuses).toEqual({ a: 'success', b: 'failed', c: 'skipped' });
  });

  it('clamps out-of-range steps', () => {
    expect(computeReplayFrame(def, orderedEvents, -3).step).toBe(0);
    expect(computeReplayFrame(def, orderedEvents, 999).step).toBe(5);
  });

  it('replays a failed execution record faithfully', () => {
    const frame = computeReplayFrame(def, orderedEvents, orderedEvents.length);
    expect(frame.statuses.b).toBe('failed');
    expect(frame.statuses.c).toBe('skipped');
  });
});

describe('computeWarnings', () => {
  it('flags nodes missing from the execution record', () => {
    const events: NodeEvent[] = [
      { nodeId: 'a', status: 'running', at: 0 },
      { nodeId: 'a', status: 'success', at: 10 },
      { nodeId: 'b', status: 'running', at: 20 },
      { nodeId: 'b', status: 'success', at: 30 },
    ];
    const warnings = computeWarnings(def, events);
    const missing = warnings.find((w) => w.kind === 'missing-records');
    expect(missing?.nodeIds).toEqual(['c']);
  });

  it('flags recorded order that violates topological order', () => {
    const events: NodeEvent[] = [
      { nodeId: 'b', status: 'running', at: 0 },
      { nodeId: 'a', status: 'running', at: 10 },
      { nodeId: 'a', status: 'success', at: 20 },
      { nodeId: 'b', status: 'success', at: 30 },
      { nodeId: 'c', status: 'running', at: 40 },
      { nodeId: 'c', status: 'success', at: 50 },
    ];
    const warnings = computeWarnings(def, events);
    const ooo = warnings.find((w) => w.kind === 'out-of-order');
    expect(ooo?.nodeIds).toEqual(['b']);
    // replay still applies events in recorded order
    const frame = computeReplayFrame(def, events, 1);
    expect(frame.statuses.b).toBe('running');
    expect(frame.statuses.a).toBe('pending');
  });

  it('returns no warnings for a clean record', () => {
    expect(computeWarnings(def, orderedEvents)).toEqual([]);
  });
});
