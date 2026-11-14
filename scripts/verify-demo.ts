import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { domainPlan } from '../server/catalog';
import { validate } from '../server/validation';
import { unzipSync } from 'fflate';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { Plan } from '../shared/schema';
const base = process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:5173';
const out = '.data/acceptance';
await mkdir(out, { recursive: true });
const health = await fetch(base + '/api/health');
assert(health.ok);
const cookie = health.headers.get('set-cookie')!.split(';')[0];
async function api(route: string, body?: unknown) {
  const r = await fetch(base + '/api' + route, { method: body === undefined ? 'GET' : 'POST', headers: {cookie, ...(body === undefined ? {} : {'Content-Type':'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body) });
  assert(r.ok, `${route}: HTTP ${r.status}`);
  return r.json() as Promise<any>;
}
async function result(job: any, plan: Plan, label: string) {
  for (let i = 0; i < 120; i++) {
    job = await api('/jobs/' + job.id);
    if (job.status === 'complete') break;
    assert(job.status !== 'failed', job.error);
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.equal(job.status, 'complete');
  assert((await api(`/jobs/${job.id}/validation`)).valid);
  const data = await api(`/jobs/${job.id}/download`);
  assert(validate(plan, data).valid);
  await writeFile(`${out}/${label}.json`, JSON.stringify(data, null, 2), { mode: 0o600 });
  for (const format of ['csv','xlsx','sql']) {
    const r = await fetch(`${base}/api/jobs/${job.id}/download?format=${format}`, {headers:{cookie}});
    assert(r.ok);
    const bytes = Buffer.from(await r.arrayBuffer());
    await writeFile(`${out}/${label}.${format === 'csv' ? 'zip' : format}`, bytes, {mode:0o600});
    if (format === 'csv') {
      const entries = unzipSync(bytes);
      for (const t of plan.tables) assert.equal(parse(Buffer.from(entries[t.name+'.csv']), {columns:true,bom:true}).length,t.count);
    } else if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(bytes as any);
      assert.equal(wb.worksheets.length,plan.tables.length);
      for (const t of plan.tables) assert.equal(wb.getWorksheet(t.name)!.rowCount,t.count+1);
    } else assert.equal((bytes.toString().match(/^INSERT INTO /gm) ?? []).length, plan.tables.reduce((s,t)=>s+t.count,0));
  }
  const report = {label,counts:Object.fromEntries(Object.entries(data).map(([t, rows]:any)=>[t,rows.length])),validated:true,exports:['json','csv ZIP','xlsx','sql'],research:await api(`/jobs/${job.id}/research`)};
  console.log(JSON.stringify(report));
  return {data,report};
}
const reports = [];
for (const domain of (process.env.DEMO_LOCALIZATION_ONLY ? [] : ['university','employees','commerce']) as ('university' | 'employees' | 'commerce')[]) {
  const plan = domainPlan(domain);
  const r = await result(await api('/jobs/generate',plan),plan,domain);
  if(domain === 'university') {
    assert.equal(new Set(r.data.students.map((s:any)=>s.university_id)).size,1);
    assert.equal(new Set(r.data.students.map((s:any)=>s.student_number)).size,100);
  }
  if(domain === 'employees') assert.equal(r.data.employees.filter((e:any)=>Number(e.experience)>5).length,30);
  reports.push(r.report);
}
const form = new FormData();
form.append('files',new Blob([await readFile('examples/american.json')],{type:'application/json'}),'american.json');
const upload = await fetch(base+'/api/localization/inspect',{method:'POST',headers:{cookie},body:form});
assert(upload.ok);
const payload = await upload.json() as any;
const localized = await result(await api('/jobs/localize',{plan:payload.plan,data:payload.data}),payload.plan,'localized');
for(const [table,rows] of Object.entries(payload.data) as any) for(let i=0;i<rows.length;i++) {
  assert.deepEqual(Object.keys(localized.data[table][i]),Object.keys(rows[i]));
  assert.equal(localized.data[table][i].id,rows[i].id);
}
assert.equal(localized.data.orders[0].total,localized.data.payments[0].amount);
assert.equal(localized.data.employees[0].city,'الرياض');
reports.push(localized.report);
await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
