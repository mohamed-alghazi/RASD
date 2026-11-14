import { createHash } from 'node:crypto';
export interface ResearchTarget {
  topic: 'salary' | 'price' | 'tax';
  domain: 'employees' | 'products' | 'services' | 'regulatory';
  table: string;
  field: string;
  subject: string;
  unit: 'month' | 'year' | 'item';
}
export interface Evidence {
  id?: string;
  title: string;
  url: string;
  finding: string;
  field: string;
  applied: boolean;
  classification: 'source' | 'estimate' | 'conversion';
  retrievedAt?: string;
  target?: ResearchTarget;
}
export interface Research {
  status: 'available' | 'unconfigured' | 'unavailable' | 'not-needed';
  evidence: Evidence[];
  warning?: string;
  rejected?: { url: string; reason: string }[];
}
const cache = new Map<string, { expires: number; result: Research }>();
export const normalizeSubject = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function subjectMatches(text: string, subject: string) {
  const normalized = ' ' + normalizeSubject(text) + ' ';
  const words = normalizeSubject(subject)
    .split(' ')
    .filter(
      (w) => w.length > 1 && !['the', 'and', 'for', 'with', 'in', 'saudi', 'arabia'].includes(w),
    );
  return words.length > 0 && words.every((w) => normalized.includes(' ' + w + ' '));
}
export function relevant(
  source: { title: string; content: string; url: string },
  topic: string,
  target?: ResearchTarget,
) {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (
    /(^|\.)(facebook\.com|reddit\.com|tiktok\.com|indeed\.com|linkedin\.com|instagram\.com|youtube\.com|twitter\.com|x\.com)$/.test(
      url.hostname,
    )
  )
    return false;
  const text = source.title + ' ' + source.content;
  const terms: Record<string, RegExp> = {
    salary: /salary|salaries|compensation|راتب|رواتب|أجور/i,
    price: /price|pricing|\bSAR\b|\bSR\b|سعر|أسعار|ر\.س/i,
    tax: /\bvat\b|value.added.tax|ضريبة|قيمة مضافة/i,
  };
  if (
    !(terms[topic] ?? /$a/).test(text) ||
    !/saudi|السعودية|سعودي|\bSAR\b|\/sa[/-]|\.sa(?:\/|$)|ر\.س/i.test(text + ' ' + url.href)
  )
    return false;
  if (
    topic === 'salary' &&
    /remote - remote jobs|San Francisco|New York|United States|\bUSA\b/i.test(text)
  )
    return false;
  if (
    target &&
    (!subjectMatches(text, target.subject) ||
      (target.topic === 'tax' && !/zatca\.gov\.sa$/.test(url.hostname)))
  )
    return false;
  if (target?.topic === 'price') {
    const variants = (v: string) =>
      normalizeSubject(v)
        .split(' ')
        .filter((w) => ['white', 'black', 'brown', 'oak', 'stained', 'effect'].includes(w));
    const expected = variants(target.subject),
      actual = variants(source.title);
    if (expected.length && actual.some((w) => !expected.includes(w))) return false;
  }
  return true;
}
export async function research(
  topic: 'salary' | 'price' | 'tax',
  field: string,
  context: string,
  target?: ResearchTarget,
): Promise<Research> {
  const key = JSON.stringify([topic, field, context, target]);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return structuredClone(existing.result);
  if (!process.env.TAVILY_API_KEY)
    return {
      status: 'unconfigured',
      evidence: [],
      warning: 'البحث غير مهيأ؛ القيم الاقتصادية تقديرات غير موثقة.',
    };
  try {
    const site =
      target?.topic === 'price' && /\bikea\b/i.test(target.subject)
        ? 'site:ikea.com/sa/en '
        : target?.topic === 'price' && /microsoft 365/i.test(target.subject)
          ? 'site:microsoft.com/en-sa/ '
          : '';
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${site}Saudi Arabia ${topic} ${context.slice(0, 200)}`,
        max_results: 5,
        search_depth: 'basic',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw Error();
    const body = (await response.json()) as any;
    const evidence: Evidence[] = [],
      rejected: NonNullable<Research['rejected']> = [];
    for (const s of Array.isArray(body.results) ? body.results.slice(0, 5) : []) {
      if (typeof s.title !== 'string' || typeof s.content !== 'string' || typeof s.url !== 'string')
        continue;
      if (!relevant(s, topic, target)) {
        rejected.push({
          url: s.url.slice(0, 1000),
          reason: 'Unrelated subject, geography, rule or unsuitable source',
        });
        continue;
      }
      evidence.push({
        id: createHash('sha256')
          .update(s.url + '|' + field + '|' + context)
          .digest('hex')
          .slice(0, 24),
        title: s.title.slice(0, 200),
        url: s.url.slice(0, 2000),
        finding: s.content.slice(0, 8000),
        field,
        applied: false,
        classification: 'source',
        retrievedAt: new Date().toISOString(),
        target,
      });
    }
    const result: Research = {
      status: 'available',
      evidence,
      rejected,
      warning:
        'تطبق فقط مشاهدات أو حدود موثقة اجتازت التحقق من الموضوع والوحدة والمصدر؛ بقية القيم تقديرات.',
    };
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    // Cache failures briefly as well: a broken provider must not trigger repeated per-job retries.
    cache.set(key, { expires: Date.now() + 3600000, result: structuredClone(result) });
    return result;
  } catch {
    const result: Research = {
      status: 'unavailable',
      evidence: [],
      warning: 'تعذر البحث؛ لم يطبق أي مصدر خارجي.',
    };
    cache.set(key, { expires: Date.now() + 60000, result });
    return structuredClone(result);
  }
}
