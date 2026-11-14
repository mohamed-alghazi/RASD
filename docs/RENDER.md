# Render deployment repair

## Root cause

The deployed commit `44b395563d3b64ac2f15285c92d636dc29f6b194` contains the root package/build configuration and `rasd-source.zip`, but no `client/`, `server/`, or `shared/` directories. Render does not extract that ZIP as application source. `index.html` correctly references `/client/main.tsx`; changing that path would hide the missing-source problem rather than restore the application.

The complete source was committed in `1a17467` and the approved emerald theme and bilingual branding in `e79b047`. The repair branch includes both commits plus Render-specific configuration. Merge the complete branch into `main` before deploying `main`; redeploying `44b3955` cannot include these changes.

The repaired repository includes `client/`, `server/`, `shared/`, `public/`, `scripts/`, `tests/`, and the existing examples and documentation. The OpenRouter/NVIDIA provider adapter, Tavily pipeline, applied research rules, generation/localization engines, simplified workflows, and three-domain chat are preserved. No UI redesign or engine replacement is part of this deployment repair.

## Existing Render service settings

| Setting        | Value                                   |
| -------------- | --------------------------------------- |
| Service type   | Node Web Service, not a Static Site     |
| Branch         | `main`, after merging the repair PR     |
| Root directory | Repository root (leave blank)           |
| Node           | 24, selected by `.node-version`         |
| Build command  | `npm ci --include=dev && npm run build` |
| Start command  | `npm start`                             |
| Environment    | `NODE_ENV=production`                   |
| Health check   | `/api/health`                           |

The build includes dev dependencies because TypeScript/Vite and the existing `tsx` server runner use them. Do not prune them before `npm start`. Fastify listens on `0.0.0.0` and Render's supplied `PORT`; there is no second public frontend process in production. It serves `dist/client` and `/api` together, preserving same-origin requests and session cookies.

Render's HTTPS public origin is read from `RENDER_EXTERNAL_URL` when `PUBLIC_ORIGIN` is absent or blank. For a custom domain, set `PUBLIC_ORIGIN` to the exact HTTPS origin, without a trailing slash. No permissive CORS or untrusted forwarded-host fallback is added.

Keep the existing selected provider/model in Render environment settings:

- `AI_PROVIDER=openrouter`
- `AI_BASE_URL=https://openrouter.ai/api/v1`
- `AI_MODEL`: the exact verified NVIDIA model already selected for RASD; this repair does not change or revalidate it.
- `OPENROUTER_API_KEY` and `TAVILY_API_KEY`: enter securely in Render. The existing aliases `keymohamed` and `keyayham` also remain supported in memory.
- `PUBLIC_ORIGIN`: optional override for a custom domain.
- `DATA_DIR`: private writable storage outside `dist/client`.

`render.yaml` is an optional reference for a free, single-instance demonstration service with automatic deploys disabled. It neither creates nor publishes a service by itself. Its `/tmp/rasd` storage is ephemeral: sessions and downloads are lost on restart/redeploy and free-service spin-down is possible. For durable storage, choose a suitable persistent volume separately and set `DATA_DIR` to its private mount path. No paid plan or storage has been provisioned or capacity-tested.

## Verification commands

```sh
npm ci --include=dev
npm run build
npm test
npx --no-install tsx scripts/smoke-production.ts
```

The production smoke check starts the real backend, fetches the built HTML/JS/CSS and brand SVG, checks CSP and Secure session cookies, verifies requests using Render-style public-origin metadata, creates a real chat session, generates records, and reopens a JSON download. It makes no live AI or research calls. A local smoke pass does not establish that the actual Render account has deployed the new commit or configured provider credentials.

Verified locally on Node 24.22.1 / npm 11.9.0, including an isolated copy made only from tracked Git files, with no `.env`, `.env.local`, existing `node_modules`, or prebuilt assets:

- Clean lockfile install: 406 packages installed with `npm ci --include=dev`.
- `NODE_ENV=production npm run build`: TypeScript and Vite passed.
- `npm test`: 89 passed, 0 failed, 0 skipped across 7 files.
- Production smoke: built HTML, both JS/CSS assets, logo SVG, security headers, Secure cookie, Render origin, session creation, generation, and parsed JSON download passed.
- Old-commit reproduction: Vite exited 1 with the reported missing `/client/main.tsx` error.
- Render YAML parsed successfully; secrets are configuration prompts, not values.

After merging, select **Deploy latest commit** in the existing Render service and verify the deployment log's commit hash differs from `44b3955`. Check `/api/health`, then use all three services and a download on the actual HTTPS URL. Deployment and external account settings remain separate from the source repair; no Render deployment is triggered by this work.
