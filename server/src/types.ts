export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface WorkflowNode {
  id: string;
  name: string;
  dependsOn: string[];
  /** Milliseconds the simulated task takes. */
  durationMs?: number;
  /** When true the simulated task rejects, producing a failed execution. */
  fail?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
}

export type EventType =
  | 'execution_started'
  | 'node_started'
  | 'node_succeeded'
  | 'node_failed'
  | 'node_skipped'
  | 'execution_succeeded'
  | 'execution_failed';

export interface ExecutionEvent {
  /** Monotonic index, also chronological order. */
  seq: number;
  /** Elapsed milliseconds since the execution started. */
  t: number;
  type: EventType;
  nodeId?: string;
  message?: string;
}

export type ExecutionStatus = 'running' | 'success' | 'failed';

export interface Execution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  /** Final status of every node that produced a terminal event. */
  nodeStatus: Record<string, NodeStatus>;
  events: ExecutionEvent[];
}

export interface ValidationIssue {
  code: 'CYCLE' | 'MISSING_DEPENDENCY' | 'DUPLICATE_NODE' | 'EMPTY_WORKFLOW';
  message: string;
  nodeIds?: string[];
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Topological ordering of node ids, available when there is no cycle. */
  order: string[];
}
