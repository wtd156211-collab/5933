import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApiServer } from '../src/app.js';
import type { Server } from 'node:http';

let server: Server;
let base: string;

before(async () => {
  server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getJson(path: string) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: (await response.json()) as any };
}

describe('HTTP API', () => {
  it('lists workflows with validity flags', async () => {
    const { status, body } = await getJson('/api/workflows');
    assert.equal(status, 200);
    const byId = new Map<string, any>((body as any[]).map((w) => [w.id, w]));
    assert.equal(byId.get('etl-report').valid, true);
    assert.equal(byId.get('broken-cycle').valid, false);
    assert.ok(byId.get('broken-cycle').issues.some((i: any) => i.code === 'CYCLE'));
    assert.equal(byId.get('broken-missing-dep').valid, false);
  });

  it('returns a workflow detail with topological order', async () => {
    const { status, body } = await getJson('/api/workflows/etl-report');
    assert.equal(status, 200);
    assert.equal(body.workflow.id, 'etl-report');
    assert.ok(body.validation.order.includes('extract'));
    assert.ok(body.validation.valid);
  });

  it('returns 404 for unknown workflow', async () => {
    const { status } = await getJson('/api/workflows/nope');
    assert.equal(status, 404);
  });

  it('refuses to execute an invalid workflow', async () => {
    const response = await fetch(`${base}/api/workflows/broken-cycle/executions`, {
      method: 'POST',
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Workflow is invalid and cannot be executed');
  });

  it('starts a valid workflow execution and settles via polling', async () => {
    const response = await fetch(`${base}/api/workflows/etl-report/executions`, {
      method: 'POST',
    });
    assert.equal(response.status, 202);
    const created = await response.json();

    let execution = created;
    for (let i = 0; i < 50 && execution.status === 'running'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      execution = (await getJson(`/api/executions/${created.id}`)).body;
    }
    assert.equal(execution.status, 'success');
    assert.ok(execution.events.length >= 7);
  });

  it('serves a replay for historical executions including warnings', async () => {
    const legacy = await getJson('/api/executions/exec-etl-legacy/replay');
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.playable, true);
    assert.ok(
      legacy.body.warnings.some((w: any) => w.code === 'MISSING_NODE_RECORDS'),
      'legacy execution should warn about missing archive records',
    );
    assert.ok(legacy.body.frames.length > 1);

    const failed = await getJson('/api/executions/exec-deploy-0001/replay');
    assert.equal(failed.body.playable, true);
    const last = failed.body.frames.at(-1);
    assert.equal(last.nodeStatus.test, 'failed');
    assert.equal(last.nodeStatus.deploy, 'skipped');
  });

  it('returns 404 replay for unknown execution', async () => {
    const { status } = await getJson('/api/executions/nope/replay');
    assert.equal(status, 404);
  });
});
