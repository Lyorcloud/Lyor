import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outputPath = join(process.cwd(), 'build', 'runtime-config.production.json');

const isLoopbackHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  return normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.') ||
    normalized === '::1' ||
    normalized === '0.0.0.0';
};

export const createProductionRuntimeConfig = (environment = process.env) => {
  const rawUrl = environment.LYOR_SUPABASE_URL?.trim() ?? '';
  const publishableKey = environment.LYOR_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  let supabaseUrl;
  try {
    supabaseUrl = new URL(rawUrl);
  } catch {
    throw new Error('LYOR_SUPABASE_URL must be a valid production HTTPS URL.');
  }

  if (
    supabaseUrl.protocol !== 'https:' ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    isLoopbackHostname(supabaseUrl.hostname)
  ) {
    throw new Error('LYOR_SUPABASE_URL must be an uncredentialed, non-loopback HTTPS URL.');
  }

  if (publishableKey.length < 20) {
    throw new Error('LYOR_SUPABASE_PUBLISHABLE_KEY is missing or invalid.');
  }

  return {
    supabaseUrl: supabaseUrl.origin,
    supabasePublishableKey: publishableKey,
  };
};

export const writeProductionRuntimeConfig = async (environment = process.env) => {
  const config = createProductionRuntimeConfig(environment);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
};

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (entryUrl === import.meta.url) {
  await writeProductionRuntimeConfig();
  process.stdout.write('Prepared validated production runtime configuration.\n');
}
