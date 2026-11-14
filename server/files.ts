import { Unzip, UnzipInflate, zipSync, strToU8 } from 'fflate';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { fail, type Dataset, type Field, type Plan, type Table } from '../shared/schema.js';
import { parsePrisma, parseSql, parseSqlite } from './parsers.js';
export interface Upload {
  name: string;
  bytes: Uint8Array;
}
const MiB = 1024 * 1024;
export function safeName(name: string) {
  if (
    name.includes('\\') ||
    name.startsWith('/') ||
    name.split('/').some((x) => x === '..') ||
    /^[A-Za-z]:/.test(name) ||
    name.includes('\0')
  )
    fail('مسار أرشيف غير آمن');
  return name;
}
export function unzipBounded(bytes: Uint8Array, max: number, maxFiles = 100): Upload[] {
  if (bytes.length < 22 || bytes[0] !== 80 || bytes[1] !== 75) fail('أرشيف غير صالح');
  const files: Upload[] = [];
  let total = 0,
    count = 0,
    error: unknown;
  const unzip = new Unzip((file) => {
    try {
      safeName(file.name);
      if (++count > maxFiles) fail('عدد ملفات الأرشيف كبير', 'RESOURCE_LIMIT');
      if (file.originalSize && file.originalSize > max) fail('أرشيف متضخم', 'RESOURCE_LIMIT');
      if (file.name.endsWith('/')) return;
      let size = 0;
      const chunks: Uint8Array[] = [];
      file.ondata = (err, chunk, final) => {
        if (err) {
          error = err;
          return;
        }
        size += chunk.length;
        total += chunk.length;
        if (total > max) {
          file.terminate();
          error = new Error('ARCHIVE_LIMIT');
          return;
        }
        chunks.push(chunk);
        if (final) {
          const result = new Uint8Array(size);
          let pos = 0;
          for (const c of chunks) {
            result.set(c, pos);
            pos += c.length;
          }
          files.push({ name: file.name, bytes: result });
        }
      };
      file.start();
    } catch (e) {
      error = e;
    }
  });
  unzip.register(UnzipInflate);
  try {
    for (let i = 0; i < bytes.length; i += 4096) {
      unzip.push(bytes.subarray(i, i + 4096), i + 4096 >= bytes.length);
      if (error) throw error;
    }
  } catch {
    fail('أرشيف تالف أو غير آمن أو تجاوز حد التوسيع', 'RESOURCE_LIMIT');
  }
  if (error) fail('أرشيف غير صالح أو تجاوز حد التوسيع', 'RESOURCE_LIMIT');
  return files;
}
const ext = (s: string) => s.split('.').pop()!.toLowerCase();
export async function schemaUpload(upload: Upload): Promise<Plan> {
  const type = ext(upload.name);
  if (upload.bytes.length > (type === 'zip' ? 20 : 4) * MiB)
    fail('حجم ملف المخطط يتجاوز الحد', 'RESOURCE_LIMIT');
  if (type === 'zip') {
    const files = unzipBounded(upload.bytes, 12 * MiB).filter((f) =>
      ['sql', 'prisma', 'sqlite', 'db'].includes(ext(f.name)),
    );
    if (files.length !== 1) fail('ضع ملف مخطط واحداً فقط داخل ZIP لمنع دمج مخططات متعارضة');
    return schemaUpload(files[0]);
  }
  if (type === 'sql')
    return parseSql(new TextDecoder('utf-8', { fatal: true }).decode(upload.bytes));
  if (type === 'prisma')
    return parsePrisma(new TextDecoder('utf-8', { fatal: true }).decode(upload.bytes));
  if (['db', 'sqlite'].includes(type)) return parseSqlite(upload.bytes);
  fail('صيغة المخطط غير مدعومة');
}
function tableName(name: string) {
  const base = name
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(base)) fail('استخدم اسماً إنجليزياً بسيطاً لملف الجدول');
  return base;
}
function rows(input: unknown): Record<string, any>[] {
  if (!Array.isArray(input) || input.some((r) => !r || Array.isArray(r) || typeof r !== 'object'))
    fail('يجب أن يكون الجدول مصفوفة كائنات');
  return input;
}
export function localizationLimits(data: Dataset) {
  const ts = Object.values(data);
  const columns = ts.reduce((s, r) => s + Object.keys(r[0] ?? {}).length, 0),
    count = ts.reduce((s, r) => s + r.length, 0),
    cells = ts.reduce((s, r) => s + r.reduce((a, row) => a + Object.keys(row).length, 0), 0);
  if (ts.length > 30 || columns > 300 || count > 10000 || cells > 200000)
    fail('تجاوز حد التوطين: 30 جدولاً، 300 عمود، 10000 صف، 200000 خلية', 'RESOURCE_LIMIT');
}
export async function dataUploads(uploads: Upload[]): Promise<Dataset> {
  if (uploads.length > 10 || uploads.reduce((n, u) => n + u.bytes.length, 0) > 10 * MiB)
    fail('الحد 10 ملفات و10 MiB إجمالاً', 'RESOURCE_LIMIT');
  const data: Dataset = {};
  let expanded = 0;
  async function consume(u: Upload, inside = false) {
    const type = ext(u.name);
    if (type === 'zip') {
      if (inside) fail('الأرشيفات المتداخلة غير مدعومة');
      for (const f of unzipBounded(u.bytes, 24 * MiB, 100)) {
        expanded += f.bytes.length;
        if (expanded > 24 * MiB) fail('تجاوز التوسيع', 'RESOURCE_LIMIT');
        await consume(f, true);
      }
      return;
    }
    const add = (name: string, value: unknown) => {
      if (data[name]) fail('اسم جدول مكرر: ' + name);
      const r = rows(value);
      if (!r.length) fail('الجدول فارغ: ' + name);
      const keys = Object.keys(r[0]);
      if (!keys.length || keys.some((k) => !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(k)))
        fail('أسماء أعمدة غير مدعومة');
      for (const row of r) {
        if (Object.keys(row).length !== keys.length || keys.some((k) => !(k in row)))
          fail('صفوف غير متجانسة');
        for (const cell of Object.values(row))
          if (
            (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell)) ||
            (typeof cell === 'number' && !Number.isFinite(cell))
          )
            fail('يدعم التوطين خلايا بسيطة فقط');
      }
      data[name] = r;
      localizationLimits(data);
    };
    if (type === 'csv') {
      const records = parse(new TextDecoder('utf-8', { fatal: true }).decode(u.bytes), {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        max_record_size: 1024 * 1024,
      });
      add(tableName(u.name), records);
    } else if (type === 'json') {
      const obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(u.bytes));
      if (Array.isArray(obj)) add(tableName(u.name), obj);
      else if (obj && typeof obj === 'object')
        for (const [name, value] of Object.entries(obj)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) fail('اسم جدول غير صالح');
          add(name, value);
        }
      else fail('JSON غير صالح');
    } else if (type === 'xlsx') {
      unzipBounded(u.bytes, 40 * MiB, 300);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(Buffer.from(u.bytes) as any);
      for (const sheet of book.worksheets) {
        const header = sheet.getRow(1).values as any[];
        const keys = header.slice(1).map(String);
        const records: any[] = [];
        sheet.eachRow((row, n) => {
          if (n === 1) return;
          const item: any = {};
          keys.forEach((k, i) => {
            const v = row.getCell(i + 1).value;
            if (v && typeof v === 'object') fail('خلايا Excel المركبة والصيغ غير مدعومة');
            item[k] = v ?? null;
          });
          records.push(item);
        });
        add(tableName(sheet.name + '.xlsx'), records);
      }
    } else fail('صيغة بيانات غير مدعومة: ' + u.name);
  }
  for (const u of uploads) await consume(u);
  localizationLimits(data);
  return data;
}
export function inferPlan(data: Dataset): Plan {
  const tables: Table[] = Object.entries(data).map(([name, rs]) => {
    const fields: Field[] = Object.keys(rs[0]).map((name) => {
      const vals = rs.map((r) => r[name]).filter((v) => v !== null);
      const v = vals[0];
      return {
        name,
        type:
          typeof v === 'number'
            ? vals.every(Number.isInteger) &&
              !/salary|price|cost|^(amount|total|subtotal|tax_amount|discount_amount)$/.test(name)
              ? 'integer'
              : 'decimal'
            : typeof v === 'boolean'
              ? 'boolean'
              : 'string',
        nullable: rs.some((r) => r[name] === null),
      };
    });
    const candidate =
      fields.find((f) => f.name === 'id') ??
      fields.find(
        (f) =>
          /(_id|_number|_code)$/.test(f.name) &&
          new Set(rs.map((r) => r[f.name])).size === rs.length,
      );
    if (
      !candidate ||
      rs.some((r) => r[candidate.name] === null) ||
      new Set(rs.map((r) => r[candidate.name])).size !== rs.length
    )
      fail(`تعذر تحديد مفتاح فريد في ${name}؛ أضف مفتاحاً أو قدم خطة صريحة`);
    return {
      name,
      count: rs.length,
      fields,
      primaryKey: [candidate.name],
      unique: [],
      foreignKeys: [],
    };
  });
  for (const t of tables)
    for (const f of t.fields) {
      if (t.primaryKey.includes(f.name) || !f.name.endsWith('_id')) continue;
      const base = f.name.slice(0, -3).toLowerCase();
      const parent = tables.find((p) =>
        [base, base + 's', base + 'es', base.replace(/y$/, 'ies')].includes(p.name.toLowerCase()),
      );
      if (parent && parent !== t) {
        const pk = parent.fields.find((x) => x.name === parent.primaryKey[0])!;
        if (pk.type === f.type)
          t.foreignKeys.push({
            columns: [f.name],
            table: parent.name,
            references: parent.primaryKey,
          });
      }
    }
  const plan: Plan = {
    version: 1,
    domain: 'localized',
    seed: 42,
    tables,
    rules: [],
    assumptions: [
      'تستنتج العلاقات من أسماء *_id والمفاتيح الفريدة؛ العلاقات الملتبسة تتطلب خطة صريحة.',
    ],
  };
  for (const t of tables) {
    const names = t.fields.map((f) => f.name);
    const price = names.includes('unit_price')
      ? 'unit_price'
      : names.includes('price')
        ? 'price'
        : undefined;
    if (price && names.includes('quantity') && names.includes('total')) {
      const discount = names.includes('discount') ? 'discount' : undefined;
      const rates = [...new Set(data[t.name].map((row) => Number(row.tax_rate ?? 0)))];
      if (
        rates.length !== 1 ||
        rates[0] < 0 ||
        rates[0] > 1 ||
        (discount &&
          data[t.name].some((row) => Number(row[discount]) < 0 || Number(row[discount]) > 1))
      )
        continue;
      const rate = rates[0];
      const valid = data[t.name].every((row) => {
        try {
          return new Decimal(String(row.quantity))
            .mul(String(row[price]))
            .mul(new Decimal(1).minus(String(discount ? row[discount] : 0)))
            .mul(new Decimal(1).plus(rate))
            .toDecimalPlaces(2)
            .eq(String(row.total));
        } catch {
          return false;
        }
      });
      if (!valid) continue;
      plan.rules.push({
        kind: 'finance',
        table: t.name,
        quantity: 'quantity',
        price,
        ...(discount ? { discount } : {}),
        taxRate: rate,
        total: 'total',
        taxInclusive: false,
      });
      const product = t.foreignKeys.find((k) =>
        tables.find((p) => p.name === k.table)?.fields.some((f) => f.name === 'price'),
      );
      if (
        product &&
        data[t.name].every((row) => {
          const parent = data[product.table].find(
            (p) => p[product.references[0]] === row[product.columns[0]],
          );
          return parent && new Decimal(String(parent.price)).eq(String(row[price]));
        })
      )
        plan.rules.push({
          kind: 'mirror',
          table: t.name,
          field: price,
          sourceTable: product.table,
          sourceKey: product.references[0],
          foreignKey: product.columns[0],
          sourceField: 'price',
        });
    }
  }
  for (const child of tables) {
    if (!plan.rules.some((r) => r.kind === 'finance' && r.table === child.name)) continue;
    for (const fk of child.foreignKeys) {
      const parent = tables.find((t) => t.name === fk.table)!;
      if (!parent.fields.some((f) => f.name === 'total')) continue;
      const valid = data[parent.name].every((row) =>
        data[child.name]
          .filter((c) => c[fk.columns[0]] === row[fk.references[0]])
          .reduce((sum, c) => sum.plus(String(c.total)), new Decimal(0))
          .eq(String(row.total)),
      );
      if (valid)
        plan.rules.push({
          kind: 'rollup',
          table: parent.name,
          field: 'total',
          childTable: child.name,
          childForeignKey: fk.columns[0],
          parentKey: fk.references[0],
          childField: 'total',
        });
    }
  }
  for (const t of tables) {
    if (!t.fields.some((f) => f.name === 'amount')) continue;
    for (const fk of t.foreignKeys) {
      if (!plan.rules.some((r) => r.kind === 'rollup' && r.table === fk.table)) continue;
      const source = data[fk.table];
      if (
        data[t.name].every(
          (row) =>
            data[t.name].filter((r) => r[fk.columns[0]] === row[fk.columns[0]]).length === 1 &&
            source.some(
              (s) =>
                s[fk.references[0]] === row[fk.columns[0]] &&
                new Decimal(String(s.total)).eq(String(row.amount)),
            ),
        )
      )
        plan.rules.push({
          kind: 'mirror',
          table: t.name,
          field: 'amount',
          sourceTable: fk.table,
          sourceKey: fk.references[0],
          foreignKey: fk.columns[0],
          sourceField: 'total',
        });
    }
  }
  if (plan.rules.length)
    plan.assumptions.push(
      'استنتجت قواعد مالية فقط عندما طابقت جميع حسابات المصدر؛ الخصم نسبة بين صفر وواحد، وتحفظ المعاملة الضريبية الصريحة للمصدر.',
    );
  return plan;
}
