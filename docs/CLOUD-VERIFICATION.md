# RASD cloud activation — 14 November 2026

**Not ready for full hackathon acceptance:** live OpenRouter/NVIDIA and Tavily verification remain blocked by outbound network policy. No exact NVIDIA model has been guessed. The real frontend/backend and the deterministic generation/localization workflows run.

## Environment and source

- Repository: `aysaama/-RASD-V2`. Checkout branch: `work`, HEAD `44b395563d3b64ac2f15285c92d636dc29f6b194`, matching the observed remote `main` tip. No branch reset, push, publication or deployment.
- The original Git commit contains root configuration plus `rasd-source.zip`; source directories were absent. Missing source was safely extracted without overwriting existing files. Extracted source remains untracked for review; the original ZIP is unchanged. Keep these files in the reviewed environment snapshot or commit them before expecting a fresh Git-only checkout to include repairs.
- Node 24.22.1, npm 11.9.0; 406 lockfile dependencies installed with `npm ci`. The lockfile and dependency declarations are unchanged. npm cache uses writable `/workspace/.npm-cache`.
- Development frontend: Vite port 5173. Backend: Fastify port 3001. Health and frontend proxy requests passed. Production serves built frontend and API from one Fastify process.
- Shared desktop/preview-opening tools are unavailable in this session. Installed Chromium was used for real browser tests; no public or localhost preview link is claimed.

## Provider and research status

- Selected provider: **OpenRouter**, base `https://openrouter.ai/api/v1`, **NVIDIA models only**. `AI_MODEL` is unresolved pending access to the live catalog.
- Existing `keymohamed` maps in memory to `OPENROUTER_API_KEY`; `keyayham` maps in memory to `TAVILY_API_KEY`. Both are present. Neither value was printed, saved in a source file, or included in build artifacts.
- Requests to both OpenRouter's public model catalog and Tavily are blocked by HTTP CONNECT 403. Authentication and model capability are therefore unverified, rather than invalid credentials.
- **Live AI turns: 0. Successful real Tavily searches: 0.** The integration verifier attempted research and reported `unavailable`. No source relevance, attribution or evidence application is claimed from live results.
- Provider-contract tests use simulated HTTP responses and independently validate returned plans. They cover OpenAI, Gemini, Anthropic, DeepSeek, compatible transports, and OpenRouter's strict parameter/NVIDIA policy. They do not prove model availability or Arabic understanding.
- Research remains **review-only**. It uses a topic/Saudi filter and caches successful research for one hour. No numerical rule is promoted from unverified excerpts. Salary and product-price transformations remain labeled heuristics or explicit user-specified currency conversions, without source-backed benchmark claims.

## Executed checks

| Check | Outcome |
|---|---|
| Unit/API/provider/regression suite | 60 passed, 0 failed, 0 skipped |
| Chromium browser suite | 4 passed, 0 failed, 0 skipped |
| TypeScript and production Vite build | Passed |
| Production smoke | Real static frontend, health, CSP, Secure cookie, generation and downloaded JSON passed |
| Dependency audit | 0 known vulnerabilities at verification time |
| Actual API university generation | 1 university, 2 faculties, 4 departments, 100 students; unique student numbers, shared university and consistent ancestor references |
| Actual API company generation | 1 company, 5 departments, 100 employees, 10 projects, 200 tasks; exactly 30 employees above 5 years' experience |
| Actual API commerce generation | 50 products, 100 customers, 100 orders, 200 items, 100 payments; validated references, prices and totals |
| Actual API localization | American fixture: 8 related tables / 8 rows; unchanged columns, IDs, row counts and relationships, Saudi names/cities and consistent financial totals |
| Downloads for all four actual datasets | JSON revalidated, every CSV ZIP table parsed, XLSX sheets reopened and row counts inspected, SQL INSERT counts inspected |
| Disposable database | Existing engine suite executes exported SQL against SQL.js SQLite with FK enforcement |
| Real schema-upload API inputs | SQL, Prisma, SQLite, ZIP examples and actual PostgreSQL/MySQL-subset files parsed; resulting records generated and validated |
| Resource benchmark | 20,000 rows / 240,000 cells, valid; 4,853,724 bytes; about 18.2 seconds, ~138 MiB peak RSS in this run |
| Secret hygiene | `.env`/`.env.local`/`.data` ignored; no existing credential-value matches in source or build artifacts |
| Replit deployment/capacity | Not run; existing Node 22/single-VM configuration retained |

The browser tests use the real backend for RTL/mobile navigation, upload, review, generation, validation, automatic localization, downloads/history and domain switching. AI calls are unavailable in these tests; contextual Arabic live quality remains unverified. API session/approval tests inject the AI boundary explicitly and prove ownership/revision handling, rather than live model understanding.

