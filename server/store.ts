import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, type Dataset, type Plan } from '../shared/schema.js';
import type { ChatState } from './ai.js';
import type { Validation } from './validation.js';
import type { Research } from './research.js';
export interface StoredChat extends ChatState {
  id: string;
  owner: string;
  expires: number;
  busy?: boolean;
}
export interface Job {
  id: string;
  owner: string;
  kind: 'generation' | 'localization';
  status: 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
  phase: string;
  progress: number;
  created: number;
  expires: number;
  plan: Plan;
  data?: Dataset;
  before?: Dataset;
  validation?: Validation;
  research?: Research;
  transforms?: unknown[];
  warnings?: string[];
  error?: string;
  errorCode?: string;
  durationMs?: number;
  outputBytes?: number;
}
export class Store {
  private chats = new Map<string, StoredChat>();
  private jobs = new Map<string, Job>();
  private writeChain: Promise<void> = Promise.resolve();
  constructor(public dir = process.env.DATA_DIR ?? '.data') {}
  async init() {
    await mkdir(this.dir, { recursive: true });
    for (const file of await readdir(this.dir)) {
      if (!/^(chat|job)-[0-9a-f-]+\.json$/.test(file)) continue;
      try {
        const obj = JSON.parse(await readFile(path.join(this.dir, file), 'utf8'));
        if (obj.expires < Date.now()) {
          await unlink(path.join(this.dir, file));
          continue;
        }
        if (file.startsWith('chat')) {
          obj.busy = false;
          this.chats.set(obj.id, obj);
        } else {
          if (['running', 'pending'].includes(obj.status)) {
            obj.status = 'failed';
            obj.error = 'انقطع التطبيق أثناء المعالجة؛ ابدأ مهمة جديدة.';
          }
          this.jobs.set(obj.id, obj);
        }
      } catch {
        /* Partial or corrupt metadata is never exposed. */
      }
    }
  }
  private ttl() {
    return (
      Date.now() + Math.max(1, Math.min(168, Number(process.env.JOB_TTL_HOURS) || 24)) * 3600000
    );
  }
  async save(kind: 'chat' | 'job', obj: StoredChat | Job) {
    const destination = path.join(this.dir, `${kind}-${obj.id}.json`);
    const content = JSON.stringify(obj);
    const operation = this.writeChain.then(async () => {
      const temp = destination + '.tmp';
      await writeFile(temp, content, { mode: 0o600 });
      await rename(temp, destination);
    });
    this.writeChain = operation.catch(() => {});
    return operation;
  }
  async newChat(owner: string, domain: StoredChat['domain']) {
    if (this.chats.size >= 1000) throw new AppError(429, 'CAPACITY', 'عدد الجلسات ممتلئ مؤقتاً');
    const chat: StoredChat = {
      id: randomUUID(),
      owner,
      domain,
      messages: [
        {
          role: 'assistant',
          content:
            domain === 'employees'
              ? 'ما نوع الشركة وكم موظفاً تحتاج؟'
              : domain === 'university'
                ? 'ما الجامعة وكم طالباً تريد توليده؟'
                : 'ما نوع المتجر وكم عميلاً تحتاج؟',
        },
      ],
      requirements: '',
      approved: false,
      revision: 0,
      expires: this.ttl(),
    };
    this.chats.set(chat.id, chat);
    await this.save('chat', chat);
    return chat;
  }
  chat(id: string, owner: string) {
    const c = this.chats.get(id);
    if (!c || c.owner !== owner || c.expires < Date.now())
      throw new AppError(404, 'NOT_FOUND', 'المحادثة غير موجودة');
    return c;
  }
  listChats(owner: string) {
    return [...this.chats.values()]
      .filter((c) => c.owner === owner && c.expires > Date.now())
      .map((c) => ({ id: c.id, domain: c.domain, expires: c.expires, revision: c.revision }));
  }
  async newJob(owner: string, kind: Job['kind'], plan: Plan) {
    if (
      this.jobs.size >= 100 ||
      [...this.jobs.values()].filter((j) => j.owner === owner).length >= 20
    )
      throw new AppError(
        429,
        'CAPACITY',
        'وصلت سعة المهام المؤقتة. احذف نتائج قديمة ثم أعد المحاولة.',
      );
    const retained = [...this.jobs.values()].reduce(
      (sum, j) =>
        sum + (j.outputBytes ?? 0) + (j.before ? Buffer.byteLength(JSON.stringify(j.before)) : 0),
      0,
    );
    if (retained > 64 * 1024 * 1024)
      throw new AppError(429, 'CAPACITY', 'ذاكرة النتائج المؤقتة ممتلئة؛ احذف نتائج قديمة');
    const j: Job = {
      id: randomUUID(),
      owner,
      kind,
      status: 'pending',
      phase: 'بانتظار المعالجة',
      progress: 0,
      created: Date.now(),
      expires: this.ttl(),
      plan,
    };
    this.jobs.set(j.id, j);
    try {
      await this.save('job', j);
    } catch (e) {
      this.jobs.delete(j.id);
      throw e;
    }
    return j;
  }
  job(id: string, owner: string) {
    const j = this.jobs.get(id);
    if (!j || j.owner !== owner || j.expires < Date.now())
      throw new AppError(404, 'NOT_FOUND', 'المهمة غير موجودة أو انتهت صلاحيتها');
    return j;
  }
  listJobs(owner: string) {
    return [...this.jobs.values()]
      .filter((j) => j.owner === owner && j.expires > Date.now())
      .sort((a, b) => b.created - a.created);
  }
  async remove(id: string, owner: string) {
    this.job(id, owner);
    this.jobs.delete(id);
    await this.writeChain;
    await unlink(path.join(this.dir, `job-${id}.json`)).catch(() => {});
  }
  async cleanup() {
    for (const [id, obj] of this.jobs)
      if (obj.expires < Date.now()) {
        this.jobs.delete(id);
        await unlink(path.join(this.dir, `job-${id}.json`)).catch(() => {});
      }
    for (const [id, obj] of this.chats)
      if (obj.expires < Date.now()) {
        this.chats.delete(id);
        await unlink(path.join(this.dir, `chat-${id}.json`)).catch(() => {});
      }
  }
}
