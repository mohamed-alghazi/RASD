import { mkdir, readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { zipSync, strToU8 } from 'fflate';
import { domainPlan } from '../server/catalog';
await mkdir('examples', { recursive: true });
for (const domain of ['employees', 'commerce', 'university'] as const)
  await writeFile(`examples/${domain}-plan.json`, JSON.stringify(domainPlan(domain), null, 2));
const SQL = await initSqlJs();
const db = new SQL.Database();
db.exec(await readFile('examples/contracting.sql', 'utf8'));
await writeFile('examples/contracting.sqlite', db.export());
db.close();
await writeFile(
  'examples/project.zip',
  zipSync({ 'prisma/schema.prisma': strToU8(await readFile('examples/company.prisma', 'utf8')) }),
);
console.log('Created three reviewable plans, SQLite schema, and project ZIP. No provider calls.');
