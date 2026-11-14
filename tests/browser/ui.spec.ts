import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { domainPlan } from '../../server/catalog';
const workspace = (page: Page, name: string) => page.locator(`[data-workspace=${name}]`);
// The real backend deliberately limits requests per IP. A fast browser suite shares
// one proxy IP, so leave a full journey's headroom and wait for the real window.
let apiRequests = 0,
  rateWindowStarted = 0;
test.beforeEach(async ({ page }) => {
  const elapsed = Date.now() - rateWindowStarted;
  if (rateWindowStarted && elapsed >= 61000) {
    apiRequests = 0;
    rateWindowStarted = 0;
  }
  if (apiRequests >= 80) {
    test.setTimeout(90000);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 61000 - (Date.now() - rateWindowStarted))),
    );
    apiRequests = 0;
    rateWindowStarted = 0;
  }
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      if (!rateWindowStarted) rateWindowStarted = Date.now();
      apiRequests++;
    }
  });
});

async function downloaded(page: Page, button: any) {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return { bytes: Buffer.concat(chunks), name: download.suggestedFilename() };
}
async function jsonDownload(page: Page, scope: any) {
  await scope.getByText('خيارات التنزيل', { exact: true }).click();
  await scope.getByLabel('الصيغة').selectOption('json');
  return JSON.parse(
    (
      await downloaded(page, scope.getByRole('button', { name: 'تنزيل JSON', exact: true }))
    ).bytes.toString(),
  );
}
async function ready(scope: any) {
  await expect(scope.getByText('اجتازت التحقق', { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(scope.getByRole('button', { name: 'تنزيل Excel', exact: true })).toBeVisible();
}

test('Arabic homepage and mobile navigation remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: /مشروعك يستحق/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'القائمة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'القائمة', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.locator('nav').getByRole('button', { name: 'التوليد السريع' }).click();
  await expect(page.getByRole('heading', { name: 'التوليد السريع', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/quick-upload-mobile.png', fullPage: true });
});

test('Quick Generate uploads, generates and downloads Excel automatically without a plan-confirmation screen', async ({
  page,
}) => {
  let starts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/jobs/generate')) starts++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'لديّ مخطط جاهز' }).click();
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles(path.resolve('examples/contracting.sql'));
  await ready(q);
  expect(starts).toBe(1);
  await expect(q.getByRole('button', { name: 'اعتماد الخطة وتوليد البيانات' })).toHaveCount(0);
  await expect(q.getByLabel('عدد employees')).toBeHidden();
  const result = await downloaded(
    page,
    q.getByRole('button', { name: 'تنزيل Excel', exact: true }),
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(result.bytes as any);
  expect(book.getWorksheet('companies')!.rowCount).toBe(2);
  expect(book.getWorksheet('employees')!.rowCount).toBe(21);
  await page.screenshot({ path: 'test-results/quick-result.png', fullPage: true });
  await page.getByRole('button', { name: 'تنزيلاتي', exact: true }).click();
  const downloads = workspace(page, 'downloads');
  await expect(downloads.getByRole('heading', { name: 'نتائجك المؤقتة' })).toBeVisible();
  await downloads.getByRole('button', { name: 'عرض النتيجة', exact: true }).click();
  await ready(downloads);
});

test('optional advanced counts remain usable and produce a real 100-row download', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'لديّ مخطط جاهز' }).click();
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles(path.resolve('examples/contracting.sql'));
  await ready(q);
  const old = await q.locator('[data-job-id]').getAttribute('data-job-id');
  await q.getByText('إعدادات متقدمة', { exact: true }).click();
  await q.getByLabel('عدد employees').fill('100');
  await q.getByRole('button', { name: 'تطبيق التعديلات وإعادة التوليد' }).click();
  await expect(q.locator('[data-job-id]')).not.toHaveAttribute('data-job-id', old!);
  await ready(q);
  const d = await jsonDownload(page, q);
  expect(d.companies).toHaveLength(1);
  expect(d.employees).toHaveLength(100);
  expect(new Set(d.employees.map((r: any) => r.company_id))).toEqual(new Set([1]));
});

test('localization automatically shows before/after and preserves financial relationships in downloads', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'التوطين السعودي' }).click();
  const l = workspace(page, 'localize');
  await l.locator('input[type=file]').setInputFiles(path.resolve('examples/american.json'));
  await ready(l);
  await expect(l.getByRole('region', { name: 'مقارنة قبل التوطين وبعده' })).toBeVisible();
  await expect(l.getByText('John Smith', { exact: true })).toBeVisible();
  await expect(l.getByLabel('التعامل مع المبالغ')).toBeHidden();
  const d = await jsonDownload(page, l);
  expect(d.employees[0].id).toBe(1);
  expect(d.employees[0].city).toBe('الرياض');
  expect(d.orders[0].total).toBe(d.payments[0].amount);
  await page.screenshot({ path: 'test-results/localization-result.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await l.getByRole('button', { name: 'تنزيل JSON', exact: true }).boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/localization-mobile.png', fullPage: true });
});

