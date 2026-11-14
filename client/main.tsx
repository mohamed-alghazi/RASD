import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpLeft,
  ArrowUp,
  ArrowLeft,
  Braces,
  Database,
  Globe2,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Zap,
  Menu,
  X,
  Layers,
  Check,
  ChevronLeft,
  History,
} from 'lucide-react';
import { periodUnit } from '../shared/semantics';
import { quickDefaults, missingValues, withFieldValues, tableLabel } from './workflows';
import type { Plan } from '../shared/schema';
import { api, post } from './api';
import {
  Busy,
  Disclosure,
  ErrorBox,
  JobResult,
  PlanView,
  PlanEditor,
  Upload,
  Downloads,
} from './components';
import './style.css';
import './theme.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
type Service = 'home' | 'chat' | 'quick' | 'localize' | 'downloads';
const services = [
  {
    key: 'chat' as Service,
    n: '01',
    icon: MessageSquare,
    title: 'التوليد بالمحادثة',
    en: 'AI CONVERSATION',
    description: 'صف فكرتك. ودع رصد يحوّلها إلى جداول مترابطة، وبيانات تفهم سياق مشروعك.',
    tag: 'من الفكرة إلى البيانات',
  },
  {
    key: 'quick' as Service,
    n: '02',
    icon: Zap,
    title: 'التوليد السريع',
    en: 'SCHEMA TO DATA',
    description: 'ارفع مخططك. نحلله ونولّد بيانات جاهزة تلقائياً.',
    tag: 'متوافق مع مخططك',
  },
  {
    key: 'localize' as Service,
    n: '03',
    icon: Globe2,
    title: 'التوطين السعودي',
    en: 'MADE FOR SAUDI',
    description: 'امنح بياناتك سياقاً سعودياً. أسماء، مدن، وقيم اقتصادية مع حفظ العلاقات.',
    tag: 'سياق محلي، دقة أعلى',
  },
];
function serviceFromHash(): Service {
  const value = window.location.hash.slice(1);
  return ['chat', 'quick', 'localize', 'downloads'].includes(value) ? (value as Service) : 'home';
}
function App() {
  const [page, setPage] = useState<Service>(serviceFromHash),
    [menu, setMenu] = useState(false),
    [health, setHealth] = useState<any>(null),
    [visited, setVisited] = useState<Service[]>(() =>
      Array.from(new Set<Service>(['home', serviceFromHash()])),
    );
  useEffect(() => {
    api('/health')
      .then(setHealth)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const changed = () => {
      const s = serviceFromHash();
      setPage(s);
      setVisited((v) => (v.includes(s) ? v : [...v, s]));
      setMenu(false);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  function navigate(s: Service) {
    if (window.location.hash !== '#' + s) window.history.pushState(null, '', '#' + s);
    setVisited((v) => (v.includes(s) ? v : [...v, s]));
    setPage(s);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return (
    <div className="app">
      <header className="site-header">
        <button className="brand" aria-label="رصد الرئيسية" onClick={() => navigate('home')}>
          <img className="brand-mark" src="/rasd-mark.svg" alt="" width="52" height="52" />
          <span className="brand-wordmark">
            <strong lang="ar">رصد</strong>
            <span lang="en" dir="ltr">
              RASD
            </span>
          </span>
        </button>
        <nav id="main-nav" className={menu ? 'open' : ''}>
          <button className={page === 'home' ? 'selected' : ''} onClick={() => navigate('home')}>
            الرئيسية
          </button>
          {services.map((s) => (
            <button
              key={s.key}
              aria-current={page === s.key ? 'page' : undefined}
              className={page === s.key ? 'selected' : ''}
              onClick={() => navigate(s.key)}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="header-end">
          <button className="text-button" onClick={() => navigate('downloads')}>
            <History size={15} />
            تنزيلاتي
          </button>
          <span className="saudi-dot" /> صُنع للسياق السعودي{' '}
          <button
            className="menu-button"
            aria-label="القائمة"
            aria-controls="main-nav"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <div hidden={page !== 'home'}>
        <Home onNavigate={navigate} />
      </div>
      <main className="workspace" hidden={page === 'home'}>
        <div className="workspace-heading">
          <h1>{services.find((s) => s.key === page)?.title ?? 'تنزيلاتي'}</h1>
          <p>
            {page === 'chat'
              ? 'حوار بسيط. خطة واضحة. بيانات مترابطة بعد اعتمادك.'
              : page === 'quick'
                ? 'ارفع مخططك، وسنتولى التحليل والتوليد والتحقق.'
                : page === 'downloads'
                  ? 'استرجع مهام هذا المتصفح، وافحص النتائج أو نزّلها قبل انتهاء صلاحيتها.'
                  : 'ارفع بياناتك. نتولى التحليل والبحث والتوطين، مع حفظ العلاقات.'}
          </p>
        </div>
        {visited.includes('chat') && (
          <section hidden={page !== 'chat'} data-workspace="chat">
            <Chat configured={health?.aiConfigured} />
          </section>
        )}
        {visited.includes('quick') && (
          <section hidden={page !== 'quick'} data-workspace="quick">
            <Quick />
          </section>
        )}
        {visited.includes('localize') && (
          <section hidden={page !== 'localize'} data-workspace="localize">
            <Localization />
          </section>
        )}
        {visited.includes('downloads') && (
          <section hidden={page !== 'downloads'} data-workspace="downloads">
            <Downloads active={page === 'downloads'} />
          </section>
        )}
      </main>
      <footer>
        <div className="footer-brand">
          رصد <span>بيانات تفهم مشروعك.</span>
        </div>
        <span>بيانات اصطناعية · خصوصية أولاً · سياق سعودي</span>
        <small>RASD © {new Date().getFullYear()}</small>
      </footer>
    </div>
  );
}
function Home({ onNavigate }: { onNavigate: (s: Service) => void }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-copy">
          <div className="hero-badge">
            <span /> بيانات اصطناعية. واقعية بلا تعقيد.
          </div>
          <h1>
            مشروعك يستحق
            <br />
            بيانات <em>تفهمه.</em>
          </h1>
          <p>
            من فكرتك إلى قاعدة بيانات تنبض بالواقع.
            <br />
            ولّد بيانات مترابطة، دقيقة، ومصممة للسياق السعودي.
          </p>
          <div className="hero-actions">
            <button className="primary large" onClick={() => onNavigate('chat')}>
              ابدأ بالمحادثة <ArrowUpLeft size={19} />
            </button>
            <button className="secondary large" onClick={() => onNavigate('quick')}>
              <Braces size={19} /> لديّ مخطط جاهز
            </button>
          </div>
          <button className="text-button" onClick={() => onNavigate('localize')}>
            لديّ بيانات أجنبية وأريد توطينها <ArrowUpLeft size={16} />
          </button>
          <div className="hero-notes">
            <span>
              <Check size={15} /> علاقات صحيحة
            </span>
            <span>
              <Check size={15} /> توليد قابل للتكرار
            </span>
            <span>
              <Check size={15} /> بياناتك في أمان
            </span>
          </div>
        </div>
        <div className="hero-art" aria-label="رسم توضيحي لجداول مترابطة">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-tag">
            <span /> العلاقات متسقة
          </div>
          <div className="diagram-line line-one" />
          <div className="diagram-line line-two" />
          <div className="mini-table table-company">
            <div>
              <Database size={14} />
              <code>companies</code>
              <span>01</span>
            </div>
            <p>
              <i>PK</i>
              <code>id</code>
              <b>1</b>
            </p>
            <p>
              <code>name</code>
              <b>شركة آفاق</b>
            </p>
          </div>
          <div className="mini-table table-employees">
            <div>
              <Database size={14} />
              <code>employees</code>
              <span>100</span>
            </div>
            <p>
              <i>PK</i>
              <code>id</code>
              <b>1042</b>
            </p>
            <p>
              <code>name</code>
              <b>نورة القحطاني</b>
            </p>
            <p>
              <i>FK</i>
              <code>company_id</code>
              <b>1</b>
            </p>
            <p>
              <code>city</code>
              <b>الرياض</b>
            </p>
          </div>
          <div className="mini-table table-departments">
            <div>
              <Database size={14} />
              <code>departments</code>
              <span>05</span>
            </div>
            <p>
              <i>PK</i>
              <code>id</code>
              <b>3</b>
            </p>
            <p>
              <code>name</code>
              <b>الهندسة</b>
            </p>
          </div>
          <div className="verified-note">
            <ShieldCheck size={22} />
            <div>
              <strong>الدقة تبدأ من العلاقات.</strong>
              <small>رسم توضيحي · يتأكد رصد من كل مرجع</small>
            </div>
          </div>
          <div className="art-caption">BUILT ON CONTEXT. CONNECTED BY DESIGN.</div>
        </div>
      </section>
      <section className="service-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ثلاث طرق. نتيجة واحدة.</span>
            <h2>ابدأ من حيث وصل مشروعك.</h2>
          </div>
          <p>اختر المسار المناسب، ودع التفاصيل لرصد.</p>
        </div>
        <div className="service-cards">
          {services.map((s) => (
            <button
              className={'service-card service-' + s.key}
              key={s.key}
              onClick={() => onNavigate(s.key)}
            >
              <div className="card-top">
                <span className="service-icon">
                  <s.icon size={24} />
                </span>
                <span className="card-number">{s.n}</span>
              </div>
              <small>{s.en}</small>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              <div className="card-bottom">
                <span>{s.tag}</span>
                <ArrowUpLeft size={21} />
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="trust-strip">
        <div>
          <Layers size={22} />
          <span>
            <strong>البنية قبل السجلات</strong>
            <small>نفهم الجداول والعلاقات أولاً</small>
          </span>
        </div>
        <div>
          <ShieldCheck size={22} />
          <span>
            <strong>نتحقق من الناتج الفعلي</strong>
            <small>مفاتيح، حدود، وقواعد منطقية</small>
          </span>
        </div>
        <div>
          <Globe2 size={22} />
          <span>
            <strong>السياق السعودي حاضر</strong>
            <small>افتراضات واضحة، ومصادر عند توفرها</small>
          </span>
        </div>
      </section>
    </main>
  );
}
function ValueQuestion({ plan, onResolve }: { plan: Plan; onResolve: (p: Plan) => void }) {
  const missing = missingValues(plan)[0];
  const [value, setValue] = useState(''),
    [error, setError] = useState('');
  if (!missing) return null;
  return (
    <section className="glass clarification">
      <h2>توضيح واحد لنكمل</h2>
      <p>
        ما القيم المناسبة للحقل <bdi>{missing.field.name}</bdi> في {tableLabel(missing.table)}؟
      </p>
      <p className="muted">لم نتمكن من معرفة معناه بأمان. اكتب أمثلة مفصولة بفاصلة.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onResolve(withFieldValues(plan, missing.table, missing.field.name, value));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          القيم الممكنة
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="مثال: نشط، قيد المراجعة"
            required
          />
        </label>
        {error && <ErrorBox message={error} />}
        <button className="primary">متابعة التوليد</button>
      </form>
    </section>
  );
}
function Quick() {
  const [plan, setPlan] = useState<Plan | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [job, setJob] = useState(''),
    [name, setName] = useState(''),
    [status, setStatus] = useState(''),
    [count, setCount] = useState(20);
  const working = busy || ['pending', 'running'].includes(status);
  async function generate(p: Plan) {
    setBusy(true);
    setError('');
    try {
      const j = await post('/jobs/generate', p);
      setStatus('pending');
      setJob(j.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    if (
      files.length !== 1 ||
      files[0].size > (/\.zip$/i.test(files[0].name) ? 20 : 4) * 1024 * 1024
    ) {
      setError('اختر ملف مخطط واحداً حتى 4 MiB أو ملف ZIP حتى 20 MiB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      files.forEach((f) => form.append('file', f));
      const p = quickDefaults(await api<Plan>('/schema/inspect', { method: 'POST', body: form }));
      setPlan(p);
      setName(files[0].name);
      if (!missingValues(p).length) await generate(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setJob('');
    setPlan(null);
    setStatus('');
    setError('');
    setName('');
  }
  function clear() {
    if (status === 'complete') reset();
    else {
      setJob('');
      setStatus('');
    }
  }
  const missing = plan ? missingValues(plan)[0] : null;
  return (
    <>
      {error && <ErrorBox message={error} />}
      {!plan ? (
        <section className="glass">
          <Upload
            accept=".sql,.prisma,.sqlite,.db,.zip"
            onFiles={upload}
            busy={busy}
            label="ارفع مخططك أو ملف المشروع"
          />
          <p className="upload-limits">SQL وPrisma وSQLite حتى 4 MiB · ZIP حتى 20 MiB</p>
          <Disclosure title="الصيغ والحدود">
            <p>
              ندعم مجموعة من أوامر إنشاء الجداول والمفاتيح والعلاقات؛ الصيغ غير المدعومة تظهر برسالة
              واضحة. حتى 50 جدولاً و20000 سجل و250000 خلية إجمالاً.
            </p>
          </Disclosure>
        </section>
      ) : (
        <>
          <div className="file-pill">
            <Braces size={17} />
            <bdi>{name}</bdi>
            <button className="text-button" disabled={working} onClick={reset}>
              رفع ملف آخر
            </button>
          </div>
          {!job && missing && (
            <ValueQuestion
              key={missing.table + '.' + missing.field.name}
              plan={plan}
              onResolve={(p) => {
                setPlan(p);
                if (!missingValues(p).length) void generate(p);
              }}
            />
          )}
          {!job && !missing && (
            <section className="glass">
              <p>مخططك جاهز: {plan.tables.length} جداول. سننشئ البيانات ونتحقق منها تلقائياً.</p>
              <button className="primary" disabled={working} onClick={() => generate(plan)}>
                {busy ? <Busy>جارٍ البدء</Busy> : 'إعادة التوليد'}
              </button>
            </section>
          )}
          {job && <JobResult key={job} jobId={job} onClear={clear} onStatus={setStatus} />}
          {!missing && (
            <Disclosure title="إعدادات متقدمة">
              <fieldset disabled={working}>
                <label>
                  العدد الافتراضي للسجلات
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={count}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setCount(n);
                      setPlan(
                        quickDefaults({
                          ...plan,
                          tables: plan.tables.map((t) => ({ ...t, count: n })),
                        }),
                      );
                    }}
                  />
                </label>
                <p className="muted">
                  نحافظ على أعداد مناسبة للجداول المرتبطة والشروط الفريدة. يمكنك تعديل كل جدول عند
                  الحاجة.
                </p>
                <PlanEditor plan={plan} onChange={setPlan} />
                <button className="primary" disabled={working} onClick={() => generate(plan)}>
                  تطبيق التعديلات وإعادة التوليد
                </button>
              </fieldset>
            </Disclosure>
          )}
        </>
      )}
    </>
  );
}
function Localization() {
  const [payload, setPayload] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [job, setJob] = useState(''),
    [status, setStatus] = useState(''),
    [economic, setEconomic] = useState('estimate'),
    [rate, setRate] = useState(''),
    [appliedMode, setAppliedMode] = useState('estimate'),
    [appliedRate, setAppliedRate] = useState('');
  const working = busy || ['pending', 'running'].includes(status);
  async function start(data: any, mode = economic) {
    setBusy(true);
    setError('');
    try {
      const j = await post('/jobs/localize', {
        ...data,
        options: {
          economic: mode,
          ...(rate && mode !== 'preserve' ? { currencyRate: Number(rate) } : {}),
        },
      });
      setAppliedMode(mode);
      setAppliedRate(mode === 'preserve' ? '' : rate);
      setStatus('pending');
      setJob(j.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.length > 10 || files.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024) {
      setError('يمكن رفع 10 ملفات كحد أقصى وبحجم إجمالي حتى 10 MiB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const result = await api('/localization/inspect', { method: 'POST', body: form });
      const p = { data: result.data, plan: result.plan };
      setPayload(p);
      await start(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setJob('');
    setPayload(null);
    setStatus('');
    setError('');
  }
  function recovery(j: any) {
    if (j.errorCode === 'FINANCIAL_AMBIGUITY')
      return (
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setEconomic('preserve');
            void start(payload, 'preserve');
          }}
        >
          الحفاظ على المبالغ والمتابعة
        </button>
      );
    if (j.errorCode === 'SALARY_PERIOD')
      return (
        <div className="clarification">
          {payload.plan.tables.every((t: any) =>
            t.fields.every((f: any) => f.name !== 'salary_period' || f.type === 'string'),
          ) &&
            ['month', 'year'].map((period) => (
              <button
                className="secondary"
                key={period}
                disabled={busy}
                onClick={() => {
                  const p = structuredClone(payload);
                  for (const rows of Object.values(p.data) as any[])
                    for (const row of rows)
                      if ('salary_period' in row && periodUnit(row.salary_period) === 'unknown')
                        row.salary_period = period;
                  setPayload(p);
                  void start(p);
                }}
              >
                {period === 'month' ? 'الرواتب شهرية' : 'الرواتب سنوية'}
              </button>
            ))}
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setEconomic('preserve');
              void start(payload, 'preserve');
            }}
          >
            الحفاظ على المبالغ والمتابعة
          </button>
        </div>
      );
    return null;
  }
  return (
    <>
      {error && <ErrorBox message={error} />}
      {!job && (
        <section className="glass">
          <Upload
            accept=".csv,.json,.xlsx,.zip"
            multiple
            onFiles={upload}
            busy={busy}
            label="ارفع بياناتك الأجنبية"
          />
          <p className="upload-limits">CSV وExcel وJSON وZIP · حتى 10 ملفات و10 MiB إجمالاً</p>
          <p className="muted">
            نحلل البيانات ونبحث عن المعلومات المناسبة ونراجع النتائج تلقائياً. تبقى ملفاتك الأصلية
            كما هي.
          </p>
          {payload && (
            <button className="primary" disabled={working} onClick={() => start(payload)}>
              إعادة المحاولة
            </button>
          )}
        </section>
      )}
      {job && status === 'complete' && appliedMode === 'preserve' && (
        <p className="notice">تم الحفاظ على المبالغ والعملات الأصلية.</p>
      )}
      {job && status === 'complete' && appliedRate && (
        <p className="notice">المبالغ محوّلة بالسعر الذي اخترته، وليست أسعاراً مرصودة للسوق.</p>
      )}
      {job && (
        <JobResult
          key={job}
          jobId={job}
          onStatus={setStatus}
          onClear={() => {
            if (status === 'complete') reset();
            else {
              setJob('');
              setStatus('');
            }
          }}
          recovery={recovery}
        />
      )}
      <Disclosure title="إعدادات متقدمة">
        <fieldset disabled={working}>
          <label>
            التعامل مع المبالغ
            <select value={economic} onChange={(e) => setEconomic(e.target.value)}>
              <option value="estimate">توطين تلقائي مع تمييز التقديرات</option>
              <option value="preserve">الحفاظ على المبالغ والعملات الأصلية</option>
            </select>
          </label>
          <label>
            تحويل العملة فقط (اختياري)
            <input
              type="number"
              min="0.0001"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="سعر التحويل"
            />
          </label>
          <p className="muted">
            التحويل ليس تسعيراً للسوق السعودي. لا نضيف ضريبة تلقائياً. عند غموض الحسابات يمكنك الحفاظ
            على المبالغ.
          </p>
          {job && (
            <button className="secondary" disabled={working} onClick={() => start(payload)}>
              إعادة المعالجة بهذه الخيارات
            </button>
          )}
        </fieldset>
      </Disclosure>
    </>
  );
}
function Chat({ configured }: { configured?: boolean }) {
  const [domain, setDomain] = useState('employees'),
    [session, setSession] = useState<any>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [plan, setPlan] = useState<Plan | null>(null),
    [job, setJob] = useState(''),
    [history, setHistory] = useState<any[]>([]),
    [historyOpen, setHistoryOpen] = useState(false);
  const epoch = useRef(0),
    end = useRef<HTMLDivElement>(null);
  const labels: Record<string, string> = {
    employees: 'الموظفون والشركات',
    commerce: 'التجارة الإلكترونية',
    university: 'الطلاب والجامعات',
  };
  async function newSession(d: string) {
    const ticket = ++epoch.current;
    setHistoryOpen(false);
    setDomain(d);
    setSession(null);
    setPlan(null);
    setJob('');
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const s = await post('/sessions', { domain: d });
      if (epoch.current !== ticket) return;
      setSession(s);
    } catch (e) {
      if (epoch.current === ticket) setError((e as Error).message);
    } finally {
      if (epoch.current === ticket) setBusy(false);
    }
  }
  useEffect(() => {
    newSession('employees');
    return () => {
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [session?.messages.length]);
  async function send() {
    if (busy || !message.trim() || !session) return;
    const ticket = epoch.current;
    setBusy(true);
    setError('');
    try {
      const s = await post('/sessions/' + session.id + '/messages', { message });
      if (ticket !== epoch.current) return;
      setSession(s);
      setPlan(s.plan ?? null);
      setMessage('');
    } catch (e) {
      if (ticket === epoch.current) setError((e as Error).message);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  async function approve() {
    const ticket = epoch.current;
    setBusy(true);
    setError('');
    try {
      const updated = await api('/sessions/' + session.id + '/plan', {
        method: 'PUT',
        body: JSON.stringify(plan),
      });
      if (ticket !== epoch.current) return;
      await post('/sessions/' + session.id + '/approve', { revision: updated.revision });
      if (ticket !== epoch.current) return;
      const j = await post('/sessions/' + session.id + '/generate');
      if (ticket !== epoch.current) return;
      setSession(updated);
      setJob(j.id);
    } catch (e) {
      if (ticket === epoch.current) setError((e as Error).message);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  async function resume(id: string) {
    const ticket = ++epoch.current;
    setSession(null);
    setPlan(null);
    setJob('');
    setMessage('');
    setHistoryOpen(false);
    setBusy(true);
    setError('');
    try {
      const s = await api('/sessions/' + id);
      if (ticket !== epoch.current) return;
      setSession(s);
      setDomain(s.domain);
      setPlan(s.plan ?? null);
      setJob('');
      setHistory([]);
    } catch (e) {
      if (ticket === epoch.current) setError((e as Error).message);
    } finally {
      if (ticket === epoch.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="chat-toolbar">
        <div className="domain-tabs">
          {Object.entries(labels).map(([key, label]) => (
            <button
              className={domain === key ? 'active' : ''}
              key={key}
              aria-pressed={domain === key}
              onClick={() => {
                if (key !== domain) void newSession(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <button className="text-button" onClick={() => newSession(domain)}>
            <Plus size={17} /> محادثة جديدة
          </button>
          <button
            className="text-button"
            aria-expanded={historyOpen}
            onClick={async () => {
              if (historyOpen) {
                setHistoryOpen(false);
                return;
              }
              const ticket = epoch.current;
              try {
                const items = await api<any[]>('/sessions');
                if (ticket === epoch.current) {
                  setHistory(items.filter((s) => s.id !== session?.id));
                  setHistoryOpen(true);
                }
              } catch (e) {
                if (ticket === epoch.current) setError((e as Error).message);
              }
            }}
          >
            <History size={17} /> السابقة
          </button>
        </div>
      </div>
      {historyOpen && (
        <div className="glass history">
          {history.length === 0 && <p>لا توجد محادثات سابقة.</p>}
          {history.map((s) => (
            <button className="secondary" key={s.id} onClick={() => resume(s.id)}>
              {labels[s.domain]} · {s.id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}
      {configured === false && (
        <div className="notice">
          المحادثة غير متاحة حالياً. يمكنك استخدام التوليد السريع أو التوطين، ثم المحاولة لاحقاً.
        </div>
      )}
      {error && (
        <>
          <ErrorBox message={error} />
          {!session && (
            <button className="secondary" disabled={busy} onClick={() => newSession(domain)}>
              إعادة المحاولة
            </button>
          )}
        </>
      )}
      {job && <JobResult key={job} jobId={job} onClear={() => setJob('')} />}
      {!job && (
        <div className={'chat-layout' + (plan ? ' has-plan' : '')}>
          <section className="glass chat-panel">
            <div className="chat-title">
              <span className="assistant-icon">
                <Sparkles size={20} />
              </span>
              <div>
                <strong>مساعد رصد</strong>
                <small>{labels[domain]} · محادثة مستقلة</small>
              </div>
            </div>
            <div className="messages" aria-live="polite">
              {session?.messages.map((m: any, i: number) => (
                <div key={i} className={'message ' + m.role}>
                  {m.role === 'assistant' && <span className="avatar">ر</span>}
                  <ConversationText
                    key={session.id + '-' + i}
                    content={m.content}
                    collapsible={m.role === 'assistant'}
                  />
                </div>
              ))}
              {!session && busy && <Busy>جارٍ إنشاء المحادثة</Busy>}
              {busy && session && <Busy>جارٍ إعداد الرد</Busy>}
              <div ref={end} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <textarea
                aria-label="رسالتك لرصد"
                value={message}
                disabled={busy || !session}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="مثلاً: شركة مقاولات، 100 موظف، وخمسة أقسام..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                className="send-button"
                aria-label="إرسال"
                disabled={busy || !message.trim() || !session}
              >
                <ArrowUp size={21} />
              </button>
            </form>
            <small className="chat-footnote">
              راجع الخطة قبل اعتمادها. التوليد يبدأ بموافقتك فقط.
            </small>
          </section>
          {plan && <PlanView plan={plan} onChange={setPlan} onGenerate={approve} busy={busy} />}
        </div>
      )}
      {job && (
        <Disclosure title="عرض المحادثة">
          <div className="messages">
            {session?.messages.map((m: any, i: number) => (
              <div className={'message ' + m.role} key={i}>
                <ConversationText content={m.content} collapsible={m.role === 'assistant'} />
              </div>
            ))}
          </div>
        </Disclosure>
      )}
    </>
  );
}
function ConversationText({ content, collapsible }: { content: string; collapsible: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = collapsible && content.length > 280;
  return (
    <div>
      <p>{long && !expanded ? content.slice(0, 280) + '…' : content}</p>
      {long && (
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'عرض أقل' : 'عرض المزيد'}
        </button>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
