import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { aiTurn, type ChatState } from '../server/ai';
import { domainPlan } from '../server/catalog';
const oldKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;
  else delete process.env.OPENAI_API_KEY;
});
const state: ChatState = {
  domain: 'employees',
  messages: [{ role: 'assistant', content: 'كم موظفاً؟' }],
  requirements: 'شركة مقاولات',
  approved: false,
  revision: 0,
};
describe('real provider adapter contract — simulated HTTP responses, no live credentials', () => {
  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'openai');
    vi.stubEnv('AI_BASE_URL', 'https://api.openai.com/v1');
    vi.stubEnv('AI_MODEL', 'gpt-4o-mini');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('sends contextual Arabic history with strict structured outputs and validates returned plan', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const fn = vi.fn(async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      expect(body.messages.at(-1).content).toBe('100');
      expect(body.messages[1].content).toBe('كم موظفاً؟');
      expect(body.response_format.json_schema.strict).toBe(true);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'خطة للمراجعة',
                  requirements: 'شركة مقاولات 100 موظف',
                  ready: true,
                  count: 100,
                  planJson: JSON.stringify(domainPlan('employees')),
                }),
              },
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fn);
    const result = await aiTurn(state, '100');
    expect(result.plan?.tables.find((t) => t.name === 'employees')?.count).toBe(100);
    expect(fn).toHaveBeenCalledOnce();
  });
  it('malformed model output is retried exactly once and cannot corrupt state', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    const before = structuredClone(state);
    const fn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"execute":"DROP TABLE users"}' } }] }),
        ),
    );
    vi.stubGlobal('fetch', fn);
    await expect(aiTurn(state, 'نعم')).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(state).toEqual(before);
  });
  it('rejects a valid-shaped plan from a different domain', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: 'خطة',
                    requirements: 'test',
                    ready: true,
                    count: 100,
                    planJson: JSON.stringify(domainPlan('commerce')),
                  }),
                },
              },
            ],
          }),
        ),
    );
    await expect(aiTurn(state, '100')).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });
  it('provider authentication errors return a controlled actionable error', async () => {
    process.env.OPENAI_API_KEY = 'test-only';
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    await expect(aiTurn(state, '100')).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      status: 502,
    });
  });
});

describe('provider-independent transport — simulated HTTP only', () => {
  afterEach(() => vi.unstubAllEnvs());
  for (const provider of ['gemini', 'anthropic', 'deepseek', 'compatible']) {
    it(`validates structured output from ${provider} without an OpenAI key`, async () => {
      vi.stubEnv('AI_PROVIDER', provider);
      vi.stubEnv('AI_KEY_ENV', 'RASD_TEST_PROVIDER_KEY');
      vi.stubEnv('RASD_TEST_PROVIDER_KEY', 'test-only');
      vi.stubEnv('AI_MODEL', 'configured-model');
      vi.stubEnv('AI_BASE_URL', 'https://provider.example/v1');
      delete process.env.OPENAI_API_KEY;
      const envelope = {
        reply: 'خطة للمراجعة',
        requirements: '100 موظف',
        ready: true,
        count: 100,
        planJson: JSON.stringify(domainPlan('employees')),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url, options: any) => {
          const request = JSON.parse(options.body);
          expect(JSON.stringify(request)).toContain('100');
          expect(JSON.stringify(request)).toContain('كم موظفاً؟');
          expect(JSON.stringify(request)).not.toContain('test-only');
          if (provider === 'gemini') {
            expect(options.headers['x-goog-api-key']).toBe('test-only');
            expect(request.generationConfig.responseMimeType).toBe('application/json');
            return Response.json({
              candidates: [{ content: { parts: [{ text: JSON.stringify(envelope) }] } }],
            });
          }
          if (provider === 'anthropic') {
            expect(options.headers['x-api-key']).toBe('test-only');
            expect(request.tool_choice.name).toBe('rasd_turn');
            return Response.json({
              content: [{ type: 'tool_use', name: 'rasd_turn', input: envelope }],
            });
          }
          expect(options.headers.Authorization).toBe('Bearer test-only');
          return Response.json({ choices: [{ message: { content: JSON.stringify(envelope) } }] });
        }),
      );
      const result = await aiTurn(state, '100');
      expect(result.plan?.domain).toBe('employees');
    });
  }
  it('does not switch providers when the selected provider key is missing', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', '');
    process.env.OPENAI_API_KEY = 'test-only';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(aiTurn(state, '100')).rejects.toMatchObject({ code: 'AI_UNCONFIGURED' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('OpenRouter NVIDIA policy — simulated HTTP only', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('uses the configured NVIDIA model and requires supported structured parameters', async () => {
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    vi.stubEnv('AI_MODEL', 'nvidia/test-model');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
    vi.stubEnv('AI_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubGlobal('fetch', async (url: any, options: any) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      const request = JSON.parse(options.body);
      expect(request.model).toBe('nvidia/test-model');
      expect(request.provider).toEqual({ require_parameters: true, allow_fallbacks: false });
      expect(request.response_format.json_schema.strict).toBe(true);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'كم موظفاً؟',
                requirements: 'شركة',
                ready: false,
                count: 1,
                planJson: null,
              }),
            },
          },
        ],
      });
    });
    expect((await aiTurn(state, 'مصنع')).result.ready).toBe(false);
  });
  it('never silently sends a non-NVIDIA model to OpenRouter', async () => {
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    vi.stubEnv('AI_MODEL', 'other/model');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(aiTurn(state, '100')).rejects.toMatchObject({ code: 'AI_CONFIGURATION' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
