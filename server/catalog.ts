import type { Field, Plan, Table } from '../shared/schema.js';
export const firstNames = [
  'عبدالله',
  'نورة',
  'محمد',
  'سارة',
  'خالد',
  'ريم',
  'عبدالعزيز',
  'لينا',
  'فهد',
  'هند',
  'عمر',
  'الجوهرة',
  'سلطان',
  'مريم',
  'فيصل',
  'أمل',
  'تركي',
  'دانة',
  'إبراهيم',
  'لطيفة',
];
export const families = [
  'القحطاني',
  'العتيبي',
  'الغامدي',
  'الدوسري',
  'الشهري',
  'الحربي',
  'الزهراني',
  'المطيري',
  'العنزي',
  'المالكي',
  'السبيعي',
  'الشمري',
  'التميمي',
  'اليامي',
  'الرشيدي',
  'الجهني',
  'البقمي',
  'السلمي',
  'العمري',
  'الهاجري',
];
export const cities = [
  'الرياض',
  'جدة',
  'الدمام',
  'مكة المكرمة',
  'المدينة المنورة',
  'الخبر',
  'أبها',
  'تبوك',
];
export const titles = [
  'مهندس برمجيات',
  'مهندس مدني',
  'محاسب',
  'مدير مشروع',
  'أخصائي موارد بشرية',
  'محلل أعمال',
  'مصمم منتجات',
  'مهندس كهربائي',
];
export const products = [
  'لوحة مفاتيح لاسلكية',
  'شاشة مكتبية',
  'حقيبة حاسوب',
  'سماعة رأس',
  'مصباح مكتبي',
  'دفتر ملاحظات',
  'كرسي مكتبي',
  'حامل حاسوب',
];
const f = (name: string, type: Field['type'] = 'string', rest: Partial<Field> = {}): Field => ({
  name,
  type,
  nullable: false,
  ...rest,
});
const id = () => f('id', 'integer');
const fk = (name: string, table: string) => ({ columns: [name], table, references: ['id'] });
const table = (
  name: string,
  count: number,
  fields: Field[],
  foreignKeys: Table['foreignKeys'] = [],
  unique: string[][] = [],
): Table => ({ name, count, fields: [id(), ...fields], primaryKey: ['id'], unique, foreignKeys });
export type Domain = 'employees' | 'commerce' | 'university';
export function domainPlan(domain: Domain, count = 100, seed = 42): Plan {
  const base: Plan = {
    version: 1,
    domain,
    seed,
    tables: [],
    rules: [],
    assumptions: [
      'جميع السجلات اصطناعية؛ أرقام الاتصال غير مخصصة للاستخدام الفعلي.',
      'القيم الاقتصادية تقديرات اختبار وليست إحصاءات سوقية رسمية.',
    ],
  };
  if (domain === 'university')
    base.tables = [
      table('universities', 1, [
        f('name', 'string', { values: ['جامعة الإمام محمد بن سعود الإسلامية'] }),
        f('city', 'string', { values: ['الرياض'] }),
      ]),
      table(
        'faculties',
        2,
        [
          f('university_id', 'integer'),
          f('name', 'string', { values: ['كلية الهندسة', 'كلية علوم الحاسب والمعلومات'] }),
        ],
        [fk('university_id', 'universities')],
      ),
      table(
        'departments',
        4,
        [
          f('faculty_id', 'integer'),
          f('name', 'string', {
            values: ['الهندسة المدنية', 'علوم الحاسب', 'الهندسة الكهربائية', 'نظم المعلومات'],
          }),
        ],
        [fk('faculty_id', 'faculties')],
      ),
      table(
        'students',
        count,
        [
          f('university_id', 'integer'),
          f('faculty_id', 'integer'),
          f('department_id', 'integer'),
          f('name', 'string', { semantic: 'name' }),
          f('student_number', 'string', { semantic: 'student_number' }),
          f('admission_date', 'date'),
          f('allowance', 'decimal', { values: [1000], precision: 8, scale: 2 }),
          f('allowance_eligible', 'boolean', { default: true }),
        ],
        [
          fk('university_id', 'universities'),
          fk('faculty_id', 'faculties'),
          fk('department_id', 'departments'),
        ],
        [['student_number']],
      ),
    ];
  if (domain === 'employees') {
    base.tables = [
      table('companies', 1, [
        f('name', 'string', { values: ['شركة آفاق للمقاولات'] }),
        f('city', 'string', { semantic: 'city' }),
      ]),
      table(
        'departments',
        5,
        [
          f('company_id', 'integer'),
          f('name', 'string', {
            values: ['الهندسة', 'المالية', 'التشغيل', 'الموارد البشرية', 'إدارة المشاريع'],
          }),
        ],
        [fk('company_id', 'companies')],
      ),
      table(
        'employees',
        count,
        [
          f('company_id', 'integer'),
          f('department_id', 'integer'),
          f('name', 'string', { semantic: 'name' }),
          f('email', 'string', { semantic: 'email' }),
          f('job_title', 'string', { semantic: 'title' }),
          f('experience', 'integer', { min: 0, max: 20, semantic: 'experience' }),
          f('salary', 'decimal', {
            semantic: 'salary',
            min: 7000,
            max: 25000,
            precision: 10,
            scale: 2,
          }),
          f('birth_date', 'date'),
          f('hire_date', 'date'),
        ],
        [fk('company_id', 'companies'), fk('department_id', 'departments')],
        [['email']],
      ),
      table(
        'projects',
        10,
        [
          f('company_id', 'integer'),
          f('name', 'string', {
            values: ['تطوير البنية التحتية', 'تأهيل المرافق', 'مبنى الإدارة', 'تطوير المستودعات'],
          }),
          f('start_date', 'date'),
          f('end_date', 'date'),
        ],
        [fk('company_id', 'companies')],
      ),
      table(
        'tasks',
        200,
        [
          f('project_id', 'integer'),
          f('employee_id', 'integer'),
          f('title', 'string', {
            values: ['مراجعة المخططات', 'فحص الجودة', 'إعداد تقرير التنفيذ', 'تنسيق التوريد'],
          }),
          f('status', 'string', { values: ['جديد', 'قيد التنفيذ', 'مكتمل'] }),
        ],
        [fk('project_id', 'projects'), fk('employee_id', 'employees')],
      ),
    ];
    base.rules = [
      { kind: 'experience', table: 'employees', field: 'experience', percent: 30, threshold: 5 },
      { kind: 'chronology', table: 'employees', before: 'birth_date', after: 'hire_date' },
      { kind: 'chronology', table: 'projects', before: 'start_date', after: 'end_date' },
    ];
  }
  if (domain === 'commerce') {
    base.tables = [
      table('products', 50, [
        f('name', 'string', { semantic: 'product' }),
        f('price', 'decimal', { semantic: 'price', min: 30, max: 2000, precision: 10, scale: 2 }),
        f('currency', 'string', { values: ['SAR'] }),
      ]),
      table(
        'customers',
        count,
        [
          f('name', 'string', { semantic: 'name' }),
          f('email', 'string', { semantic: 'email' }),
          f('city', 'string', { semantic: 'city' }),
        ],
        [],
        [['email']],
      ),
      table(
        'orders',
        count,
        [
          f('customer_id', 'integer'),
          f('total', 'decimal', { precision: 12, scale: 2 }),
          f('currency', 'string', { values: ['SAR'] }),
        ],
        [fk('customer_id', 'customers')],
      ),
      table(
        'order_items',
        count * 2,
        [
          f('order_id', 'integer'),
          f('product_id', 'integer'),
          f('quantity', 'integer', { min: 1, max: 5 }),
          f('unit_price', 'decimal', { precision: 10, scale: 2 }),
          f('discount', 'decimal', { values: [0.1], precision: 4, scale: 2 }),
          f('total', 'decimal', { precision: 12, scale: 2 }),
        ],
        [fk('order_id', 'orders'), fk('product_id', 'products')],
      ),
      table(
        'payments',
        count,
        [
          f('order_id', 'integer'),
          f('amount', 'decimal', { precision: 12, scale: 2 }),
          f('status', 'string', { values: ['مدفوع'] }),
        ],
        [fk('order_id', 'orders')],
      ),
    ];
    base.rules = [
      { kind: 'mirror', table: 'order_items', field: 'unit_price', sourceTable: 'products', sourceKey: 'id', foreignKey: 'product_id', sourceField: 'price' },
      { kind: 'rollup', table: 'orders', field: 'total', childTable: 'order_items', childForeignKey: 'order_id', parentKey: 'id', childField: 'total' },
      { kind: 'mirror', table: 'payments', field: 'amount', sourceTable: 'orders', sourceKey: 'id', foreignKey: 'order_id', sourceField: 'total' },
      {
        kind: 'finance',
        table: 'order_items',
        quantity: 'quantity',
        price: 'unit_price',
        discount: 'discount',
        taxRate: 0,
        total: 'total',
        taxInclusive: false,
      },
    ];
    base.assumptions.push(
      'لا تضاف ضريبة تلقائياً. يلزم تحديد المعاملة الضريبية ومراجعتها قبل استخدام ضريبة في البيانات.',
    );
  }
  return base;
}
