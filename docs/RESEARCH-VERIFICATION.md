# Research pipeline verification — 14 November 2026

The existing RASD architecture now applies narrowly validated research to real data. OpenRouter/NVIDIA, Tavily, the three services, upload limits and visual identity are preserved. No dependencies were added or upgraded, credentials were not exposed, and nothing was published.

## Actual live evidence and values

Four real Tavily searches were made: software-engineer salaries, an IKEA product, Microsoft 365 Personal, and a refined Saudi IKEA search. Generation reused the salary result from memory. No AI calls were needed for this work.

| Operation | Before evidence application | Actual result | Classification/provenance |
|---|---:|---:|---|
| Localized software engineer, 2 years | SAR 8,600 heuristic | SAR 8,600 | Estimate within an observed range; unchanged by the bound |
| Localized software engineer, 12 years | SAR 16,600 heuristic | SAR 14,000 | Source-bounded estimate; GulfTalent's reported monthly range was SAR 1,500–14,000 |
| Microsoft 365 Personal, yearly | SAR 299.97 heuristic from USD 99.99 | SAR 429.99/year | Exact observed Saudi Microsoft annual offer |
| IKEA LACK white 55×55 table | USD 20 source | SAR 71.25 heuristic | Estimate only; no clear matching quote was accepted |
| Generated software engineers | Existing seeded salary estimates | 21 of 100 salaries changed; all within compatible SAR 7,000–14,000 bounds | Source range intersected with the plan's minimum; exactly 30 employees still have >5 years' experience |

Sources actually used:

- [GulfTalent, Software Engineer Salaries in Saudi Arabia](https://www.gulftalent.com/saudi-arabia/salaries/software-engineer). The returned source describes a small respondent sample, not a universal employment constraint. The engine uses it only as a disclosed observed bound on synthetic estimates. Experience differences in this live example remain heuristic; the live source did not establish an experience curve.
- [Microsoft Saudi, Microsoft 365 Personal](https://www.microsoft.com/en-sa/microsoft-365/p/microsoft-365-personal/cfq7ttc0k5bf). The retrieved annual offer was 429.99 SAR/year; its billing period matched the source row.

The American source fixture contains 7 tables / 8 rows: two employees, a product, an annual service, a customer, an order, an order item and a payment. Columns, table/row counts, IDs and FK connections were preserved. The final product/order/payment amounts are 71.25 / 128.25 / 128.25, using the existing quantity-two, 10%-discount formula without adding VAT. The subscription has no invented relationship to the product invoice.

The original running-API jobs produced downloaded datasets and audits. Final extraction guards were then revalidated against the same captured live evidence without new calls. JSON was reopened, every CSV ZIP table parsed, XLSX sheets reopened, and SQL inserted into a disposable SQLite database with foreign keys enabled. SQLite row counts, FK checks and the actual subscription amount passed.

Evidence-only artifacts and final actual outputs:

- `.data/research-acceptance/american-source.json`
- `.data/research-acceptance/live-searches.json` and `product-research.json`
- `.data/research-acceptance/final-localized.json`, `.zip`, `.xlsx`, `.sql`
- `.data/research-acceptance/final-audit.json`
- `.data/research-acceptance/final-generated.json` and `final-generation-audit.json`

These directories are ignored and private; source provenance is kept alongside data rather than adding columns.

## Relevance and safety

Regression cases reject the previously retained Indeed remote/US listing, social anecdotes, a railway/VAT page offered as payment-settlement evidence, wrong occupations, wrong storefronts, different finishes/specifications, stale evidence, annual/monthly confusion, conflicting quotes and ambiguous offers. Unrelated stock-market results and nonmatching IKEA variants from the live searches were not used as price rules.

A schema-validated rule is rederived from its original evidence before application. Tampered bounds are rejected. Downloads also reject persisted records that violate an applied range. Existing key/unique constraints, explicit values/rules and tax treatment are protected. The job completion/persistence race discovered by the regression test was fixed.

## Automated results

Final unit/API/provider/regression suite: **78 passed, 0 failed, 0 skipped**. Chromium browser suite: **4 passed, 0 failed, 0 skipped**. TypeScript, the production Vite build, and the production startup/static frontend/security-cookie/generation/download smoke check passed. The suite covers simulated Tavily/AI boundaries separately from the four actual searches. Browser tests run the real backend and downloads with live research disabled to avoid extra credits; they are not counted as live AI/research tests.

No claims are made that all prices are now researched, the salary sample is representative, the chosen service quote is a market median, or legal VAT applicability is inferred. See [pipeline contract](RESEARCH-PIPELINE.md) for the supported subset and remaining limits.

## Files changed for this task

- New: `server/benchmarks.ts`, `tests/benchmarks.test.ts`, `scripts/verify-research.ts`, these research documents.
- Updated: `server/research.ts`, `server/app.ts`, `server/localization.ts`, `server/generator.ts`, `server/files.ts`, `shared/schema.ts`, `server/ai.ts`, `client/components.tsx`, `tests/providers.test.ts`, `playwright.config.ts`, `README.md`, `docs/SUPPORT.md`.
- Provider transports, package declarations, lockfile and Replit deployment settings are unchanged in this task. Earlier workspace changes were preserved.
