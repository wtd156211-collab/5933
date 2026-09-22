import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateWorkflow } from '../src/workflow.js';
import type { Workflow } from '../src/types.js';

describe('validateWorkflow', () => {
  it('accepts a normal DAG and returns topological order', () => {
    const workflow: Workflow = {
      id: 'ok',
      name: 'ok',
      nodes: [
        { id: 'b', name: 'B', dependsOn: ['a'] },
        { id: 'a', name: 'A', dependsOn: [] },
        { id: 'c', name: 'C', dependsOn: ['b'] },
      ],
    };
    const result = validateWorkflow(workflow);
    assert.equal(result.valid, true);
    assert.deepEqual(result.order, ['a', 'b', 'c']
    );
    assert.deepEqual(result.issues, []);
  });

  it('detects a cyclic dependency and reports the nodes on the cycle', () => {
    const workflow: Workflow = {
      id: 'cycle',
      name: 'cycle',
      nodes: [
        { id: 'a', name: 'A', dependsOn: ['c'] },
        { id: 'b', name: 'B', dependsOn: ['a'] },
        { id: 'c', name: 'C', dependsOn: ['b'] },
      ],
    };
    const result = validateWorkflow(workflow);
    assert.equal(result.valid, false);
    assert.equal(result.order.length, 0);
    const issue = result.issues.find((i) => i.code === 'CYCLE');
    assert.ok(issue, 'expected a CYCLE issue');
    assert.deepEqual(issue.nodeIds!.sort(), ['a', 'b', 'c']);
  });

  it('detects a dependency on a node that does not exist', () => {
    const workflow: Workflow = {
      id: 'missing',
      name: 'missing',
      nodes: [
        { id: 'a', name: 'A', dependsOn: [] },
        { id: 'b', name: 'B', dependsOn: ['ghost'] },
      ],
    };
    const result = validateWorkflow(workflow);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === 'MISSING_DEPENDENCY'));
    assert.ok(result.issues.some((i) => i.message.includes('ghost')));
  });

  it('detects duplicate node ids', () => {
    const workflow: Workflow = {
      id: 'dup',
      name: 'dup',
      nodes: [
        { id: 'a', name: 'A1', dependsOn: [] },
        { id: 'a', name: 'A2', dependsOn: [] },
      ],
    };
    const result = validateWorkflow(workflow);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_NODE'));
  });
});
