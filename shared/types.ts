export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export type ExecutionStatus = 'running' | 'success' | 'failed';

export interface WorkflowNodeDef {
  id: string;
  name: string;
  dependsOn: string[];
}

export interface WorkflowDef {
  id: string;
  name: string;
  nodes: WorkflowNodeDef[];
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface ValidationError {
  kind: 'cycle' | 'missing-dependency';
  message: string;
  nodes: string[];
}

export interface WorkflowGraph {
  workflow: WorkflowDef;
  edges: WorkflowEdge[];
  errors: ValidationError[];
}

export interface NodeEvent {
  nodeId: string;
  status: NodeStatus;
  at: number;
}

export interface ExecutionRecord {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: number;
  finishedAt: number | null;
  events: NodeEvent[];
}

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: number;
  finishedAt: number | null;
}
