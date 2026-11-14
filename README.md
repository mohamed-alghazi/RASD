# RASD — رصد

An Arabic RTL full-stack synthetic-data application. Three connected services: AI conversation planning, schema-based generation, and Saudi localization. This repository runs locally and includes Replit configuration; it has **not been published or deployed**.

## Run

Requirements: Node.js 22.12+ (verified on Node 24.21), npm, and a writable persistent data directory.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to Fastify on port 3001. If either port is occupied, configure `PORT`, `VITE_API_PORT`, and `VITE_PORT` together in your shell; Vite deliberately fails on a port collision. When using a different browser origin, set `PUBLIC_ORIGIN` accordingly.

For this existing Windows workspace, the automatically created, ignored `.env` selects **http://localhost:5193**, with API port 3193, to avoid other applications already using the default ports. A fresh checkout without `.env` uses 5173/3001. Both Vite and the server read local environment configuration.

```sh
npm run build
npm test
npm run test:browser
npm run benchmark
npm run verify:integrations
```

Browser tests use an existing Chrome installation and dedicated ports 5187/3187. On Linux CI, install Chrome or adjust `channel` in `playwright.config.ts` to your installed Playwright Chromium. On this Windows environment, tests need permission to write their temporary data and connect to loopback sockets outside the sandbox.

For a production start, build first, set `NODE_ENV=production` in the host environment, then run `npm start`. Fastify serves the built frontend and API together. `GET /api/health` reports readiness and provider configuration booleans, never credentials.

## Provider credentials

The selected cloud provider is **OpenRouter**, with an **NVIDIA** model required. No exact model is configured until the live catalog and authentication can be verified. The cloud environment bindings `keymohamed` and `keyayham` are mapped in memory to `OPENROUTER_API_KEY` and `TAVILY_API_KEY`; their values are never written to files.

Use environment settings or Replit Secrets:

```dotenv
AI_PROVIDER=openrouter
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=<exact verified NVIDIA model ID>
OPENROUTER_API_KEY=<secure value>
TAVILY_API_KEY=<secure value>
```

Keep values out of Git. `.env.local` and `.env` are ignored. Process environment takes precedence over `.env.local`, then `.env`. Do not copy the angle-bracket placeholders into your configuration.

After allowing `openrouter.ai` and `api.tavily.com`, run:

```sh
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/select-openrouter-model.ts
NODE_USE_ENV_PROXY=1 npm run verify:integrations
```

The selector checks the current public catalog, restricts candidates to NVIDIA text models with sufficient context and advertised structured response support, prefers advertised strict structured outputs, checks authentication, and saves only the model ID to ignored `.env.local`. Advertised capability still requires live Arabic/plan validation. OpenRouter requests require supported parameters and disable provider fallback; no non-NVIDIA model is selected automatically. `NODE_USE_ENV_PROXY=1` enables the managed HTTPS proxy on Node 24; direct Replit networking normally does not need it.

The transport adapter also supports explicit `openai`, `gemini`, `anthropic`, `deepseek`, and `compatible` selections, each with its own credential variable. `AI_MODEL` and `AI_BASE_URL` override provider defaults; `AI_KEY_ENV` selects an existing credential binding. There is no automatic provider switch. Every provider response passes the same strict Zod envelope and deterministic plan validation before use. See `.env.example` and [current cloud verification](docs/CLOUD-VERIFICATION.md).

## Try the services

- **Quick Generate:** upload `examples/contracting.sql`, `examples/company.prisma`, or a SQLite file. Set companies to 1 and employees to 100, inspect the plan, then generate. Required text fields without a recognized meaning require an explicit `semantic`, `values`, or `default` in the advanced plan editor; the system stops rather than inventing filler.
- **Saudi Localization:** upload `examples/american.json` for related products/orders/payments and employees, or `examples/employees.csv`. Source formulas are inferred only when every source row matches the supported arithmetic. Ambiguous financial data stops with guidance to preserve amounts or supply explicit rules.
- **AI Chat:** configure the selected provider and verified model, select one of the three supported domains, describe your needs, review/edit the proposed plan, and explicitly approve generation. Domain changes create independent sessions. Prior sessions can be resumed only through the history action.

