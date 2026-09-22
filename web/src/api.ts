import type {
  Execution,
  Replay,
  ValidationResult,
  Workflow,
  WorkflowSummary,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return body as T;
}

export const api = {
  listWorkflows: () => request<WorkflowSummary[]>('/api/workflows'),
  getWorkflow: (id: string) =>
    request<{ workflow: Workflow; validation: ValidationResult }>(
      `/api/workflows/${encodeURIComponent(id)}`,
    ),
  listExecutions: (workflowId: string) =>
    request<Execution[]>(
      `/api/workflows/${encodeURIComponent(workflowId)}/executions`,
    ),
  getExecution: (id: string) =>
    request<Execution>(`/api/executions/${encodeURIComponent(id)}`),
  getReplay: (id: string) =>
    request<Replay>(`/api/executions/${encodeURIComponent(id)}/replay`),
  startExecution: (workflowId: string) =>
    fetch(`/api/workflows/${encodeURIComponent(workflowId)}/executions`, {
      method: 'POST',
    }),
};
