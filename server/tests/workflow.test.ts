import { describe, expect, it } from 'vitest';
import { topoLevels, validateWorkflow } from '../../shared/workflow';
import type { WorkflowDef } from '../../shared/types';

const diamond: WorkflowDef = {
  id: 'diamond',
  name: 'diamond',
  nodes: [
    { id: 'a', name: 'A', dependsOn: [] },
    { id: 'b', name: 'B', dependsOn: ['a'] },
    { id: 'c', name: 'C', dependsOn: ['a'] },
    { id: 'd', name: 'D', dependsOn: ['b', 'c'] },
  ],
};

describe('validateWorkflow', () => {
  it('accepts a valid DAG', () => {
    expect(validateWorkflow(diamond)).toEqual([]);
  });

  it('reports cycles with the cycle path', () => {
    const def: WorkflowDef = {
      id: 'cyc',
      name: 'cyc',
      nodes: [
        { id: 'a', name: 'A', dependsOn: ['c'] },
        { id: 'b', name: 'B', dependsOn: ['a'] },
        { id: 'c', name: 'C', dependsOn: ['b'] },
      ],
    };
    const errors = validateWorkflow(def);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('cycle');
    expect(errors[0].message).toContain('循环依赖');
  });

  it('reports self-dependency as a cycle', () => {
    const def: WorkflowDef = {
      id: 'self',
      name: 'self',
      nodes: [{ id: 'a', name: 'A', dependsOn: ['a'] }],
    };
    expect(validateWorkflow(def)[0].kind).toBe('cycle');
  });

  it('reports missing dependencies', () => {
    const def: WorkflowDef = {
      id: 'broken',
      name: 'broken',
      nodes: [
        { id: 'a', name: 'A', dependsOn: [] },
        { id: 'b', name: 'B', dependsOn: ['ghost'] },
      ],
    };
    const errors = validateWorkflow(def);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('missing-dependency');
    expect(errors[0].message).toContain('ghost');
  });
});

describe('topoLevels', () => {
  it('groups independent nodes into levels', () => {
    expect(topoLevels(diamond)).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('throws on cyclic graphs', () => {
    const def: WorkflowDef = {
      id: 'cyc',
      name: 'cyc',
      nodes: [
        { id: 'a', name: 'A', dependsOn: ['b'] },
        { id: 'b', name: 'B', dependsOn: ['a'] },
      ],
    };
    expect(() => topoLevels(def)).toThrow();
  });

  it('throws on missing dependencies', () => {
    const def: WorkflowDef = {
      id: 'broken',
      name: 'broken',
      nodes: [{ id: 'a', name: 'A', dependsOn: ['ghost'] }],
    };
    expect(() => topoLevels(def)).toThrow(/missing dependency/);
  });
});
