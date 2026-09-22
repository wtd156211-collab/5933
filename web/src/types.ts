export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface WorkflowNode {
  id: string;
  name: string;
  dependsOn: string[];
  durationMs?: number;
  fail?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
}

export interface ValidationIssue {
  code: 'CYCLE' | 'MISSING_DEPENDENCY' | 'DUPLICATE_NODE' | 'EMPTY_WORKFLOW';
  message: string;
  nodeIds?: string[];
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  order: string[];
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
  seq: number;
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
  nodeStatus: Record<string, NodeStatus>;
  events: ExecutionEvent[];
}

export interface WorkflowSummary {
  id: string;
  name: string;
  nodeCount: number;
  valid: boolean;
  issues: ValidationIssue[];
  executionCount: number;
}

export type ReplayWarningCode =
  | 'CYCLE'
  | 'MISSING_DEPENDENCY'
  | 'MISSING_NODE_RECORDS'
  | 'UNKNOWN_NODE_EVENT'
  | 'OUT_OF_ORDER_NODE_EVENT'
  | 'EVENT_NODE_WITHOUT_ID';

export interface ReplayWarning {
  code: ReplayWarningCode;
  message: string;
  nodeIds?: string[];
}

export interface ReplayFrame {
  step: number;
  nodeStatus: Record<string, NodeStatus>;
  event: ExecutionEvent | null;
}

export interface Replay {
  playable: boolean;
  validation: ValidationResult;
  warnings: ReplayWarning[];
  frames: ReplayFrame[];
}
