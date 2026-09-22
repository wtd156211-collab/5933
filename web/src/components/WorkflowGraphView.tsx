import { useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NodeStatus, WorkflowGraph } from '../../../shared/types';
import { topoLevels } from '../../../shared/workflow';

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  skipped: '已跳过',
};

interface Props {
  graph: WorkflowGraph;
  statuses: Record<string, NodeStatus>;
  errorNodeIds?: Set<string>;
}

function layoutPositions(graph: WorkflowGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let levels: string[][] | null = null;
  try {
    levels = topoLevels(graph.workflow);
  } catch {
    levels = null;
  }
  if (levels) {
    levels.forEach((ids, depth) => {
      ids.forEach((id, i) => {
        positions.set(id, { x: i * 220 - ((ids.length - 1) * 220) / 2, y: depth * 120 });
      });
    });
  } else {
    // invalid graph (cycle / missing dep): arrange on a circle so the
    // structure and the offending edges are still inspectable
    const n = graph.workflow.nodes.length;
    graph.workflow.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
      positions.set(node.id, {
        x: 260 * Math.cos(angle),
        y: 180 * Math.sin(angle),
      });
    });
  }
  return positions;
}

export default function WorkflowGraphView({ graph, statuses, errorNodeIds }: Props) {
  const { nodes, edges } = useMemo(() => {
    const positions = layoutPositions(graph);
    const nodes: Node[] = graph.workflow.nodes.map((n) => {
      const status = statuses[n.id] ?? 'pending';
      const hasError = errorNodeIds?.has(n.id) ?? false;
      const deps = n.dependsOn.length > 0 ? n.dependsOn.join(', ') : '无';
      return {
        id: n.id,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: (
            <div className="node-label">
              <div className="node-name">{n.name}</div>
              <div className="node-meta">id: {n.id}</div>
              <div className="node-meta">依赖: {deps}</div>
              <div className={`node-status status-${status}`}>
                {STATUS_LABEL[status]}
              </div>
            </div>
          ),
        },
        className: `wf-node status-${status}${hasError ? ' node-error' : ''}`,
        draggable: false,
        connectable: false,
      };
    });
    const edges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.from,
      target: e.to,
      animated: statuses[e.to] === 'running',
      className: 'wf-edge',
    }));
    return { nodes, edges };
  }, [graph, statuses, errorNodeIds]);

  return (
    <div className="graph-container" data-testid="workflow-graph">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
