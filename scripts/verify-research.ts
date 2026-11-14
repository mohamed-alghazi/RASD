import { loadEnvironment } from '../server/config';
import { createApp } from '../server/app';
import { domainPlan } from '../server/catalog';
import { inferPlan } from '../server/files';
import { validate } from '../server/validation';
import { generate } from '../server/generator';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
loadEnvironment();
await mkdir('.data/research-acceptance', { recursive: true });
const calls: any[] = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input: any, opts?: any) => {
  const res = await nativeFetch(input, opts);
  if (String(input) === 'https://api.tavily.com/search') {
    const payload = JSON.parse(opts.body);
    const body = await res.clone().json();
    calls.push({ query: payload.query, status: res.status, results: body.results });
  }
  return res;
};
const app = await createApp({ logger: false, dir: '.data/research-live-jobs' });
await app.listen({ host: '127.0.0.1', port: 0 });
const base = `http://127.0.0.1:${(app.server.address() as any).port}`;
const cookie = (await nativeFetch(base + '/api/health')).headers.get('set-cookie')!.split(';')[0];
async function api(url: string, body?: any) {
  const r = await nativeFetch(base + '/api' + url, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert(r.ok, JSON.stringify(data));
  return data as any;
}
async function finish(id: string, label: string) {
  let job;
  for (let i = 0; i < 100; i++) {
    job = await api('/jobs/' + id);
    if (job.status === 'complete') break;
    if (job.status === 'failed') throw Error(job.error);
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(job.status, 'complete');
  const data = await api(`/jobs/${id}/download`);
  const evidence = await api(`/jobs/${id}/research`);
  const preview = await api(`/jobs/${id}/preview`);
  const validation = await api(`/jobs/${id}/validation`);
  assert(validation.valid);
  await writeFile(`.data/research-acceptance/${label}.json`, JSON.stringify(data, null, 2));
  await writeFile(
    `.data/research-acceptance/${label}-audit.json`,
    JSON.stringify(
      { evidence, transforms: preview.transforms, warnings: preview.warnings, validation },
      null,
      2,
    ),
  );
  for (const format of ['csv', 'sql', 'xlsx']) {
    const r = await nativeFetch(base + `/api/jobs/${id}/download?format=${format}`, {
      headers: { cookie },
    });
    assert(r.ok);
    await writeFile(
      `.data/research-acceptance/${label}.${format === 'csv' ? 'zip' : format}`,
      Buffer.from(await r.arrayBuffer()),
    );
  }
  return { data, evidence, validation };
}
const source = {
  employees: [
    {
      id: 1,
      name: 'John Smith',
      job_title: 'software engineer',
      salary: 8000,
      experience: 2,
      salary_period: 'month',
      currency: 'USD',
    },
    {
      id: 2,
      name: 'Jane Doe',
      job_title: 'software engineer',
      salary: 18000,
      experience: 12,
      salary_period: 'month',
      currency: 'USD',
    },
  ],
  products: [{ id: 1, name: 'IKEA LACK side table white 55x55 cm', price: 20, currency: 'USD' }],
  services: [
    {
      id: 1,
      name: 'Microsoft 365 Personal',
      price: 99.99,
      billing_period: 'year',
      currency: 'USD',
    },
  ],
  customers: [{ id: 1, name: 'James Brown' }],
  orders: [{ id: 1, customer_id: 1, total: 36, currency: 'USD' }],
  order_items: [
    { id: 1, order_id: 1, product_id: 1, quantity: 2, unit_price: 20, discount: 0.1, total: 36 },
  ],
  payments: [{ id: 1, order_id: 1, amount: 36, currency: 'USD' }],
};
const report: any = {};
try {
  await writeFile(
    '.data/research-acceptance/american-source.json',
    JSON.stringify(source, null, 2),
  );
  const plan = inferPlan(source);
  const localized = await finish(
    (await api('/jobs/localize', { plan, data: source })).id,
    'localized',
  );
  for (const t of plan.tables) {
    assert.equal(localized.data[t.name].length, t.count);
    for (let i = 0; i < t.count; i++) {
      assert.deepEqual(
        Object.keys(localized.data[t.name][i]),
        Object.keys((source as any)[t.name][i]),
      );
      assert.equal(localized.data[t.name][i].id, (source as any)[t.name][i].id);
    }
  }
  assert.equal(localized.data.payments[0].amount, localized.data.orders[0].total);
  assert(
    localized.evidence.applications.some((a: any) => a.changedRows > 0),
    'No live benchmark influenced localization',
  );
  report.localization = {
    applications: localized.evidence.applications,
    limitations: localized.evidence.limitations,
    employees: localized.data.employees,
    products: localized.data.products,
    services: localized.data.services,
  };
  const p = domainPlan('employees');
  p.tables.find((t) => t.name === 'employees')!.fields.find((f) => f.name === 'job_title')!.values =
    ['software engineer'];
  const baseline = generate(p);
  const generated = await finish((await api('/jobs/generate', p)).id, 'generated');
  assert(validate(p, generated.data).valid);
  assert(
    generated.evidence.applications.some((a: any) => a.changedRows > 0),
    'No live benchmark influenced generated records',
  );
  assert.equal(generated.data.employees.filter((r: any) => Number(r.experience) > 5).length, 30);
  report.generation = {
    applications: generated.evidence.applications,
    changedSalaries: generated.data.employees.filter(
      (r: any, i: number) => r.salary !== baseline.employees[i].salary,
    ).length,
    rows: generated.data.employees.length,
  };
} catch (e: any) {
  report.failure = { name: e.name, message: e.message };
  process.exitCode = 1;
} finally {
  await app.close();
  await writeFile('.data/research-acceptance/live-searches.json', JSON.stringify(calls, null, 2));
  await writeFile(
    '.data/research-acceptance/summary.json',
    JSON.stringify({ ...report, searchCalls: calls.length }, null, 2),
  );
  console.log(JSON.stringify({ ...report, searchCalls: calls.length }, null, 2));
}
