import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { WorkflowGraph } from './WorkflowGraph';
import type {
  Execution,
  ExecutionEvent,
  NodeStatus,
  Replay,
  ValidationIssue,
  ValidationResult,
  Workflow,
  WorkflowSummary,
} from './types';

const POLL_MS = 500;

function StatusBadge({ status }: { status: Execution['status'] }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issue-list">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={`issue issue-${issue.code}`}>
          <strong>{issue.code}</strong>: {issue.message}
        </li>
      ))}
    </ul>
  );
}

function WarningList({ replay }: { replay: Replay }) {
  if (replay.warnings.length === 0) return null;
  return (
    <div className="warnings">
      <h4>Record warnings</h4>
      <ul>
        {replay.warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`} className={`warning warning-${warning.code}`}>
            <strong>{warning.code}</strong>: {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

const EVENT_LABEL: Record<ExecutionEvent['type'], string> = {
  execution_started: 'Execution started',
  node_started: 'Node started',
  node_succeeded: 'Node succeeded',
  node_failed: 'Node failed',
  node_skipped: 'Node skipped',
  execution_succeeded: 'Execution succeeded',
  execution_failed: 'Execution failed',
};

function eventTargetClass(event: ExecutionEvent | null): string {
  if (!event) return '';
  if (event.type === 'node_failed') return 'event-failed';
  if (event.type === 'node_skipped') return 'event-skipped';
  if (event.type.startsWith('execution_')) return 'event-execution';
  return '';
}

export default function App() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [detail, setDetail] = useState<{
    workflow: Workflow;
    validation: ValidationResult;
  } | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>('');
  const [replay, setReplay] = useState<Replay | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [liveExecution, setLiveExecution] = useState<Execution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const playTimer = useRef<number | null>(null);

  useEffect(() => {
    api
      .listWorkflows()
      .then((list) => {
        setWorkflows(list);
        setSelectedWorkflowId(list[0]?.id ?? '');
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    let cancelled = false;
    setError(null);
    setReplay(null);
    setSelectedExecutionId('');
    setLiveExecution(null);
    setFrameIndex(0);
    api
      .getWorkflow(selectedWorkflowId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    api
      .listExecutions(selectedWorkflowId)
      .then((list) => {
        if (!cancelled) setExecutions(list);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId]);

  const refreshExecutions = useCallback(async () => {
    if (!selectedWorkflowId) return;
    const list = await api.listExecutions(selectedWorkflowId);
    setExecutions(list);
    return list;
  }, [selectedWorkflowId]);

  // Poll while any execution of the selected workflow is running.
  const runningIds = useMemo(
    () => new Set(executions.filter((e) => e.status === 'running').map((e) => e.id)),
    [executions],
  );
  useEffect(() => {
    if (runningIds.size === 0) return;
    const timer = window.setInterval(() => {
      refreshExecutions().catch((err: Error) => setError(err.message));
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [runningIds, refreshExecutions]);

  const selectExecution = useCallback(
    async (executionId: string) => {
      setSelectedExecutionId(executionId);
      setReplay(null);
      setPlaying(false);
      setFrameIndex(0);
      if (!executionId) return;
      const [executionResult, replayResult] = await Promise.all([
        api.getExecution(executionId),
        api.getReplay(executionId),
      ]);
      setReplay(replayResult);
      setFrameIndex(replayResult.frames.length > 0 ? replayResult.frames.length - 1 : 0);
      if (executionResult.status === 'running') {
        setLiveExecution(executionResult);
      } else {
        setLiveExecution(null);
      }
    },
    [],
  );

  // Keep live execution fresh when viewing a running execution (polling).
  useEffect(() => {
    if (!liveExecution || liveExecution.status !== 'running') {
      return;
    }
    const executionId = liveExecution.id;
    const timer = window.setInterval(async () => {
      const updated = await api.getExecution(executionId);
      setExecutions((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e)),
      );
      if (updated.status === 'running') {
        setLiveExecution(updated);
      } else {
        // Settled: leave live mode and load the replay of the final record.
        setLiveExecution(null);
        // The execution object is persisted before the final terminal event
        // flush completes, so retry once if the replay still looks empty.
        let replayResult = await api.getReplay(executionId);
        if (replayResult.frames.length <= 1) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          replayResult = await api.getReplay(executionId);
        }
        setReplay(replayResult);
        setSelectedExecutionId(executionId);
        setFrameIndex(replayResult.frames.length - 1);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [liveExecution?.id, liveExecution?.status]);

  // Playback timer.
  useEffect(() => {
    if (!playing || !replay) return;
    playTimer.current = window.setInterval(() => {
      setFrameIndex((index) => {
        if (index >= replay.frames.length - 1) {
          setPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, 450);
    return () => {
      if (playTimer.current !== null) window.clearInterval(playTimer.current);
    };
  }, [playing, replay]);

  const startExecution = async () => {
    if (!selectedWorkflowId || !detail?.validation.valid || starting) return;
    setStarting(true);
    setError(null);
    try {
      const response = await api.startExecution(selectedWorkflowId);
      const body = (await response.json()) as Execution & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Failed to start execution');
      await refreshExecutions();
      await selectExecution(body.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const frame = replay && replay.playable ? replay.frames[frameIndex] ?? null : null;
  const isViewingLive =
    liveExecution !== null && liveExecution.id === selectedExecutionId;
  const graphStatus: Record<string, NodeStatus> = isViewingLive
    ? (liveExecution.nodeStatus as Record<string, NodeStatus>)
    : frame?.nodeStatus ?? {};

  const currentEvent = isViewingLive ? null : frame?.event ?? null;
  const detailNode = isViewingLive ? null : currentEvent?.nodeId ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Workflow Viewer &amp; Execution Replay</h1>
        <p className="muted">
          Dependencies, live runs (polled every {POLL_MS} ms) and historical
          step-by-step replay.
        </p>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          <section>
            <h2>Workflows</h2>
            {loading ? (
              <p className="muted">Loading…</p>
            ) : (
              <ul className="workflow-list">
                {workflows.map((workflow) => (
                  <li key={workflow.id}>
                    <button
                      className={`workflow-item ${
                        workflow.id === selectedWorkflowId ? 'selected' : ''
                      }`}
                      onClick={() => setSelectedWorkflowId(workflow.id)}
                    >
                      <span>{workflow.name}</span>
                      <span
                        className={`validity ${workflow.valid ? 'valid' : 'invalid'}`}
                        title={workflow.issues.map((i) => i.message).join('\n')}
                      >
                        {workflow.valid ? 'valid' : 'invalid'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {detail && (
              <button
                className="primary"
                disabled={!detail.validation.valid || starting || runningIds.size > 0}
                onClick={startExecution}
                title={
                  !detail.validation.valid
                    ? 'Fix validation errors before running'
                    : runningIds.size > 0
                      ? 'Wait for the running execution to finish'
                      : 'Start a new execution'
                }
              >
                {starting ? 'Starting…' : '▶ Run workflow'}
              </button>
            )}
          </section>

          <section>
            <h2>History</h2>
            {executions.length === 0 && <p className="muted">No executions yet.</p>}
            <ul className="execution-list">
              {executions.map((execution) => (
                <li key={execution.id}>
                  <button
                    className={`execution-item ${
                      execution.id === selectedExecutionId ? 'selected' : ''
                    }`}
                    onClick={() => selectExecution(execution.id)}
                    disabled={execution.status === 'running'}
                    title={
                      execution.status === 'running'
                        ? 'Replay is only available for finished executions'
                        : 'Replay this execution'
                    }
                  >
                    <span className="execution-id">{execution.id}</span>
                    <StatusBadge status={execution.status} />
                    <span className="muted">{execution.startedAt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="content">
          {detail && (
            <>
              <div className="content-heading">
                <h2>{detail.workflow.name}</h2>
                {!detail.validation.valid && (
                  <span className="blocked-note">
                    ⛔ Invalid workflow — graph inspection only, run and replay
                    are blocked.
                  </span>
                )}
              </div>
              {!detail.validation.valid && <IssueList issues={detail.validation.issues} />}
              <WorkflowGraph
                workflow={detail.workflow}
                nodeStatus={graphStatus}
                highlightNodeId={detailNode}
              />
            </>
          )}

          {liveExecution?.status === 'running' && (
            <div className="replay-panel">
              <h3>Live execution: {liveExecution.id}</h3>
              <p>
                Status: <StatusBadge status={liveExecution.status} /> — this page
                polls the server until the run settles.
              </p>
            </div>
          )}

          {replay && replay.playable && (
            <div className="replay-panel">
              <div className="replay-heading">
                <h3>Replay: {selectedExecutionId}</h3>
                <div className="replay-controls">
                  <button
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex(0);
                    }}
                    disabled={frameIndex === 0}
                  >
                    ⏮ Start
                  </button>
                  <button
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex((i) => Math.max(0, i - 1));
                    }}
                    disabled={frameIndex === 0}
                  >
                    ◀ Step
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      if (frameIndex === replay.frames.length - 1) setFrameIndex(0);
                      setPlaying((p) => !p);
                    }}
                  >
                    {playing ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex((i) => Math.min(replay.frames.length - 1, i + 1));
                    }}
                    disabled={frameIndex === replay.frames.length - 1}
                  >
                    Step ▶
                  </button>
                  <button
                    onClick={() => {
                      setPlaying(false);
                      setFrameIndex(replay.frames.length - 1);
                    }}
                    disabled={frameIndex === replay.frames.length - 1}
                  >
                    End ⏭
                  </button>
                  <span className="muted">
                    Step {frameIndex}/{replay.frames.length - 1}
                  </span>
                </div>
              </div>

              <input
                className="timeline"
                type="range"
                min={0}
                max={replay.frames.length - 1}
                value={frameIndex}
                onChange={(event) => {
                  setPlaying(false);
                  setFrameIndex(Number(event.target.value));
                }}
                aria-label="Replay timeline"
              />

              {currentEvent && (
                <div className={`event-card ${eventTargetClass(currentEvent)}`}>
                  <span className="event-seq">#{currentEvent.seq}</span>
                  <span>{EVENT_LABEL[currentEvent.type]}</span>
                  {currentEvent.nodeId && <code>{currentEvent.nodeId}</code>}
                  <span className="muted">t+{currentEvent.t}ms</span>
                  {currentEvent.message && <span>{currentEvent.message}</span>}
                </div>
              )}

              <ol className="event-log">
                {replay.frames.slice(1).map((item, index) => {
                  const event = item.event!;
                  return (
                    <li
                      key={event.seq}
                      className={`event-row ${eventTargetClass(event)} ${
                        index === frameIndex - 1 ? 'current' : ''
                      }`}
                      onClick={() => {
                        setPlaying(false);
                        setFrameIndex(index + 1);
                      }}
                    >
                      <span className="event-seq">#{event.seq}</span>
                      <span>{EVENT_LABEL[event.type]}</span>
                      {event.nodeId && <code>{event.nodeId}</code>}
                      <span className="muted">t+{event.t}ms</span>
                    </li>
                  );
                })}
              </ol>

              <WarningList replay={replay} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
