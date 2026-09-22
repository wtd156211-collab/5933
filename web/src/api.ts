import type {
  ExecutionRecord,
  ExecutionSummary,
  WorkflowGraph,
} from '../../shared/types';

export interface WorkflowListItem {
  id: string;
  name: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 请求失败: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  listWorkflows: () => getJson<WorkflowListItem[]>('/api/workflows'),
  getGraph: (id: string) => getJson<WorkflowGraph>(`/api/workflows/${id}/graph`),
  listExecutions: (workflowId: string) =>
    getJson<ExecutionSummary[]>(`/api/workflows/${workflowId}/executions`),
  getExecution: (id: string) => getJson<ExecutionRecord>(`/api/executions/${id}`),
  startExecution: async (workflowId: string): Promise<ExecutionRecord> => {
    const res = await fetch(`/api/workflows/${workflowId}/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `启动执行失败: HTTP ${res.status}`);
    }
    return (await res.json()) as ExecutionRecord;
  },
};
