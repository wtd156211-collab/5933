import { useEffect, useState } from 'react';
import type { NodeEvent } from '../../../shared/types';
import type { ReplayWarning } from '../../../shared/replay';

interface Props {
  events: NodeEvent[];
  step: number;
  onStepChange: (step: number) => void;
  warnings: ReplayWarning[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
};

export default function ReplayControls({ events, step, onStepChange, warnings }: Props) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (step >= events.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => onStepChange(step + 1), 600);
    return () => clearTimeout(timer);
  }, [playing, step, events.length, onStepChange]);

  const currentEvent = step > 0 ? events[step - 1] : null;

  return (
    <div className="replay-controls" data-testid="replay-controls">
      <div className="replay-buttons">
        <button onClick={() => onStepChange(0)} disabled={step === 0}>
          ⏮ 重置
        </button>
        <button onClick={() => onStepChange(step - 1)} disabled={step === 0}>
          ◀ 上一步
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          disabled={step >= events.length && !playing}
        >
          {playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button onClick={() => onStepChange(step + 1)} disabled={step >= events.length}>
          下一步 ▶
        </button>
        <button
          onClick={() => onStepChange(events.length)}
          disabled={step >= events.length}
        >
          ⏭ 到末尾
        </button>
        <span className="replay-step-indicator">
          步骤 {step} / {events.length}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={events.length}
        value={step}
        onChange={(e) => onStepChange(Number(e.target.value))}
        className="replay-slider"
        aria-label="回放时间轴"
      />
      <div className="replay-current">
        {currentEvent ? (
          <>
            当前事件: 节点 <code>{currentEvent.nodeId}</code> →{' '}
            <span className={`status-${currentEvent.status}`}>
              {STATUS_LABEL[currentEvent.status] ?? currentEvent.status}
            </span>{' '}
            @ {new Date(currentEvent.at).toLocaleTimeString()}
          </>
        ) : (
          '时间轴起点（所有节点等待中）'
        )}
      </div>
      {warnings.length > 0 && (
        <div className="replay-warnings" data-testid="replay-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="warning-item">
              ⚠ {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
