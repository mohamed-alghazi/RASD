import { afterEach, describe, expect, it, vi } from 'vitest';
import { relevant, type Evidence, type ResearchTarget } from '../server/research';
import {
  extractBenchmark,
  applyBenchmarks,
  researchBenchmarks,
  benchmarkTargets,
  validateBenchmarkApplications,
  type BenchmarkResearch,
} from '../server/benchmarks';
import { domainPlan } from '../server/catalog';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
import { localize } from '../server/localization';
import { inferPlan } from '../server/files';
import { exportData } from '../server/exports';
const target: ResearchTarget = {
  topic: 'salary',
  domain: 'employees',
  table: 'employees',
  field: 'salary',
  subject: 'software engineer',
  unit: 'month',
};
const salarySource: Evidence = {
  id: 'salary',
  title: 'Software Engineer salary in Saudi Arabia',
  url: 'https://www.gulftalent.com/saudi-arabia/salaries/software-engineer',
  finding:
    'Software engineer salary in Saudi Arabia per month. Highest salary is SAR 14,000 and lowest salary is SAR 1,500.',
  field: 'employees.salary',
  applied: false,
  classification: 'source',
  retrievedAt: new Date().toISOString(),
  target,
};
const priceSource: Evidence = {
  id: 'price',
  title: 'IKEA LACK white side table 55x55 cm Saudi Arabia',
  url: 'https://www.ikea.com/sa/en/p/lack-side-table-white-30449908/',
  finding: 'IKEA LACK white side table 55x55 cm Saudi Arabia. Price SAR 49.',
  field: 'products.price',
  applied: false,
  classification: 'source',
  retrievedAt: new Date().toISOString(),
  target: {
    topic: 'price',
    domain: 'products',
    table: 'products',
    field: 'price',
    subject: 'IKEA LACK white side table 55x55 cm',
    unit: 'item',
  },
};
function approved(evidence: Evidence[]): BenchmarkResearch {
  return {
    status: 'available',
    evidence: structuredClone(evidence),
    rules: evidence.map(extractBenchmark).filter((r): r is NonNullable<typeof r> => !!r),
    applications: [],
    limitations: [],
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('target relevance and conservative structured extraction', () => {
  it('rejects the previously retained remote job listing, social anecdotes and railway/payment mismatch', () => {
    expect(
      relevant(
        {
          title: 'Software engineer Saudi Arabia jobs',
          content: 'Salary Search: San Francisco Remote - Remote jobs',
          url: 'https://www.indeed.com/q-software-engineer-in-saudi-arabia-jobs.html',
        },
        'salary',
        target,
      ),
    ).toBe(false);
    expect(
      relevant(
        {
          title: 'Software engineer Saudi salary',
          content: 'Saudi salary SAR 20000',
          url: 'https://facebook.com/groups/example',
        },
        'salary',
        target,
      ),
    ).toBe(false);
    expect(
      relevant(
        {
          title: 'Saudi railway stations VAT',
          content: 'Saudi railway tickets VAT 15% payments',
          url: 'https://zatca.gov.sa/railway',
        },
        'tax',
        {
          ...target,
          topic: 'tax',
          domain: 'regulatory',
          subject: 'credit card payment settlement',
        },
      ),
    ).toBe(false);
  });
  it('requires matching occupation/identity, trusted publisher, unit and freshness', () => {
    expect(extractBenchmark(salarySource)).toMatchObject({
      min: 1500,
      max: 14000,
      mode: 'source-bounded-estimate',
    });
    for (const change of [
      { url: 'https://example.com/salary' },
      { finding: 'Software engineer yearly compensation SAR 200000' },
      { target: { ...target, subject: 'accountant' } },
      { retrievedAt: '2020-01-01T00:00:00.000Z' },
    ])
      expect(extractBenchmark({ ...salarySource, ...change })).toBeUndefined();
  });
  it('never uses annual total compensation as monthly salary or multiple ambiguous price offers', () => {
    expect(
      extractBenchmark({
        ...salarySource,
        finding: 'Software engineer total compensation yearly SAR 200000',
      }),
    ).toBeUndefined();
    expect(
      extractBenchmark({ ...priceSource, finding: priceSource.finding + ' Delivery fee SAR 25' }),
    ).toBeUndefined();
    expect(
      extractBenchmark({
        ...priceSource,
        target: { ...priceSource.target!, subject: 'IKEA LACK black side table 90x55 cm' },
      }),
    ).toBeUndefined();
  });
  it('does not execute source instructions or accept a tampered numeric rule', () => {
    const p = domainPlan('employees');
    p.tables
      .find((t) => t.name === 'employees')!
      .fields.find((f) => f.name === 'job_title')!.values = ['software engineer'];
    const data = generate(p),
      context = structuredClone(data),
      r = approved([salarySource]);
    r.rules[0].max = 999999;
    expect(() => applyBenchmarks(p, data, context, r)).toThrow();
  });
});
describe('actual source-bound data and exports', () => {
  it('research changes actual generated salaries, preserves 30% experience and rechecks exportable records', async () => {
    const p = domainPlan('employees');
    p.tables
      .find((t) => t.name === 'employees')!
      .fields.find((f) => f.name === 'job_title')!.values = ['software engineer'];
    const data = generate(p),
      before = structuredClone(data),
      r = approved([salarySource]);
    const applications = applyBenchmarks(p, data, before, r);
    expect(applications[0].changedRows).toBeGreaterThan(0);
    expect(data.employees.filter((x) => Number(x.experience) > 5)).toHaveLength(30);
    expect(data.employees.some((x, i) => x.salary !== before.employees[i].salary)).toBe(true);
    expect(Math.max(...data.employees.map((x) => Number(x.salary)))).toBe(14000);
    expect(validate(p, data).issues).toEqual([]);
    expect(r.evidence[0].applied).toBe(true);
    expect(JSON.parse((await exportData(p, data, 'json')).bytes.toString()).employees).toHaveLength(
      100,
    );
    data.employees[0].salary = 15000;
    expect(() => validateBenchmarkApplications(data, r)).toThrow();
  });
  it('localizes related employee/product/service rows with provenance and exact totals', async () => {
    const source = {
      employees: [
        {
          id: 1,
          name: 'John',
          job_title: 'software engineer',
          salary: 50000,
          experience: 12,
          salary_period: 'month',
          currency: 'USD',
        },
      ],
      products: [
        { id: 1, name: 'IKEA LACK white side table 55x55 cm', price: 20, currency: 'USD' },
      ],
      customers: [{ id: 1, name: 'Jane' }],
      orders: [{ id: 1, customer_id: 1, total: 36 }],
      order_items: [
        {
          id: 1,
          order_id: 1,
          product_id: 1,
          quantity: 2,
          unit_price: 20,
          discount: 0.1,
          total: 36,
        },
      ],
    };
    const p = inferPlan(source),
      r = approved([salarySource, priceSource]);
    const result = localize(p, source, {}, r);
    expect(result.data.employees[0].salary).toBe(14000);
    expect(result.data.products[0].price).toBe(49);
    expect(Number(result.data.orders[0].total)).toBe(88.2);
    expect(result.data.products[0].name).toBe(source.products[0].name);
    expect(result.data.employees[0].salary_period).toBe('month');
    expect(result.validation.valid).toBe(true);
    expect(r.applications).toHaveLength(2);
    for (const t of p.tables)
      expect(result.data[t.name].map((x) => x.id)).toEqual(
        (source as any)[t.name].map((x: any) => x.id),
      );
    const exported = JSON.parse((await exportData(p, result.data, 'json')).bytes.toString());
    expect(exported.products[0].price).toBe(49);
    expect(result.transforms.some((t) => t.classification === 'observed-price')).toBe(true);
  });
  it('preserve and explicit conversion bypass evidence and never relabel conversion as market research', () => {
    const source = {
      products: [
        { id: 1, name: 'IKEA LACK white side table 55x55 cm', price: 20, currency: 'USD' },
      ],
    };
    const p = inferPlan(source),
      r = approved([priceSource]);
    expect(localize(p, source, { economic: 'preserve' }, r).data.products[0].price).toBe(20);
    expect(localize(p, source, { currencyRate: 3.75 }, r).data.products[0].price).toBe(75);
    expect(r.evidence[0].applied).toBe(false);
  });
  it('honors keys, explicit values, annual pay and tax ambiguity', () => {
    const p = domainPlan('employees');
    p.tables.find((t) => t.name === 'employees')!.fields.find((f) => f.name === 'salary')!.values =
      [20000];
    expect(benchmarkTargets(p, generate(p)).some((t) => t.field === 'salary')).toBe(false);
    const data = {
      employees: [{ id: 1, job_title: 'software engineer', salary: 100000, salary_period: 'year' }],
    };
    expect(benchmarkTargets(inferPlan(data), data)).toEqual([]);
  });
  it('caps calls, caches research and keeps cached applied flags isolated', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-only');
    const source = {
      employees: [{ id: 1, job_title: 'software engineer', salary: 20000, salary_period: 'month' }],
    };
    const p = inferPlan(source);
    const fetch = vi.fn(async () =>
      Response.json({
        results: [
          { title: salarySource.title, url: salarySource.url, content: salarySource.finding },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const first = await researchBenchmarks(p, source);
    first.evidence[0].applied = true;
    const second = await researchBenchmarks(p, source);
    expect(fetch).toHaveBeenCalledOnce();
    expect(second.evidence[0].applied).toBe(false);
  });
});

describe('service units, unsupported variants and financial ambiguity', () => {
  const service: Evidence = {
    ...priceSource,
    id: 'service',
    title: 'Buy Microsoft 365 Personal – Subscription Price | Microsoft Store',
    url: 'https://www.microsoft.com/en-sa/microsoft-365/p/microsoft-365-personal/cfq7ttc0k5bf',
    finding: 'Microsoft 365 Personal. 429.99 SAR/year. English (Saudi Arabia).',
    target: {
      topic: 'price',
      domain: 'services',
      table: 'services',
      field: 'price',
      subject: 'Microsoft 365 Personal',
      unit: 'year',
    },
  };
  it('uses a matching annual service quote without converting it to monthly or changing its identity', () => {
    const source = {
      services: [
        {
          id: 1,
          name: 'Microsoft 365 Personal',
          price: 99.99,
          billing_period: 'year',
          currency: 'USD',
        },
      ],
    };
    const r = approved([service]);
    const result = localize(inferPlan(source), source, {}, r);
    expect(result.data.services[0]).toMatchObject({
      id: 1,
      name: 'Microsoft 365 Personal',
      price: 429.99,
      billing_period: 'year',
      currency: 'SAR',
    });
    expect(r.applications[0]).toMatchObject({ changedRows: 1, classification: 'observed-price' });
    expect(
      extractBenchmark({ ...service, target: { ...service.target!, unit: 'month' } }),
    ).toBeUndefined();
  });
  it('rejects foreign storefronts and a different finish rather than accepting partial name matches', () => {
    expect(
      extractBenchmark({ ...priceSource, url: 'https://www.ikea.com/us/en/p/lack/' }),
    ).toBeUndefined();
    expect(
      relevant(
        {
          title: 'LACK side table white stained oak effect 55x55 cm IKEA',
          url: priceSource.url,
          content: priceSource.finding,
        },
        'price',
        priceSource.target,
      ),
    ).toBe(false);
  });
  it('preserves explicit tax treatment and refuses an unqualified retail quote when nonzero tax applies', () => {
    const source = {
      products: [{ id: 1, name: priceSource.target!.subject, price: 20 }],
      lines: [{ id: 1, product_id: 1, quantity: 2, unit_price: 20, total: 46, tax_rate: 0.15 }],
    };
    const p = inferPlan(source);
    const data = structuredClone(source),
      r = approved([priceSource]);
    expect(applyBenchmarks(p, data, source, r)).toEqual([]);
    expect(data.products[0].price).toBe(20);
  });
  it('does not change the meaning of an annual salary period when only an estimate is available', () => {
    const source = {
      employees: [
        {
          id: 1,
          job_title: 'software engineer',
          experience: 5,
          salary: 100000,
          salary_period: 'year',
        },
      ],
    };
    const result = localize(inferPlan(source), source);
    expect(result.data.employees[0].salary).toBe(132000);
    expect(result.data.employees[0].salary_period).toBe('year');
  });
  it('conflicting independent quotes are retained for review, never selected opportunistically', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'test-only');
    const source = {
      products: [{ id: 1, name: 'IKEA LACK white side table 55x55 cm', price: 20.01 }],
    };
    const fetch = vi.fn(async () =>
      Response.json({
        results: [
          { title: priceSource.title, url: priceSource.url, content: 'Saudi Arabia price SAR 49' },
          {
            title: priceSource.title,
            url: priceSource.url + '?offer=2',
            content: 'Saudi Arabia price SAR 59',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await researchBenchmarks(inferPlan(source), source);
    expect(result.evidence).toHaveLength(2);
    expect(result.rules).toHaveLength(0);
    expect(result.limitations.join(' ')).toContain('Conflicting');
  });
});

describe('source-backed experience applicability', () => {
  it('applies an explicit experience band only to the matching cohort', () => {
    const source: Evidence = {
      ...salarySource,
      finding: 'Software engineer salary Saudi Arabia. 0-2 years: SAR 4,000-6,000 per month.',
    };
    const rule = extractBenchmark(source);
    expect(rule).toMatchObject({ experienceMin: 0, experienceMax: 2, min: 4000, max: 6000 });
    const data = {
      employees: [
        {
          id: 1,
          job_title: 'software engineer',
          salary: 9000,
          experience: 2,
          salary_period: 'month',
        },
        {
          id: 2,
          job_title: 'software engineer',
          salary: 12000,
          experience: 8,
          salary_period: 'month',
        },
      ],
    };
    const plan = inferPlan(data),
      context = structuredClone(data),
      r = approved([source]);
    applyBenchmarks(plan, data, context, r);
    expect(data.employees.map((r) => r.salary)).toEqual([6000, 12000]);
    expect(r.applications[0].matchedRows).toBe(1);
  });
});

describe('real job and download pipeline — simulated Tavily boundary', () => {
  it('applies a benchmark in the job worker and blocks a tampered persisted export', async () => {
    const { createApp } = await import('../server/app');
    const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises');
    const dir = await mkdtemp('/tmp/rasd-benchmark-api-');
    vi.stubEnv('TAVILY_API_KEY', 'test-only');
    vi.stubGlobal('fetch', async () =>
      Response.json({
        results: [
          { title: salarySource.title, url: salarySource.url, content: salarySource.finding },
        ],
      }),
    );
    let app = await createApp({ dir, logger: false });
    try {
      const health = await app.inject({ method: 'GET', url: '/api/health' });
      const cookie = health.cookies[0].name + '=' + health.cookies[0].value;
      const plan = domainPlan('employees');
      plan.tables
        .find((t) => t.name === 'employees')!
        .fields.find((f) => f.name === 'job_title')!.values = ['Software engineer'];
      const start = await app.inject({
        method: 'POST',
        url: '/api/jobs/generate',
        headers: { cookie },
        payload: plan,
      });
      expect(start.statusCode).toBe(200);
      const id = start.json().id;
      let job: any;
      for (let i = 0; i < 100; i++) {
        job = (
          await app.inject({ method: 'GET', url: '/api/jobs/' + id, headers: { cookie } })
        ).json();
        if (['complete', 'failed'].includes(job.status)) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(job.status).toBe('complete');
      const research = (
        await app.inject({ method: 'GET', url: `/api/jobs/${id}/research`, headers: { cookie } })
      ).json();
      expect(research.applications[0].changedRows).toBeGreaterThan(0);
      const download = await app.inject({
        method: 'GET',
        url: `/api/jobs/${id}/download`,
        headers: { cookie },
      });
      expect(download.statusCode).toBe(200);
      expect(Math.max(...download.json().employees.map((r: any) => Number(r.salary)))).toBe(14000);
      await app.close();
      const file = dir + `/job-${id}.json`;
      const stored = JSON.parse(await readFile(file, 'utf8'));
      stored.data.employees[0].salary = '15000.00';
      await writeFile(file, JSON.stringify(stored));
      app = await createApp({ dir, logger: false });
      const blocked = await app.inject({
        method: 'GET',
        url: `/api/jobs/${id}/download`,
        headers: { cookie },
      });
      expect(blocked.statusCode).toBe(400);
      expect(blocked.json().error.code).toBe('BENCHMARK_INVALID');
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it('requires a service amount and its billing period to be adjacent, not somewhere else in the page', () => {
  const e: Evidence = {
    ...priceSource,
    id: 'unit-test',
    title: 'Microsoft 365 Personal',
    url: 'https://www.microsoft.com/en-sa/microsoft-365/p/microsoft-365-personal/cfq7ttc0k5bf',
    finding: 'Microsoft 365 Personal Saudi Arabia. 429.99 SAR/year. Monthly benefits included.',
    target: {
      topic: 'price',
      domain: 'services',
      table: 'services',
      field: 'price',
      subject: 'Microsoft 365 Personal',
      unit: 'month',
    },
  };
  expect(extractBenchmark(e)).toBeUndefined();
  expect(extractBenchmark({ ...e, target: { ...e.target!, unit: 'year' } })).toMatchObject({
    min: 429.99,
    max: 429.99,
  });
});

it('preserves imported service identities and generates service names rather than people or physical products', () => {
  const source = {
    services: [{ id: 1, name: 'Microsoft 365 Personal', price: 99.99, billing_period: 'year' }],
  };
  const plan = inferPlan(source);
  plan.tables[0].fields.find((f) => f.name === 'billing_period')!.values = ['year'];
  const generated = generate(plan);
  expect(String(generated.services[0].name)).toContain('استضافة');
  expect(localize(plan, source).data.services[0].name).toBe('Microsoft 365 Personal');
});
