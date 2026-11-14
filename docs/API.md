# API reference

All endpoints are same-origin. An opaque `rasd_owner` HttpOnly cookie isolates conversations and jobs. Use a cookie jar in CLI clients. No secret belongs in an API request. Mutating endpoints validate their inputs and return `{ "error": { "code": "...", "message": "Arabic actionable message" } }` on failure. Stack traces and provider bodies are not sent to clients.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Readiness, provider booleans and process concurrency |
| GET | `/api/sessions` | Owned conversation summaries |
| POST | `/api/sessions` | Create `{domain: employees / commerce / university}` |
| GET | `/api/sessions/:id` | Resume owned conversation |
| POST | `/api/sessions/:id/messages` | `{message}` → validated AI reply and optional plan |
| PUT | `/api/sessions/:id/plan` | Replace/revalidate editable plan; invalidates approval |
| POST | `/api/sessions/:id/approve` | `{revision}` explicitly approves current plan |
| POST | `/api/sessions/:id/generate` | Generate only an approved current plan |
| POST | `/api/plans/validate` | Normalize/validate a full intermediate plan |
| POST | `/api/schema/inspect` | Multipart single schema upload → editable plan |
| POST | `/api/jobs/generate` | Reviewed full plan → generation job |
| POST | `/api/localization/inspect` | Multipart uploaded data → source data and inferred plan |
| POST | `/api/jobs/localize` | `{plan,data,options?:{economic, currencyRate}}` → job |
| GET | `/api/jobs/:id` | Status, phase, percentage, timing, expiry and plan |
| GET | `/api/jobs` | Owned temporary jobs, newest first; used by download history |
| GET | `/api/jobs/:id/preview` | Up to 20 representative rows/table and before/after |
| GET | `/api/jobs/:id/validation` | Actual output validation report |
| GET | `/api/jobs/:id/research` | Provider status and relevant review evidence |
| GET | `/api/jobs/:id/download?format=json` | Validated JSON download |
| GET | `/api/jobs/:id/download?format=csv` | CSV ZIP with relationship manifest |
| GET | `/api/jobs/:id/download?format=xlsx` | Workbook download |
| GET | `/api/jobs/:id/download?format=sql&dialect=sqlite` | Parent-first inserts; dialect also accepts postgres/mysql |
| POST | `/api/jobs/:id/cancel` | Cooperative cancellation between processing phases |
| DELETE | `/api/jobs/:id` | Remove finished/cancelled owned job and temporary data |

Job lifecycle: pending → running → complete or failed/cancelled. A failure never yields a successful download. Cancellation cannot preempt a synchronous generation/validation loop; it takes effect at the next safe phase boundary. HTTP progress is phase-based, not a precise per-row percentage.

The schema contract and all executable rule variants are in `shared/schema.ts`. See `server/catalog.ts` for complete valid starting plans. FK references must target declared keys, and cycles are rejected. Plan approval uses a revision check to prevent stale plans being generated. One AI request may run per conversation at a time; different domains use different session IDs.

General API rate limit is 120 requests/minute/IP, with 20 chat messages/minute/IP. Heavy operations return 429 BUSY after two process-local slots are occupied. A reverse proxy should enforce body/time limits and HTTPS as well. The application does not trust forwarded client IP headers by default.
