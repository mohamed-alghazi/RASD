# Verification record

Verified on **14 November 2026**, Windows, Node **24.21.0**, using the actual source in this workspace.

| Check | Actual result |
|---|---|
| `npm run build` | Passed TypeScript and Vite production build |
| `npm test` | **45 passed**, 3 test files |
| `npm run test:browser` | **4 passed**, installed Chrome, desktop and 390px mobile |
| Production smoke | Built frontend + health + security headers + Secure cookie + generation + actual JSON download passed |
| Dependency audit | **0 known vulnerabilities** after patched dependency updates |
| Numeric resource check | **20,000 rows / 240,000 cells**, valid actual data |
| OpenAI live test | Skipped: **OPENAI_API_KEY missing** |
| Tavily live test | Skipped: **TAVILY_API_KEY missing** |
| Replit deployment | Configuration supplied; not deployed or live-tested |

The measured numeric workload produced **4,853,724 bytes**, completed in **1,088 ms**, and reached about **175 MiB peak RSS** on this machine. The full measurement is in `benchmark.json`. This does not certify all upper-bound schemas, concurrent archive processing, or a particular Replit VM size.

## What the tests actually do

- Generate one university, two faculties, four departments/majors and exactly 100 students. Inspect reused university IDs, ancestor consistency, 100 distinct student numbers/names and allowance values. Deliberately break actual references and ensure validation fails.
- Generate one company, five departments, 100 employees, ten projects and 200 tasks. Check exact 30% experience distribution and salary arithmetic. Test multiple non-overlapping title distributions.
- Generate 50 products, customers, orders, line items and payments. Check exact decimal line calculations and order/payment totals. Tamper with a payment and verify failure.
- Parse actual SQL/Prisma/SQLite/ZIP inputs. Generate source-shaped records and execute exported SQL inserts against a disposable SQLite database with FK enforcement.
- Localize a relational American fixture containing departments, jobs, employees, customers, products, orders, items and payments. Check unchanged columns/counts/IDs, new Saudi names/cities, labeled economic estimates, and recalculated totals.
- Read actual exported JSON, parse every table in the CSV ZIP, inspect the relationship manifest, and reopen XLSX with ExcelJS. Verify SQL quote escaping and CSV formula protection. Block exports after actual critical validation failure.
- Test malformed files, traversal, decompression expansion limits, cyclic dependencies, unknown semantics, row/cell/upload limits and two-heavy-job concurrency.
- Test owned sessions/jobs/download history, strict origins, revision approval, source preservation, failed jobs, persistence and missing-provider errors.
- Exercise the real AI HTTP adapter with simulated provider responses: contextual Arabic history is sent, the strict output envelope is required, malformed output is retried once, cross-domain plans are rejected, and upstream failures become controlled Arabic errors.
- In Chrome, navigate RTL/mobile layouts; upload a real SQL schema; edit row counts; generate; open validation; download and inspect bytes; reopen through download history; automatically localize the American fixture; view before/after; download and inspect keys/totals; and switch all three chat domains without state leakage.

Provider-contract tests inject responses and are explicitly labeled. They do **not** establish real model understanding of natural Arabic, live model availability, search relevance across arbitrary real queries, or live market-benchmark accuracy. No live provider results were fabricated.

## Credentials and safe verification

Checked the process environment, Windows user/machine environment, and project configuration candidates without printing secret values. Neither key was present. `.env` was created from the empty template and contains no generated credentials. `.env.local` and `.env` are ignored by Git.

Configure `OPENAI_API_KEY` and `TAVILY_API_KEY` in **`C:\Users\ayham\OneDrive\Desktop\codex-rasd\.env.local`**, the existing ignored `.env`, or Replit Secrets. Restart the server, then run:

```sh
npm run verify:integrations
```

The verifier reports status and counts only. It does not print keys, authorization headers, or raw provider errors. Real AI and research verification remain outstanding until valid credentials are supplied.

## Remaining product limits

The requested full production definition is not certified: research results remain review-only rather than automatically validated market rules; localization uses disclosed economic heuristics; SQL/Prisma and financial rules have documented subsets; PostgreSQL/MySQL exports have not been inserted into running servers; production multi-instance operation requires different storage/coordination. See `SUPPORT.md` for details.

The production smoke command is `npx tsx scripts/smoke-production.ts`. Run it serially after `npm run build`, separately from browser-test process-tree teardown on Windows.
