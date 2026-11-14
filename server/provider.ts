import { AppError } from '../shared/schema.js';

// Transport only: planning, schema validation and row generation remain provider-independent.
export function aiConfig() {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  const defaults: Record<string, { key: string; model: string; base: string }> = {
    openrouter: { key: 'OPENROUTER_API_KEY', model: '', base: 'https://openrouter.ai/api/v1' },
    openai: { key: 'OPENAI_API_KEY', model: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
    gemini: { key: 'GEMINI_API_KEY', model: 'gemini-2.5-flash', base: 'https://generativelanguage.googleapis.com/v1beta' },
    anthropic: { key: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-4-5', base: 'https://api.anthropic.com/v1' },
    deepseek: { key: 'DEEPSEEK_API_KEY', model: 'deepseek-chat', base: 'https://api.deepseek.com' },
    compatible: { key: 'AI_API_KEY', model: '', base: '' },
  };
  const settings = defaults[provider];
  if (!settings) throw new AppError(503, 'AI_CONFIGURATION', 'AI_PROVIDER غير مدعوم');
  const keyName = process.env.AI_KEY_ENV ?? settings.key;
  return {
    provider, keyName, key: process.env[keyName]?.trim(),
    model: process.env.AI_MODEL ?? (provider === 'openai' ? process.env.OPENAI_MODEL : undefined) ?? settings.model,
    base: (process.env.AI_BASE_URL ?? settings.base).replace(/\/$/, ''),
  };
}
export function aiStatus() {
  const { provider, keyName, key, model } = aiConfig();
  return { provider, model, keyName, configured: !!key && !!model };
}
export async function structuredCompletion(
  messages: { role: string; content: string }[], schema: object,
): Promise<string> {
  const { provider, keyName, key, model, base } = aiConfig();
  if (!key) throw new AppError(503, 'AI_UNCONFIGURED', `أضف ${keyName} لتفعيل المحادثة. لم ترسل الرسالة ويمكن إعادة المحاولة.`);
  if (provider === 'openrouter' && !model.startsWith('nvidia/')) throw new AppError(503, 'AI_CONFIGURATION', 'حدد AI_MODEL بنموذج NVIDIA متحقق منه على OpenRouter');
  if (!model || !base) throw new AppError(503, 'AI_CONFIGURATION', 'حدد AI_MODEL و AI_BASE_URL للمزود المتوافق');
  const url = new URL(base);
  if (url.protocol !== 'https:') throw new AppError(503, 'AI_CONFIGURATION', 'يجب أن يستخدم مزود الذكاء الاصطناعي HTTPS');
  let endpoint: string, body: object;
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'gemini') {
    endpoint = `${base}/models/${encodeURIComponent(model)}:generateContent`;
    headers['x-goog-api-key'] = key;
    body = {
      systemInstruction: { parts: [{ text: messages.filter(m => m.role === 'system').map(m => m.content).join('\n') }] },
      contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 10000 },
    };
  } else if (provider === 'anthropic') {
    endpoint = `${base}/messages`;
    headers = { ...headers, 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    body = {
      model, max_tokens: 10000,
      system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
      messages: messages.filter(m => m.role !== 'system'),
      tools: [{ name: 'rasd_turn', description: 'Return the validated RASD planning envelope', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'rasd_turn' },
    };
  } else {
    endpoint = `${base}/chat/completions`;
    headers.Authorization = `Bearer ${key}`;
    body = {
      model, messages,
      response_format: provider === 'deepseek'
        ? { type: 'json_object' }
        : { type: 'json_schema', json_schema: { name: 'rasd_turn', strict: true, schema } },
      ...(provider === 'deepseek' ? { max_tokens: 8192 } : { max_completion_tokens: 10000 }),
    };
  }
  if (provider === 'openrouter') body = { ...body, provider: { require_parameters: true, allow_fallbacks: false } };
  let res: Response;
  try {
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000), redirect: 'error' });
  } catch {
    throw new AppError(502, 'AI_PROVIDER_ERROR', 'تعذر الاتصال بمزود الذكاء الاصطناعي. تحقق من الشبكة وأعد المحاولة.');
  }
  if (!res.ok) throw new AppError(502, 'AI_PROVIDER_ERROR', 'تعذر الاتصال بمزود الذكاء الاصطناعي. تحقق من المفتاح والنموذج وأعد المحاولة.');
  const data = await res.json() as any;
  if (provider === 'gemini') return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  if (provider === 'anthropic') {
    const tool = data.content?.find((p: any) => p.type === 'tool_use' && p.name === 'rasd_turn');
    return tool ? JSON.stringify(tool.input) : '';
  }
  return data.choices?.[0]?.message?.content ?? '';
}
