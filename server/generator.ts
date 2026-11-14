import Decimal from 'decimal.js';
import { semantic } from '../shared/semantics.js';
export { semantic } from '../shared/semantics.js';
import {
  checkPlan,
  dependencyOrder,
  fail,
  type Dataset,
  type Field,
  type Plan,
  type Row,
  type Table,
} from '../shared/schema.js';
import { cities, families, firstNames, products, titles } from './catalog.js';
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function value(f: Field, t: Table, i: number, rng: () => number): Row[string] {
  if (f.values) return f.values[i % f.values.length];
  if (f.default !== undefined) return f.default;
  const s = semantic(f, t.name);
  const lo = f.min ?? (s === 'salary' ? 7000 : s === 'price' ? 30 : 1),
    hi = f.max ?? (s === 'salary' ? 25000 : s === 'price' ? 2000 : 100);
  if (f.type === 'integer' || f.type === 'decimal') {
    if (s === 'experience') return Math.floor(rng() * 21);
    const x = lo + rng() * (hi - lo);
    return f.type === 'integer'
      ? Math.floor(x)
      : new Decimal(x).toDecimalPlaces(f.scale ?? 2).toFixed(f.scale ?? 2);
  }
  if (f.type === 'boolean') return rng() > 0.5;
  if (f.type === 'uuid') {
    const hex = () => Math.floor(rng() * 16).toString(16);
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
      c === 'y' ? (8 + Math.floor(rng() * 4)).toString(16) : hex(),
    );
  }
  if (f.type === 'date' || f.type === 'datetime') {
    const year = /birth/.test(f.name) ? 1985 : /end|due/.test(f.name) ? 2025 : 2023;
    return (
      `${year}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` +
      (f.type === 'datetime' ? 'T12:00:00.000Z' : '')
    );
  }
  let result: string;
  switch (s) {
    case 'name':
      result =
        firstNames[i % firstNames.length] +
        ' ' +
        families[Math.floor(i / firstNames.length) % families.length];
      break;
    case 'email':
      result = `user${i + 1}@example.test`;
      break;
    case 'phone':
      result = `+966500${String(i + 1).padStart(6, '0')}`;
      break;
    case 'city':
      result = cities[i % cities.length];
      break;
    case 'address':
      result = `حي ${['النخيل', 'الروضة', 'الياسمين', 'السلام'][i % 4]}، شارع ${i + 1}`;
      break;
    case 'company':
      result = 'شركة آفاق للتقنية';
      break;
    case 'university':
      result = 'جامعة الإمام محمد بن سعود الإسلامية';
      break;
    case 'faculty':
      result = ['كلية الهندسة', 'كلية علوم الحاسب'][i % 2];
      break;
    case 'department':
    case 'major':
      result = ['الهندسة', 'المالية', 'التشغيل', 'الموارد البشرية', 'التقنية'][i % 5];
      break;
    case 'title':
      result = titles[i % titles.length];
      break;
    case 'product':
      result = products[i % products.length];
      break;
    case 'service':
      result = ['استضافة مواقع سنوية', 'صيانة أجهزة شهرية', 'استشارات تقنية', 'تصميم مواقع'][i % 4];
      break;
    case 'student_number':
      result = `445${String(i + 1).padStart(7, '0')}`;
      break;
    case 'currency':
      result = 'SAR';
      break;
    case 'status':
      result = ['active', 'pending', 'completed'][i % 3];
      break;
    case 'description':
      result = ['مراجعة دورية وفق خطة العمل', 'طلب توريد معتمد', 'خدمة ضمن الاتفاقية'][i % 3];
      break;
    default:
      if (f.nullable) return null;
      fail(
        `لا يوجد مولد دلالي للحقل ${t.name}.${f.name}؛ أضف semantic أو values أو default في الخطة`,
        'UNKNOWN_SEMANTIC',
      );
  }
  if (f.length && result.length > f.length)
    fail(`القيمة الدلالية تتجاوز طول ${t.name}.${f.name}؛ حدد قيماً أقصر`);
  return result;
}
function keyValue(f: Field, i: number, rng: () => number) {
  if (f.type === 'integer') return i + 1;
  if (f.type === 'uuid')
    return value(
      f,
      { name: '', count: 0, fields: [], primaryKey: [], unique: [], foreignKeys: [] },
      i,
      rng,
    );
  if (f.type === 'string') {
    const s = String(i + 1);
    if (f.length && s.length > f.length) fail('سعة المفتاح أقل من عدد السجلات');
    return s;
  }
  fail('نوع مفتاح غير مدعوم: ' + f.type);
}
export function finance(
  quantity: unknown,
  price: unknown,
  discount: unknown,
  taxRate: number,
  inclusive = false,
) {
  const net = new Decimal(String(quantity))
    .mul(String(price))
    .mul(new Decimal(1).minus(String(discount ?? 0)));
  return net
    .mul(inclusive ? 1 : new Decimal(1).plus(taxRate))
    .toDecimalPlaces(2)
    .toFixed(2);
}
export function reconcile(p: Plan, data: Dataset) {
  for (const r of p.rules)
    if (r.kind === 'mirror' && r.field !== 'amount' && r.field !== 'total')
      for (const row of data[r.table]) {
        const source = data[r.sourceTable].find((s) => s[r.sourceKey] === row[r.foreignKey]);
        if (!source) fail('مرجع قاعدة نسخ مفقود');
        row[r.field] = source[r.sourceField];
      }
  for (const r of p.rules)
    if (r.kind === 'finance')
      for (const row of data[r.table])
        row[r.total] = finance(
          row[r.quantity],
          row[r.price],
          r.discount ? row[r.discount] : 0,
          r.taxRate,
          r.taxInclusive,
        );
  for (const r of p.rules)
    if (r.kind === 'rollup')
      for (const row of data[r.table])
        row[r.field] = data[r.childTable]
          .filter((c) => c[r.childForeignKey] === row[r.parentKey])
          .reduce((sum, c) => sum.plus(String(c[r.childField])), new Decimal(0))
          .toFixed(2);
  for (const r of p.rules)
    if (r.kind === 'mirror' && (r.field === 'amount' || r.field === 'total'))
      for (const row of data[r.table]) {
        const source = data[r.sourceTable].find((s) => s[r.sourceKey] === row[r.foreignKey]);
        if (!source) fail('مرجع قاعدة نسخ مفقود');
        row[r.field] = source[r.sourceField];
      }
}
export function generate(input: Plan): Dataset {
  const p = checkPlan(input);
  const estimated = p.tables.reduce(
    (sum, t) =>
      sum +
      t.count *
        (2 +
          t.fields.reduce((n, f) => {
            let size = 16;
            if (f.values)
              size = Math.max(...f.values.map((v) => Buffer.byteLength(JSON.stringify(v))));
            else if (f.default !== undefined) size = Buffer.byteLength(JSON.stringify(f.default));
            else if (f.type === 'string')
              size = Math.min(f.length ?? 100, semantic(f, t.name) ? 100 : 10000) * 3 + 2;
            else if (f.type === 'uuid') size = 38;
            else if (f.type === 'date' || f.type === 'datetime') size = 30;
            else if (f.type === 'decimal') size = (f.precision ?? 18) + 4;
            return n + Buffer.byteLength(f.name) + size + 4;
          }, 0)),
    0,
  );
  if (estimated > 8 * 1024 * 1024)
    fail('الحجم التقديري يتجاوز 8 MiB؛ خفّض عدد السجلات أو أطوال القيم', 'RESOURCE_LIMIT');
  const rng = random(p.seed),
    data: Dataset = {};
  for (const t of dependencyOrder(p)) {
    const rows: Row[] = [];
    data[t.name] = rows;
    for (let i = 0; i < t.count; i++) {
      const row: Row = {};
      const foreign = new Set(t.foreignKeys.flatMap((k) => k.columns));
      for (const f of t.fields) {
        if (foreign.has(f.name)) continue;
        row[f.name] = t.primaryKey.includes(f.name) ? keyValue(f, i, rng) : value(f, t, i, rng);
      }
      // Reuse a single parent record for each FK tuple. Shared ancestors must agree.
      for (const fk of [...t.foreignKeys].reverse()) {
        const pool = data[fk.table];
        if (!pool.length) {
          for (const c of fk.columns) row[c] = null;
          continue;
        }
        const compatible = pool.filter((parent) =>
          t.foreignKeys.every((other) => {
            if (other === fk) return true;
            const ancestors = p.tables
              .find((x) => x.name === fk.table)!
              .foreignKeys.filter(
                (a) => a.table === other.table && a.references.join() === other.references.join(),
              );
            return ancestors.every((a) =>
              a.columns.every(
                (c, j) =>
                  row[other.columns[j]] === undefined || row[other.columns[j]] === parent[c],
              ),
            );
          }),
        );
        if (!compatible.length) fail('تعذر توحيد علاقة الجدول ' + t.name);
        const parent = compatible[i % compatible.length];
        fk.columns.forEach((c, j) => {
          row[c] = parent[fk.references[j]];
        });
        for (const ancestor of p.tables.find((x) => x.name === fk.table)!.foreignKeys) {
          const direct = t.foreignKeys.find(
            (a) => a.table === ancestor.table && a.references.join() === ancestor.references.join(),
          );
          if (direct)
            direct.columns.forEach((c, j) => {
              row[c] = parent[ancestor.columns[j]];
            });
        }
      }
      rows.push(row);
    }
  }
  for (const r of p.rules) {
    const rows = data[r.table];
    if (r.kind === 'range')
      for (const row of rows) row[r.field] = Math.max(r.min, Math.min(r.max, Number(row[r.field])));
    if (r.kind === 'experience') {
      const n = Math.round((rows.length * r.percent) / 100);
      rows.forEach((row, i) => {
        row[r.field] = i < n ? r.threshold + 1 + (i % 10) : i % (r.threshold + 1);
      });
    }
    if (r.kind === 'chronology')
      for (const row of rows)
        if (String(row[r.before]) > String(row[r.after]))
          [row[r.before], row[r.after]] = [row[r.after], row[r.before]];
  }
  const distributions = p.rules.filter((r) => r.kind === 'distribution');
  for (const first of distributions) {
    if (distributions.find((r) => r.table === first.table && r.field === first.field) !== first)
      continue;
    const group = distributions.filter((r) => r.table === first.table && r.field === first.field),
      rows = data[first.table];
    const values = group.map((r) => r.value);
    if (
      group.reduce((s, r) => s + r.percent, 0) > 100 ||
      new Set(values.map((v) => JSON.stringify(v))).size !== values.length
    )
      fail('توزيعات متعارضة');
    let offset = 0;
    for (const r of group) {
      const n = Math.round((rows.length * r.percent) / 100);
      for (let i = offset; i < offset + n; i++) {
        if (!rows[i]) fail('التوزيعات لا تسمح بتقريب صحيح لهذا العدد');
        rows[i][r.field] = r.value;
      }
      offset += n;
    }
    const field = p.tables
      .find((t) => t.name === first.table)!
      .fields.find((f) => f.name === first.field)!;
    for (let i = offset; i < rows.length; i++)
      if (values.includes(rows[i][first.field] as any)) {
        const alternate = field.values?.find((v) => !values.includes(v));
        if (alternate !== undefined) rows[i][first.field] = alternate;
        else if (typeof first.value === 'boolean' && !values.includes(!first.value))
          rows[i][first.field] = !first.value;
        else fail('يجب تحديد قيم بديلة للتوزيع');
      }
  }
  // Retain the existing salary heuristic only for a compatible, unconstrained field.
  const employeeTable = p.tables.find((t) => t.name === 'employees');
  const salary = employeeTable?.fields.find((f) => f.name === 'salary');
  if (
    p.domain === 'employees' &&
    salary &&
    !salary.values &&
    salary.default === undefined &&
    employeeTable?.fields.some((f) => f.name === 'experience') &&
    !p.rules.some((r) => 'field' in r && r.table === 'employees' && r.field === 'salary')
  ) {
    for (const row of data.employees) {
      row.salary = new Decimal(
        Math.max(
          salary.min ?? 7000,
          Math.min(salary.max ?? 25000, 7000 + Number(row.experience) * 800),
        ),
      ).toFixed(salary.scale ?? 2);
    }
  }
  reconcile(p, data);
  if (Buffer.byteLength(JSON.stringify(data)) > 8 * 1024 * 1024)
    fail('الناتج يتجاوز 8 MiB', 'RESOURCE_LIMIT');
  return data;
}
