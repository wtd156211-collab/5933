import { useMemo, useState } from 'react';
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from './layout';
import type { NodeStatus, Workflow } from './types';

interface Props {
  workflow: Workflow;
  nodeStatus: Record<string, NodeStatus>;
  highlightNodeId?: string | null;
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
  skipped: 'Skipped',
};

function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

export function WorkflowGraph({ workflow, nodeStatus, highlightNodeId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = useMemo(() => layoutGraph(workflow), [workflow]);
  const padding = 20;
  const selected = workflow.nodes.find((n) => n.id === (highlightNodeId ?? selectedId)) ?? null;

  return (
    <div className="graph-wrap">
      <svg
        className="graph"
        viewBox={`${-padding} ${-layout.height / 2} ${layout.width + padding * 2} ${layout.height + padding * 2}`}
        role="img"
        aria-label={`Dependency graph of workflow ${workflow.name}`}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8794a8" />
          </marker>
        </defs>
        {layout.edges.map((edge) => {
          const active =
            nodeStatus[edge.from.id] === 'success' &&
            (nodeStatus[edge.to.id] === 'running' ||
              nodeStatus[edge.to.id] === 'success');
          return (
            <path
              key={edge.id}
              className={`edge ${active ? 'edge-active' : ''}`}
              d={edgePath(edge.from, edge.to)}
              markerEnd="url(#arrow)"
            />
          );
        })}
        {layout.nodes.map((node) => {
          const status = nodeStatus[node.id] ?? 'pending';
          const isSelected = (highlightNodeId ?? selectedId) === node.id;
          return (
            <g
              key={node.id}
              className={`node node-${status} ${isSelected ? 'node-selected' : ''}`}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => setSelectedId(isSelected ? null : node.id)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSelectedId(node.id);
              }}
            >
              <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} />
              <text className="node-name" x={12} y={22}>
                {node.name}
              </text>
              <text className="node-id" x={12} y={40}>
                {node.id}
              </text>
              <text className="node-status" x={NODE_WIDTH - 12} y={22} textAnchor="end">
                {STATUS_LABEL[status]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="node-detail" aria-live="polite">
        {selected ? (
          <>
            <strong>{selected.name}</strong>
            <div className="node-detail-row">
              <span>ID</span>
              <code>{selected.id}</code>
            </div>
            <div className="node-detail-row">
              <span>Depends on</span>
              <span>
                {selected.dependsOn.length > 0
                  ? selected.dependsOn.join(', ')
                  : 'nothing (root node)'}
              </span>
            </div>
            <div className="node-detail-row">
              <span>Status</span>
              <code>{nodeStatus[selected.id] ?? 'pending'}</code>
            </div>
          </>
        ) : (
          <span className="muted">Click a node to inspect its dependencies and status.</span>
        )}
      </div>
    </div>
  );
}
