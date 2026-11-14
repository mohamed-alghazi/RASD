import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dotenv from 'dotenv';
import { loadEnvironment } from '../server/config';

describe('Render public origin configuration', () => {
  beforeEach(() => {
    vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} });
    vi.stubEnv('keyayham', '');
    vi.stubEnv('keymohamed', '');
    vi.stubEnv('PUBLIC_ORIGIN', undefined);
    vi.stubEnv('RENDER_EXTERNAL_URL', undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses the Render HTTPS origin without a trailing slash when no override exists', () => {
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://rasd-example.onrender.com/');
    loadEnvironment();
    expect(process.env.PUBLIC_ORIGIN).toBe('https://rasd-example.onrender.com');
  });

  it('treats a blank override as unset', () => {
    vi.stubEnv('PUBLIC_ORIGIN', '  ');
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://rasd-example.onrender.com');
    loadEnvironment();
    expect(process.env.PUBLIC_ORIGIN).toBe('https://rasd-example.onrender.com');
  });

  it('preserves an explicit custom-domain origin', () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://rasd.example');
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://rasd-example.onrender.com');
    loadEnvironment();
    expect(process.env.PUBLIC_ORIGIN).toBe('https://rasd.example');
  });

  it('leaves local and Replit origin handling unchanged without Render metadata', () => {
    loadEnvironment();
    expect(process.env.PUBLIC_ORIGIN).toBeUndefined();
  });
});
