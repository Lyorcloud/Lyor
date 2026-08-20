import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const cli = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');

const hasContainerRuntime = ['docker', 'podman'].some((command) =>
  spawnSync(command, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).status === 0,
);
if (!hasContainerRuntime) {
  process.stderr.write('Local Supabase tests require Docker Desktop or Podman on PATH. No compatible container runtime was found.\n');
  process.exit(1);
}

function runCli(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout || 'Supabase command failed.\n');
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

// Supabase start/status output includes local development credentials. Capture
// it so even disposable local keys never appear in logs or CI output.
runCli(['start'], true);
runCli(['db', 'reset', '--local'], true);
runCli(['test', 'db', '--local']);

const status = JSON.parse(runCli(['status', '-o', 'json'], true));
const apiUrl = status.API_URL ?? status.api_url;
const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? status.anon_key;
if (typeof apiUrl !== 'string' || typeof publishableKey !== 'string') {
  throw new Error('Supabase status did not return a local API URL and publishable/anon key.');
}

const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const authTests = spawnSync(process.execPath, [vitest, 'run', 'tests/auth-flow.integration.test.ts'], {
  cwd: root,
  env: {
    ...process.env,
    LYOR_RUN_SUPABASE_INTEGRATION: '1',
    LYOR_SUPABASE_URL: apiUrl,
    LYOR_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  },
  stdio: 'inherit',
});
process.exit(authTests.status ?? 1);
