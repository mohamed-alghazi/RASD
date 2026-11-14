# RASD UX simplification — 14 November 2026

The existing Arabic RTL identity, glass surfaces and three services are preserved. The normal path no longer requires table configuration, schema details, research methodology, raw rules or JSON editing.

## Screen and journey audit

| Area | Observed friction | Change |
|---|---|---|
| Home/navigation | Localization less prominent; breadcrumb/status/English labels repeated the selected service; navigation discarded screen state | Direct localization entry; shorter Arabic workspace header; retain visited workspaces; browser Back/Forward and direct service links work |
| Quick Generate | Mandatory plan screen, one count input per table and explicit approval before any output | Upload starts inspection, generation/research and validation automatically; shared organization defaults and finite-unique/one-to-one caps; default counts and all per-table controls remain optional |
| Unknown schema fields | A required unfamiliar string could fail with instructions to edit semantic/JSON | Ask one plain-language question for example values, then continue automatically; never invent a meaning or silently fill a required business field |
| Saudi Localization | Mostly automatic already, but duplicate advanced settings/reprocess controls and a hidden comparison made the result harder to use | One collapsed Advanced section; automatic upload-to-results path; changed main entity selected; visible before/after; no extra confirmation |
| Financial ambiguity | Failure asked users to understand finance rules | Visible explanation and a direct preserve-original-amounts action; explicit monthly/annual clarification when the backend requests it |
| AI Chat | Instruction sidebar repeated the process; plans displayed all table controls; active-domain clicks reset conversations | Compact plan beside the conversation; one explicit approval action; collapsed plan editing; keep current domain on active-tab clicks; preserve drafts on service navigation |
| Long chat replies | Technical/lengthy content could dominate the conversation | Short-response instruction to the existing provider; long assistant text is collapsed with Show more; plain text stays safely escaped |
| Session/history | Empty history had little feedback; concurrent navigation could make stale responses confusing | Empty-state feedback, existing epoch isolation preserved/strengthened, stale approval chains stop between requests, real delayed-session regression |
| Results/downloads | Time/size metadata and a full table preceded download; before/after was collapsed | Download near the top; Excel default when table names can be preserved, JSON fallback otherwise; optional format/dialect choice; concise counts and short preview |
| Data previews | Technical identifiers dominated small screens | Friendly labels; business columns first, all identifiers still available through horizontal scrolling; clear overflow hint and keyboard focus |
| Quality/evidence | Several technical sections competed with the result | Group validation, source/application details and transformations under collapsed Quality and sources; economic qualification remains visible before download |
| Recovery | Network errors could expose English transport text | Arabic network feedback and a retry that retrieves the existing result without creating a new job |
| Downloads/history | A selected result appeared below the whole history list | Focused result view with a return action; refresh history on return to the service |
| Management | Delete was a prominent trailing action | Optional result-management disclosure; new task and deletion remain available |
| Request client | Empty-body JSON POSTs caused actual approval/generation errors; cancel/delete were affected too | Set JSON content type only when sending a JSON body; the real approval-to-download journey now passes |

## Main paths now

- **Saudi Localization:** upload → automatic analysis/research/transformation/validation → visible comparison → download. A material ambiguity produces a focused recovery question; financial uncertainty never becomes a silently verified fact.
- **Quick Generate:** upload schema/ZIP → safe defaults → automatic generation/research/validation → preview/download. Only unfamiliar required data asks for clarification. Counts and all technical controls are optional.
- **AI Chat:** choose domain → converse → concise plan → explicit approval → generation/validation → preview/download. Domain isolation and current-plan revision approval remain enforced by the backend.

Uploads and data formats retain their backend limits. Original identifiers, columns, relationships and financial formulas remain under existing validation. Preview labels/order are presentation only: exported column names, order and data remain unchanged. A preserve-amounts or conversion notice describes the options submitted for that job, not unsaved choices in the Advanced panel.

Excel is selected only when table names fit its limits without case collisions; JSON remains the safe default for other schemas. CSV ZIP, JSON, SQL dialects, Excel, detailed previews, JSON plan editing, research provenance, validation details, retries and history remain available.

## Verification

- **85 unit/API/provider/regression tests passed**, including tests for shared-parent defaults, finite/one-to-one constraints, required-field clarification, length validation, and common salary-period labels without unnecessary questions.
- **14 Chromium browser tests passed** on the real frontend/backend: automatic upload/generation, actual Excel/JSON bytes, optional 100-row regeneration, automatic before/after, financial recovery, necessary field clarification, retained drafts/results, delayed real session responses, explicit approval, retry without duplicate jobs, browser history/deep links, format fallback, deletion/quality controls, and safe preservation for unsupported salary periods.
- Mobile checks use 390×844: RTL, no document overflow and the download button remains within the first viewport. Desktop and mobile screenshots were inspected.
- TypeScript and the existing production build passed. Production startup, static assets, CSP, Secure cookies, real generation and downloaded JSON were also checked.
- Browser plan approval is tested with an owned plan created through real APIs; no model-generated response is fabricated. This UX pass does not claim a new live Arabic provider test. The rapid suite is paced to respect the existing per-IP request limit; no backend protection is weakened. Research is disabled in the browser regression server to avoid spending credits; prior live provider/research evidence remains separate.
- No external AI/search calls, dependency upgrades, app publication or deployment were needed for this UX pass.

Screenshots: `test-results/quick-result.png`, `localization-result.png`, `localization-mobile.png`, `chat.png`, `chat-plan.png`, `quick-upload-mobile.png`. These generated files are ignored.

## Implementation and commands

Main changes: `client/main.tsx`, `client/components.tsx`, `client/style.css`, `client/api.ts`; new pure workflow helpers in `client/workflows.ts`; shared semantic detection extracted to `shared/semantics.ts` so UI clarification and the engine use the same interpretation. The generator reexports the same function, preserving existing consumers.

Backend changes expose controlled job error codes for safe recovery, request concise replies from the existing AI prompt, and interpret common period labels through the shared helper without rewriting source metadata. The benchmark pipeline uses that same unit interpretation; unsupported periods are not guessed. Provider transports, research rules, exports, ownership checks, upload/resource limits and dependencies are preserved. Backend files affected: `server/app.ts`, `server/store.ts`, `server/ai.ts`, `server/localization.ts`, `server/benchmarks.ts`, and the semantic reexport in `server/generator.ts`. Tests: `tests/workflows.test.ts`, `tests/browser/ui.spec.ts`. Earlier workspace changes were preserved; no commit or push was performed.

From `/workspace/-RASD-V2`:

```sh
NODE_USE_ENV_PROXY=1 npm run dev
npm test
npm run build
NODE_USE_ENV_PROXY=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
npx --no-install tsx scripts/smoke-production.ts
```

## Remaining boundaries

- Complex or unsupported schemas still need explicit meaning/constraints. The UI simplifies necessary clarification; it does not claim universal schema understanding.
- Estimated economic values remain estimates. Regulatory applicability and unsupported accounting cases are not automatically guessed.
- Switching services retains state while the page stays open. Reloading creates a fresh screen; owned jobs remain accessible in Downloads and saved conversations through history until expiry.
- Automated walkthroughs are not a substitute for observing ordinary users in a usability study. Safari/Firefox and physical mobile-device testing were not run.
- No public preview/deployment or Replit capacity claim is made.
