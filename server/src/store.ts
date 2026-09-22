import type { ExecutionRecord, WorkflowDef } from '../../shared/types';

export interface Store {
  workflows: Map<string, WorkflowDef>;
  executions: Map<string, ExecutionRecord>;
  nextExecutionSeq: number;
}

export function createStore(seed = true): Store {
  const store: Store = {
    workflows: new Map(),
    executions: new Map(),
    nextExecutionSeq: 1,
  };
  if (seed) seedStore(store);
  return store;
}

function seedStore(store: Store): void {
  const orderPipeline: WorkflowDef = {
    id: 'order-pipeline',
    name: '订单处理流水线',
    nodes: [
      { id: 'fetch-order', name: '拉取订单', dependsOn: [] },
      { id: 'validate', name: '校验订单', dependsOn: ['fetch-order'] },
      { id: 'charge', name: '扣款', dependsOn: ['validate'] },
      { id: 'reserve-stock', name: '锁定库存', dependsOn: ['validate'] },
      { id: 'notify', name: '发送通知', dependsOn: ['charge', 'reserve-stock'] },
    ],
  };

  const cyclicWorkflow: WorkflowDef = {
    id: 'cyclic-workflow',
    name: '循环依赖示例（非法）',
    nodes: [
      { id: 'a', name: '节点 A', dependsOn: ['c'] },
      { id: 'b', name: '节点 B', dependsOn: ['a'] },
      { id: 'c', name: '节点 C', dependsOn: ['b'] },
    ],
  };

  const brokenWorkflow: WorkflowDef = {
    id: 'broken-workflow',
    name: '缺失依赖示例（非法）',
    nodes: [
      { id: 'extract', name: '抽取数据', dependsOn: [] },
      { id: 'transform', name: '转换数据', dependsOn: ['extract', 'nonexistent'] },
    ],
  };

  for (const wf of [orderPipeline, cyclicWorkflow, brokenWorkflow]) {
    store.workflows.set(wf.id, wf);
  }

  // A completed historical execution of the order pipeline.
  const t0 = Date.now() - 3600_000;
  store.executions.set('exec-success-1', {
    id: 'exec-success-1',
    workflowId: 'order-pipeline',
    status: 'success',
    startedAt: t0,
    finishedAt: t0 + 5200,
    events: [
      { nodeId: 'fetch-order', status: 'running', at: t0 },
      { nodeId: 'fetch-order', status: 'success', at: t0 + 800 },
      { nodeId: 'validate', status: 'running', at: t0 + 820 },
      { nodeId: 'validate', status: 'success', at: t0 + 1800 },
      { nodeId: 'charge', status: 'running', at: t0 + 1850 },
      { nodeId: 'reserve-stock', status: 'running', at: t0 + 1850 },
      { nodeId: 'reserve-stock', status: 'success', at: t0 + 3000 },
      { nodeId: 'charge', status: 'success', at: t0 + 3600 },
      { nodeId: 'notify', status: 'running', at: t0 + 3650 },
      { nodeId: 'notify', status: 'success', at: t0 + 5200 },
    ],
  });

  // A failed historical execution: charge fails, notify is skipped.
  const t1 = Date.now() - 1800_000;
  store.executions.set('exec-failed-1', {
    id: 'exec-failed-1',
    workflowId: 'order-pipeline',
    status: 'failed',
    startedAt: t1,
    finishedAt: t1 + 3900,
    events: [
      { nodeId: 'fetch-order', status: 'running', at: t1 },
      { nodeId: 'fetch-order', status: 'success', at: t1 + 700 },
      { nodeId: 'validate', status: 'running', at: t1 + 720 },
      { nodeId: 'validate', status: 'success', at: t1 + 1500 },
      { nodeId: 'charge', status: 'running', at: t1 + 1550 },
      { nodeId: 'reserve-stock', status: 'running', at: t1 + 1550 },
      { nodeId: 'reserve-stock', status: 'success', at: t1 + 2800 },
      { nodeId: 'charge', status: 'failed', at: t1 + 3400 },
      { nodeId: 'notify', status: 'skipped', at: t1 + 3900 },
    ],
  });

  // A legacy record with messy data: events recorded out of topological
  // order and one node (notify) missing from the record entirely.
  const t2 = Date.now() - 900_000;
  store.executions.set('exec-legacy-1', {
    id: 'exec-legacy-1',
    workflowId: 'order-pipeline',
    status: 'success',
    startedAt: t2,
    finishedAt: t2 + 3000,
    events: [
      { nodeId: 'validate', status: 'running', at: t2 },
      { nodeId: 'fetch-order', status: 'running', at: t2 + 100 },
      { nodeId: 'fetch-order', status: 'success', at: t2 + 600 },
      { nodeId: 'validate', status: 'success', at: t2 + 900 },
      { nodeId: 'reserve-stock', status: 'running', at: t2 + 950 },
      { nodeId: 'charge', status: 'running', at: t2 + 1000 },
      { nodeId: 'reserve-stock', status: 'success', at: t2 + 2000 },
      { nodeId: 'charge', status: 'success', at: t2 + 3000 },
    ],
  });
}