## Architecture

```text
client/          React workspaces, plan editor, upload UI, preview and exports
shared/schema.ts Strict intermediate schema and constraint contracts
server/app.ts    Fastify routes, ownership, limits, job lifecycle and errors
server/ai.ts     Provider-independent structured planning and validation
server/provider.ts OpenRouter/NVIDIA and isolated provider HTTP transports
server/parsers.ts SQL/Prisma subsets and read-only SQLite schema inspection
server/generator.ts Seeded values, parent pools, dependency ordering and rules
server/validation.ts Checks on actual rows, references, constraints and money
server/localization.ts Structure-preserving transformations and uncertainty labels
server/research.ts Targeted Tavily requests, relevance filter and one-hour cache
server/exports.ts UTF-8 JSON, CSV ZIP, XLSX and escaped SQL inserts
server/store.ts  Atomic local metadata persistence, ownership and expiry cleanup
tests/           Engine, provider-contract, API, export and browser tests
examples/        Actual importable sample files
docs/            API, supported subsets, verification and deployment details
```

Generation creates parent records once, orders tables by dependencies, selects FK tuples from existing rows, and aligns shared ancestors. It never calls an LLM per record. Invalid data cannot be downloaded as a successful dataset. Financial arithmetic uses Decimal.js. Price mirrors run before line-item formulas, followed by rollups and payment mirrors. Domain templates provide university, employment and commerce starting plans; imports use the same generic engine.

Application storage is an anonymous browser-owned cookie session, not an account system. The cookie is opaque, HttpOnly and SameSite Strict; production adds Secure. Session/job lookups check ownership. Metadata and datasets expire after 24 hours by default. Keep `DATA_DIR` private, backed by a persistent volume, and outside `dist/client`.

## Deployment on Replit

1. Import the complete repository into a Node.js Repl and run `npm ci`.
2. Add `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `OPENROUTER_API_KEY`, `TAVILY_API_KEY`, and your exact deployment HTTPS origin as `PUBLIC_ORIGIN` in **Secrets**. Optional settings are in `.env.example`.
3. Use `npm run dev` in development. `.replit` exposes Vite port 5173, with the backend private on 3001.
4. Use a single-process Reserved VM deployment. The configured build runs `npm ci && npm run build`; production runs Fastify on port 5173 to match the exposed port.
5. Configure persistent private storage for `DATA_DIR`. Confirm `/api/health`, then run a small schema upload, generation, localization and download in the deployed environment.
6. Set the exact public origin; foreign browser origins are rejected. Do not enable permissive CORS or expose the storage directory.

The two-heavy-operation limit is **per process**, including upload inspection. Use one process/instance for the initial deployment. Multiple instances require shared ownership/session storage, a distributed queue/semaphore, and coordinated expiry. Autoscaling ephemeral disks are not sufficient for the current local store.

## Verification and limits

See [verification](docs/VERIFICATION.md), [supported formats and rules](docs/SUPPORT.md), and [API reference](docs/API.md). `docs/benchmark.json` records an actual 20,000-row / 240,000-cell numeric workload on the development machine. This is a measured example, **not** production capacity certification.

Known boundaries: live OpenRouter/Tavily calls and Replit deployment remain unverified without credentials/account access; research applies only supported source bounds and exact quotes through a validated pipeline; other excerpts remain review-only; salaries and prices are labeled estimates or explicit conversions; unfamiliar domain semantics and complex invoices require user rules. Read the detailed support document before production use.

## Research-driven values

Generation and localization now apply validated salary bounds and exact matching Saudi price quotes, with record-level provenance and export revalidation. Unsupported or ambiguous evidence remains unapplied. See [pipeline contract](docs/RESEARCH-PIPELINE.md) and [actual live verification](docs/RESEARCH-VERIFICATION.md).

## Simplified workflows

Quick Generate now starts automatically after upload; localization shows before/after directly. Technical controls are optional, AI Chat still requires explicit plan approval, and downloads are available near the top of results. See [UX audit and verification](docs/UX-SIMPLIFICATION.md).
