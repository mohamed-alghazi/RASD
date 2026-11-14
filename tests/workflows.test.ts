import { describe, it, expect } from 'vitest';
import { quickDefaults, missingValues, withFieldValues } from '../client/workflows';
import { parseSql } from '../server/parsers';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
describe('safe defaults and necessary user clarification', () => {
  it('uses a shared company and generates a valid relational dataset without per-table setup', () => {
    const plan = quickDefaults(
      parseSql(
        'CREATE TABLE companies(id INTEGER PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE employees(id INTEGER PRIMARY KEY,company_id INTEGER NOT NULL REFERENCES companies(id),name TEXT NOT NULL);',
      ),
    );
    const d = generate(plan);
    expect(d.companies).toHaveLength(1);
    expect(d.employees).toHaveLength(20);
    expect(validate(plan, d).valid).toBe(true);
    expect(missingValues(plan)).toEqual([]);
  });
  it('asks only for unknown required text, not IDs or nullable/recognized fields', () => {
    const p = parseSql(
      'CREATE TABLE samples(id INTEGER PRIMARY KEY,isotope VARCHAR(8) NOT NULL UNIQUE,notes TEXT,name TEXT);',
    );
    expect(missingValues(p).map((x) => x.field.name)).toEqual(['isotope']);
    const next = withFieldValues(p, 'samples', 'isotope', 'C12، C13, C14');
    expect(next.tables[0].count).toBe(3);
    expect(validate(next, generate(next)).valid).toBe(true);
    expect(p.tables[0].fields[1].values).toBeUndefined();
  });
  it('caps one-to-one child counts and finite unique values without changing the schema', () => {
    const p = quickDefaults(
      parseSql(
        "CREATE TABLE companies(id INTEGER PRIMARY KEY,name TEXT NOT NULL);CREATE TABLE profiles(id INTEGER PRIMARY KEY,company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),status VARCHAR(20) NOT NULL DEFAULT 'active');",
      ),
    );
    expect(p.tables.map((t) => t.count)).toEqual([1, 1]);
    expect(validate(p, generate(p)).valid).toBe(true);
  });
  it('rejects empty or overlong clarification values and leaves server validation authoritative', () => {
    const p = parseSql('CREATE TABLE x(id INTEGER PRIMARY KEY,code VARCHAR(3) NOT NULL);');
    expect(() => withFieldValues(p, 'x', 'code', '')).toThrow();
    expect(() => withFieldValues(p, 'x', 'code', 'four')).toThrow();
  });
});

import { localize } from '../server/localization';
import { inferPlan } from '../server/files';
it.each([
  ['monthly', 11000],
  ['شهرياً', 11000],
  ['annually', 132000],
])('interprets %s without unnecessary questions or rewriting metadata', (period, salary) => {
  const source = {
    employees: [{ id: 1, name: 'John', salary: 10000, experience: 5, salary_period: period }],
  };
  const result = localize(inferPlan(source), source);
  expect(result.data.employees[0].salary).toBe(salary);
  expect(result.data.employees[0].salary_period).toBe(period);
});
