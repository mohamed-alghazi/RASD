# Supported behavior and explicit boundaries

## Schema imports

SQL accepts only `CREATE TABLE` statements. Supports integer/serial variants, decimal/numeric, real/float, common strings, boolean, date/timestamp/datetime, UUID and inline MySQL ENUM. Supports PKs, composite PKs/FKs, unique keys, nullability, scalar defaults, simple same-column numeric CHECK comparisons, and length/precision/scale. Names use ASCII SQL identifiers up to 63 characters. Quoted simple names are accepted. Foreign keys must reference a declared unique key of the same type.

Unsupported syntax is rejected with a specific error: ALTER/INSERT/DROP, indexes outside table definitions, table-level CHECK, arbitrary expressions and generated columns, schemas/namespaces, engine options, referential actions, JSON/array/binary types, deferrable constraints, functions as defaults, and dependency cycles. SQL comment preprocessing is deliberately limited; avoid comment markers inside SQL literal values. SQLite is opened in an isolated SQL.js in-memory database only to query `sqlite_master`; supplied CREATE statements are parsed, not executed. SQL.js is WASM, with no access to a privileged host database.

Prisma supports line-separated models/scalars, enum values, `@id`, `@unique`, `@@id`, `@@unique`, supported scalar defaults, autoincrement/uuid/now IDs or dates, `@db.VarChar`, `@db.Char`, `@db.Decimal`, and simple `@relation(fields: [...], references: [...])`. Lists of scalars, mappings, custom relation attributes, indexes and unsupported scalar attributes are rejected. Default expressions do not call external code. Generated string keys are synthetic identifiers; they do not reproduce cuid/opaque provider algorithms. Datasource and generator declarations are not executed.

ZIP projects must contain exactly one selected SQL, Prisma or SQLite schema. Other files are ignored and never executed. Automatic merging of multiple migrations or competing schemas is unsupported. Paths and decompressed sizes are bounded; nested data ZIPs are rejected.

## Rules and generation

- `range`: bounded numeric values.
- `distribution`: exact rounded count for each requested value; remaining rows require a valid alternative.
- `experience`: exact rounded percentage above a threshold.
- `chronology`: supported before/after ordering.
- `finance`: quantity × unit price × (1 − fractional discount), optionally tax-exclusive with an explicit tax rate, rounded to two decimal places.
- `mirror`: copy an existing referenced value, such as a product price or order payment amount.
- `rollup`: sum a child field grouped by its actual parent FK.

Finance execution order is price mirrors → line calculations → rollups → total/amount mirrors. Arbitrary chained accounting graphs, partial payments, currency mixtures, row-specific tax regimes, shipping/fee allocations and general-purpose expressions are unsupported. Contradictions cause failure; they are never silently ignored. Full constraint solving, automatic nullable-cycle resolution and arbitrary cross-entity semantic inference are not implemented.

The generator combines deterministic Saudi catalogs with seeded typed values. Primary/FK pools and composite tuples are real shared records. Parent cardinality is specified in the reviewed plan. Date generation is deterministic and intentionally bounded, rather than a historical simulation. Synthetic contact data must never be used to call or message people. Phone numbers have Saudi format but are not guaranteed to belong to a reserved telecom range.

## Localization

CSV, JSON, XLSX and ZIP are supported. CSV values remain strings, JSON primitive types remain primitive types, and XLSX accepts plain scalar cells; formulas, dates represented as Excel objects, rich text and other complex cells are rejected. Tables must have homogeneous simple columns and at least one row. Column names and table filenames use simple ASCII identifiers. A single JSON object can contain multiple related tables.

Primary keys are inferred from unique non-null `id` or a unique `*_id`, `*_number`, `*_code`. Standard `*_id` names infer relationships only when a corresponding table/key exists with a matching type. CSV carries no unique/type constraint metadata; provide a plan when that information matters. IDs, inferred FK fields and declared unique fields are preserved. Unrecognized fields are left unchanged; they are not translated blindly.

