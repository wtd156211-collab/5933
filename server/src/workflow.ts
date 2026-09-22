import type { ValidationIssue, ValidationResult, Workflow } from './types.js';

/**
 * Validate a workflow definition and compute its topological order.
 *
 * Detects duplicate node ids, references to missing dependencies and
 * dependency cycles (via Kahn's algorithm with the remaining-cycle nodes
 * reported explicitly).
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  if (workflow.nodes.length === 0) {
    issues.push({ code: 'EMPTY_WORKFLOW', message: 'Workflow has no nodes.' });
    return { valid: false, issues, order: [] };
  }

  for (const node of workflow.nodes) {
    if (ids.has(node.id)) {
      issues.push({
        code: 'DUPLICATE_NODE',
        message: `Duplicate node id: ${node.id}`,
        nodeIds: [node.id],
      });
    }
    ids.add(node.id);
  }

  for (const node of workflow.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) {
        issues.push({
          code: 'MISSING_DEPENDENCY',
          message: `Node "${node.id}" depends on missing node "${dep}".`,
          nodeIds: [node.id, dep],
        });
      }
    }
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of workflow.nodes) {
    indegree.set(node.id, 0);
    dependents.set(node.id, []);
  }
  for (const node of workflow.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      dependents.get(dep)!.push(node.id);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of dependents.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  if (order.length !== workflow.nodes.length) {
    const cyclic = workflow.nodes.map((n) => n.id).filter((id) => !order.includes(id));
    issues.push({
      code: 'CYCLE',
      message: `Cyclic dependency detected involving: ${cyclic.join(', ')}`,
      nodeIds: cyclic,
    });
  }

  return { valid: issues.length === 0, issues, order: issues.length === 0 ? order : [] };
}

export function findNode(workflow: Workflow, nodeId: string) {
  return workflow.nodes.find((n) => n.id === nodeId);
}