test('only a material financial ambiguity asks a question and preserve-amounts recovery works', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'التوطين السعودي' }).click();
  const l = workspace(page, 'localize');
  await l.locator('input[type=file]').setInputFiles({
    name: 'ambiguous.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        products: [{ id: 1, name: 'Keyboard', price: 100, total: 125, currency: 'USD' }],
      }),
    ),
  });
  await expect(l.getByRole('button', { name: 'الحفاظ على المبالغ والمتابعة' })).toBeVisible({
    timeout: 20000,
  });
  await l.getByRole('button', { name: 'الحفاظ على المبالغ والمتابعة' }).click();
  await ready(l);
  await expect(l.getByText('تم الحفاظ على المبالغ والعملات الأصلية.')).toBeVisible();
  const d = await jsonDownload(page, l);
  expect(d.products[0]).toMatchObject({ id: 1, price: 100, total: 125, currency: 'USD' });
});

test('unknown required text asks one plain-language question, with no JSON editing', async ({
  page,
}) => {
  let starts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/jobs/generate')) starts++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'لديّ مخطط جاهز' }).click();
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles({
    name: 'science.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'CREATE TABLE samples(id INTEGER PRIMARY KEY,isotope VARCHAR(8) NOT NULL UNIQUE);',
    ),
  });
  await expect(q.getByRole('heading', { name: 'توضيح واحد لنكمل' })).toBeVisible();
  expect(starts).toBe(0);
  await q.getByLabel('القيم الممكنة').fill('C12، C13، C14');
  await q.getByRole('button', { name: 'متابعة التوليد' }).click();
  await ready(q);
  const d = await jsonDownload(page, q);
  expect(d.samples.map((r: any) => r.isotope)).toEqual(['C12', 'C13', 'C14']);
  expect(starts).toBe(1);
});

test('switching services preserves the result and chat draft without restarting work', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'لديّ مخطط جاهز' }).click();
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles(path.resolve('examples/contracting.sql'));
  await ready(q);
  const id = await q.locator('[data-job-id]').getAttribute('data-job-id');
  await page.locator('nav').getByRole('button', { name: 'التوليد بالمحادثة' }).click();
  const c = workspace(page, 'chat');
  await expect(c.getByText('ما نوع الشركة وكم موظفاً تحتاج؟')).toBeVisible();
  await c.getByRole('button', { name: 'الطلاب والجامعات', exact: true }).click();
  await expect(c.getByText('ما الجامعة وكم طالباً تريد توليده؟')).toBeVisible();
  await c.getByLabel('رسالتك لرصد').fill('جامعة الإمام');
  await page.locator('nav').getByRole('button', { name: 'التوليد السريع' }).click();
  await expect(q.locator('[data-job-id]')).toHaveAttribute('data-job-id', id!);
  await page.locator('nav').getByRole('button', { name: 'التوليد بالمحادثة' }).click();
  await expect(c.getByLabel('رسالتك لرصد')).toHaveValue('جامعة الإمام');
  await expect(c.getByRole('button', { name: 'الطلاب والجامعات', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: 'test-results/chat.png', fullPage: true });
});

