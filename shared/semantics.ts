import type { Field } from './schema.js';
export function semantic(f: Field, table = ''): string | undefined {
  if (f.semantic) return f.semantic;
  const n = f.name.toLowerCase();
  if (
    /^(id|.*_id|salary_period|billing_period|price_tax_basis|source_currency|currency_rate)$/.test(
      n,
    )
  )
    return undefined;
  if (/student_?(number|no)/.test(n)) return 'student_number';
  if (/email/.test(n)) return 'email';
  if (/phone|mobile/.test(n)) return 'phone';
  if (/salary|compensation|wage/.test(n)) return 'salary';
  if (/price|cost/.test(n)) return 'price';
  if (/experience/.test(n)) return 'experience';
  if (/currency/.test(n)) return 'currency';
  if (/city/.test(n)) return 'city';
  if (/address/.test(n)) return 'address';
  if (/job_title|occupation|role/.test(n)) return 'title';
  if (/status/.test(n)) return 'status';
  if (/description|notes/.test(n)) return 'description';
  if (/name|title/.test(n)) {
    if (/universit/.test(table)) return 'university';
    if (/facult/.test(table)) return 'faculty';
    if (/major|department/.test(table)) return 'department';
    if (/compan/.test(table)) return 'company';
    if (/service/.test(table)) return 'service';
    if (/product|inventory|equipment/.test(table)) return 'product';
    return 'name';
  }
  return undefined;
}

// Interpret common labels without rewriting the user's original metadata column.
export function periodUnit(value: unknown, fallback = 'unknown'): string {
  if (value === undefined || value === null || value === '') return fallback;
  const label = String(value)
    .toLowerCase()
    .trim()
    .replace(/[\u064b-\u065f\s_/-]/g, '');
  if (['month', 'monthly', 'permonth', 'شهري', 'شهريا'].includes(label)) return 'month';
  if (['year', 'yearly', 'annual', 'annually', 'peryear', 'سنوي', 'سنويا'].includes(label))
    return 'year';
  if (['item', 'each', 'unit'].includes(label)) return 'item';
  return 'unknown';
}
