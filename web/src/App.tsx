import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ExecutionRecord,
  ExecutionSummary,
  NodeStatus,
  WorkflowGraph,
} from '../../shared/types';
import { computeReplayFrame } from '../../shared/replay';
import { api, type WorkflowListItem } from './api';
import WorkflowGraphView from './components/WorkflowGraphView';
import ReplayControls from './components/ReplayControls';

const EXEC_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  success: '成功',
  failed: '失败',
};

export default function App() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [workflowId, setWorkflowId] = useState<string>('');
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [selectedExec, setSelectedExec] = useState<ExecutionRecord | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWorkflows()
      .then((list) => {
        setWorkflows(list);
        if (list.length > 0) setWorkflowId((cur) => cur || list[0].id);
      })
      .catch((e) => setError(`加载工作流列表失败: ${e.message}`));
  }, []);

  const refreshExecutions = useCallback((wfId: string) => {
    return api.listExecutions(wfId).then(setExecutions).catch(() => setExecutions([]));
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    setGraph(null);
    setSelectedExec(null);
    setStep(0);
    setError(null);
    api
      .getGraph(workflowId)
      .then(setGraph)
      .catch((e) => setError(`加载工作流图失败: ${e.message}`));
    refreshExecutions(workflowId);
  }, [workflowId, refreshExecutions]);

  const graphErrors = graph?.errors ?? [];
  const graphValid = graph !== null && graphErrors.length === 0;

  // Poll a running execution until it finishes, then refresh the list.
  const followExecution = useCallback(
    (execId: string) => {
      const timer = setInterval(async () => {
        try {
          const record = await api.getExecution(execId);
          setSelectedExec(record);
          setStep(record.events.length);
          if (record.status !== 'running') {
            clearInterval(timer);
            refreshExecutions(record.workflowId);
          }
        } catch {
          clearInterval(timer);
        }
      }, 400);
    },
    [refreshExecutions],
  );

  const handleRun = useCallback(async () => {
    if (!workflowId || !graphValid) return;
    setError(null);
    try {
      const record = await api.startExecution(workflowId);
      setSelectedExec(record);
        followExecution(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [workflowId, graphValid, followExecution]);

  const handleSelectExecution = useCallback(async (execId: string) => {
    setError(null);
    try {
      const record = await api.getExecution(execId);
      setSelectedExec(record);
      setStep(record.events.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const frame = useMemo(() => {
    if (!graph || !selectedExec) return null;
    return computeReplayFrame(graph.workflow, selectedExec.events, step);
  }, [graph, selectedExec, step]);

  const statuses: Record<string, NodeStatus> = useMemo(() => {
    if (frame) return frame.statuses;
    const base: Record<string, NodeStatus> = {};
    for (const n of graph?.workflow.nodes ?? []) base[n.id] = 'pending';
    return base;
  }, [frame, graph]);

  const errorNodeIds = useMemo(
    () => new Set(graphErrors.flatMap((e) => e.nodes)),
    [graphErrors],
  );

  return (
    <div className="app">
      <header>
        <h1>工作流可视化与执行回放</h1>
        <select
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
          aria-label="选择工作流"
        >
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.id})
            </option>
          ))}
        </select>
        <button onClick={handleRun} disabled={!graphValid} data-testid="run-button">
          运行工作流
        </button>
      </header>

      {error && <div className="error-banner">⚠ {error}</div>}

      {graphErrors.length > 0 && (
        <div className="error-banner" data-testid="graph-errors">
          <strong>工作流定义非法，已阻止运行与回放：</strong>
          <ul>
            {graphErrors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="main">
        <aside className="sidebar">
          <h2>历史执行记录</h2>
          {!graphValid && <p className="hint">工作流定义非法，回放已禁用。</p>}
          {graphValid && executions.length === 0 && (
            <p className="hint">暂无执行记录，点击“运行工作流”创建。</p>
          )}
          <ul className="exec-list">
            {graphValid &&
              executions.map((e) => (
                <li key={e.id}>
                  <button
                    className={`exec-item status-${e.status}${
                      selectedExec?.id === e.id ? ' selected' : ''
                    }`}
                    onClick={() => handleSelectExecution(e.id)}
                  >
                    <span className="exec-id">{e.id}</span>
                    <span className={`exec-status status-${e.status}`}>
                      {EXEC_STATUS_LABEL[e.status] ?? e.status}
                    </span>
                    <span className="exec-time">
                      {new Date(e.startedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        <section className="content">
          {graph ? (
            <WorkflowGraphView
              graph={graph}
              statuses={statuses}
              errorNodeIds={errorNodeIds}
            />
          ) : (
            <p className="hint">加载中…</p>
          )}
          {graphValid && selectedExec && frame && (
            <ReplayControls
              events={selectedExec.events}
              step={step}
              onStepChange={setStep}
              warnings={frame.warnings}
            />
          )}
        </section>
      </div>
    </div>
  );
}
