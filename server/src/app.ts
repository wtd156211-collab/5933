import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWorkflow } from './engine.js';
import { buildReplay } from './replay.js';
import { executions, workflows } from './store.js';
import { validateWorkflow } from './workflow.js';
import type { Execution } from './types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WEB_DIST = resolve(__dirname, '../../../web/dist');

let seqCounter = 1000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function notFound(res: ServerResponse, message: string) {
  sendJson(res, 404, { error: message });
}

function workflowSummary(id: string, executionCount: number) {
  const workflow = workflows.find((w) => w.id === id);
  if (!workflow) return null;
  const validation = validateWorkflow(workflow);
  return {
    id: workflow.id,
    name: workflow.name,
    nodeCount: workflow.nodes.length,
    valid: validation.valid,
    issues: validation.issues,
    executionCount,
  };
}

export function createApiServer() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const { pathname } = url;

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/workflows') {
        sendJson(
          res,
          200,
          workflows.map((w) =>
            workflowSummary(w.id, executions.filter((e) => e.workflowId === w.id).length),
          ),
        );
        return;
      }

      const workflowMatch = pathname.match(/^\/api\/workflows\/([^/]+)$/);
      if (req.method === 'GET' && workflowMatch) {
        const workflow = workflows.find((w) => w.id === workflowMatch[1]);
        if (!workflow) return notFound(res, 'Workflow not found');
        sendJson(res, 200, { workflow, validation: validateWorkflow(workflow) });
        return;
      }

      const workflowExecMatch = pathname.match(
        /^\/api\/workflows\/([^/]+)\/executions$/,
      );
      if (workflowExecMatch) {
        const workflow = workflows.find((w) => w.id === workflowExecMatch[1]);
        if (!workflow) return notFound(res, 'Workflow not found');
        const list = executions.filter((e) => e.workflowId === workflow.id);
        if (req.method === 'GET') {
          sendJson(res, 200, list);
          return;
        }
        if (req.method === 'POST') {
          const validation = validateWorkflow(workflow);
          if (!validation.valid) {
            sendJson(res, 400, {
              error: 'Workflow is invalid and cannot be executed',
              validation,
            });
            return;
          }
          const execution: Execution = {
            id: `exec-${workflow.id}-${++seqCounter}`,
            workflowId: workflow.id,
            status: 'running',
            startedAt: new Date().toISOString(),
            nodeStatus: {},
            events: [],
          };
          executions.push(execution);
          void runWorkflow(workflow, execution.id, {
            onUpdate: (updated) => {
              const index = executions.findIndex((e) => e.id === updated.id);
              if (index >= 0) executions[index] = updated;
            },
          }).catch(() => {
            // status stays failed via events; polling surfaces it
          });
          sendJson(res, 202, executions.find((e) => e.id === execution.id)!);
          return;
        }
      }

      const allExecMatch = pathname === '/api/executions';
      if (req.method === 'GET' && allExecMatch) {
        sendJson(res, 200, executions);
        return;
      }

      const executionMatch = pathname.match(/^\/api\/executions\/([^/]+)$/);
      if (req.method === 'GET' && executionMatch) {
        const execution = executions.find((e) => e.id === executionMatch[1]);
        if (!execution) return notFound(res, 'Execution not found');
        sendJson(res, 200, execution);
        return;
      }

      const replayMatch = pathname.match(/^\/api\/executions\/([^/]+)\/replay$/);
      if (req.method === 'GET' && replayMatch) {
        const execution = executions.find((e) => e.id === replayMatch[1]);
        if (!execution) return notFound(res, 'Execution not found');
        const workflow = workflows.find((w) => w.id === execution.workflowId);
        if (!workflow) return notFound(res, 'Workflow not found');
        sendJson(res, 200, buildReplay(workflow, execution));
        return;
      }

      if (!pathname.startsWith('/api/')) {
        await serveStatic(pathname, res);
        return;
      }

      notFound(res, 'Unknown route');
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(pathname: string, res: ServerResponse) {
  const path = pathname === '/' ? '/index.html' : pathname;
  try {
    const file = await readFile(join(WEB_DIST, path));
    const headers: Record<string, string> = {
      'content-type': MIME[extname(path)] ?? 'application/octet-stream',
    };
    if (extname(path) === '.html') headers['cache-control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(file);
  } catch {
    try {
      const index = await readFile(join(WEB_DIST, 'index.html'));
      res.writeHead(200, {
        'content-type': MIME['.html'],
        'cache-control': 'no-store',
      });
      res.end(index);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found. Build the web app with: npm run build -w web');
    }
  }
}
