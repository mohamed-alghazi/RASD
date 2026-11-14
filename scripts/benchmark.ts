import { writeFile, mkdir } from 'node:fs/promises';
import { checkPlan, type Table } from '../shared/schema';
import { generate } from '../server/generator';
import { validate } from '../server/validation';
const table = (name: string): Table => ({
  name,
  count: 10000,
  fields: [
    { name: 'id', type: 'integer', nullable: false },
    ...Array.from({ length: 11 }, (_, i) => ({
      name: 'measure_' + i,
      type: 'decimal' as const,
      nullable: false,
      min: 1,
      max: 1000,
      precision: 12,
      scale: 2,
    })),
  ],
  primaryKey: ['id'],
  unique: [],
  foreignKeys: [],
});
const plan = checkPlan({
  version: 1,
  domain: 'numeric-load-check',
  seed: 42,
  tables: [table('readings_a'), table('readings_b')],
  rules: [],
  assumptions: [],
});
const start = performance.now();
const before = process.memoryUsage();
const data = generate(plan);
const report = validate(plan, data);
const result = {
  recordedAt: new Date().toISOString(),
  node: process.version,
  rows: report.checkedRows,
  cells: report.checkedCells,
  valid: report.valid,
  outputBytes: Buffer.byteLength(JSON.stringify(data)),
  elapsedMs: Math.round(performance.now() - start),
  rssBefore: before.rss,
  rssAfter: process.memoryUsage().rss,
  maxRssKiB: process.resourceUsage().maxRSS,
  note: 'Single numeric workload on this development machine; not a production capacity or concurrency certification.',
};
await mkdir('docs', { recursive: true });
await writeFile('docs/benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!report.valid) process.exitCode = 1;
