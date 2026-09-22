import express, { type Express } from 'express';
import cors from 'cors';
import { buildGraph } from '../../shared/workflow';
import type { ExecutionSummary } from '../../shared/types';
import { startWorkflow, WorkflowValidationError } from './engine';
import type { Store } from './store';

export function createApp(store: Store): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/workflows', (_req, res) => {
    res.json([...store.workflows.values()].map((w) => ({ id: w.id, name: w.name })));
  });

  app.get('/api/workflows/:id/graph', (req, res) => {
    const def = store.workflows.get(req.params.id);
    if (!def) return res.status(404).json({ error: 'workflow not found' });
    res.json(buildGraph(def));
  });

  app.get('/api/workflows/:id/executions', (req, res) => {
    const def = store.workflows.get(req.params.id);
    if (!def) return res.status(404).json({ error: 'workflow not found' });
    const list: ExecutionSummary[] = [...store.executions.values()]
      .filter((e) => e.workflowId === def.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(({ id, workflowId, status, startedAt, finishedAt }) => ({
        id,
        workflowId,
        status,
        startedAt,
        finishedAt,
      }));
    res.json(list);
  });

  app.get('/api/executions/:id', (req, res) => {
    const record = store.executions.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'execution not found' });
    res.json(record);
  });

  app.post('/api/workflows/:id/executions', (req, res) => {
    const def = store.workflows.get(req.params.id);
    if (!def) return res.status(404).json({ error: 'workflow not found' });
    const failNodes: string[] = Array.isArray(req.body?.failNodes)
      ? req.body.failNodes
      : [];
    try {
      const { record } = startWorkflow(store, def, { failNodes });
      res.status(201).json(record);
    } catch (err) {
      if (err instanceof WorkflowValidationError) {
        res.status(422).json({ error: err.message, details: err.messages });
      } else {
        res.status(500).json({ error: String(err) });
      }
    }
  });

  return app;
}
