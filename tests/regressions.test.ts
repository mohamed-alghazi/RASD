import { describe, it, expect } from 'vitest';
import { domainPlan } from '../server/catalog';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
import { checkPlan } from '../shared/schema';

describe('actual record regressions', () => {
  it('commerce uses generic financial rules, including with renamed tables and explicit VAT', () => {
    const p = domainPlan('commerce');
    const names = Object.fromEntries(p.tables.map(t => [t.name, 'demo_' + t.name]));
    for (const t of p.tables) {
      t.name = names[t.name];
      for (const fk of t.foreignKeys) fk.table = names[fk.table];
    }
    for (const r of p.rules) {
      r.table = names[r.table];
      if (r.kind === 'mirror') r.sourceTable = names[r.sourceTable];
      if (r.kind === 'rollup') r.childTable = names[r.childTable];
      if (r.kind === 'finance') r.taxRate = 0.15;
    }
    const data = generate(checkPlan(p));
    expect(validate(p, data).issues).toEqual([]);
    expect(data.demo_products).toHaveLength(50);
    expect(data.demo_order_items[0].unit_price).toBe(data.demo_products[0].price);
    expect(data.demo_payments[0].amount).toBe(data.demo_orders[0].total);
    data.demo_payments[0].amount = '0.01';
    expect(validate(p, data).valid).toBe(false);
  });
  it('accepts an employee plan with a different schema without requiring template tables', () => {
    const p = checkPlan({ version: 1, domain: 'employees', seed: 42,
      tables: [{ name: 'workers', count: 10, primaryKey: ['id'], fields: [{name: 'id',type:'integer'},{name:'name',type:'string',semantic:'name'}] }] });
    expect(validate(p, generate(p)).valid).toBe(true);
  });
  it('preserves explicitly requested salary values', () => {
    const p = domainPlan('employees');
    p.tables.find(t => t.name === 'employees')!.fields.find(f => f.name === 'salary')!.values = [9000];
    const data = generate(p);
    expect(new Set(data.employees.map(r => r.salary))).toEqual(new Set([9000]));
    expect(validate(p, data).valid).toBe(true);
  });
  it('rejects normalized impossible dates and date trailing garbage', () => {
    const p = domainPlan('university');
    for (const invalid of ['2025-02-30', '2025-01-01unexpected', '2025-13-01']) {
      const data = generate(p);
      data.students[0].admission_date = invalid;
      expect(validate(p, data).valid).toBe(false);
    }
    const data = generate(p);
    data.students[0].admission_date = '2024-02-29';
    expect(validate(p, data).valid).toBe(true);
  });
});

describe('fail-closed validation', () => {
  it('rejects a numeric rule targeting a string before generation', () => {
    const p = domainPlan('employees');
    p.rules.push({ kind: 'range', table: 'employees', field: 'name', min: 1, max: 2 });
    expect(() => checkPlan(p)).toThrow();
  });
  it('requires all declared columns even when nullable', () => {
    const p = domainPlan('employees');
    p.tables.find(t => t.name === 'employees')!.fields.find(f => f.name === 'email')!.nullable = true;
    const data = generate(p);
    delete data.employees[0].email;
    expect(validate(p, data).valid).toBe(false);
  });
  it('rejects negative quantities even when totals are internally consistent', () => {
    const p = domainPlan('commerce');
    const data = generate(p);
    data.order_items[0].quantity = -1;
    expect(validate(p, data).issues.some(i => i.message.includes('خصم'))).toBe(true);
  });
});

describe('localization retains occupational meaning', () => {
  it('uses original seniority for salary estimation and never substitutes an unrelated job', async () => {
    const { localize } = await import('../server/localization');
    const { inferPlan } = await import('../server/files');
    const source = { employees: [
      {id:1,job_title:'Project manager',salary:8000,experience:5},
      {id:2,job_title:'Marine biologist',salary:8000,experience:5},
    ] };
    const result = localize(inferPlan(source),source);
    expect(result.data.employees[0].job_title).toBe('مدير مشروع');
    expect(result.data.employees[0].salary).toBe(14300);
    expect(result.data.employees[1].job_title).toBe('Marine biologist');
    expect(result.transforms.some(t=>t.classification==='estimate')).toBe(true);
  });
});
