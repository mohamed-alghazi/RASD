import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError, checkPlan, fail, type Plan } from '../shared/schema.js';
import { Store, type Job } from './store.js';
import { aiTurn } from './ai.js';
import { aiStatus } from './provider.js';
import { schemaUpload, dataUploads, inferPlan, type Upload } from './files.js';
import { generate } from './generator.js';
import { validate } from './validation.js';
import { exportData } from './exports.js';
import { localize } from './localization.js';
import {
  researchBenchmarks,
  applyBenchmarks,
  validateBenchmarkApplications,
  type BenchmarkResearch,
} from './benchmarks.js';
declare module 'fastify' {
  interface FastifyRequest {
    owner: string;
  }
}
const id = z.string().uuid();
export async function createApp(
  options: { dir?: string; logger?: boolean; ai?: typeof aiTurn } = {},
) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 12 * 1024 * 1024,
    requestTimeout: 120000,
  });
  const store = new Store(options.dir);
  await store.init();
  let active = 0;
  const busyChats = new Set<string>();
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(multipart, {
    limits: { files: 10, fileSize: 20 * 1024 * 1024, fields: 5, parts: 15 },
  });
  app.decorateRequest('owner', '');
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api')) return;
    reply.header('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    const configured = process.env.PUBLIC_ORIGIN;
    const expected = configured ?? `${req.protocol}://${req.headers.host}`;
    if (origin && origin !== expected) throw new AppError(403, 'ORIGIN', 'مصدر الطلب غير مسموح');
    const existing = req.cookies.rasd_owner;
    req.owner =
      existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex');
    if (req.owner !== existing)
      reply.setCookie('rasd_owner', req.owner, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 86400,
      });
  });
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError)
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION',
          message:
            'طلب غير صالح: ' +
            err.issues
              .map((i: any) => i.path.join('.') + ' ' + i.message)
              .slice(0, 5)
              .join('؛ '),
        },
      });
    if (err.statusCode === 429)
      return reply.code(429).send({
        error: { code: 'RATE_LIMIT', message: 'طلبات كثيرة؛ انتظر قليلاً ثم أعد المحاولة.' },
      });
    if (err.statusCode === 413 || err.code?.startsWith('FST_REQ_FILE'))
      return reply
        .code(413)
        .send({ error: { code: 'RESOURCE_LIMIT', message: 'تجاوز الملف الحد المسموح' } });
    if (err instanceof SyntaxError || err.code?.startsWith('FST_ERR_CTP'))
      return reply
        .code(400)
        .send({ error: { code: 'MALFORMED_INPUT', message: 'محتوى الطلب غير صالح' } });
    req.log.error({ err: { name: err.name, code: err.code } }, 'operation failed');
    return reply.code(500).send({
      error: { code: 'INTERNAL', message: 'تعذرت العملية. تحقق من الملف وأعد المحاولة.' },
    });
  });
  async function uploads(req: any) {
    const files: Upload[] = [];
    let total = 0;
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const bytes = await part.toBuffer();
      if (part.file.truncated) throw new AppError(413, 'RESOURCE_LIMIT', 'ملف كبير');
      total += bytes.length;
      if (total > 20 * 1024 * 1024)
        throw new AppError(413, 'RESOURCE_LIMIT', 'تجاوز الحجم الإجمالي');
      files.push({ name: part.filename, bytes });
    }
    if (!files.length) fail('اختر ملفاً');
    return files;
  }
  const jobPublic = (j: Job) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    phase: j.phase,
    progress: j.progress,
    created: j.created,
    expires: j.expires,
    error: j.error,
    errorCode: j.errorCode,
    durationMs: j.durationMs,
    outputBytes: j.outputBytes,
    plan: j.plan,
  });
  function reserve() {
    if (active >= 2)
      throw new AppError(429, 'BUSY', 'توجد مهمتان قيد التنفيذ. أعد المحاولة بعد انتهائهما.');
    active++;
  }
  function run(j: Job, work: (job: Job) => Promise<void>) {
    setImmediate(async () => {
      const start = Date.now();
      try {
        j.status = 'running';
        j.phase = 'تحليل القواعد والمصادر';
        j.progress = 15;
        await store.save('job', j);
        await work(j);
        if ((j.status as string) === 'cancelled') return;
        if (!j.validation?.valid) throw new AppError(422, 'INVALID_DATA', 'فشل التحقق من البيانات');
        j.durationMs = Date.now() - start;
        j.outputBytes = Buffer.byteLength(JSON.stringify(j.data));
        j.phase = 'اكتمل التحقق';
        j.progress = 100;
        // Report completion only after the final dataset and audit are durable.
        await store.save('job', { ...j, status: 'complete' });
        j.status = 'complete';
      } catch (e) {
        if ((j.status as string) !== 'cancelled') {
          j.status = 'failed';
          j.phase = 'توقفت المعالجة';
          j.error = e instanceof AppError ? e.message : 'تعذرت معالجة البيانات بأمان';
          j.errorCode = e instanceof AppError ? e.code : 'INTERNAL';
          await store.save('job', j);
        }
      } finally {
        active--;
      }
    });
  }
  async function startGeneration(owner: string, plan: Plan) {
    reserve();
    let j;
    try {
      j = await store.newJob(owner, 'generation', plan);
    } catch (e) {
      active--;
      throw e;
    }
    run(j, async (j) => {
      j.data = generate(plan);
      if (!validate(plan, j.data).valid)
        throw new AppError(422, 'INVALID_DATA', 'فشل تحقق البيانات قبل البحث');
      const context = structuredClone(j.data);
      j.research = await researchBenchmarks(plan, context);
      if (j.status === 'cancelled') return;
      j.phase = 'توليد السجلات المترابطة';
      j.progress = 50;
      await store.save('job', j);
      const applications = applyBenchmarks(plan, j.data!, context, j.research as BenchmarkResearch);
      validateBenchmarkApplications(j.data!, j.research as BenchmarkResearch);
      j.transforms = applications
        .filter((a) => a.changedRows > 0)
        .map((a) => ({
          ...a,
          method: `${a.classification === 'observed-price' ? 'سعر عرض مرصود' : 'تقدير مقيد بنطاق مرصود؛ فروق الخبرة تقديرية'}: ${a.changedRows} سجل · ${a.sourceUrl}`,
        }));
      j.warnings = (j.research as BenchmarkResearch).limitations;
      j.phase = 'التحقق من البيانات الفعلية';
      j.progress = 85;
      j.validation = validate(plan, j.data);
    });
    return jobPublic(j);
  }
  app.get('/api/health', async () => ({
    status: 'ok',
    aiConfigured: aiStatus().configured,
    ai: aiStatus(),
    researchConfigured: !!process.env.TAVILY_API_KEY,
    activeJobs: active,
    concurrencyScope: 'process',
    maxConcurrentJobs: 2,
  }));
  app.get('/api/sessions', async (req) => store.listChats(req.owner));
  app.post('/api/sessions', async (req, reply) => {
    const body = z
      .object({ domain: z.enum(['employees', 'commerce', 'university']) })
      .strict()
      .parse(req.body);
    const c = await store.newChat(req.owner, body.domain);
    reply.code(201);
    return { ...c, owner: undefined };
  });
  app.get('/api/sessions/:id', async (req) => {
    const c = store.chat(id.parse((req.params as any).id), req.owner);
    return { ...c, owner: undefined };
  });
  app.post(
    '/api/sessions/:id/messages',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const c = store.chat(id.parse((req.params as any).id), req.owner);
      const body = z
        .object({ message: z.string().trim().min(1).max(4000) })
        .strict()
        .parse(req.body);
      if (busyChats.has(c.id)) throw new AppError(409, 'CHAT_BUSY', 'انتظر الرد الحالي');
      if (c.messages.length >= 100) fail('وصلت المحادثة إلى حد 100 رسالة؛ ابدأ محادثة جديدة');
      busyChats.add(c.id);
      try {
        const { result, plan } = await (options.ai ?? aiTurn)(c, body.message);
        c.messages.push(
          { role: 'user', content: body.message },
          { role: 'assistant', content: result.reply },
        );
        c.requirements = result.requirements;
        c.plan = plan;
        c.approved = false;
        c.revision++;
        await store.save('chat', c);
        return { ...c, owner: undefined };
      } finally {
        busyChats.delete(c.id);
      }
    },
  );
  app.put('/api/sessions/:id/plan', async (req) => {
    const c = store.chat(id.parse((req.params as any).id), req.owner);
    if (busyChats.has(c.id)) throw new AppError(409, 'CHAT_BUSY', 'انتظر الرد الحالي');
    const plan = checkPlan(req.body);
    if (plan.domain !== c.domain) fail('لا يمكن تغيير مجال المحادثة');
    c.plan = plan;
    c.approved = false;
    c.revision++;
    await store.save('chat', c);
    return { ...c, owner: undefined };
  });
  app.post('/api/sessions/:id/approve', async (req) => {
    const c = store.chat(id.parse((req.params as any).id), req.owner);
    const { revision } = z.object({ revision: z.number().int() }).strict().parse(req.body);
    if (busyChats.has(c.id) || revision !== c.revision || !c.plan)
      throw new AppError(409, 'STALE_PLAN', 'راجع أحدث خطة أولاً');
    c.approved = true;
    await store.save('chat', c);
    return { approved: true, revision: c.revision };
  });
  app.post('/api/sessions/:id/generate', async (req) => {
    const c = store.chat(id.parse((req.params as any).id), req.owner);
    if (!c.plan || !c.approved || busyChats.has(c.id))
      throw new AppError(409, 'APPROVAL_REQUIRED', 'اعتمد الخطة الحالية أولاً');
    return startGeneration(req.owner, c.plan);
  });
  app.post('/api/schema/inspect', async (req) => {
    reserve();
    try {
      const files = await uploads(req);
      if (files.length !== 1) fail('ارفع ملف مخطط واحداً');
      return await schemaUpload(files[0]);
    } finally {
      active--;
    }
  });
  app.post('/api/plans/validate', async (req) => ({ valid: true, plan: checkPlan(req.body) }));
  app.post('/api/jobs/generate', async (req) => startGeneration(req.owner, checkPlan(req.body)));
  app.post('/api/localization/inspect', async (req) => {
    reserve();
    try {
      const files = await uploads(req);
      const data = await dataUploads(files);
      const plan = inferPlan(data);
      return { plan, data, warnings: plan.assumptions };
    } finally {
      active--;
    }
  });
  app.post('/api/jobs/localize', async (req) => {
    const body = z
      .object({
        plan: z.unknown(),
        data: z.record(
          z.string(),
          z.array(
            z.record(
              z.string(),
              z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]),
            ),
          ),
        ),
        options: z
          .object({
            economic: z.enum(['preserve', 'estimate']).optional(),
            currencyRate: z.number().positive().max(10000).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .parse(req.body);
    const plan = checkPlan(body.plan);
    const { localizationLimits } = await import('./files.js');
    localizationLimits(body.data);
    if (!validate(plan, body.data).valid)
      fail('البيانات المصدر لا تطابق الخطة؛ راجع العلاقات والأنواع');
    reserve();
    let j;
    try {
      j = await store.newJob(req.owner, 'localization', plan);
    } catch (e) {
      active--;
      throw e;
    }
    run(j, async (j) => {
      j.research =
        body.options?.economic === 'preserve' || body.options?.currencyRate
          ? ({
              status: 'not-needed',
              evidence: [],
              rules: [],
              applications: [],
              limitations: [],
            } as BenchmarkResearch)
          : await researchBenchmarks(plan, body.data);
      if (j.status === 'cancelled') return;
      j.before = body.data;
      j.progress = 50;
      j.phase = 'توطين القيم مع حفظ المفاتيح';
      await store.save('job', j);
      const result = localize(plan, body.data, body.options, j.research as BenchmarkResearch);
      j.data = result.data;
      j.validation = result.validation;
      j.transforms = result.transforms;
      j.warnings = result.warnings;
    });
    return jobPublic(j);
  });
  app.get('/api/jobs', async (req) => store.listJobs(req.owner).map(jobPublic));
  app.get('/api/jobs/:id', async (req) =>
    jobPublic(store.job(id.parse((req.params as any).id), req.owner)),
  );
  app.get('/api/jobs/:id/preview', async (req) => {
    const j = store.job(id.parse((req.params as any).id), req.owner);
    if (j.status !== 'complete') throw new AppError(409, 'NOT_READY', 'النتيجة غير جاهزة');
    return {
      tables: j.plan.tables.map((t) => ({
        name: t.name,
        count: t.count,
        fields: t.fields,
        foreignKeys: t.foreignKeys,
        rows: j.data![t.name].slice(0, 20),
        before: j.before?.[t.name].slice(0, 20),
      })),
      transforms: j.transforms,
      warnings: j.warnings,
    };
  });
  app.get(
    '/api/jobs/:id/validation',
    async (req) =>
      store.job(id.parse((req.params as any).id), req.owner).validation ?? {
        valid: false,
        checks: [],
        issues: [],
      },
  );
  app.get(
    '/api/jobs/:id/research',
    async (req) =>
      store.job(id.parse((req.params as any).id), req.owner).research ?? {
        status: 'not-needed',
        evidence: [],
      },
  );
  app.get('/api/jobs/:id/download', async (req, reply) => {
    const j = store.job(id.parse((req.params as any).id), req.owner);
    if (j.status !== 'complete' || !j.data)
      throw new AppError(409, 'NOT_READY', 'النتيجة غير جاهزة');
    const query = z
      .object({
        format: z.enum(['json', 'csv', 'sql', 'xlsx']).default('json'),
        dialect: z.enum(['sqlite', 'postgres', 'mysql']).default('sqlite'),
      })
      .strict()
      .parse(req.query);
    if (j.research && 'applications' in j.research)
      validateBenchmarkApplications(j.data, j.research as BenchmarkResearch);
    const out = await exportData(j.plan, j.data, query.format, query.dialect);
    return reply
      .type(out.type)
      .header('Content-Disposition', `attachment; filename="${out.name}"`)
      .send(out.bytes);
  });
  app.post('/api/jobs/:id/cancel', async (req) => {
    const j = store.job(id.parse((req.params as any).id), req.owner);
    if (['running', 'pending'].includes(j.status)) {
      j.status = 'cancelled';
      j.phase = 'ألغيت المهمة';
      await store.save('job', j);
    }
    return jobPublic(j);
  });
  app.delete('/api/jobs/:id', async (req) => {
    const j = store.job(id.parse((req.params as any).id), req.owner);
    if (['pending', 'running'].includes(j.status))
      throw new AppError(409, 'RUNNING', 'ألغ المهمة وانتظر توقفها أولاً');
    await store.remove(j.id, req.owner);
    return { deleted: true };
  });
  const cleanup = setInterval(() => store.cleanup().catch(() => {}), 60000);
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
  });
  if (process.env.NODE_ENV === 'production') {
    await app.register(serveStatic, { root: path.resolve('dist/client'), prefix: '/' });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/')
        ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'المسار غير موجود' } })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
