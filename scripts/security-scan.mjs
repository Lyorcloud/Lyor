import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['src', 'electron', 'supabase', 'docs'];
const sourceFiles = ['.env.example', 'package.json', 'electron-builder.config.cjs'];
const secretPatterns = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u,
  /sb_secret_[A-Za-z0-9_-]{20,}/u,
  /AKIA[0-9A-Z]{16}/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];

async function collect(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (entry.name === '.temp') continue;
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await collect(location));
    else results.push(location);
  }
  return results;
}

const files = [...sourceFiles.map((file) => path.join(root, file))];
for (const directory of sourceRoots) files.push(...await collect(path.join(root, directory)));

const findings = [];
for (const file of files) {
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    findings.push(path.relative(root, file));
  }
}

const rendererFiles = await collect(path.join(root, 'dist'));
const forbiddenRendererMarkers = [
  'LYOR_SUPABASE_PUBLISHABLE_KEY',
  'LYOR_SUPABASE_URL',
  '@supabase/supabase-js',
  'refresh_token',
  'service_role',
];
for (const file of rendererFiles) {
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  if (forbiddenRendererMarkers.some((marker) => content.includes(marker))) {
    findings.push(`${path.relative(root, file)} (renderer auth marker)`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Security scan failed:\n${findings.map((file) => `- ${file}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Security scan passed (${files.length} source/config files; ${rendererFiles.length} renderer files).\n`);
}
