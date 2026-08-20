import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const repositoryRoot = process.cwd();
const releaseRoot = join(repositoryRoot, 'release');
const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const installerName = `Lyor-Setup-${version}-x64.exe`;
const required = [installerName, `${installerName}.blockmap`, 'latest.yml'];
const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

for (const name of required) {
  const path = join(releaseRoot, name);
  if (!(await stat(path)).isFile()) throw new Error(`Required release artifact is missing: ${name}`);
}

const latest = await readFile(join(releaseRoot, 'latest.yml'), 'utf8');
if (!latest.includes(`version: ${version}`) || !latest.includes(installerName)) {
  throw new Error('latest.yml version or installer reference does not match package.json.');
}

const appUpdatePath = join(releaseRoot, 'win-unpacked', 'resources', 'app-update.yml');
const appUpdate = await readFile(appUpdatePath, 'utf8');
if (!appUpdate.includes('owner: Lyorcloud') || !appUpdate.includes('repo: Lyor')) {
  throw new Error('Packaged updater target is not Lyorcloud/Lyor.');
}

const files = await readdir(releaseRoot);
const excludedStaleArtifacts = files
  .filter((name) => /^Lyor-Setup-.*-x64\.exe(?:\.blockmap)?$/u.test(name))
  .filter((name) => name !== installerName && name !== `${installerName}.blockmap`)
  .sort();

const manifest = {
  schemaVersion: 1,
  version,
  repository: 'Lyorcloud/Lyor',
  generatedAt: new Date().toISOString(),
  artifacts: Object.fromEntries(await Promise.all(required.map(async (name) => [name, {
    bytes: (await stat(join(releaseRoot, name))).size,
    sha256: await sha256(join(releaseRoot, name)),
  }]))),
  packagedUpdaterMetadata: {
    path: 'win-unpacked/resources/app-update.yml',
    sha256: await sha256(appUpdatePath),
  },
  excludedStaleArtifacts,
};

await writeFile(join(releaseRoot, 'artifact-sha256.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Verified release artifacts for ${version}.\n`);
if (excludedStaleArtifacts.length > 0) {
  process.stdout.write(`Excluded ${excludedStaleArtifacts.length} stale local artifact(s) from the manifest.\n`);
}
