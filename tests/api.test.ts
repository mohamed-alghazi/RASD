import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app';
import { domainPlan } from '../server/catalog';
import { Store } from '../server/store';
import type { ChatState } from '../server/ai';
let app: Awaited<ReturnType<typeof createApp>>, dir: string, cookie: string;
const ai = async (state: ChatState, message: string) => {
  const count = Number(message.match(/\d+/)?.[0] ?? 100);
  const plan = domainPlan(state.domain, count);
  return {
    result: {
      reply: 'خطة جاهزة للمراجعة',
      requirements: state.requirements + ' ' + message,
      ready: true,
      count,
      planJson: JSON.stringify(plan),
    },
    plan,
  };
};
async function req(method: string, url: string, payload?: any, owner = cookie) {
  return app.inject({
    method: method as any,
    url,
    headers: owner ? { cookie: owner } : {},
    ...(payload === undefined ? {} : { payload }),
  });
}
async function complete(id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await req('GET', '/api/jobs/' + id);
    const j = r.json();
    if (['complete', 'failed', 'cancelled'].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('job timeout');
}
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'rasd-test-'));
  app = await createApp({ dir, logger: false, ai });
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  cookie = response.cookies[0].name + '=' + response.cookies[0].value;
});
afterAll(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});
describe('D sessions and real API-to-export flow (provider boundary injected)', () => {
  it('short Arabic replies remain isolated across all three domains', async () => {
    const sessions = [];
    for (const domain of ['employees', 'commerce', 'university']) {
      const s = (await req('POST', '/api/sessions', { domain })).json();
      sessions.push(s);
      const turn = await req('POST', `/api/sessions/${s.id}/messages`, { message: '100' });
      expect(turn.statusCode).toBe(200);
      expect(turn.json().domain).toBe(domain);
      expect(turn.json().messages).toHaveLength(3);
      expect(turn.json().requirements).toContain('100');
    }
    expect(new Set(sessions.map((s) => s.id)).size).toBe(3);
    for (const s of sessions) {
      const r = await req('GET', '/api/sessions/' + s.id);
      expect(r.json().domain).toBe(s.domain);
    }
  });
  it('approval required, stale approval blocked, actual JSON/CSV/SQL/XLSX download', async () => {
    const s = (await req('POST', '/api/sessions', { domain: 'university' })).json();
    const turn = (
      await req('POST', `/api/sessions/${s.id}/messages`, { message: 'جامعة الإمام 100' })
    ).json();
    expect((await req('POST', `/api/sessions/${s.id}/generate`)).statusCode).toBe(409);
    expect((await req('POST', `/api/sessions/${s.id}/approve`, { revision: 0 })).statusCode).toBe(
      409,
    );
    expect(
      (await req('POST', `/api/sessions/${s.id}/approve`, { revision: turn.revision })).statusCode,
    ).toBe(200);
    const start = await req('POST', `/api/sessions/${s.id}/generate`);
    expect(start.statusCode).toBe(200);
    const id = start.json().id;
    expect((await complete(id)).status).toBe('complete');
    const preview = (await req('GET', `/api/jobs/${id}/preview`)).json();
    expect(preview.tables.find((t: any) => t.name === 'students').count).toBe(100);
    const json = await req('GET', `/api/jobs/${id}/download?format=json`);
    expect(json.json().students).toHaveLength(100);
    expect(new Set(json.json().students.map((s: any) => s.university_id)).size).toBe(1);
    for (const format of ['csv', 'sql', 'xlsx']) {
      const out = await req('GET', `/api/jobs/${id}/download?format=${format}`);
      expect(out.statusCode).toBe(200);
      expect(out.rawPayload.length).toBeGreaterThan(100);
    }
    expect((await req('GET', `/api/jobs/${id}/validation`)).json().valid).toBe(true);
  });
  it('job/session ownership and cross-origin mutation protections', async () => {
    const s = (await req('POST', '/api/sessions', { domain: 'employees' })).json();
    const other = 'rasd_owner=' + 'a'.repeat(64);
    expect((await req('GET', '/api/sessions/' + s.id, undefined, other)).statusCode).toBe(404);
    const j = (await req('POST', '/api/jobs/generate', domainPlan('employees', 10))).json();
    expect((await req('GET', '/api/jobs/' + j.id, undefined, other)).statusCode).toBe(404);
    expect((await req('GET', '/api/jobs')).json().some((job: any) => job.id === j.id)).toBe(true);
    expect(
      (await req('GET', '/api/jobs', undefined, other)).json().some((job: any) => job.id === j.id),
    ).toBe(false);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: { origin: 'https://evil.example' },
          payload: { domain: 'employees' },
        })
      ).statusCode,
    ).toBe(403);
    await complete(j.id);
  });
  it('persistent metadata survives restart', async () => {
    const s = (await req('POST', '/api/sessions', { domain: 'commerce' })).json();
    const store = new Store(dir);
    await store.init();
    expect(store.chat(s.id, cookie.split('=')[1]).domain).toBe('commerce');
  });
});
describe('API upload, failure, limits and temporary jobs', () => {
  it('two heavy jobs are allowed and the third is rejected until capacity frees', async () => {
    const oldKey = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = 'test-only';
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    vi.stubGlobal('fetch', async () => {
      await gate;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const a = await createApp({ dir: path.join(dir, 'concurrency'), logger: false });
    try {
      const one = await a.inject({
        method: 'POST',
        url: '/api/jobs/generate',
        payload: domainPlan('employees', 2),
      });
      const two = await a.inject({
        method: 'POST',
        url: '/api/jobs/generate',
        payload: domainPlan('employees', 2),
      });
      expect(one.statusCode).toBe(200);
      expect(two.statusCode).toBe(200);
      const three = await a.inject({
        method: 'POST',
        url: '/api/jobs/generate',
        payload: domainPlan('employees', 2),
      });
      expect(three.statusCode).toBe(429);
      expect(three.json().error.code).toBe('BUSY');
    } finally {
      release();
      await new Promise((r) => setTimeout(r, 80));
      await a.close();
      vi.unstubAllGlobals();
      if (oldKey) process.env.TAVILY_API_KEY = oldKey;
      else delete process.env.TAVILY_API_KEY;
    }
  });
  it('actual multipart SQL upload inspects and generates', async () => {
    const boundary = 'rasd-boundary';
    const source = 'CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL);';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="schema.sql"\r\nContent-Type: text/plain\r\n\r\n${source}\r\n--${boundary}--\r\n`;
    const r = await app.inject({
      method: 'POST',
      url: '/api/schema/inspect',
      headers: { cookie, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: body,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().tables[0].name).toBe('companies');
    const j = (await req('POST', '/api/jobs/generate', r.json())).json();
    expect((await complete(j.id)).status).toBe('complete');
  });
  it('localization job checks source data, preserves original keys and downloads', async () => {
    const data = { employees: [{ id: 1, name: 'John', city: 'Boston', salary: 8000.5 }] };
    const { inferPlan } = await import('../server/files');
    const r = await req('POST', '/api/jobs/localize', { data, plan: inferPlan(data) });
    expect(r.statusCode).toBe(200);
    const j = await complete(r.json().id);
    expect(j.status).toBe('complete');
    const d = (await req('GET', `/api/jobs/${j.id}/download`)).json();
    expect(d.employees[0].id).toBe(1);
    expect(d.employees[0].city).toBe('الرياض');
    const preview = (await req('GET', `/api/jobs/${j.id}/preview`)).json();
    expect(preview.tables[0].before[0].name).toBe('John');
    expect((await req('DELETE', '/api/jobs/' + j.id)).json()).toEqual({ deleted: true });
    expect((await req('GET', '/api/jobs/' + j.id)).statusCode).toBe(404);
  });
  it('actual invalid data fails job and cannot be downloaded', async () => {
    const p = domainPlan('employees', 10);
    p.tables.find((t) => t.name === 'employees')!.unique.push(['company_id']);
    const r = await req('POST', '/api/jobs/generate', p);
    const j = await complete(r.json().id);
    expect(j.status).toBe('failed');
    expect((await req('GET', `/api/jobs/${j.id}/download`)).statusCode).toBe(409);
  });
  it('missing live AI credentials gives honest retryable error', async () => {
    const old = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const real = await createApp({ dir: path.join(dir, 'real'), logger: false });
    const s = await real.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { domain: 'employees' },
    });
    const c = s.cookies[0].name + '=' + s.cookies[0].value;
    const r = await real.inject({
      method: 'POST',
      url: `/api/sessions/${s.json().id}/messages`,
      headers: { cookie: c },
      payload: { message: '100' },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json().error.code).toBe('AI_UNCONFIGURED');
    await real.close();
    if (old) process.env.OPENAI_API_KEY = old;
  });
  it('strict payload bounds, unsupported domain and invalid identifiers', async () => {
    expect((await req('POST', '/api/sessions', { domain: 'medical' })).statusCode).toBe(400);
    const p = domainPlan('university');
    p.tables[0].name = 'x; DROP TABLE';
    expect((await req('POST', '/api/jobs/generate', p)).statusCode).toBe(400);
    expect((await req('GET', '/api/jobs/not-uuid')).statusCode).toBe(400);
  });
});
