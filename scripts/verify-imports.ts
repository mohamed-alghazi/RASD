import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
const base = process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:5173';
const health=await fetch(base+'/api/health');
const cookie=health.headers.get('set-cookie')!.split(';')[0];
await mkdir('.data/acceptance',{recursive:true});
const schemas:Record<string,string>={
 'postgres.sql':'CREATE TABLE samples (id SERIAL PRIMARY KEY, reading NUMERIC(8,3) NOT NULL CHECK (reading >= 0), collected_at TIMESTAMP NOT NULL);',
 'mysql.sql':'CREATE TABLE samples (id INT PRIMARY KEY AUTO_INCREMENT, reading DECIMAL(8,3) NOT NULL CHECK (reading >= 0), state ENUM(\'received\',\'processed\') NOT NULL);',
};
for(const [name,content] of Object.entries(schemas)) await writeFile('.data/acceptance/'+name,content);
const reports=[];
for(const path of ['examples/contracting.sql','examples/company.prisma','examples/contracting.sqlite','examples/project.zip','.data/acceptance/postgres.sql','.data/acceptance/mysql.sql']) {
 const form=new FormData();form.append('files',new Blob([await readFile(path)]),path.split('/').at(-1)!);
 const response=await fetch(base+'/api/schema/inspect',{method:'POST',headers:{cookie},body:form});
 assert(response.ok,`${path}: ${response.status}`);
 const plan=await response.json() as any;
 const data=generate(plan);
 const result=validate(plan,data);
 assert(result.valid,JSON.stringify(result.issues));
 reports.push({path,tables:plan.tables.length,rows:result.checkedRows,cells:result.checkedCells,valid:true});
}
await writeFile('.data/acceptance/import-report.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports,null,2));
