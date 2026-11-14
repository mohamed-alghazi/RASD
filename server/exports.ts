import { stringify } from 'csv-stringify/sync';
import { zipSync, strToU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { AppError, dependencyOrder, type Dataset, type Plan } from '../shared/schema.js';
import { validate } from './validation.js';
export type Format = 'json' | 'csv' | 'sql' | 'xlsx';
export function safeCell(value: unknown) {
  return typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
}
export async function exportData(
  p: Plan,
  data: Dataset,
  format: Format,
  dialect: 'sqlite' | 'postgres' | 'mysql' = 'sqlite',
) {
  if (!validate(p, data).valid)
    throw new AppError(409, 'INVALID_DATA', 'لا يمكن تصدير بيانات لم تجتز التحقق');
  if (format === 'json')
    return {
      bytes: Buffer.from(JSON.stringify(data, null, 2)),
      type: 'application/json; charset=utf-8',
      name: 'rasd.json',
    };
  if (format === 'csv') {
    const files: Record<string, Uint8Array> = {};
    for (const t of p.tables)
      files[t.name + '.csv'] = strToU8(
        '\uFEFF' +
          stringify(
            data[t.name].map((r) =>
              Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])),
            ),
            { header: true, columns: t.fields.map((f) => f.name) },
          ),
      );
    files['schema.json'] = strToU8(JSON.stringify(p, null, 2));
    files['README.txt'] = strToU8(
      'UTF-8 CSV. Values beginning with formula characters are prefixed with an apostrophe for spreadsheet safety. schema.json contains relationships. CSV has no native null or type information; use JSON for lossless data.',
    );
    return { bytes: Buffer.from(zipSync(files)), type: 'application/zip', name: 'rasd-csv.zip' };
  }
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook();
    for (const t of p.tables) {
      if (t.name.length > 31)
        throw new AppError(400, 'XLSX_NAME', 'اسم الجدول أطول من حد ورقة Excel؛ اختر JSON أو CSV');
      const sheet = book.addWorksheet(t.name);
      sheet.columns = t.fields.map((f) => ({ header: f.name, key: f.name, width: 24 }));
      for (const r of data[t.name])
        sheet.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17634E' } };
      sheet.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }];
    }
    return {
      bytes: Buffer.from(await book.xlsx.writeBuffer()),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      name: 'rasd.xlsx',
    };
  }
  const q = (s: string) =>
    dialect === 'mysql' ? '`' + s.replace(/`/g, '``') + '`' : '"' + s.replace(/"/g, '""') + '"';
  const lit = (v: unknown) =>
    v === null
      ? 'NULL'
      : typeof v === 'number'
        ? String(v)
        : typeof v === 'boolean'
          ? dialect === 'postgres'
            ? v
              ? 'TRUE'
              : 'FALSE'
            : v
              ? '1'
              : '0'
          : "'" + String(v).replace(/'/g, "''") + "'";
  if (
    dialect === 'mysql' &&
    Object.values(data).some((rows) =>
      rows.some((r) => Object.values(r).some((v) => typeof v === 'string' && v.includes('\\'))),
    )
  )
    throw new AppError(
      400,
      'SQL_ESCAPE',
      'استخدم JSON لهذه القيم؛ تصدير MySQL لا يدعم الشرطة المائلة العكسية',
    );
  const lines = ['-- RASD synthetic data. Import into an empty compatible schema.', 'BEGIN;'];
  for (const t of dependencyOrder(p)) {
    for (const row of data[t.name])
      lines.push(
        `INSERT INTO ${q(t.name)} (${t.fields.map((f) => q(f.name)).join(', ')}) VALUES (${t.fields.map((f) => lit(row[f.name])).join(', ')});`,
      );
  }
  lines.push('COMMIT;');
  return {
    bytes: Buffer.from(lines.join('\n')),
    type: 'application/sql; charset=utf-8',
    name: `rasd-${dialect}.sql`,
  };
}