Actual downloaded datasets and exports are retained privately in `.data/acceptance/`. Screenshots are in `test-results/`. These generated directories are ignored by Git.

## Repairs and code review

Small changes relative to the uploaded source:

- `server/provider.ts` (new), `server/ai.ts`, `server/config.ts`, `server/app.ts`: isolated provider transports, in-memory credential aliases, selected-provider health metadata, strict local validation, no automatic provider switching. OpenRouter requires NVIDIA, structured parameters and no fallback.
- `server/catalog.ts`, `server/generator.ts`, `examples/commerce-plan.json`: commerce price mirrors, line arithmetic, order rollups and payment mirrors use generic executable rules instead of fixed table names. Employee generation accepts alternate schemas and preserves explicit salary values/rules.
- `server/validation.ts`, `shared/schema.ts`: reject impossible calendar dates, missing nullable columns, invalid financial inputs and incompatible numeric/date rule fields.
- `server/localization.ts`: preserve unfamiliar occupations, translate known titles without substituting unrelated jobs, and calculate salary seniority from original/related job records.
- `client/main.tsx`: provider-neutral credential notice; visual identity preserved.
- `playwright.config.ts`: optional Linux Chromium executable; existing Chrome default retained.
- `tests/regressions.test.ts` (new), `tests/providers.test.ts`, `tests/browser/ui.spec.ts`: targeted regressions and provider/browser configuration checks.
- `scripts/select-openrouter-model.ts`, `scripts/verify-demo.ts`, `scripts/verify-imports.ts` (new), `scripts/verify-integrations.ts`: reproducible model discovery/authentication, low-call Arabic verification, real dataset/download checks and actual schema-file checks.
- `.env.example`, `README.md`, `docs/SUPPORT.md`, `docs/benchmark.json`, this report: configuration and current evidence.

Original architecture, package declarations, lockfile, source archive and Replit deployment settings are preserved. No application redesign or public deployment was performed.

## Commands and saved environment configuration

Run from `/workspace/-RASD-V2`:

```sh
npm ci --cache /workspace/.npm-cache
NODE_USE_ENV_PROXY=1 npm run dev
npm test
npm run build
NODE_USE_ENV_PROXY=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
npx --no-install tsx scripts/smoke-production.ts
npx --no-install tsx scripts/verify-demo.ts
npx --no-install tsx scripts/verify-imports.ts
npm audit --cache /workspace/.npm-cache
```

After network access is applied:

```sh
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/select-openrouter-model.ts
NODE_USE_ENV_PROXY=1 npm run verify:integrations
```

The selector queries the current catalog, restricts to suitable advertised NVIDIA text/structured models, checks OpenRouter authentication, then saves only the exact nonsecret model ID. The verifier runs two Arabic turns (including contextual `100`), validates the generated plan/actual employee records, and makes one targeted Tavily query. Provider contract/advertised capability is not a substitute for passing those calls.

Saved draft fields: `install_script`, `start_skill`, `AI_PROVIDER=openrouter`, `AI_BASE_URL=https://openrouter.ai/api/v1`, and custom network domains `openrouter.ai`, `api.tavily.com`. Existing network presets/bindings are preserved. The installation script safely extracts only missing archive entries, uses frozen npm installation and builds. Startup instructions use the existing checkout, describe restart/readiness, credential mapping and outstanding live verification.

A confirmed draft save does not apply network changes, execute scripts or publish an environment. Review/save the network changes in environment settings to unblock live calls. Publish the prepared environment snapshot only after the remaining work is complete and reviewed; no new-task snapshot restoration is claimed.

## Remaining acceptance gaps

1. Apply the network destinations, then verify exact NVIDIA model availability, authentication, structured output and real Arabic conversations. No fallback provider is selected.
2. Obtain successful Tavily responses and inspect actual topical evidence. Research currently does not drive salary/product market benchmarks; those remain estimates. A reliable evidence-to-market-rule system remains outstanding.
3. SQL/Prisma support is a documented subset. Arbitrary schemas/business semantics, complex invoice chains, partial payments and mixed currencies require explicit rules or are rejected. PostgreSQL/MySQL exports were not imported into running servers; SQLite was.
4. Localization uses a limited occupation glossary and heuristic salary/product estimates; it is not an industry/city/category-calibrated Saudi market model. Unfamiliar fields are preserved. Unique fields remain protected.
5. Replit account deployment, persistent-storage configuration, production load and multi-instance coordination are unverified. The current local store is suitable for one controlled process, not autoscaling.

These limitations prevent a claim that the complete requested system is ready for hackathon acceptance, despite the verified offline workflows and repairs.