test('delayed real session responses cannot replace a different domain', async ({ page }) => {
  await page.route('**/api/sessions', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().domain === 'commerce'
    ) {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ابدأ بالمحادثة', exact: true }).click();
  const c = workspace(page, 'chat');
  await expect(c.getByText('ما نوع الشركة وكم موظفاً تحتاج؟')).toBeVisible();
  await c.getByRole('button', { name: 'التجارة الإلكترونية', exact: true }).click();
  await c.getByRole('button', { name: 'الطلاب والجامعات', exact: true }).click();
  await expect(c.getByText('ما الجامعة وكم طالباً تريد توليده؟')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(c.getByText('ما نوع المتجر وكم عميلاً تحتاج؟')).toHaveCount(0);
  const list = await (await page.request.get('/api/sessions')).json();
  expect(new Set(list.map((s: any) => s.domain))).toEqual(
    new Set(['employees', 'commerce', 'university']),
  );
});

test('an owned stored plan is concise, optional details stay closed and generation still requires explicit approval', async ({
  page,
}) => {
  await page.goto('/');
  await page.request.get('/api/health');
  const session = await (
    await page.request.post('/api/sessions', { data: { domain: 'university' } })
  ).json();
  const plan = domainPlan('university', 7);
  await page.request.put(`/api/sessions/${session.id}/plan`, { data: plan });
  await page.getByRole('button', { name: 'ابدأ بالمحادثة', exact: true }).click();
  const c = workspace(page, 'chat');
  await expect(c.getByText('ما نوع الشركة وكم موظفاً تحتاج؟')).toBeVisible();
  await c.getByRole('button', { name: 'السابقة', exact: true }).click();
  await c.getByRole('button', { name: new RegExp(session.id.slice(0, 8)) }).click();
  await expect(c.getByRole('heading', { name: 'خطة بياناتك' })).toBeVisible();
  await expect(c.getByLabel('عدد students')).toBeHidden();
  expect((await page.request.post(`/api/sessions/${session.id}/generate`)).status()).toBe(409);
  expect((await (await page.request.get('/api/jobs')).json()).length).toBe(0);
  await page.screenshot({ path: 'test-results/chat-plan.png', fullPage: true });
  await c.getByRole('button', { name: 'اعتماد الخطة وتوليد البيانات' }).click();
  await ready(c);
  const d = await jsonDownload(page, c);
  expect(d.students).toHaveLength(7);
  expect(d.universities).toHaveLength(1);
});

test('network retry retrieves the real result without submitting a duplicate generation job', async ({
  page,
}) => {
  let starts = 0,
    failed = false;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/jobs/generate')) starts++;
  });
  await page.route(/\/api\/jobs\/[a-f0-9-]+$/, async (route) => {
    if (route.request().method() === 'GET' && !failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'لديّ مخطط جاهز' }).click();
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles(path.resolve('examples/contracting.sql'));
  await expect(q.getByRole('alert')).toContainText('تعذر الاتصال');
  await q.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await ready(q);
  expect(starts).toBe(1);
});

test('browser back/forward and direct service links work without losing the upload result', async ({
  page,
}) => {
  await page.goto('/#quick');
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles(path.resolve('examples/contracting.sql'));
  await ready(q);
  const id = await q.locator('[data-job-id]').getAttribute('data-job-id');
  await page.locator('nav').getByRole('button', { name: 'التوطين السعودي' }).click();
  await expect(page).toHaveURL(/#localize$/);
  await page.goBack();
  await expect(q.locator('[data-job-id]')).toHaveAttribute('data-job-id', id!);
  await page.goForward();
  await expect(workspace(page, 'localize').getByText('ارفع بياناتك الأجنبية')).toBeVisible();
});

test('a schema that cannot keep its table names in Excel gets a usable JSON default automatically', async ({
  page,
}) => {
  await page.goto('/#quick');
  const q = workspace(page, 'quick');
  const name = 'records_with_a_very_long_table_name';
  await q.locator('input[type=file]').setInputFiles({
    name: 'long-name.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from(`CREATE TABLE ${name}(id INTEGER PRIMARY KEY,name TEXT NOT NULL);`),
  });
  await expect(q.getByRole('button', { name: 'تنزيل JSON', exact: true })).toBeVisible({
    timeout: 20000,
  });
  const result = await downloaded(page, q.getByRole('button', { name: 'تنزيل JSON', exact: true }));
  expect(JSON.parse(result.bytes.toString())[name]).toHaveLength(20);
});

test('quality details, format options and result deletion stay available without cluttering the main flow', async ({
  page,
}) => {
  await page.goto('/#quick');
  const q = workspace(page, 'quick');
  await q.locator('input[type=file]').setInputFiles(path.resolve('examples/contracting.sql'));
  await ready(q);
  await expect(q.getByText('المفاتيح الأساسية والفريدة', { exact: true })).toBeHidden();
  await q.getByText('الدقة والمصادر', { exact: true }).click();
  await q.getByText('نتائج التحقق —', { exact: false }).click();
  await expect(q.getByText('المفاتيح الأساسية والفريدة', { exact: true })).toBeVisible();
  await q.getByText('إدارة النتيجة', { exact: true }).click();
  await q.getByRole('button', { name: 'حذف هذه البيانات المؤقتة', exact: true }).click();
  await expect(q.getByRole('button', { name: 'اختيار الملفات', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/jobs')).json()).length).toBe(0);
});

test('an unsupported salary period offers preservation instead of forcing an incorrect monthly or yearly assumption', async ({
  page,
}) => {
  await page.goto('/#localize');
  const l = workspace(page, 'localize');
  await l.locator('input[type=file]').setInputFiles({
    name: 'payroll.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        employees: [
          { id: 1, name: 'John', salary: 8000, salary_period: 'biweekly', currency: 'USD' },
        ],
      }),
    ),
  });
  await expect(
    l.getByRole('button', { name: 'الحفاظ على المبالغ والمتابعة', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await l.getByRole('button', { name: 'الحفاظ على المبالغ والمتابعة', exact: true }).click();
  await ready(l);
  const d = await jsonDownload(page, l);
  expect(d.employees[0]).toMatchObject({
    id: 1,
    salary: 8000,
    salary_period: 'biweekly',
    currency: 'USD',
  });
});
