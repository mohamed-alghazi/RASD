import Decimal from 'decimal.js';
import { periodUnit } from '../shared/semantics.js';
import {
  applyBenchmarks,
  validateBenchmarkApplications,
  type BenchmarkResearch,
} from './benchmarks.js';
import { fail, type Dataset, type Plan } from '../shared/schema.js';
import { cities, families, firstNames } from './catalog.js';
import { semantic, reconcile } from './generator.js';
import { validate } from './validation.js';
export interface Transform {
  table: string;
  field: string;
  method: string;
  classification:
    | 'synthetic'
    | 'estimate'
    | 'conversion'
    | 'preserved'
    | 'source-bounded-estimate'
    | 'observed-price';
}
export function localize(
  plan: Plan,
  source: Dataset,
  options: { economic?: 'preserve' | 'estimate'; currencyRate?: number } = {},
  benchmarks?: BenchmarkResearch,
) {
  const data: Dataset = structuredClone(source),
    transforms: Transform[] = [];
  const protectedFields = new Set<string>();
  for (const t of plan.tables) {
    for (const key of [t.primaryKey, ...t.unique])
      for (const c of key) protectedFields.add(t.name + '.' + c);
    for (const fk of t.foreignKeys) {
      fk.columns.forEach((c) => protectedFields.add(t.name + '.' + c));
      fk.references.forEach((c) => protectedFields.add(fk.table + '.' + c));
    }
  }
  for (const t of plan.tables) {
    for (const f of t.fields) {
      if (protectedFields.has(t.name + '.' + f.name)) continue;
      const s = semantic(f, t.name);
      if (!s) continue;
      if (s === 'currency' && (options.economic ?? 'estimate') === 'preserve') continue;
      let classification: Transform['classification'] = 'synthetic',
        changed = false;
      data[t.name].forEach((row, i) => {
        const old = row[f.name];
        if (old === null) return;
        let v: any = old;
        const asSource = (n: string | number) => (typeof old === 'number' ? Number(n) : String(n));
        if (f.type === 'string')
          switch (s) {
            case 'name':
              v = firstNames[i % 20] + ' ' + families[Math.floor(i / 20) % 20];
              break;
            case 'email':
              v = `person${i + 1}@example.test`;
              break;
            case 'phone':
              v = `+966500${String(i + 1).padStart(6, '0')}`;
              break;
            case 'city':
              v = cities[i % cities.length];
              break;
            case 'address':
              v = `حي النخيل، شارع ${i + 1}، الرياض`;
              break;
            case 'title': {
              const translations: Record<string, string> = {
                'software engineer': 'مهندس برمجيات',
                'civil engineer': 'مهندس مدني',
                accountant: 'محاسب',
                'project manager': 'مدير مشروع',
                'senior software engineer': 'مهندس برمجيات أول',
                manager: 'مدير',
                'electrical engineer': 'مهندس كهربائي',
                'business analyst': 'محلل أعمال',
              };
              // Preserve unfamiliar occupations rather than assigning an unrelated job by row index.
              v = translations[String(old).trim().toLowerCase()] ?? old;
              break;
            }
            case 'service':
            case 'product':
              // Product identity/specifications are needed for benchmark applicability.
              v = old;
              break;
            case 'currency':
              v = 'SAR';
              break;
            case 'university':
              v = 'جامعة الإمام محمد بن سعود الإسلامية';
              break;
            case 'department':
              v = ['الهندسة', 'المالية', 'التشغيل', 'الموارد البشرية'][i % 4];
              break;
            case 'company':
              v = 'شركة آفاق للتقنية';
              break;
          }
        if ((s === 'salary' || s === 'price') && (options.economic ?? 'estimate') === 'estimate') {
          const n = new Decimal(String(old));
          if (n.isNegative()) fail('مبلغ سالب غير قابل للتوطين الآمن');
          if (options.currencyRate) {
            v = asSource(n.mul(options.currencyRate).toFixed(2));
            classification = 'conversion';
          } else if (s === 'salary') {
            const experience = Number(row.experience ?? row.years_experience ?? 5);
            const original = source[t.name][i];
            const relatedJob = t.foreignKeys
              .map((fk) =>
                source[fk.table]?.find((parent) =>
                  fk.references.every((key, j) => parent[key] === original[fk.columns[j]]),
                ),
              )
              .find((parent) => parent && (parent.job_title || parent.occupation));
            const title = String(
              original.job_title ??
                original.occupation ??
                relatedJob?.job_title ??
                relatedJob?.occupation ??
                '',
            );
            const factor = /مدير|manager|senior/i.test(title) ? 1.3 : 1;
            const period = periodUnit(original.salary_period, 'month');
            if (!['month', 'year'].includes(period))
              fail('حدد فترة الراتب الشهرية أو السنوية قبل التوطين', 'SALARY_PERIOD');
            v = asSource(
              new Decimal(7000 + Math.min(25, Math.max(0, experience)) * 800)
                .mul(factor)
                .mul(period === 'year' ? 12 : 1)
                .toFixed(2),
            );
            classification = 'estimate';
          } else {
            v = asSource(
              n
                .mul(3.75)
                .mul(/service/i.test(t.name) ? 0.8 : 0.95)
                .toFixed(2),
            );
            classification = 'estimate';
          }
        }
        if (f.type === 'string' && typeof v !== 'string') v = String(v);
        if (f.type === 'integer' && typeof v === 'number') v = Math.round(v);
        row[f.name] = v;
        if (v !== old) changed = true;
      });
      if (changed)
        transforms.push({
          table: t.name,
          field: f.name,
          method:
            (classification as Transform['classification']) === 'estimate'
              ? 'تقدير اختباري غير موثق؛ راجع ملاءمته للسوق'
              : (classification as Transform['classification']) === 'conversion'
                ? 'تحويل بالسعر الذي حدده المستخدم'
                : 'استبدال اصطناعي سعودي',
          classification,
        });
    }
  }
  if (benchmarks && options.economic !== 'preserve' && !options.currencyRate) {
    const applied = applyBenchmarks(plan, data, source, benchmarks);
    for (const application of applied.filter((a) => a.changedRows > 0)) {
      transforms.push({
        table: application.table,
        field: application.field,
        classification: application.classification,
        method: `${application.classification === 'observed-price' ? 'سعر عرض مرصود مطابق للصنف والوحدة' : 'تقدير مقيد بنطاق راتب مرصود؛ فروق الخبرة تقديرية'}: ${application.changedRows} سجل · ${application.sourceUrl}`,
      });
    }
    validateBenchmarkApplications(data, benchmarks);
  }
  // Apply only verified source formulas; preserve each source cell's primitive type.
  reconcile(plan, data);
  for (const t of plan.tables)
    for (let i = 0; i < data[t.name].length; i++)
      for (const f of t.fields) {
        const old = source[t.name][i][f.name];
        if (
          typeof old === 'number' &&
          typeof data[t.name][i][f.name] === 'string' &&
          Number.isFinite(Number(data[t.name][i][f.name]))
        )
          data[t.name][i][f.name] = Number(data[t.name][i][f.name]);
        if (typeof old === 'string' && typeof data[t.name][i][f.name] === 'number')
          data[t.name][i][f.name] = String(data[t.name][i][f.name]);
      }
  const monetaryChanged = transforms.some((t) =>
    ['estimate', 'conversion', 'source-bounded-estimate', 'observed-price'].includes(
      t.classification,
    ),
  );
  if (monetaryChanged) {
    const financial = plan.tables.some((t) =>
      t.fields.some((f) => /^(total|amount|subtotal|tax|tax_amount|discount_amount)$/.test(f.name)),
    );
    if (financial && !plan.rules.some((r) => r.kind === 'finance'))
      fail(
        'توجد مبالغ مترابطة. قدم قواعد finance صريحة أو اختر الحفاظ على المبالغ؛ لن نغير الأسعار مع ترك الإجماليات القديمة.',
        'FINANCIAL_AMBIGUITY',
      );
    for (const t of plan.tables)
      for (const f of t.fields.filter((f) =>
        /^(amount|total|subtotal|tax|tax_amount|discount_amount)$/.test(f.name),
      )) {
        const covered = plan.rules.some(
          (r) =>
            r.table === t.name &&
            (r.kind === 'finance'
              ? r.total === f.name
              : (r.kind === 'rollup' || r.kind === 'mirror') && r.field === f.name),
        );
        if (!covered)
          fail(
            'حقل مالي مشتق دون قاعدة متحققة: ' +
              t.name +
              '.' +
              f.name +
              '؛ اختر الحفاظ على المبالغ أو أضف قاعدة صريحة.',
            'FINANCIAL_AMBIGUITY',
          );
      }
  }
  const result = validate(plan, data);
  if (!result.valid) fail('فشل تحقق البيانات الموطنة: ' + result.issues[0]?.message);
  return {
    data,
    transforms,
    validation: result,
    warnings: [
      'القيم غير الموسومة بمصدر تقديرات للاختبار؛ النطاقات المرصودة ليست مسحاً شاملاً، وأسعار العروض ليست متوسطات سوقية.',
      'تظل المفاتيح والحقول الفريدة محفوظة. أرقام الاتصال اصطناعية ولا ينبغي الاتصال بها.',
      'لا تضاف ضريبة تلقائياً.',
    ],
  };
}
