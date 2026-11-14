import initSqlJs from 'sql.js';
import { checkPlan, fail, type Field, type Plan, type Table } from '../shared/schema.js';
// Split only at depth zero; SQL literals and quoted identifiers remain intact.
export function splitSql(text: string, delimiter = ',') {
  const out: string[] = [];
  let part = '',
    depth = 0,
    quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      part += c;
      if (c === quote) {
        if (text[i + 1] === quote) {
          part += text[++i];
        } else quote = '';
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      part += c;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth < 0) fail('أقواس SQL غير متوازنة');
    if (c === delimiter && depth === 0) {
      if (part.trim()) out.push(part.trim());
      part = '';
    } else part += c;
  }
  if (quote || depth) fail('SQL غير مكتمل');
  if (part.trim()) out.push(part.trim());
  return out;
}
function identifier(s: string) {
  const n = s.trim().replace(/^[`"\[]|[`"\]]$/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(n)) fail('اسم غير مدعوم: ' + s);
  return n;
}
const cols = (s: string) => splitSql(s).map(identifier);
export function fieldType(
  raw: string,
): Pick<Field, 'type' | 'length' | 'precision' | 'scale' | 'values'> {
  const s = raw.trim().toLowerCase();
  let m;
  if (/^(smallint|tinyint|mediumint|int|integer|bigint|serial|bigserial)(\b|$)/.test(s))
    return { type: 'integer' };
  if ((m = /^(decimal|numeric)\s*(?:\((\d+)(?:\s*,\s*(\d+))?\))?$/.exec(s)))
    return { type: 'decimal', precision: Number(m[2] ?? 12), scale: Number(m[3] ?? 0) };
  if (/^(real|float|double precision|double)$/.test(s))
    return { type: 'decimal', precision: 18, scale: 6 };
  if ((m = /^(varchar|char|character varying|nvarchar)\s*\((\d+)\)$/.exec(s)))
    return { type: 'string', length: Number(m[2]) };
  if (/^(text|string|varchar|char)$/.test(s)) return { type: 'string' };
  if (/^bool(ean)?$/.test(s)) return { type: 'boolean' };
  if (s === 'uuid') return { type: 'uuid' };
  if (s === 'date') return { type: 'date' };
  if (/^(datetime|timestamp)( without time zone| with time zone)?$/.test(s))
    return { type: 'datetime' };
  if ((m = /^enum\((.*)\)$/i.exec(raw))) {
    return {
      type: 'string',
      values: splitSql(m[1]).map((x) => {
        if (!/^'(?:[^']|'')*'$/.test(x)) fail('ENUM غير صالح');
        return x.slice(1, -1).replace(/''/g, "'");
      }),
    };
  }
  fail('نوع غير مدعوم: ' + raw, 'UNSUPPORTED_SQL');
}
export function parseSql(source: string, seed = 42): Plan {
  if (source.includes('/*') || source.includes('--'))
    source = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
  const tables: Table[] = [];
  for (const statement of splitSql(source, ';')) {
    const m = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\w]+)\s*\(([\s\S]*)\)\s*$/i.exec(
      statement,
    );
    if (!m)
      fail(
        'يدعم SQL عبارات CREATE TABLE فقط دون أوامر تنفيذية أو خيارات محرك: ' +
          statement.slice(0, 100),
        'UNSUPPORTED_SQL',
      );
    const t: Table = {
      name: identifier(m[1]),
      count: 20,
      fields: [],
      primaryKey: [],
      unique: [],
      foreignKeys: [],
    };
    for (let item of splitSql(m[2])) {
      item = item.replace(/^CONSTRAINT\s+[`"\w]+\s+/i, '');
      let x;
      if ((x = /^PRIMARY\s+KEY\s*\(([^)]+)\)$/i.exec(item))) {
        t.primaryKey = cols(x[1]);
        continue;
      }
      if ((x = /^UNIQUE\s*(?:KEY\s+\w+\s*)?\(([^)]+)\)$/i.exec(item))) {
        t.unique.push(cols(x[1]));
        continue;
      }
      if (
        (x = /^FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([`"\w]+)\s*\(([^)]+)\)$/i.exec(item))
      ) {
        t.foreignKeys.push({
          columns: cols(x[1]),
          table: identifier(x[2]),
          references: cols(x[3]),
        });
        continue;
      }
      const c =
        /^([`"\w]+)\s+((?:double\s+precision|character\s+varying|timestamp(?:\s+(?:with|without)\s+time\s+zone)?|[a-zA-Z]+)(?:\s*\([^)]*\))?)([\s\S]*)$/i.exec(
          item,
        );
      if (!c) fail('قيد SQL غير مدعوم: ' + item, 'UNSUPPORTED_SQL');
      const f: Field = { name: identifier(c[1]), ...fieldType(c[2]), nullable: true };
      let rest = c[3].trim();
      rest = rest
        .replace(/\bNOT\s+NULL\b/gi, () => {
          f.nullable = false;
          return '';
        })
        .replace(/\bPRIMARY\s+KEY\b/gi, () => {
          t.primaryKey.push(f.name);
          f.nullable = false;
          return '';
        })
        .replace(/\bUNIQUE\b/gi, () => {
          t.unique.push([f.name]);
          return '';
        })
        .replace(/\bAUTO_INCREMENT\b|\bAUTOINCREMENT\b/gi, '');
      rest = rest.replace(/\bREFERENCES\s+([`"\w]+)\s*\(([^)]+)\)/gi, (_, table, cs) => {
        t.foreignKeys.push({ columns: [f.name], table: identifier(table), references: cols(cs) });
        return '';
      });
      rest = rest.replace(
        /\bDEFAULT\s+('(?:[^']|'')*'|-?\d+(?:\.\d+)?|true|false|null)(?=\s|$)/gi,
        (_, v: string) => {
          f.default =
            v[0] === "'"
              ? v.slice(1, -1).replace(/''/g, "'")
              : /^(true|false)$/i.test(v)
                ? v.toLowerCase() === 'true'
                : /^null$/i.test(v)
                  ? null
                  : Number(v);
          return '';
        },
      );
      rest = rest.replace(
        /\bCHECK\s*\(\s*([\w"]+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)\s*\)/gi,
        (_, name, op, v) => {
          if (identifier(name) !== f.name) fail('CHECK عبر الحقول غير مدعوم', 'UNSUPPORTED_SQL');
          const n = Number(v);
          if (op === '>=' || op === '>')
            f.min = n + (op === '>' ? (f.type === 'integer' ? 1 : 10 ** -(f.scale ?? 2)) : 0);
          else f.max = n - (op === '<' ? (f.type === 'integer' ? 1 : 10 ** -(f.scale ?? 2)) : 0);
          return '';
        },
      );
      if (rest.trim()) fail('صياغة أو قيد SQL غير مدعوم: ' + rest.trim(), 'UNSUPPORTED_SQL');
      t.fields.push(f);
    }
    for (const k of t.primaryKey) {
      const f = t.fields.find((f) => f.name === k);
      if (f) f.nullable = false;
    }
    tables.push(t);
  }
  return checkPlan({
    version: 1,
    domain: 'imported',
    seed,
    tables,
    rules: [],
    assumptions: ['لم تستنتج قواعد الأعمال المتخصصة من SQL. راجع الدلالات والأعداد قبل التوليد.'],
  });
}
export function parsePrisma(source: string): Plan {
  source = source.replace(/\/\/.*$/gm, '');
  const enums = new Map<string, string[]>();
  for (const m of source.matchAll(/enum\s+(\w+)\s*\{([^}]+)\}/g))
    enums.set(m[1], m[2].trim().split(/\s+/));
  const models = [...source.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g)];
  if (!models.length) fail('لا توجد نماذج Prisma');
  const modelNames = new Set(models.map((m) => m[1]));
  const tables: Table[] = [];
  for (const m of models) {
    const t: Table = {
      name: identifier(m[1]),
      count: 20,
      fields: [],
      primaryKey: [],
      unique: [],
      foreignKeys: [],
    };
    for (const line of m[2]
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      let x;
      if ((x = /^@@(id|unique)\(\[([^\]]+)\]\)$/.exec(line))) {
        const keys = cols(x[2]);
        if (x[1] === 'id') t.primaryKey = keys;
        else t.unique.push(keys);
        continue;
      }
      if (line.startsWith('@@')) fail('سمة Prisma غير مدعومة: ' + line);
      const parts = /^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/.exec(line);
      if (!parts) fail('حقل Prisma غير مدعوم: ' + line);
      const [, name, type, modifier, attrs] = parts;
      if (modelNames.has(type)) {
        const rel =
          /^@relation\(\s*fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]\s*\)$/.exec(attrs);
        if (rel)
          t.foreignKeys.push({ columns: cols(rel[1]), table: type, references: cols(rel[2]) });
        else if (attrs) fail('علاقة Prisma غير مدعومة: ' + line);
        continue;
      }
      if (modifier === '[]') fail('قوائم Prisma العددية والنصية غير مدعومة: ' + line);
      const types: Record<string, Field['type']> = {
        Int: 'integer',
        BigInt: 'integer',
        Float: 'decimal',
        Decimal: 'decimal',
        String: 'string',
        Boolean: 'boolean',
        DateTime: 'datetime',
      };
      const values = enums.get(type);
      if (!types[type] && !values) fail('نوع Prisma غير مدعوم: ' + type);
      const f: Field = {
        name: identifier(name),
        type: values ? 'string' : types[type],
        nullable: modifier === '?',
        ...(values ? { values } : {}),
      };
      let rest = attrs;
      rest = rest
        .replace(/@id\b/g, () => {
          t.primaryKey.push(name);
          f.nullable = false;
          return '';
        })
        .replace(/@unique\b/g, () => {
          t.unique.push([name]);
          return '';
        })
        .replace(
          /@default\((autoincrement\(\)|uuid\(\)|cuid\(\)|now\(\)|"[^"]*"|-?\d+(?:\.\d+)?|true|false)\)/g,
          (_, v: string) => {
            if (v === 'uuid()') f.type = 'uuid';
            else if (!v.endsWith('()'))
              f.default =
                v[0] === '"'
                  ? JSON.parse(v)
                  : v === 'true'
                    ? true
                    : v === 'false'
                      ? false
                      : Number(v);
            return '';
          },
        )
        .replace(/@db\.(VarChar|Char)\((\d+)\)/g, (_, type, n) => {
          f.length = Number(n);
          return '';
        })
        .replace(/@db\.Decimal\((\d+),\s*(\d+)\)/g, (_, p, s) => {
          f.precision = Number(p);
          f.scale = Number(s);
          return '';
        });
      if (rest.trim()) fail('سمة Prisma غير مدعومة: ' + rest);
      t.fields.push(f);
    }
    tables.push(t);
  }
  return checkPlan({
    version: 1,
    domain: 'imported',
    seed: 42,
    tables,
    rules: [],
    assumptions: ['Prisma: تدعم السمات الموثقة فقط؛ لا تنفذ شيفرة المشروع.'],
  });
}
export async function parseSqlite(bytes: Uint8Array): Promise<Plan> {
  if (Buffer.from(bytes.subarray(0, 16)).toString() !== 'SQLite format 3\0')
    fail('ملف SQLite غير صالح');
  const SQL = await initSqlJs();
  let db;
  try {
    db = new SQL.Database(bytes);
    const result = db.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    if (!result.length) fail('قاعدة البيانات فارغة');
    return parseSql(result[0].values.map((r) => String(r[0])).join(';'));
  } catch (e) {
    if (e instanceof Error && 'code' in e) throw e;
    return fail('تعذر فحص SQLite؛ الملف تالف أو يحتوي مخططاً غير مدعوم');
  } finally {
    db?.close();
  }
}
