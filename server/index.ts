import { loadEnvironment } from './config.js';
import { createApp } from './app.js';
loadEnvironment();
const app = await createApp();
await app.listen({ port: Number(process.env.PORT) || 3001, host: process.env.HOST ?? '0.0.0.0' });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => app.close().then(() => process.exit(0)));
