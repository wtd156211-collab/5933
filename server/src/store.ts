import type { Execution, Workflow } from './types.js';

/**
 * In-memory data store seeded with workflows and historical executions.
 * The seed data deliberately includes invalid workflows and imperfect
 * execution records so the UI can demonstrate every error path against
 * real API responses (no hardcoded frontend data).
 */

export const workflows: Workflow[] = [
  {
    id: 'etl-report',
    name: 'Daily ETL Report',
    nodes: [
      { id: 'extract', name: 'Extract', dependsOn: [], durationMs: 20 },
      { id: 'validate', name: 'Validate', dependsOn: ['extract'], durationMs: 15 },
      { id: 'transform', name: 'Transform', dependsOn: ['validate'], durationMs: 25 },
      { id: 'load', name: 'Load Warehouse', dependsOn: ['transform'], durationMs: 15 },
      { id: 'notify', name: 'Notify Team', dependsOn: ['load'], durationMs: 10 },
      { id: 'archive', name: 'Archive Raw', dependsOn: ['extract'], durationMs: 30 },
    ],
  },
  {
    id: 'deploy-pipeline',
    name: 'Deploy Pipeline',
    nodes: [
      { id: 'build', name: 'Build', dependsOn: [], durationMs: 20 },
      { id: 'test', name: 'Test', dependsOn: ['build'], durationMs: 20, fail: true },
      { id: 'deploy', name: 'Deploy', dependsOn: ['test'], durationMs: 20 },
      { id: 'smoke', name: 'Smoke Check', dependsOn: ['deploy'], durationMs: 10 },
    ],
  },
  {
    id: 'broken-cycle',
    name: 'Broken: Cyclic Workflow',
    nodes: [
      { id: 'a', name: 'A', dependsOn: ['c'] },
      { id: 'b', name: 'B', dependsOn: ['a'] },
      { id: 'c', name: 'C', dependsOn: ['b'] },
    ],
  },
  {
    id: 'broken-missing-dep',
    name: 'Broken: Missing Dependency',
    nodes: [
      { id: 'start', name: 'Start', dependsOn: [] },
      { id: 'middle', name: 'Middle', dependsOn: ['start', 'ghost'] },
    ],
  },
];

export const executions: Execution[] = [
  {
    id: 'exec-etl-0001',
    workflowId: 'etl-report',
    status: 'success',
    startedAt: '2026-09-20T02:00:00.000Z',
    finishedAt: '2026-09-20T02:00:00.110Z',
    nodeStatus: {
      extract: 'success',
      validate: 'success',
      transform: 'success',
      load: 'success',
      notify: 'success',
      archive: 'success',
    },
    events: [
      { seq: 0, t: 0, type: 'execution_started' },
      { seq: 1, t: 1, type: 'node_started', nodeId: 'extract' },
      { seq: 2, t: 20, type: 'node_succeeded', nodeId: 'extract' },
      { seq: 3, t: 21, type: 'node_started', nodeId: 'archive' },
      { seq: 4, t: 22, type: 'node_started', nodeId: 'validate' },
      { seq: 5, t: 37, type: 'node_succeeded', nodeId: 'validate' },
      { seq: 6, t: 38, type: 'node_started', nodeId: 'transform' },
      { seq: 7, t: 51, type: 'node_succeeded', nodeId: 'archive' },
      { seq: 8, t: 63, type: 'node_succeeded', nodeId: 'transform' },
      { seq: 9, t: 64, type: 'node_started', nodeId: 'load' },
      { seq: 10, t: 79, type: 'node_succeeded', nodeId: 'load' },
      { seq: 11, t: 80, type: 'node_started', nodeId: 'notify' },
      { seq: 12, t: 90, type: 'node_succeeded', nodeId: 'notify' },
      { seq: 13, t: 90, type: 'execution_succeeded' },
    ],
  },
  {
    id: 'exec-deploy-0001',
    workflowId: 'deploy-pipeline',
    status: 'failed',
    startedAt: '2026-09-21T08:30:00.000Z',
    finishedAt: '2026-09-21T08:30:00.060Z',
    nodeStatus: {
      build: 'success',
      test: 'failed',
      deploy: 'skipped',
      smoke: 'skipped',
    },
    events: [
      { seq: 0, t: 0, type: 'execution_started' },
      { seq: 1, t: 1, type: 'node_started', nodeId: 'build' },
      { seq: 2, t: 21, type: 'node_succeeded', nodeId: 'build' },
      { seq: 3, t: 22, type: 'node_started', nodeId: 'test' },
      { seq: 4, t: 42, type: 'node_failed', nodeId: 'test', message: 'Node test failed intentionally' },
      { seq: 5, t: 43, type: 'node_skipped', nodeId: 'deploy' },
      { seq: 6, t: 43, type: 'node_skipped', nodeId: 'smoke' },
      { seq: 7, t: 44, type: 'execution_failed', message: 'One or more nodes failed.' },
    ],
  },
  {
    // Imported from a legacy recorder: nodes started in an order that
    // disagrees with the topological order, and the "archive" node has no
    // records at all. Both conditions must be surfaced during replay.
    id: 'exec-etl-legacy',
    workflowId: 'etl-report',
    status: 'success',
    startedAt: '2026-09-19T02:00:00.000Z',
    finishedAt: '2026-09-19T02:00:00.080Z',
    nodeStatus: {
      extract: 'success',
      validate: 'success',
      transform: 'success',
      load: 'success',
      notify: 'success',
      archive: 'pending',
    },
    events: [
      { seq: 0, t: 0, type: 'execution_started' },
      { seq: 1, t: 1, type: 'node_started', nodeId: 'extract' },
      { seq: 2, t: 10, type: 'node_succeeded', nodeId: 'extract' },
      // Parallel workers shipped events out of chronological order:
      // transform was recorded (t=15) while validate (t=11..21) was still
      // running, i.e. the record order disagrees with the topological order.
      { seq: 3, t: 15, type: 'node_started', nodeId: 'transform' },
      { seq: 4, t: 11, type: 'node_started', nodeId: 'validate' },
      { seq: 5, t: 21, type: 'node_succeeded', nodeId: 'validate' },
      { seq: 6, t: 40, type: 'node_succeeded', nodeId: 'transform' },
      { seq: 7, t: 41, type: 'node_started', nodeId: 'load' },
      { seq: 8, t: 55, type: 'node_succeeded', nodeId: 'load' },
      { seq: 9, t: 56, type: 'node_started', nodeId: 'notify' },
      { seq: 10, t: 70, type: 'node_succeeded', nodeId: 'notify' },
      // The sibling "archive" branch never produced any records.
      { seq: 11, t: 72, type: 'execution_succeeded' },
    ],
  },
];
