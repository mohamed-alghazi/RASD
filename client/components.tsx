import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  FileUp,
  LoaderCircle,
  ShieldCheck,
  X,
  Link2,
  Trash2,
  Square,
} from 'lucide-react';
import type { Plan } from '../shared/schema';
import { tableLabel, fieldLabel } from './workflows';
import { api, download, post } from './api';
export function ErrorBox({ message }: { message: string }) {
  const technical = /API_KEY|AI_MODEL|semantic|planJson/.test(message);
  return (
    <div className="error" role="alert">
      <p>
        {technical ? 'تعذرت العملية حالياً. يمكنك إعادة المحاولة أو الاطلاع على التفاصيل.' : message}
      </p>
      {technical && (
        <Disclosure title="تفاصيل المشكلة">
          <p>{message}</p>
        </Disclosure>
      )}
    </div>
  );
}
export function Busy({ children }: { children: ReactNode }) {
  return (
    <span className="busy">
      <LoaderCircle size={17} className="spin" />
      {children}
    </span>
  );
}
export function Upload({
  accept,
  onFiles,
  busy = false,
  multiple = false,
  label = 'اسحب ملفاتك إلى هنا',
}: {
  accept: string;
  onFiles: (files: File[]) => void;
  busy?: boolean;
  multiple?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false),
    [uploadError, setUploadError] = useState('');
  function choose(files: File[]) {
    if (busy) return;
    setUploadError('');
    if (!multiple && files.length > 1) {
      setUploadError('اختر ملفاً واحداً فقط.');
      return;
    }
    const extensions = accept.toLowerCase().split(',');
    if (files.some((f) => !extensions.some((ext) => f.name.toLowerCase().endsWith(ext)))) {
      setUploadError('صيغة الملف غير مدعومة. اختر إحدى الصيغ الموضحة.');
      return;
    }
    onFiles(files);
  }
  return (
    <div
      className={'dropzone ' + (over ? 'over' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        choose([...e.dataTransfer.files]);
      }}
    >
      <div className="upload-symbol">
        <FileUp size={28} />
      </div>
      <h3>{busy ? <Busy>جارٍ فحص الملفات</Busy> : label}</h3>
      <p>أو اخترها من جهازك · تعالج الملفات بأمان</p>
      <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>
        اختيار الملفات
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) choose([...e.target.files]);
          e.target.value = '';
        }}
      />
      {uploadError && <ErrorBox message={uploadError} />}
      <small dir="ltr">{accept.replaceAll(',', ' · ')}</small>
    </div>
  );
}
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="disclosure">
      <summary>
        {title}
        <ChevronDown size={17} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function PlanEditor({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  const [raw, setRaw] = useState(''),
    [editing, setEditing] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="plan-editor">
      {' '}
      <div className="schema-grid">
        {plan.tables.map((t) => (
          <div className="schema-card" key={t.name}>
            <code>{t.name}</code>
            <label>
              عدد السجلات
              <input
                aria-label={'عدد ' + t.name}
                type="number"
                min="0"
                max="10000"
                value={t.count}
                onChange={(e) =>
                  onChange({
                    ...plan,
                    tables: plan.tables.map((x) =>
                      x.name === t.name ? { ...x, count: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
            </label>
            <small>
              {t.fields.length} حقل · {t.foreignKeys.length} علاقات
            </small>
            <details>
              <summary>الحقول والمفاتيح</summary>
              <div className="field-list" dir="ltr">
                {t.fields.map((f) => (
                  <div key={f.name}>
                    <code>{f.name}</code>
                    <span>
                      {f.type}
                      {t.primaryKey.includes(f.name) ? ' · PK' : ''}
                      {t.foreignKeys.some((k) => k.columns.includes(f.name)) ? ' · FK' : ''}
                    </span>
                  </div>
                ))}
              </div>
              {t.foreignKeys.map((fk, i) => (
                <p key={i} dir="ltr">
                  <code>
                    {fk.columns.join(',')} → {fk.table}.{fk.references.join(',')}
                  </code>
                </p>
              ))}
            </details>
          </div>
        ))}
      </div>
      <Disclosure title={`الافتراضات والقواعد (${plan.assumptions.length + plan.rules.length})`}>
        <ul>
          {plan.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
        <pre dir="ltr">{JSON.stringify(plan.rules, null, 2)}</pre>
      </Disclosure>
      <Disclosure title="تعديل تقني للخطة (JSON)">
        <p>
          يمكن تحديد values أو semantic للحقول وتعديل القواعد. يتحقق الخادم من الخطة قبل التنفيذ.
        </p>
        <button
          className="text-button"
          onClick={() => {
            setRaw(JSON.stringify(plan, null, 2));
            setEditing(true);
          }}
        >
          فتح محرر JSON
        </button>
        {editing && (
          <>
            <textarea
              className="code-editor"
              dir="ltr"
              aria-label="خطة JSON"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <button
              className="secondary"
              onClick={() => {
                try {
                  const p = JSON.parse(raw);
                  if (!p.tables || !Array.isArray(p.tables)) throw Error('الخطة تحتاج tables');
                  onChange(p);
                  setError('');
                  setEditing(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              تطبيق التعديلات
            </button>
          </>
        )}
        {error && <ErrorBox message={error} />}
      </Disclosure>
    </div>
  );
}
export function PlanView({
  plan,
  onChange,
  onGenerate,
  busy,
  button = 'اعتماد الخطة وتوليد البيانات',
}: {
  plan: Plan;
  onChange: (p: Plan) => void;
  onGenerate: () => void;
  busy: boolean;
  button?: string;
}) {
  const rows = plan.tables.reduce((sum, t) => sum + t.count, 0);
  return (
    <section className="glass plan" aria-label="خطة البيانات">
      <div className="section-heading">
        <div>
          <h2>خطة بياناتك</h2>
          <p>
            {rows.toLocaleString('ar-SA')} سجل في {plan.tables.length} جداول مترابطة
          </p>
        </div>
      </div>
      <ul className="plan-summary">
        {plan.tables.slice(0, 6).map((t) => (
          <li key={t.name}>
            <span>{tableLabel(t.name)}</span>
            <b>{t.count.toLocaleString('ar-SA')}</b>
          </li>
        ))}
      </ul>
      {plan.tables.length > 6 && (
        <p className="muted">و{plan.tables.length - 6} جداول أخرى ضمن التفاصيل.</p>
      )}
      <Disclosure title="إعدادات متقدمة">
        <fieldset disabled={busy}>
          <PlanEditor plan={plan} onChange={onChange} />
        </fieldset>
      </Disclosure>
      <div className="plan-footer">
        <small>
          <ShieldCheck size={16} /> بيانات اختبارية. نتحقق منها قبل التنزيل.
        </small>
        <button className="primary" disabled={busy} onClick={onGenerate}>
          {busy ? <Busy>جارٍ البدء</Busy> : button}
        </button>
      </div>
    </section>
  );
}
export function JobResult({
  jobId,
  onClear,
  onStatus,
  recovery,
}: {
  jobId: string;
  onClear: () => void;
  onStatus?: (status: string) => void;
  recovery?: (job: any) => ReactNode;
}) {
  const [job, setJob] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [validation, setValidation] = useState<any>(null),
    [research, setResearch] = useState<any>(null),
    [error, setError] = useState(''),
    [table, setTable] = useState(''),
    [format, setFormat] = useState('xlsx'),
    [dialect, setDialect] = useState('sqlite'),
    [downloading, setDownloading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    let timeout: ReturnType<typeof setTimeout>;
    setPreview(null);
    setError('');
    async function poll() {
      try {
        const j = await api('/jobs/' + jobId);
        if (!alive) return;
        setJob(j);
        onStatus?.(j.status);
        if (j.status === 'complete') {
          const [p, v, r] = await Promise.all([
            api('/jobs/' + jobId + '/preview'),
            api('/jobs/' + jobId + '/validation'),
            api('/jobs/' + jobId + '/research'),
          ]);
          if (!alive) return;
          setPreview(p);
          const ordered = [...p.tables].sort(
            (a: any, b: any) =>
              b.count - a.count ||
              Number(!/employees|students|customers/.test(a.name)) -
                Number(!/employees|students|customers/.test(b.name)),
          );
          setTable(
            ordered.find((t: any) =>
              t.before?.some(
                (row: any, i: number) => JSON.stringify(row) !== JSON.stringify(t.rows[i]),
              ),
            )?.name ??
              ordered[0]?.name ??
              '',
          );
          setFormat(
            p.tables.every((t: any) => t.name.length <= 31) &&
              new Set(p.tables.map((t: any) => t.name.toLowerCase())).size === p.tables.length
              ? 'xlsx'
              : 'json',
          );
          setValidation(v);
          setResearch(r);
        } else if (['pending', 'running'].includes(j.status)) timeout = setTimeout(poll, 2000);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [jobId, retry, onStatus]);
  async function action(fn: () => Promise<any>) {
    try {
      setError('');
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selected = preview?.tables.find((t: any) => t.name === table);
  return (
    <section className="glass result" data-job-id={jobId}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">مساحة النتائج</span>
          <h2>
            {job?.status === 'complete'
              ? 'بيانات جاهزة. علاقات موثوقة.'
              : (job?.phase ?? 'جارٍ الاتصال')}
          </h2>
        </div>
        {job?.status === 'complete' && (
          <span className="tag success">
            <Check size={15} /> اجتازت التحقق
          </span>
        )}
      </div>
      {error && (
        <>
          <ErrorBox message={error} />
          <button className="secondary" onClick={() => setRetry((x) => x + 1)}>
            إعادة المحاولة
          </button>
        </>
      )}
      {job && ['pending', 'running'].includes(job.status) && (
        <>
          <div className="progress">
            <div style={{ width: job.progress + '%' }} />
          </div>
          <p>
            <Busy>
              {job.phase} · {job.progress}%
            </Busy>
          </p>
          <button
            className="text-button"
            onClick={() =>
              action(async () => {
                const updated = await post('/jobs/' + jobId + '/cancel');
                setJob(updated);
                onStatus?.(updated.status);
              })
            }
          >
            <Square size={14} /> إلغاء المهمة
          </button>
        </>
      )}
      {job?.status === 'failed' && (
        <>
          <ErrorBox
            message={
              job.errorCode === 'FINANCIAL_AMBIGUITY'
                ? 'نحتاج توضيحاً للمبالغ حتى لا تتغير حسابات مترابطة بشكل غير صحيح.'
                : job.errorCode === 'SALARY_PERIOD'
                  ? 'هل الرواتب شهرية أم سنوية؟ نحتاج تحديد الفترة قبل المتابعة.'
                  : 'لم تكتمل المعالجة. يمكنك تعديل المدخلات والمحاولة مجدداً.'
            }
          />
          {recovery?.(job)}
          <Disclosure title="تفاصيل المشكلة">
            <p>{job.error}</p>
          </Disclosure>
          <button className="secondary" onClick={onClear}>
            العودة وتعديل المدخلات
          </button>
        </>
      )}
      {job?.status === 'cancelled' && (
        <>
          <p>ألغيت المهمة.</p>
          <button className="secondary" onClick={onClear}>
            العودة
          </button>
        </>
      )}
      {preview && (
        <>
          {job.kind === 'localization' && (
            <p className="notice">
              تبقى المعرفات والعلاقات محفوظة. بعض المبالغ تقديرات؛ تميّز التفاصيل بينها وبين الأسعار
              المرصودة.
            </p>
          )}
          <div className="export-bar">
            <div>
              <strong>بياناتك جاهزة للتنزيل</strong>
              <small>يشمل الملف جميع السجلات والجداول.</small>
            </div>
            <Disclosure title="خيارات التنزيل">
              {' '}
              <label>
                الصيغة
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="json">JSON</option>
                  <option value="csv">CSV + ZIP</option>
                  <option
                    value="xlsx"
                    disabled={
                      preview.tables.some((t: any) => t.name.length > 31) ||
                      new Set(preview.tables.map((t: any) => t.name.toLowerCase())).size !==
                        preview.tables.length
                    }
                  >
                    Excel
                  </option>
                  <option value="sql">SQL — لقاعدة البيانات</option>
                </select>
              </label>
              {format === 'sql' && (
                <label>
                  قاعدة البيانات
                  <select value={dialect} onChange={(e) => setDialect(e.target.value)}>
                    <option value="sqlite">SQLite</option>
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </label>
              )}
            </Disclosure>{' '}
            <button
              className="primary"
              disabled={downloading}
              onClick={() =>
                action(async () => {
                  setDownloading(true);
                  try {
                    await download(jobId, format, dialect);
                  } finally {
                    setDownloading(false);
                  }
                })
              }
            >
              {downloading ? (
                <Busy>جارٍ التنزيل</Busy>
              ) : (
                <>
                  <ArrowDownToLine size={17} /> تنزيل{' '}
                  {format === 'xlsx'
                    ? 'Excel'
                    : format === 'json'
                      ? 'JSON'
                      : format === 'csv'
                        ? 'CSV'
                        : 'SQL'}
                </>
              )}
            </button>
          </div>
          <div className="result-stats">
            <div>
              <strong>{validation.checkedRows.toLocaleString('ar-SA')}</strong>
              <span>سجل تم فحصه</span>
            </div>
            <div>
              <strong>{preview.tables.length}</strong>
              <span>جداول</span>
            </div>
          </div>
          <div className="table-tabs">
            {preview.tables.map((t: any) => (
              <button
                key={t.name}
                className={table === t.name ? 'active' : ''}
                onClick={() => setTable(t.name)}
              >
                <bdi>{tableLabel(t.name)}</bdi>
                <span>{t.count}</span>
              </button>
            ))}
          </div>
          {selected && (
            <>
              <div className="preview-note">
                معاينة أول{' '}
                {selected.before
                  ? Math.min(3, selected.rows.length)
                  : Math.min(5, selected.rows.length)}{' '}
                سجلات من {selected.count} · جميع السجلات ضمن التنزيل
              </div>
              {selected.before && (
                <section className="before-after" aria-label="مقارنة قبل التوطين وبعده">
                  <h3>قبل التوطين وبعده</h3>
                  <div className="comparison">
                    <div>
                      <h4>قبل</h4>
                      <DataTable rows={selected.before.slice(0, 3)} fields={selected.fields} />
                    </div>
                    <div>
                      <h4>بعد</h4>
                      <DataTable rows={selected.rows.slice(0, 3)} fields={selected.fields} />
                    </div>
                  </div>
                </section>
              )}
              {selected.before ? (
                <Disclosure title="عرض مزيد من السجلات">
                  <DataTable rows={selected.rows} fields={selected.fields} />
                </Disclosure>
              ) : (
                <>
                  <DataTable rows={selected.rows.slice(0, 5)} fields={selected.fields} />
                  {selected.rows.length > 5 && (
                    <Disclosure title="عرض مزيد من السجلات">
                      <DataTable rows={selected.rows} fields={selected.fields} />
                    </Disclosure>
                  )}
                </>
              )}
            </>
          )}
          <Disclosure title="الدقة والمصادر">
            {' '}
            <Disclosure title={`نتائج التحقق — ${validation.checks.length} فحوصات`}>
              <div className="check-list">
                {validation.checks.map((c: string) => (
                  <span key={c}>
                    <ShieldCheck size={17} />
                    {c}
                  </span>
                ))}
              </div>
              <p>
                {validation.checkedCells.toLocaleString('ar-SA')} خلية تم فحصها. لا توجد أخطاء حرجة.
              </p>
            </Disclosure>
            <Disclosure
              title={`المصادر: ${research.evidence.filter((e: any) => e.applied).length} مطبقة من ${research.evidence.length} — عرض التفاصيل`}
            >
              <p className="muted">
                {research.warning ??
                  (research.status === 'not-needed' ? 'لم تتطلب هذه الخطة بحثاً اقتصادياً.' : '')}
              </p>
              {research.evidence.map((e: any, i: number) => (
                <article className="evidence" key={i}>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.title}
                  </a>
                  <p>{e.finding}</p>
                  <small>
                    {e.field} · {e.applied ? 'مطبق' : 'للمراجعة؛ غير مطبق'}
                  </small>
                </article>
              ))}
            </Disclosure>
            {preview.transforms && (
              <Disclosure title="التحويلات والافتراضات الاقتصادية">
                <ul>
                  {preview.transforms.map((t: any, i: number) => (
                    <li key={i}>
                      <code>
                        {t.table}.{t.field}
                      </code>
                      : {t.method}
                    </li>
                  ))}
                </ul>
                {preview.warnings?.map((w: string) => (
                  <p key={w}>{w}</p>
                ))}
              </Disclosure>
            )}
          </Disclosure>{' '}
          <Disclosure title="تفاصيل الملف والاستيراد">
            <p>
              وقت المعالجة: {((job.durationMs ?? 0) / 1000).toFixed(1)} ثانية · حجم البيانات:{' '}
              {((job.outputBytes ?? 0) / 1024).toFixed(1)} KB
            </p>
            <p>
              يحافظ JSON على الجداول والأنواع. يحتوي CSV ZIP على ملف لكل جدول وschema.json للعلاقات.
              استورد الآباء قبل الأبناء وفق العلاقات. SQL يضيف سجلات إلى مخطط مطابق وفارغ؛ خذ نسخة
              احتياطية أولاً.
            </p>
            <p>
              تنتهي صلاحية المهمة خلال 24 ساعة افتراضياً. SQL لقاعدة SQLite هو مسار التصدير المختبر
              آلياً.
            </p>
          </Disclosure>
          <Disclosure title="إدارة النتيجة">
            <button className="secondary" onClick={onClear}>
              بدء مهمة جديدة
            </button>
            <button
              className="text-button danger"
              onClick={() =>
                action(async () => {
                  await api('/jobs/' + jobId, { method: 'DELETE' });
                  onClear();
                })
              }
            >
              <Trash2 size={15} /> حذف هذه البيانات المؤقتة
            </button>
          </Disclosure>
        </>
      )}
    </section>
  );
}
function DataTable({ rows, fields }: { rows: any[]; fields: any[] }) {
  const ref = useRef<HTMLDivElement>(null),
    [overflow, setOverflow] = useState(false);
  const shown = [
    ...fields.filter((f) => !/^id$|_id$/.test(f.name)),
    ...fields.filter((f) => /^id$|_id$/.test(f.name)),
  ];
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const check = () => setOverflow(node.scrollWidth > node.clientWidth + 1);
    const observer = new ResizeObserver(check);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    check();
    return () => observer.disconnect();
  }, [rows, fields]);
  return (
    <>
      {overflow && (
        <small className="scroll-hint">
          مرّر الجدول أفقياً لرؤية بقية الأعمدة، بما فيها المعرفات.
        </small>
      )}
      <div
        className="table-scroll"
        ref={ref}
        dir="ltr"
        tabIndex={overflow ? 0 : undefined}
        aria-label="معاينة البيانات"
      >
        <table dir="ltr">
          <thead>
            <tr>
              {shown.map((f) => (
                <th scope="col" key={f.name} title={f.name}>
                  {fieldLabel(f.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {shown.map((f) => (
                  <td key={f.name}>
                    {row[f.name] === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <bdi>{String(row[f.name])}</bdi>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function Downloads({ active = true }: { active?: boolean }) {
  const [jobs, setJobs] = useState<any[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  function refresh() {
    setLoading(true);
    setSelected('');
    setError('');
    api<any[]>('/jobs')
      .then(setJobs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    if (active) refresh();
  }, [active]);
  if (selected)
    return (
      <>
        <button className="secondary" onClick={() => setSelected('')}>
          العودة إلى تنزيلاتي
        </button>
        <JobResult key={selected} jobId={selected} onClear={refresh} />
      </>
    );
  return (
    <>
      {error && <ErrorBox message={error} />}
      <section className="glass">
        <div className="section-heading">
          <h2>نتائجك المؤقتة</h2>
          <button className="secondary" disabled={loading} onClick={refresh}>
            تحديث
          </button>
        </div>
        {loading ? (
          <Busy>جارٍ استرجاع المهام</Busy>
        ) : jobs.length === 0 ? (
          <p className="muted">
            لا توجد مهام محفوظة لهذا المتصفح. ابدأ بالتوليد أو التوطين لتظهر نتائجك هنا.
          </p>
        ) : (
          <div className="schema-grid">
            {jobs.map((j) => (
              <article className="schema-card" key={j.id}>
                <strong>{j.kind === 'localization' ? 'توطين سعودي' : 'توليد بيانات'}</strong>
                <p>
                  <small>
                    {j.plan.tables.length} جداول · {new Date(j.created).toLocaleString('ar-SA')}
                  </small>
                </p>
                <span className="tag">
                  {
                    {
                      complete: 'جاهزة',
                      failed: 'فشلت',
                      running: 'قيد التنفيذ',
                      pending: 'في الانتظار',
                      cancelled: 'ملغاة',
                    }[j.status as string]
                  }
                </span>
                <p>
                  <small>تنتهي: {new Date(j.expires).toLocaleString('ar-SA')}</small>
                </p>
                <button className="secondary" onClick={() => setSelected(j.id)}>
                  عرض النتيجة
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
