# Research-driven generation and localization

## What changes actual values

`server/benchmarks.ts` turns accepted evidence into bounded, declarative rules. Both generation jobs and Saudi Localization call this pipeline, then validate actual records before completion. No model or search is called per record. OpenRouter/NVIDIA remains unchanged; benchmark extraction is deterministic and does not require another AI call.

1. Inspect monetary fields and available occupation/item/unit metadata. Keys, unique fields, derived mirrors/rollups, explicit values/defaults and explicit field rules are protected.
2. Select at most three distinct research targets per job, prioritizing coverage across fields. Missing salary periods or item identities do not qualify for source-backed rules.
3. Query Tavily for the specific subject and unit; use regional site targeting for known storefronts. Cache successful responses for one hour and failures for one minute. Cached evidence is cloned so one job cannot inherit another job's `applied` flags.
4. Reject mismatched geography, occupations, product variants and rule contexts. Social anecdotes, remote job listings and inappropriate sources are rejected. Official status alone is insufficient.
5. Extract only supported monetary facts from an allowlist of salary publishers and sellers. Require an exact subject in the title, explicit SAR amounts, compatible periods, an unambiguous price/range, and fresh retrieval. Store the excerpt, source URL, target and retrieval time. Conflicting facts stay unapplied.
6. Validate a strict Zod rule and rederive it from its source before application. No retrieved text is executed, and no retrieved page can select arbitrary fields or calculations.
7. Intersect salary ranges with schema bounds. Apply exact item/service observations only to matching rows and billing periods. Preserve source primitive types and all identifiers. Recompute existing verified invoice formulas with Decimal.js.
8. Record matched/changed row indexes and counts, resulting extrema, classification, rule ID and provenance. A source is marked applied only when it actually changes a value.
9. Validate source-bound values and ordinary relational/financial constraints. Download routes recheck applied bounds before exporting. Completion is reported only after final data/audit persistence succeeds.

## Meaning of the classifications

- `source-bounded-estimate`: an estimate constrained to an observed salary range. It is not an exact salary observation or a representative Saudi market estimate. Existing experience estimates remain heuristics unless the source explicitly supplies a supported experience band; such a band applies only to that cohort.
- `observed-price`: a specific matching seller's SAR offer and unit, not an average market price or a guarantee of continued availability.
- `estimate`: an unverified synthetic fallback. Current product fallbacks are heuristics derived from source values, not researched market prices.
- `conversion`: an explicitly supplied currency conversion. This path bypasses research and is never labeled market localization.
- Review-only evidence: insufficient specificity, conflicting data, unsupported parsing, stale retrieval, or incompatible applicability. It does not alter values.

The existing collapsed research/transform panels show application status and distinguish applied sources from reviewed evidence. `/api/jobs/:id/research` returns the structured rules and row-level application audit; `/preview` returns transformation explanations. Dataset columns remain unchanged; keep the audit JSON beside exported data when provenance is needed.

## Supported subset and limits

Salary rules currently accept explicit monthly SAR bounds from GulfTalent, Naukrigulf and supported Hays pages. A single explicit numeric experience band can be enforced; complex multi-cohort tables remain review-only. Annual total compensation is not silently treated as monthly base pay. Localization respects an explicit annual salary period in its fallback estimate.

Price extraction supports unambiguous quotes from selected IKEA, Jarir, Extra, Microsoft, STC and Mobily pages. Subject/specification, Saudi storefront and unit checks still apply. Multiple prices, instalments, bundles, delivery charges, unclear variants and unsupported billing syntax are rejected. Storefront membership alone is not sufficient evidence.

Tax and regulatory applicability are not inferred from a generic search excerpt. Existing explicit tax treatment/formulas are preserved. Price quotations cannot override datasets with incompatible nonzero tax treatment. Automatically determining VAT eligibility, applying new legal obligations, currency mixtures, complex payroll contracts and arbitrary accounting graphs remain unsupported and need explicit rules/clarification.

The three-target budget intentionally leaves other subjects as disclosed estimates or preserved values. Publisher/merchant coverage is limited. Retrieval timestamps and a trusted publisher do not establish a statistically representative survey, legal authority for employment decisions, or guaranteed current stock/pricing.

## Verification commands

```sh
npm test
npm run build
NODE_USE_ENV_PROXY=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

Opt-in live acceptance check (up to three Tavily searches; no AI calls):

```sh
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/verify-research.ts
```

It runs real generation/localization jobs, saves actual downloads and research audits under ignored `.data/research-acceptance`, and fails if no accepted benchmark changes actual records. Supported evidence can change over time; an unavailable/ambiguous source is a real failed live acceptance check, not a reason to invent a benchmark.