Economic estimates are intentionally disclosed. Salary estimates currently use a baseline plus experience and a title factor; they are not a city/industry-calibrated Saudi salary survey. Product estimates use a disclosed heuristic based on source values; they are not evidence-derived Saudi market price predictions. A supplied `currencyRate` is labeled conversion. Mixed currencies, annual versus monthly compensation, benefits, academic eligibility and specialized sector semantics are not automatically resolved. Review uncertain inputs or preserve amounts.

Supported source invoice formulas are inferred only if all existing rows match. Source discounts must be fractions (0–1). A uniform explicit `tax_rate` is retained, or the existing formula must match without tax. RASD does not determine legal VAT classification or apply 15% by default. Income and pricing estimates are testing conveniences, not financial/tax advice. The transformations panel distinguishes synthetic replacements, estimates and conversions.

## Research

Real Tavily requests use `TAVILY_API_KEY`, a targeted query per topic/context, a one-hour in-memory cache, and Saudi/topic relevance filtering. Unrelated railway-station content fails the tax/payments filter. Evidence shows title, HTTPS link, excerpt, field, and applied status. Excerpts are discovery evidence, not automatically verified numerical benchmarks. No source is marked applied unless the application applies it; supported source bounds and exact quotes can now affect actual records; other results remain review-only. No external sources are manufactured when the provider is missing or unavailable.

## Exports

JSON is the lossless recommended format for table structure and primitive types. CSV ZIP contains one file per table, `schema.json`, and import notes; CSV cannot distinguish null from empty text and prefixes formula-like cells with an apostrophe. XLSX uses scalar cells, freezes headers, supports Arabic, and limits sheet names to 31 characters. SQL exports contain INSERT statements in parent-first order for an existing matching empty schema. SQLite insertion is tested. PostgreSQL/MySQL syntax is provided but is **not certified against running servers**. MySQL strings containing backslashes are rejected to avoid dependence on SQL mode. SQL exports do not create tables.

## Enforced initial limits

| Area | Limit |
|---|---|
| Schema standalone | 4 MiB SQL/Prisma/SQLite |
| Schema ZIP | 20 MiB compressed, 12 MiB expanded |
| Generation | 50 tables, 50 fields/table, 10,000 rows/table |
| Generation total | 20,000 rows, 250,000 cells, 8 MiB estimated/actual JSON output |
| Localization upload | 10 files, 10 MiB combined |
| Localization data | 30 tables, 300 columns, 10,000 rows, 200,000 cells |
| Data ZIP expanded | 24 MiB; XLSX expanded 40 MiB |
| Heavy operations | 2 per process |
| Temporary jobs | 20 per browser owner, 100 per process; retained-result memory admission cap |
| Expiry | 24 hours default, configurable 1–168 hours |

Uploads, selected archive bytes and generated rows are never silently truncated. Preview intentionally shows only the first 20 rows, with the actual full count visible. Export downloads revalidate the actual full dataset. The preview limit is not a data truncation.

Local atomic JSON persistence is appropriate for a small single-process installation; use a transactional database and private object storage for larger production workloads. Storage does not provide encryption at rest, authenticated accounts, team sharing, a distributed worker queue, or a global multi-instance semaphore. Resource caps reduce risk but have not been load-certified on a Replit VM. The benchmark measures one numeric dataset, not every allowable schema or decompression adversary.

## Current cloud activation changes

OpenRouter/NVIDIA is the selected provider; the exact model must be verified from the live catalog. The original Windows verification report is historical. See `CLOUD-VERIFICATION.md` for current results and network blockers.

Commerce templates now carry explicit generic mirror/finance/rollup rules; renamed tables use the same engine. Unsupported multi-stage accounting graphs remain outside the supported subset. Occupational localization translates a small known glossary and preserves unfamiliar titles rather than assigning unrelated roles; salary estimates use original seniority. These changes do not turn heuristic estimates into researched benchmarks.

## Evidence-to-rule support

The current implementation supports a conservative subset of researched salary bounds, experience applicability, and matching product/service quotes. See [the current pipeline contract](RESEARCH-PIPELINE.md) for trusted-source, unit, conflict and financial guards. Earlier review-only statements in historical verification reports are superseded by [the research verification report](RESEARCH-VERIFICATION.md).
