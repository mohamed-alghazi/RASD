import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';
import ExcelJS from 'exceljs';
import { strToU8, zipSync, unzipSync, strFromU8 } from 'fflate';
import { parse } from 'csv-parse/sync';
import { domainPlan } from '../server/catalog';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
import { exportData, safeCell } from '../server/exports';
import { checkPlan, type Dataset } from '../shared/schema';
import { parseSql, parsePrisma, parseSqlite } from '../server/parsers';
import {
  schemaUpload,
  dataUploads,
  inferPlan,
  unzipBounded,
  localizationLimits,
} from '../server/files';
import { localize } from '../server/localization';
import { relevant, research } from '../server/research';
const sql = `CREATE TABLE companies (id INTEGER PRIMARY KEY, name VARCHAR(80) NOT NULL);
CREATE TABLE employees (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id), name VARCHAR(80) NOT NULL, email VARCHAR(100) NOT NULL UNIQUE, salary DECIMAL(10,2) NOT NULL CHECK (salary >= 7000));`;
describe('A–C actual relational data', () => {
  it('multiple requested distributions share non-overlapping exact allocations', () => {
    const p = domainPlan('employees');
    p.tables
      .find((t) => t.name === 'employees')!
      .fields.find((f) => f.name === 'job_title')!.values = ['مهندس', 'محاسب', 'فني'];
    p.rules.push(
      { kind: 'distribution', table: 'employees', field: 'job_title', value: 'مهندس', percent: 30 },
      { kind: 'distribution', table: 'employees', field: 'job_title', value: 'محاسب', percent: 20 },
    );
    const data = generate(p);
    expect(validate(p, data).issues).toEqual([]);
    expect(data.employees.filter((r) => r.job_title === 'مهندس')).toHaveLength(30);
    expect(data.employees.filter((r) => r.job_title === 'محاسب')).toHaveLength(20);
  });
  it('A one university, two faculties, four majors and 100 students', async () => {
    const p = domainPlan('university'),
      d = generate(p);
    expect(validate(p, d).issues).toEqual([]);
    expect(d.students).toHaveLength(100);
    expect(d.universities).toHaveLength(1);
    expect(new Set(d.students.map((r) => r.university_id))).toEqual(new Set([1]));
    expect(new Set(d.students.map((r) => r.student_number)).size).toBe(100);
    expect(new Set(d.students.map((r) => r.name)).size).toBe(100);
    for (const s of d.students) {
      expect(s.allowance).toBe(1000);
      expect(String(s.student_number)).toMatch(/^445\d{7}$/);
      const dep = d.departments.find((r) => r.id === s.department_id)!;
      expect(dep.faculty_id).toBe(s.faculty_id);
    }
    const file = await exportData(p, d, 'json');
    expect(validate(p, JSON.parse(file.bytes.toString())).valid).toBe(true);
    d.students[0].university_id = 999;
    expect(validate(p, d).valid).toBe(false);
  });
  it('A rejects valid but semantically inconsistent faculty/department references', () => {
    const p = domainPlan('university'),
      d = generate(p);
    d.students[0].faculty_id = 2;
    expect(validate(p, d).issues.some((i) => i.message.includes('سلف'))).toBe(true);
  });
  it('B exact counts, 30% experience, salary progression and parent reuse', () => {
    const p = domainPlan('employees'),
      d = generate(p);
    expect(validate(p, d).issues).toEqual([]);
    expect(Object.values(d).map((r) => r.length)).toEqual([1, 5, 100, 10, 200]);
    expect(d.employees.filter((e) => Number(e.experience) > 5)).toHaveLength(30);
    for (const e of d.employees) expect(Number(e.salary)).toBe(7000 + Number(e.experience) * 800);
    expect(new Set(d.employees.map((e) => e.company_id)).size).toBe(1);
  });
  it('C products/customers/orders/items/payments and exact totals', () => {
    const p = domainPlan('commerce'),
      d = generate(p);
    expect(d.products).toHaveLength(50);
    expect(validate(p, d).issues).toEqual([]);
    d.payments[0].amount = '0.01';
    expect(validate(p, d).valid).toBe(false);
  });
  it('seeded output is reproducible and different seeds change prices', () => {
    const p = domainPlan('commerce');
    expect(generate(p)).toEqual(generate(p));
    expect(generate(p).products).not.toEqual(generate({ ...p, seed: 22 }).products);
  });
  it('critical actual type, uniqueness, numeric and count failures are caught', () => {
    const p = domainPlan('employees'),
      d = generate(p);
    d.employees[1].id = d.employees[0].id;
    d.employees[1].salary = 'NaN';
    d.employees[1].experience = 'oops';
    d.employees.pop();
    expect(validate(p, d).issues.length).toBeGreaterThan(3);
  });
});
describe('E safe schema import and actual insertion', () => {
  it('SQL generates only source columns, inserts into disposable SQLite', async () => {
    const p = parseSql(sql);
    const d = generate(p);
    expect(validate(p, d).issues).toEqual([]);
    expect(Object.keys(d.employees[0]).sort()).toEqual(
      ['id', 'company_id', 'name', 'email', 'salary'].sort(),
    );
    const out = await exportData(p, d, 'sql');
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec('PRAGMA foreign_keys=ON;' + sql);
    db.exec(out.bytes.toString());
    expect(db.exec('SELECT COUNT(*) FROM employees')[0].values[0][0]).toBe(20);
    db.close();
  });
  it('Prisma scalar fields and relations', () => {
    const p = parsePrisma(`model Company {
id Int @id @default(autoincrement())
name String
employees Employee[]
}
model Employee {
id Int @id @default(autoincrement())
company_id Int
name String
company Company @relation(fields: [company_id], references: [id])
}`);
    expect(validate(p, generate(p)).issues).toEqual([]);
    expect(p.tables[1].fields).toHaveLength(3);
  });
  it('SQLite and ZIP inspect real bytes', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(sql);
    const p = await parseSqlite(db.export());
    expect(p.tables).toHaveLength(2);
    db.close();
    const q = await schemaUpload({
      name: 'project.zip',
      bytes: zipSync({ 'db/schema.sql': strToU8(sql), 'README.md': strToU8('documentation') }),
    });
    expect(q.tables).toHaveLength(2);
  });
  it.each([
    'CREATE TABLE x (id INTEGER PRIMARY KEY, amount MONEY);',
    'DROP TABLE employees;',
    'CREATE TABLE x (id INTEGER PRIMARY KEY, price INTEGER, CHECK(price>0));',
    'CREATE TABLE x (id INTEGER PRIMARY KEY) ENGINE=InnoDB;',
  ])('rejects unsupported SQL without silently dropping constraints: %s', (s) =>
    expect(() => parseSql(s)).toThrow(),
  );
  it('unknown required semantic field is disclosed rather than filled', () => {
    const p = parseSql('CREATE TABLE samples (id INTEGER PRIMARY KEY, isotope TEXT NOT NULL);');
    expect(() => generate(p)).toThrow(/isotope/);
  });
  it('composite primary/FK tuples preserve parents', () => {
    const p = parseSql(
      'CREATE TABLE parent (a INTEGER NOT NULL, b INTEGER NOT NULL, PRIMARY KEY(a,b));CREATE TABLE child (id INTEGER PRIMARY KEY, a INTEGER NOT NULL, b INTEGER NOT NULL, FOREIGN KEY(a,b) REFERENCES parent(a,b));',
    );
    expect(validate(p, generate(p)).issues).toEqual([]);
  });
  it('nullable relationships to empty parents are null', () => {
    const p = parseSql(
      'CREATE TABLE parent(id INTEGER PRIMARY KEY);CREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parent(id));',
    );
    p.tables[0].count = 0;
    const d = generate(p);
    expect(d.child[0].parent_id).toBeNull();
    expect(validate(p, d).valid).toBe(true);
  });
});
const american: Dataset = {
  departments: [{ id: 1, name: 'Engineering' }],
  jobs: [{ id: 1, job_title: 'Software engineer' }],
  employees: [
    {
      id: 1,
      department_id: 1,
      job_id: 1,
      name: 'John Smith',
      city: 'New York',
      salary: 8000.5,
      experience: 8,
    },
  ],
  customers: [{ id: 1, name: 'Jane Doe', city: 'Boston' }],
  products: [{ id: 1, name: 'Keyboard', price: 100.5, currency: 'USD' }],
  orders: [{ id: 1, customer_id: 1, total: 180.9, currency: 'USD' }],
  order_items: [
    {
      id: 1,
      order_id: 1,
      product_id: 1,
      quantity: 2,
      unit_price: 100.5,
      discount: 0.1,
      total: 180.9,
    },
  ],
  payments: [{ id: 1, order_id: 1, amount: 180.9, currency: 'USD' }],
};
describe('F actual Saudi localization', () => {
  it('preserves structure/IDs/relations, localizes money and recalculates invoices', async () => {
    const p = inferPlan(american);
    checkPlan(p);
    const result = localize(p, american);
    expect(result.validation.issues).toEqual([]);
    for (const name of Object.keys(american)) {
      expect(result.data[name]).toHaveLength(american[name].length);
      expect(Object.keys(result.data[name][0])).toEqual(Object.keys(american[name][0]));
      expect(result.data[name][0].id).toBe(american[name][0].id);
    }
    expect(result.data.employees[0].name).toMatch(/عبدالله/);
    expect(result.data.employees[0].city).toBe('الرياض');
    expect(result.data.employees[0].salary).toBe(13400);
    expect(result.data.payments[0].amount).toBe(result.data.orders[0].total);
    expect(result.transforms.some((t) => t.classification === 'estimate')).toBe(true);
    expect(american.employees[0].name).toBe('John Smith');
    const out = await exportData(p, result.data, 'json');
    expect(validate(p, JSON.parse(out.bytes.toString())).valid).toBe(true);
  });
  it('currency conversion is explicitly distinguished', () => {
    const data = { employees: [{ id: 1, name: 'John', salary: 8000.25 }] };
    const r = localize(inferPlan(data), data, { currencyRate: 3.75 });
    expect(r.data.employees[0].salary).toBe(30000.94);
    expect(r.transforms.some((t) => t.classification === 'conversion')).toBe(true);
  });
  it('ambiguous finance stops and preserve option succeeds', () => {
    const data = { products: [{ id: 1, name: 'A', price: 100, total: 125 }] };
    const p = inferPlan(data);
    expect(() => localize(p, data)).toThrow();
    expect(localize(p, data, { economic: 'preserve' }).data.products[0].price).toBe(100);
  });
  it('CSV, JSON, XLSX and ZIP data imports handle Arabic and original types', async () => {
    const json = strToU8(JSON.stringify(american));
    expect(Object.keys(await dataUploads([{ name: 'american.json', bytes: json }]))).toHaveLength(
      8,
    );
    const csv = await dataUploads([
      { name: 'people.csv', bytes: strToU8('id,name,city\n1,John,Boston\n') },
    ]);
    expect(csv.people[0].id).toBe('1');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('people');
    sheet.addRow(['id', 'name']);
    sheet.addRow([1, 'نورة']);
    const xlsx = new Uint8Array(await book.xlsx.writeBuffer());
    expect((await dataUploads([{ name: 'people.xlsx', bytes: xlsx }])).people[0].name).toBe('نورة');
    expect(
      (
        await dataUploads([
          { name: 'data.zip', bytes: zipSync({ 'people.csv': strToU8('id,name\n1,John') }) },
        ])
      ).people,
    ).toHaveLength(1);
  });
});
describe('G relevant and transparent research', () => {
  it('rejects railway content for payment/tax and accepts relevant Saudi tax', () => {
    expect(
      relevant(
        {
          title: 'Saudi railway stations',
          content: 'Saudi railway passenger transport and stations',
          url: 'https://sar.com.sa',
        },
        'tax',
      ),
    ).toBe(false);
    expect(
      relevant(
        {
          title: 'Saudi VAT',
          content: 'Saudi Arabia value added tax',
          url: 'https://zatca.gov.sa',
        },
        'tax',
      ),
    ).toBe(true);
    expect(
      relevant(
        { title: 'US salaries', content: 'salary in New York', url: 'https://example.com' },
        'salary',
      ),
    ).toBe(false);
  });
  it('missing credentials never fabricate evidence', async () => {
    const old = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    const r = await research('salary', 'salary', 'engineering');
    expect(r.status).toBe('unconfigured');
    expect(r.evidence).toEqual([]);
    if (old) process.env.TAVILY_API_KEY = old;
  });
});
describe('H resource limits and malicious inputs', () => {
  it('bounds rows at 10000/table, 20000/dataset and cells', () => {
    const p = parseSql('CREATE TABLE records(id INTEGER PRIMARY KEY);');
    p.tables[0].count = 10000;
    expect(checkPlan(p).tables[0].count).toBe(10000);
    expect(generate(p).records).toHaveLength(10000);
    p.tables[0].count = 10001;
    expect(() => checkPlan(p)).toThrow();
    const q = domainPlan('university');
    q.tables[3].count = 10000;
    expect(() => checkPlan(q)).not.toThrow();
    q.tables[3].fields = Array.from({ length: 30 }, (_, i) => ({
      name: 'f' + i,
      type: 'integer' as const,
      nullable: false,
    }));
    q.tables[3].primaryKey = ['f0'];
    q.tables[3].foreignKeys = [];
    q.tables[3].unique = [];
    expect(() => checkPlan(q)).toThrow();
  });
  it('localization at limit and above', () => {
    const data = { rows: Array.from({ length: 10000 }, (_, i) => ({ id: i })) };
    expect(() => localizationLimits(data)).not.toThrow();
    data.rows.push({ id: 10000 });
    expect(() => localizationLimits(data)).toThrow();
  });
  it('rejects traversal, compression bombs, corrupt bytes and cycles', () => {
    expect(() => unzipBounded(zipSync({ '../secret.csv': strToU8('id\n1') }), 10000)).toThrow();
    expect(() => unzipBounded(zipSync({ 'large.txt': new Uint8Array(200000) }), 1000)).toThrow();
    expect(() => unzipBounded(new Uint8Array([1, 2, 3]), 1000)).toThrow();
    const p = parseSql('CREATE TABLE t(id INTEGER PRIMARY KEY, parent_id INTEGER);');
    p.tables[0].foreignKeys = [{ columns: ['parent_id'], table: 't', references: ['id'] }];
    expect(() => checkPlan(p)).toThrow(/دورة/);
  });
  it('rejects malformed JSON, nested cell objects and duplicate keys', async () => {
    await expect(dataUploads([{ name: 'x.json', bytes: strToU8('{') }])).rejects.toThrow();
    await expect(
      dataUploads([{ name: 'x.json', bytes: strToU8('[{"id":1,"x":{}}]') }]),
    ).rejects.toThrow();
    expect(() => inferPlan({ x: [{ id: 1 }, { id: 1 }] })).toThrow();
  });
  it('standalone and combined upload byte limits are enforced', async () => {
    await expect(
      schemaUpload({ name: 'x.sql', bytes: new Uint8Array(4 * 1024 * 1024 + 1) }),
    ).rejects.toThrow();
    await expect(
      dataUploads([{ name: 'x.json', bytes: new Uint8Array(10 * 1024 * 1024 + 1) }]),
    ).rejects.toThrow();
  });
});
describe('J exported bytes are inspected', () => {
  it('CSV ZIP contains every table, correct counts and relationship manifest', async () => {
    const p = domainPlan('university'),
      d = generate(p);
    const zip = unzipSync((await exportData(p, d, 'csv')).bytes);
    expect(Object.keys(zip)).toHaveLength(6);
    expect(JSON.parse(strFromU8(zip['schema.json'])).tables).toHaveLength(4);
    for (const t of p.tables) {
      const r = parse(strFromU8(zip[t.name + '.csv']), { columns: true, bom: true });
      expect(r).toHaveLength(t.count);
    }
    const students = parse(strFromU8(zip['students.csv']), { columns: true, bom: true });
    expect(new Set(students.map((s: any) => s.university_id))).toEqual(new Set(['1']));
  });
  it('XLSX roundtrip preserves rows and Arabic values', async () => {
    const p = domainPlan('university'),
      d = generate(p);
    const out = await exportData(p, d, 'xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(out.bytes as any);
    expect(book.getWorksheet('students')!.rowCount).toBe(101);
    expect(book.getWorksheet('universities')!.getRow(2).getCell(2).value).toBe(
      'جامعة الإمام محمد بن سعود الإسلامية',
    );
  });
  it('CSV formula defense, SQL quote escaping, export blocks invalid actual data', async () => {
    expect(safeCell('=cmd()')).toBe("'=cmd()");
    expect(safeCell(' +1')).toBe("' +1");
    const p = domainPlan('employees'),
      d = generate(p);
    delete p.tables[0].fields[1].values;
    d.companies[0].name = "O'Brien; DROP TABLE employees; --";
    const out = await exportData(p, d, 'sql');
    expect(out.bytes.toString()).toContain("O''Brien");
    d.employees[0].company_id = 999;
    await expect(exportData(p, d, 'json')).rejects.toThrow();
  });
});
