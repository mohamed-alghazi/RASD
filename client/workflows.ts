import type { Field, Plan } from '../shared/schema';
import { semantic } from '../shared/semantics';

export function quickDefaults(input: Plan): Plan {
  const plan = structuredClone(input);
  for (const t of plan.tables) {
    if (
      /^(companies|company|universities|university|organizations|organisation)$/i.test(t.name) &&
      !t.foreignKeys.length
    )
      t.count = 1;
    for (const key of [t.primaryKey, ...t.unique]) {
      if (key.length !== 1) continue;
      const f = t.fields.find((f) => f.name === key[0])!;
      if (f.values) t.count = Math.min(t.count, new Set(f.values).size);
      else if (f.default !== undefined && f.default !== null) t.count = Math.min(t.count, 1);
      else if (f.type === 'boolean') t.count = Math.min(t.count, 2);
      if (t.primaryKey.includes(f.name) && f.type === 'string' && f.length && f.length < 5)
        t.count = Math.min(t.count, 10 ** f.length - 1);
    }
  }
  // A declared unique FK is one-to-one, so defaults must fit its parent pool.
  for (let pass = 0; pass < plan.tables.length; pass++)
    for (const t of plan.tables)
      for (const fk of t.foreignKeys) {
        if (
          [t.primaryKey, ...t.unique].some(
            (key) => key.length === fk.columns.length && key.every((c) => fk.columns.includes(c)),
          )
        ) {
          const parent = plan.tables.find((p) => p.name === fk.table)!;
          t.count = Math.min(t.count, parent.count);
        }
      }
  return plan;
}
export function missingValues(plan: Plan): { table: string; field: Field }[] {
  return plan.tables.flatMap((t) =>
    t.fields
      .filter(
        (f) =>
          f.type === 'string' &&
          !f.nullable &&
          !f.values &&
          f.default === undefined &&
          !semantic(f, t.name) &&
          !t.primaryKey.includes(f.name) &&
          !t.foreignKeys.some((k) => k.columns.includes(f.name)),
      )
      .map((field) => ({ table: t.name, field })),
  );
}
export function withFieldValues(plan: Plan, table: string, field: string, text: string): Plan {
  const values = [
    ...new Set(
      text
        .split(/[,،\n]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  if (!values.length || values.length > 100)
    throw Error('اكتب قيمة واحدة على الأقل، وحتى 100 قيمة، وافصل بينها بفاصلة.');
  const definition = plan.tables
    .find((t) => t.name === table)!
    .fields.find((f) => f.name === field)!;
  if (definition.length && values.some((v) => v.length > definition.length!))
    throw Error(`كل قيمة يجب ألا تتجاوز ${definition.length} حرفاً.`);
  const next = structuredClone(plan);
  next.tables.find((t) => t.name === table)!.fields.find((f) => f.name === field)!.values = values;
  return quickDefaults(next);
}
export function tableLabel(name: string) {
  return (
    (
      {
        companies: 'الشركات',
        employees: 'الموظفون',
        departments: 'الأقسام',
        universities: 'الجامعات',
        faculties: 'الكليات',
        students: 'الطلاب',
        customers: 'العملاء',
        products: 'المنتجات',
        services: 'الخدمات',
        orders: 'الطلبات',
        order_items: 'تفاصيل الطلبات',
        payments: 'المدفوعات',
        projects: 'المشاريع',
        tasks: 'المهام',
      } as Record<string, string>
    )[name] ?? name
  );
}

export function fieldLabel(name: string) {
  return (
    (
      {
        name: 'الاسم',
        id: 'المعرف',
        salary: 'الراتب',
        price: 'السعر',
        unit_price: 'سعر الوحدة',
        city: 'المدينة',
        experience: 'سنوات الخبرة',
        quantity: 'الكمية',
        total: 'الإجمالي',
        amount: 'المبلغ',
        currency: 'العملة',
        email: 'البريد الإلكتروني',
        phone: 'الهاتف',
        job_title: 'المسمى الوظيفي',
        company_id: 'معرف الشركة',
        department_id: 'معرف القسم',
        job_id: 'معرف الوظيفة',
        customer_id: 'معرف العميل',
        order_id: 'معرف الطلب',
        product_id: 'معرف المنتج',
        student_number: 'الرقم الجامعي',
      } as Record<string, string>
    )[name] ?? name
  );
}
