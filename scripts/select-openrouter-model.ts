import { loadEnvironment } from '../server/config';
import { readFile, writeFile } from 'node:fs/promises';
loadEnvironment();
try {
  const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!res.ok) throw Error(`CATALOG_HTTP_${res.status}`);
  const catalog = await res.json() as any;
  const models = catalog.data.filter((m: any) =>
    typeof m.id === 'string' && m.id.startsWith('nvidia/') &&
    m.architecture?.output_modalities?.includes('text') &&
    (m.context_length ?? 0) >= 32768 &&
    (m.supported_parameters ?? []).includes('response_format') &&
    Number.isFinite(Number(m.pricing?.prompt)) && Number.isFinite(Number(m.pricing?.completion)),
  );
  models.sort((a: any, b: any) =>
    Number(b.supported_parameters.includes('structured_outputs')) - Number(a.supported_parameters.includes('structured_outputs')) ||
    Number(a.pricing.completion) - Number(b.pricing.completion) || b.context_length - a.context_length);
  const selected = process.env.AI_MODEL ? models.find((m: any) => m.id === process.env.AI_MODEL) : models[0];
  if (!selected) throw Error('NO_VERIFIED_NVIDIA_STRUCTURED_MODEL');
  if (!process.env.OPENROUTER_API_KEY) throw Error('OPENROUTER_API_KEY_MISSING');
  const auth = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!auth.ok) throw Error('OPENROUTER_AUTHENTICATION_FAILED');
  // Persist nonsecret model selection only, preserving existing local settings.
  const before = await readFile('.env.local', 'utf8').catch(() => '');
  const after = before.replace(/^AI_MODEL=.*\r?\n?/gm, '');
  await writeFile('.env.local', after + (after.endsWith('\n') ? '' : '\n') + `AI_MODEL=${selected.id}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ authenticated: true, model: selected.id, contextLength: selected.context_length, supportedParameters: selected.supported_parameters, pricing: selected.pricing, liveArabicVerification: 'still required' }, null, 2));
} catch {
  console.log(JSON.stringify({ selected: false, reason: 'Live catalog unavailable or no qualifying NVIDIA model; no model guessed.' }));
  process.exitCode = 1;
}
