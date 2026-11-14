import { z } from 'zod';
export const ident = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/);
export const fieldSchema = z
  .object({
    name: ident,
    type: z.enum(['integer', 'decimal', 'string', 'boolean', 'date', 'datetime', 'uuid']),
    nullable: z.boolean().default(false),
    length: z.number().int().min(1).max(10000).optional(),
    precision: z.number().int().min(1).max(18).optional(),
    scale: z.number().int().min(0).max(8).optional(),
    values: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(100)
      .optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    semantic: z
      .enum([
        'name',
        'email',
        'phone',
        'city',
        'address',
        'company',
        'university',
        'faculty',
        'major',
        'department',
        'title',
        'product',
        'service',
        'salary',
        'price',
        'student_number',
        'experience',
        'currency',
        'status',
        'description',
      ])
      .optional(),
  })
  .strict();
export const foreignSchema = z
  .object({ columns: z.array(ident).min(1), table: ident, references: z.array(ident).min(1) })
  .strict();
export const ruleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('distribution'),
      table: ident,
      field: ident,
      value: z.union([z.string(), z.number(), z.boolean()]),
      percent: z.number().min(0).max(100),
    })
    .strict(),
  z.object({ kind: z.literal('chronology'), table: ident, before: ident, after: ident }).strict(),
  z
    .object({
      kind: z.literal('range'),
      table: ident,
      field: ident,
      min: z.number(),
      max: z.number(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('experience'),
      table: ident,
      field: ident,
      percent: z.number().min(0).max(100),
      threshold: z.number().min(0).max(40),
    })
    .strict(),
  z
    .object({
      kind: z.literal('finance'),
      table: ident,
      quantity: ident,
      price: ident,
      discount: ident.optional(),
      taxRate: z.number().min(0).max(1),
      total: ident,
      taxInclusive: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('rollup'),
      table: ident,
      field: ident,
      childTable: ident,
      childForeignKey: ident,
      parentKey: ident,
      childField: ident,
    })
    .strict(),
  z
    .object({
      kind: z.literal('mirror'),
      table: ident,
      field: ident,
      sourceTable: ident,
      sourceKey: ident,
      foreignKey: ident,
      sourceField: ident,
    })
    .strict(),
]);
export const tableSchema = z
  .object({
    name: ident,
    count: z.number().int().min(0).max(10000),
    fields: z.array(fieldSchema).min(1).max(50),
    primaryKey: z.array(ident).min(1),
    unique: z.array(z.array(ident).min(1)).default([]),
    foreignKeys: z.array(foreignSchema).default([]),
  })
  .strict();
export const planSchema = z
  .object({
    version: z.literal(1),
    domain: z.string().min(1).max(100),
    seed: z.number().int().min(0).max(2147483647),
    tables: z.array(tableSchema).min(1).max(50),
    rules: z.array(ruleSchema).default([]),
    assumptions: z.array(z.string().max(1000)).max(50).default([]),
  })
  .strict();
