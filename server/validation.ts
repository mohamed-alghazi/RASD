import Decimal from 'decimal.js';
import type { Dataset, Plan, Row } from '../shared/schema.js';
import { finance } from './generator.js';
export interface Validation {
  valid: boolean;
  checkedRows: number;
  checkedCells: number;
  issues: { table: string; row?: number; field?: string; message: string }[];
  checks: string[];
}
function validDate(value: string, datetime: boolean) {
  if (!(datetime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value.slice(0, 10);
}
const tuple = (r: Row, columns: string[]) => JSON.stringify(columns.map((c) => r[c]));
export function validate(p: Plan, d: Dataset): Validation {
  const issues: Validation['issues'] = [];
  let checkedRows = 0,
    checkedCells = 0;
  const add = (table: string, message: string, row?: number, field?: string) => {
    if (issues.length < 100) issues.push({ table, message, row, field });
  };
  for (const name of Object.keys(d))
    if (!p.tables.some((t) => t.name === name)) add(name, 'جدول خارج الخطة');
  for (const t of p.tables) {
    const rows = d[t.name] ?? [];
    checkedRows += rows.length;
    if (rows.length !== t.count) add(t.name, 'عدد السجلات لا يطابق الخطة');
    for (const key of [t.primaryKey, ...t.unique]) {
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        if (key.some((c) => r[c] === null) && key !== t.primaryKey) return;
        const k = tuple(r, key);
        if (seen.has(k)) add(t.name, 'مفتاح مكرر: ' + key.join(','), i);
        seen.add(k);
      });
    }
    for (const fk of t.foreignKeys) {
      const pool = new Set((d[fk.table] ?? []).map((r) => tuple(r, fk.references)));
      rows.forEach((r, i) => {
        if (fk.columns.some((c) => r[c] === null)) return;
        if (!pool.has(tuple(r, fk.columns))) add(t.name, 'مرجع غير موجود: ' + fk.table, i);
      });
    }
    rows.forEach((row, i) => {
      for (const c of Object.keys(row))
        if (!t.fields.some((f) => f.name === c)) add(t.name, 'حقل خارج الخطة', i, c);
      for (const f of t.fields) {
        checkedCells++;
        const v = row[f.name];
        if (!Object.hasOwn(row, f.name)) add(t.name, 'حقل مفقود', i, f.name);
        if (v === null || v === undefined) {
          if (!f.nullable) add(t.name, 'حقل إلزامي فارغ', i, f.name);
          continue;
        }
        if (f.values && !f.values.includes(v as string | number))
          add(t.name, 'قيمة خارج التعداد', i, f.name);
        if (f.type === 'integer' && !Number.isInteger(v))
          add(t.name, 'عدد صحيح غير صالح', i, f.name);
        if (f.type === 'boolean' && typeof v !== 'boolean')
          add(t.name, 'قيمة منطقية غير صالحة', i, f.name);
        if (['string', 'uuid', 'date', 'datetime'].includes(f.type) && typeof v !== 'string')
          add(t.name, 'نوع نصي غير صالح', i, f.name);
        if (
          f.type === 'uuid' &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v))
        )
          add(t.name, 'UUID غير صالح', i, f.name);
        if (
          ['date', 'datetime'].includes(f.type) &&
          (!validDate(String(v), f.type === 'datetime'))
        )
          add(t.name, 'تاريخ غير صالح', i, f.name);
        if (f.length && String(v).length > f.length) add(t.name, 'تجاوز طول الحقل', i, f.name);
        if (typeof v === 'string' && /قيمة اصطناعية|placeholder|lorem ipsum/i.test(v))
          add(t.name, 'قيمة بلا معنى', i, f.name);
        if (['decimal', 'integer'].includes(f.type)) {
          try {
            const n = new Decimal(String(v));
            if (!n.isFinite()) throw Error();
            if ((f.min !== undefined && n.lt(f.min)) || (f.max !== undefined && n.gt(f.max)))
              add(t.name, 'خارج الحدود', i, f.name);
            if (
              f.type === 'decimal' &&
              (n.decimalPlaces() > (f.scale ?? 8) ||
                (f.precision !== undefined &&
                  n.abs().gte(new Decimal(10).pow(f.precision - (f.scale ?? 0)))))
            )
              add(t.name, 'دقة عشرية غير صالحة', i, f.name);
          } catch {
            add(t.name, 'رقم غير صالح', i, f.name);
          }
        }
      }
      // Check denormalized ancestor references against the actual referenced parent.
      for (const fk of t.foreignKeys) {
        const parent = (d[fk.table] ?? []).find((r) =>
          fk.references.every((c, j) => r[c] === row[fk.columns[j]]),
        );
        if (!parent) continue;
        for (const a of p.tables.find((t) => t.name === fk.table)!.foreignKeys) {
          const direct = t.foreignKeys.find(
            (k) => k.table === a.table && k.references.join() === a.references.join(),
          );
          if (direct && !direct.columns.every((c, j) => row[c] === parent[a.columns[j]]))
            add(t.name, 'علاقة سلف غير متسقة', i);
        }
      }
    });
  }
  for (const r of p.rules) {
    const rows = d[r.table] ?? [];
    if (r.kind === 'distribution' || r.kind === 'experience') {
      const actual = rows.filter((row) =>
        r.kind === 'distribution' ? row[r.field] === r.value : Number(row[r.field]) > r.threshold,
      ).length;
      if (actual !== Math.round((rows.length * r.percent) / 100))
        add(r.table, 'النسبة المطلوبة غير متحققة');
    } else
      rows.forEach((row, i) => {
        if (r.kind === 'range' && (Number(row[r.field]) < r.min || Number(row[r.field]) > r.max))
          add(r.table, 'حدود قاعدة غير متحققة', i);
        if (r.kind === 'chronology' && String(row[r.before]) > String(row[r.after]))
          add(r.table, 'ترتيب زمني غير صالح', i);
        if (r.kind === 'finance') {
          try {
            if (new Decimal(String(row[r.quantity])).lte(0) ||
                new Decimal(String(row[r.price])).lt(0) ||
                (r.discount && (new Decimal(String(row[r.discount])).lt(0) || new Decimal(String(row[r.discount])).gt(1))))
              add(r.table, 'كمية أو سعر أو خصم غير صالح', i);

            if (
              !new Decimal(String(row[r.total])).eq(
                finance(
                  row[r.quantity],
                  row[r.price],
                  r.discount ? row[r.discount] : 0,
                  r.taxRate,
                  r.taxInclusive,
                ),
              )
            )
              add(r.table, 'حساب مالي غير متسق', i);
          } catch {
            add(r.table, 'حساب مالي غير صالح', i);
          }
        }
        if (r.kind === 'rollup') {
          try {
            const sum = (d[r.childTable] ?? [])
              .filter((c) => c[r.childForeignKey] === row[r.parentKey])
              .reduce((s, c) => s.plus(String(c[r.childField])), new Decimal(0));
            if (!sum.eq(String(row[r.field]))) add(r.table, 'تجميع مالي غير متسق', i);
          } catch {
            add(r.table, 'تجميع غير صالح', i);
          }
        }
        if (r.kind === 'mirror') {
          const source = d[r.sourceTable]?.find((s) => s[r.sourceKey] === row[r.foreignKey]);
          if (!source || String(source[r.sourceField]) !== String(row[r.field]))
            add(r.table, 'قيمة مرجعية غير متسقة', i);
        }
      });
  }
  return {
    valid: issues.length === 0,
    checkedRows,
    checkedCells,
    issues,
    checks: [
      'عدد السجلات',
      'الأنواع والحدود',
      'المفاتيح الأساسية والفريدة',
      'المراجع والعلاقات',
      'القواعد والتوزيعات',
      'الحسابات المالية',
      'القيم الدلالية',
    ],
  };
}
