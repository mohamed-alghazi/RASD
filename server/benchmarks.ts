import { z } from 'zod';
import Decimal from 'decimal.js';
import { periodUnit } from '../shared/semantics.js';
import { createHash } from 'node:crypto';
import { fail, type Dataset, type Plan, type Row } from '../shared/schema.js';
import { semantic, reconcile } from './generator.js';
import {
  research,
  relevant,
  normalizeSubject,
  subjectMatches,
  type Evidence,
  type Research,
  type ResearchTarget,
} from './research.js';
const number = '[0-9][0-9,]*(?:\\.[0-9]{1,2})?';
const money = (s: string) => Number(s.replace(/,/g, ''));
export const benchmarkSchema = z
  .object({
    id: z.string(),
    evidenceId: z.string(),
    table: z.string(),
    field: z.string(),
    subject: z.string().min(2),
    kind: z.enum(['salary', 'price']),
    unit: z.enum(['month', 'year', 'item']),
    currency: z.literal('SAR'),
    min: z.number().finite().positive().max(1e7),
    max: z.number().finite().positive().max(1e7),
    experienceMin: z.number().int().min(0).max(50).optional(),
    experienceMax: z.number().int().min(0).max(50).optional(),
    mode: z.enum(['observed-price', 'source-bounded-estimate']),
    sourceUrl: z.url(),
    retrievedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (r) =>
      r.min <= r.max &&
      (r.mode !== 'observed-price' || r.min === r.max) &&
      ((r.experienceMin === undefined && r.experienceMax === undefined) ||
        (r.kind === 'salary' &&
          r.experienceMin !== undefined &&
          r.experienceMax !== undefined &&
          r.experienceMin <= r.experienceMax)),
  );
export type Benchmark = z.infer<typeof benchmarkSchema>;
export interface Application {
  ruleId: string;
  table: string;
  field: string;
  subject: string;
  classification: Benchmark['mode'];
  matchedRows: number;
  changedRows: number;
  minAfter: number;
  maxAfter: number;
  sourceUrl: string;
  rowIndexes: number[];
}
export interface BenchmarkResearch extends Research {
  rules: Benchmark[];
  applications: Application[];
  limitations: string[];
}
const hostIs = (url: string, hosts: string[]) => {
  try {
    const host = new URL(url).hostname;
    return hosts.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
};
export function extractBenchmark(e: Evidence): Benchmark | undefined {
  const t = e.target;
  if (
    !t ||
    !e.id ||
    !e.retrievedAt ||
    !relevant({ title: e.title, content: e.finding, url: e.url }, t.topic, t)
  )
    return;
  if (
    Date.now() - Date.parse(e.retrievedAt) > 3600000 ||
    Date.parse(e.retrievedAt) > Date.now() + 60000
  )
    return;
  if (!subjectMatches(e.title, t.subject)) return;
  const text = e.finding;
  let experienceMin: number | undefined, experienceMax: number | undefined;
  let min: number | undefined,
    max: number | undefined,
    mode: Benchmark['mode'] = 'source-bounded-estimate';
  if (t.topic === 'salary') {
    if (
      t.unit !== 'month' ||
      !hostIs(e.url, ['gulftalent.com', 'naukrigulf.com', 'hays.com', 'hays.ae'])
    )
      return;
    // A monthly salary range is a constraint, never an invented occupation/experience pay formula.
    const low = new RegExp(
      `(?:lowest|minimum)\\s+salary[^.\\n]{0,90}?SAR\\s*(${number})`,
      'i',
    ).exec(text);
    const high = new RegExp(
      `(?:highest|maximum)\\s+salary[^.\\n]{0,90}?SAR\\s*(${number})`,
      'i',
    ).exec(text);
    if (
      !/per month|monthly|\/month|شهري/i.test(text) ||
      /annually|annual salary|yearly|per year|total compensation/i.test(text)
    )
      return;
    const cohorts = [
      ...text.matchAll(
        new RegExp(
          `(\\d{1,2})\\s*[–—-]\\s*(\\d{1,2})\\s*years[^\\n]{0,40}?SAR\\s*(${number})\\s*[–—-]\\s*(?:SAR\\s*)?(${number})\\s*(?:per month|monthly|/month)`,
          'ig',
        ),
      ),
    ];
    if (cohorts.length > 1) return;
    if (cohorts.length === 1) {
      experienceMin = Number(cohorts[0][1]);
      experienceMax = Number(cohorts[0][2]);
      min = money(cohorts[0][3]);
      max = money(cohorts[0][4]);
    } else if (low && high) {
      min = money(low[1]);
      max = money(high[1]);
    } else {
      const range = new RegExp(
        `SAR\\s*(${number})\\s*[–—-]\\s*(?:SAR\\s*)?(${number})\\s*(?:per month|monthly|/month)`,
        'ig',
      );
      const matches = [...text.matchAll(range)];
      if (matches.length !== 1) return;
      min = money(matches[0][1]);
      max = money(matches[0][2]);
    }
  } else if (t.topic === 'price') {
    if (
      !hostIs(e.url, [
        'ikea.com',
        'jarir.com',
        'extra.com',
        'microsoft.com',
        'stc.com.sa',
        'mobily.com.sa',
      ])
    )
      return;
    if (hostIs(e.url, ['ikea.com']) && !new URL(e.url).pathname.startsWith('/sa/')) return;
    if (hostIs(e.url, ['microsoft.com']) && !new URL(e.url).pathname.startsWith('/en-sa/')) return;
    if (
      t.domain === 'services' &&
      !(
        t.unit === 'month'
          ? /per month|\/month|monthly|شهري/i
          : t.unit === 'year'
            ? /per year|\/year|yearly|annually|سنوي/i
            : /$a/
      ).test(text)
    )
      return;
    const currency = '(?:SAR|SR|ر\\.س)';
    const amountPattern =
      t.domain === 'services'
        ? new RegExp(
            `${currency}\\s*(${number})\\s*(?:/|per\\s+)${t.unit}\\b|(${number})\\s*${currency}\\s*(?:/|per\\s+)${t.unit}\\b`,
            'gi',
          )
        : new RegExp(`${currency}\\s*(${number})|(${number})\\s*${currency}\\b`, 'gi');
    const amounts = [...text.matchAll(amountPattern)].map((m) => money(m[1] ?? m[2]));
    const unique = [...new Set(amounts)];
    // Multiple offers, instalments, savings, delivery fees or ambiguous variants are review-only.
    if (
      unique.length !== 1 ||
      /instalment|installment|save\s|وفر|delivery fee|pack of|set of|bundle|per kg|\/kg/i.test(text)
    )
      return;
    min = max = unique[0];
    mode = 'observed-price';
  } else return; // Tax changes require an explicit legal applicability workflow, never a broad web snippet.
  const parsed = benchmarkSchema.safeParse({
    id: createHash('sha256')
      .update(e.id + '|' + min + '|' + max + '|' + experienceMin + '|' + experienceMax)
      .digest('hex')
      .slice(0, 24),
    evidenceId: e.id,
    table: t.table,
    field: t.field,
    subject: t.subject,
    kind: t.topic,
    unit: t.unit,
    currency: 'SAR',
    min,
    max,
    experienceMin,
    experienceMax,
    mode,
    sourceUrl: e.url,
    retrievedAt: e.retrievedAt,
  });
  return parsed.success ? parsed.data : undefined;
}
const roleAliases: Record<string, string> = {
  'مهندس برمجيات': 'software engineer',
  'مهندس مدني': 'civil engineer',
  محاسب: 'accountant',
  'مدير مشروع': 'project manager',
  'مهندس كهربائي': 'electrical engineer',
};
export function rowSubject(
  plan: Plan,
  data: Dataset,
  table: string,
  row: Row,
  kind: 'salary' | 'price',
): string {
  if (kind === 'price')
    return String(row.name ?? row.product_name ?? row.service_name ?? row.title ?? '');
  const t = plan.tables.find((t) => t.name === table)!;
  const job = t.foreignKeys
    .map((fk) =>
      data[fk.table]?.find((p) => fk.references.every((c, j) => p[c] === row[fk.columns[j]])),
    )
    .find((p) => p && (p.job_title || p.occupation));
  const role = String(row.job_title ?? row.occupation ?? job?.job_title ?? job?.occupation ?? '');
  return roleAliases[role] ?? role;
}
export function benchmarkTargets(plan: Plan, data: Dataset): ResearchTarget[] {
  const targets: ResearchTarget[] = [];
  for (const t of plan.tables)
    for (const f of t.fields) {
      const s = semantic(f, t.name);
      if (s !== 'salary' && s !== 'price') continue;
      // Key/unique values and derived money must never be rewritten by external research.
      if (
        [t.primaryKey, ...t.unique, ...t.foreignKeys.map((f) => f.columns)].some((k) =>
          k.includes(f.name),
        ) ||
        f.values ||
        f.default !== undefined ||
        plan.rules.some((r) => r.table === t.name && 'field' in r && r.field === f.name)
      )
        continue;
      for (const row of data[t.name] ?? []) {
        const subject = rowSubject(plan, data, t.name, row, s);
        if (subject.length < 3 || subject.length > 120) continue;
        const unit =
          s === 'salary'
            ? periodUnit(row.salary_period, plan.domain === 'employees' ? 'month' : 'unknown')
            : periodUnit(row.billing_period, 'item');
        if (!['month', 'year', 'item'].includes(unit)) continue;
        if (s === 'salary' && unit !== 'month') continue;
        const target: ResearchTarget = {
          topic: s === 'salary' ? 'salary' : 'price',
          domain: s === 'salary' ? 'employees' : /service/i.test(t.name) ? 'services' : 'products',
          table: t.name,
          field: f.name,
          subject,
          unit: unit as ResearchTarget['unit'],
        };
        if (!targets.some((x) => JSON.stringify(x) === JSON.stringify(target)))
          targets.push(target);
        if (targets.filter((x) => x.table === t.name && x.field === f.name).length >= 3) break;
      }
    }
  const first = targets.filter(
    (x, i) => targets.findIndex((y) => y.table === x.table && y.field === x.field) === i,
  );
  return [...first, ...targets.filter((x) => !first.includes(x))].slice(0, 3);
}
export async function researchBenchmarks(plan: Plan, data: Dataset): Promise<BenchmarkResearch> {
  const targets = benchmarkTargets(plan, data);
  const result: BenchmarkResearch = {
    status: targets.length ? 'unconfigured' : 'not-needed',
    evidence: [],
    rejected: [],
    rules: [],
    applications: [],
    limitations: [
      'ثلاثة أهداف بحث كحد أقصى لكل مهمة؛ الحقول الأخرى تبقى تقديرات أو محفوظة. لا تستنتج ضريبة أو أهلية قانونية تلقائياً.',
    ],
  };
  const statuses: string[] = [];
  for (const target of targets) {
    const context =
      target.subject +
      (target.topic === 'salary'
        ? ' monthly salary lowest highest SAR'
        : ` price SAR per ${target.unit}`);
    const found = await research(target.topic, `${target.table}.${target.field}`, context, target);
    statuses.push(found.status);
    result.evidence.push(...found.evidence);
    result.rejected!.push(...(found.rejected ?? []));
    const rules = found.evidence.map(extractBenchmark).filter((r): r is Benchmark => !!r);
    // Do not choose whichever conflicting snippet is convenient.
    const distinct = new Set(
      rules.map((r) => JSON.stringify([r.min, r.max, r.unit, r.experienceMin, r.experienceMax])),
    );
    if (distinct.size === 1) result.rules.push(rules[0]);
    else
      result.limitations.push(
        `${target.table}.${target.field} / ${target.subject}: ${rules.length ? 'Conflicting benchmarks; review required' : 'No sufficiently explicit applicable benchmark; estimate/preservation only'}`,
      );
  }
  result.status = statuses.includes('available')
    ? 'available'
    : statuses.includes('unavailable')
      ? 'unavailable'
      : targets.length
        ? 'unconfigured'
        : 'not-needed';
  result.warning =
    'المبالغ الموسومة بحدود مصدرية تظل تقديرات داخل نطاق مرصود؛ السعر المرصود عرض محدد، وليس متوسط السوق. المصادر غير المطبقة للمراجعة فقط.';
  return result;
}
export function applyBenchmarks(
  plan: Plan,
  data: Dataset,
  context: Dataset,
  research: BenchmarkResearch,
): Application[] {
  const applications: Application[] = [];
  for (const input of research.rules) {
    const r = benchmarkSchema.parse(input);
    const source = research.evidence.find((e) => e.id === r.evidenceId);
    const verified = source && extractBenchmark(source);
    if (!verified || JSON.stringify(verified) !== JSON.stringify(r))
      fail('قاعدة بحث غير متحققة', 'BENCHMARK_INVALID');
    const target = benchmarkTargets(plan, context).find(
      (t) =>
        t.table === r.table &&
        t.field === r.field &&
        normalizeSubject(t.subject) === normalizeSubject(r.subject) &&
        t.unit === r.unit,
    );
    if (!target) continue;
    const field = plan.tables
      .find((t) => t.name === r.table)!
      .fields.find((f) => f.name === r.field)!;
    const min = Math.max(r.min, field.min ?? -Infinity),
      max = Math.min(r.max, field.max ?? Infinity);
    if (min > max) continue;
    // Explicit nonzero tax treatment cannot be reconciled with an unqualified retail quote.
    if (r.kind === 'price' && plan.rules.some((x) => x.kind === 'finance' && x.taxRate !== 0))
      continue;
    const changed: Row[] = [];
    const rowIndexes: number[] = [];
    let changedRows = 0;
    data[r.table].forEach((row, i) => {
      const original = context[r.table]?.[i];
      if (
        !original ||
        normalizeSubject(rowSubject(plan, context, r.table, original, r.kind)) !==
          normalizeSubject(r.subject) ||
        row[r.field] === null
      )
        return;
      const period =
        r.kind === 'salary'
          ? periodUnit(original.salary_period, 'month')
          : periodUnit(original.billing_period, 'item');
      if (period !== r.unit) return;
      if (r.experienceMin !== undefined) {
        const experience = Number(original.experience ?? original.years_experience ?? NaN);
        if (
          !Number.isFinite(experience) ||
          experience < r.experienceMin ||
          experience > r.experienceMax!
        )
          return;
      }
      const old = row[r.field];
      const value = new Decimal(String(old))
        .clamp(min, max)
        .toDecimalPlaces(field.type === 'integer' ? 0 : (field.scale ?? 2));
      if (value.lt(min) || value.gt(max)) return;
      row[r.field] = typeof old === 'number' ? value.toNumber() : value.toFixed(field.scale ?? 2);
      if (!new Decimal(String(old)).eq(value)) changedRows++;
      changed.push(row);
      rowIndexes.push(i);
    });
    if (changed.length) {
      applications.push({
        ruleId: r.id,
        table: r.table,
        field: r.field,
        subject: r.subject,
        classification: r.mode,
        matchedRows: changed.length,
        changedRows,
        minAfter: Math.min(...changed.map((x) => Number(x[r.field]))),
        maxAfter: Math.max(...changed.map((x) => Number(x[r.field]))),
        sourceUrl: r.sourceUrl,
        rowIndexes,
      });
      if (changedRows) source!.applied = true;
    }
  }
  reconcile(plan, data);
  research.applications = applications;
  return applications;
}

export function validateBenchmarkApplications(data: Dataset, research: BenchmarkResearch) {
  for (const application of research.applications) {
    const rule = research.rules.find((r) => r.id === application.ruleId);
    if (!rule || !benchmarkSchema.safeParse(rule).success)
      fail('قاعدة مصدرية مفقودة', 'BENCHMARK_INVALID');
    for (const index of application.rowIndexes) {
      const row = data[rule.table]?.[index];
      if (
        !row ||
        !new Decimal(String(row[rule.field])).isFinite() ||
        new Decimal(String(row[rule.field])).lt(rule.min) ||
        new Decimal(String(row[rule.field])).gt(rule.max)
      )
        fail('القيمة تخالف الحد الموثق', 'BENCHMARK_INVALID');
    }
  }
}
