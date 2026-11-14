import dotenv from 'dotenv';
export function loadEnvironment() {
  dotenv.config({ path: ['.env.local', '.env'], override: false, quiet: true });
  // Existing environment binding; never persist or log its value.
  if (!process.env.TAVILY_API_KEY?.trim() && process.env.keyayham) process.env.TAVILY_API_KEY = process.env.keyayham;
  if (!process.env.OPENROUTER_API_KEY?.trim() && process.env.keymohamed) process.env.OPENROUTER_API_KEY = process.env.keymohamed;
}
export function credentialStatus() {
  return Object.fromEntries(
    ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'TAVILY_API_KEY'].map((name) => {
      const value = process.env[name]?.trim();
      return [
        name,
        !!value && !/^(your[-_ ]|replace|changeme|example|test-only|sk-\.\.\.)/i.test(value),
      ];
    }),
  ) as Record<string, boolean>;
}