export type Field = z.infer<typeof fieldSchema>;
export type Table = z.infer<typeof tableSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
export type Dataset = Record<string, Row[]>;
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(message: string, code = 'INVALID_INPUT'): never {
  throw new AppError(400, code, message);
}
export function checkPlan(input: unknown): Plan {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success)
    fail(
      'الخطة غير صالحة: ' +
        parsed.error.issues
          .map((i) => i.path.join('.') + ' ' + i.message)
          .slice(0, 8)
          .join('؛ '),
    );
  const p = parsed.data;
  const names = new Set(p.tables.map((t) => t.name));
  if (names.size !== p.tables.length) fail('أسماء الجداول مكررة');
  let rows = 0,
    cells = 0;
  for (const t of p.tables) {
    rows += t.count;
    cells += t.count * t.fields.length;
    const fs = new Set(t.fields.map((f) => f.name));
    if (fs.size !== t.fields.length) fail('حقول مكررة: ' + t.name);
    for (const key of [t.primaryKey, ...t.unique])
      for (const c of key) if (!fs.has(c)) fail('حقل مفتاح مفقود: ' + c);
    for (const c of t.primaryKey)
      if (t.fields.find((f) => f.name === c)!.nullable) fail('المفتاح الأساسي لا يقبل null');
    for (const f of t.fields) {
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        fail('حدود متعارضة: ' + f.name);
      if ((f.scale ?? 0) > (f.precision ?? 18)) fail('دقة عشرية غير صالحة');
    }
    for (const fk of t.foreignKeys) {
      const parent = p.tables.find((x) => x.name === fk.table);
      if (!parent || fk.columns.length !== fk.references.length) fail('علاقة غير صالحة: ' + t.name);
      fk.columns.forEach((c, i) => {
        const a = t.fields.find((f) => f.name === c),
          b = parent.fields.find((f) => f.name === fk.references[i]);
        if (!a || !b || a.type !== b.type) fail('أنواع العلاقة غير متوافقة: ' + t.name + '.' + c);
      });
      if (
        ![parent.primaryKey, ...parent.unique].some(
          (k) => JSON.stringify(k) === JSON.stringify(fk.references),
        )
      )
        fail('العلاقة يجب أن تشير إلى مفتاح فريد');
      if (
        t.count &&
        parent.count === 0 &&
        fk.columns.some((c) => !t.fields.find((f) => f.name === c)!.nullable)
      )
        fail('الجدول الأب فارغ');
    }
  }
  if (rows > 20000 || cells > 250000) fail('تجاوز حدود الصفوف أو الخلايا', 'RESOURCE_LIMIT');
  for (const r of p.rules) {
    const t = p.tables.find((t) => t.name === r.table);
    if (!t) fail('جدول قاعدة مفقود');
    const fields =
      r.kind === 'chronology'
        ? [r.before, r.after]
        : r.kind === 'finance'
          ? [r.quantity, r.price, r.total, ...(r.discount ? [r.discount] : [])]
          : r.kind === 'rollup'
            ? [r.field, r.parentKey]
            : r.kind === 'mirror'
              ? [r.field, r.foreignKey]
              : [r.field];
    for (const c of fields) if (!t.fields.some((f) => f.name === c)) fail('حقل قاعدة مفقود: ' + c);
    if (r.kind === 'range' && r.min > r.max) fail('حدود قاعدة متعارضة');
    const numeric = (table: Table, name: string) =>
      ['integer', 'decimal'].includes(table.fields.find((f) => f.name === name)!.type);
    if (r.kind === 'finance' && fields.some((c) => !numeric(t, c)))
      fail('القاعدة المالية تتطلب حقولاً عددية');
    if ((r.kind === 'range' || r.kind === 'experience') && !numeric(t, r.field))
      fail('القاعدة تتطلب حقلاً عددياً');
    if (
      r.kind === 'chronology' &&
      fields.some((c) => !['date', 'datetime'].includes(t.fields.find((f) => f.name === c)!.type))
    )
      fail('الترتيب الزمني يتطلب تواريخ');

    if (r.kind === 'rollup' || r.kind === 'mirror') {
      const other = p.tables.find(
        (t) => t.name === (r.kind === 'rollup' ? r.childTable : r.sourceTable),
      );
      const cols =
        r.kind === 'rollup' ? [r.childForeignKey, r.childField] : [r.sourceKey, r.sourceField];
      if (!other || cols.some((c) => !other.fields.some((f) => f.name === c)))
        fail('مرجع قاعدة تجميع أو نسخ غير صالح');
    }
  }
  dependencyOrder(p);
  const distributions = p.rules.filter((r) => r.kind === 'distribution');
  for (const r of distributions) {
    const group = distributions.filter((x) => x.table === r.table && x.field === r.field);
    if (
      group.reduce((n, x) => n + x.percent, 0) > 100 ||
      new Set(group.map((x) => JSON.stringify(x.value))).size !== group.length
    )
      fail('نسب توزيع متعارضة: ' + r.table + '.' + r.field);
  }
  return p;
}
export function dependencyOrder(p: Plan): Table[] {
  const done = new Set<string>(),
    active = new Set<string>(),
    out: Table[] = [];
  function visit(t: Table) {
    if (done.has(t.name)) return;
    if (active.has(t.name))
      fail('دورة علاقات غير مدعومة؛ افصل العلاقة الدائرية قبل التوليد', 'UNSUPPORTED_CYCLE');
    active.add(t.name);
    for (const fk of t.foreignKeys) visit(p.tables.find((x) => x.name === fk.table)!);
    active.delete(t.name);
    done.add(t.name);
    out.push(t);
  }
  p.tables.forEach(visit);
  return out;
}
