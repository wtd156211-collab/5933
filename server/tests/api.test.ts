import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createStore } from '../src/store';

const app = createApp(createStore());

describe('workflow API', () => {
  it('lists workflows', async () => {
    const res = await request(app).get('/api/workflows');
    expect(res.status).toBe(200);
    expect(res.body.map((w: { id: string }) => w.id)).toContain('order-pipeline');
  });

  it('returns graph with edges for a valid workflow', async () => {
    const res = await request(app).get('/api/workflows/order-pipeline/graph');
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.edges).toContainEqual({ from: 'fetch-order', to: 'validate' });
  });

  it('returns validation errors for cyclic workflow', async () => {
    const res = await request(app).get('/api/workflows/cyclic-workflow/graph');
    expect(res.status).toBe(200);
    expect(res.body.errors[0].kind).toBe('cycle');
  });

  it('returns validation errors for missing dependency', async () => {
    const res = await request(app).get('/api/workflows/broken-workflow/graph');
    expect(res.body.errors[0].kind).toBe('missing-dependency');
  });

  it('blocks execution of invalid workflows with 422', async () => {
    const res = await request(app).post('/api/workflows/cyclic-workflow/executions');
    expect(res.status).toBe(422);
    const res2 = await request(app).post('/api/workflows/broken-workflow/executions');
    expect(res2.status).toBe(422);
  });

  it('starts a valid workflow asynchronously and exposes the record', async () => {
    const res = await request(app)
      .post('/api/workflows/order-pipeline/executions')
      .send({ failNodes: ['charge'] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('running');

    // poll until the execution reaches a terminal state
    let detail;
    for (let i = 0; i < 50; i++) {
      detail = await request(app).get(`/api/executions/${res.body.id}`);
      expect(detail.status).toBe(200);
      if (detail.body.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(detail!.body.status).toBe('failed');
    expect(detail!.body.events.length).toBeGreaterThan(0);

    const list = await request(app).get('/api/workflows/order-pipeline/executions');
    expect(list.body.map((e: { id: string }) => e.id)).toContain(res.body.id);
  });

  it('serves seeded historical executions', async () => {
    const res = await request(app).get('/api/executions/exec-failed-1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    const legacy = await request(app).get('/api/executions/exec-legacy-1');
    expect(legacy.status).toBe(200);
  });

  it('returns 404 for unknown resources', async () => {
    expect((await request(app).get('/api/workflows/nope/graph')).status).toBe(404);
    expect((await request(app).get('/api/executions/nope')).status).toBe(404);
  });
});
