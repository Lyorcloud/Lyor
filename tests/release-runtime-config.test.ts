import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createProductionRuntimeConfig } from '../scripts/create-production-runtime-config.mjs';

describe('production runtime configuration', () => {
  it('accepts a non-loopback HTTPS Supabase endpoint and publishable key', () => {
    expect(createProductionRuntimeConfig({
      LYOR_SUPABASE_URL: 'https://example-project.supabase.co/',
      LYOR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_key_for_test_only',
    })).toEqual({
      supabaseUrl: 'https://example-project.supabase.co',
      supabasePublishableKey: 'sb_publishable_example_key_for_test_only',
    });
  });

  it.each([
    'http://example-project.supabase.co',
    'http://127.0.0.1:54321',
    'https://localhost:54321',
    'https://user:password@example-project.supabase.co',
  ])('rejects unsafe production endpoints: %s', (supabaseUrl) => {
    expect(() => createProductionRuntimeConfig({
      LYOR_SUPABASE_URL: supabaseUrl,
      LYOR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_key_for_test_only',
    })).toThrow();
  });

  it('rejects a missing publishable key', () => {
    expect(() => createProductionRuntimeConfig({
      LYOR_SUPABASE_URL: 'https://example-project.supabase.co',
    })).toThrow(/PUBLISHABLE_KEY/u);
  });

  it('forces the canonical Windows installer to package production runtime configuration', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const builderConfig = readFileSync('electron-builder.config.cjs', 'utf8');
    const verifier = readFileSync('scripts/verify-release-artifacts.mjs', 'utf8');
    const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');

    expect(packageJson.scripts['dist:win']).toContain('LYOR_RUNTIME_CONFIG=production');
    expect(builderConfig).toContain("process.env.LYOR_RUNTIME_CONFIG === 'production'");
    expect(builderConfig).toContain("process.env.LYOR_ALLOW_UNSIGNED_TEST_RELEASE === 'true'");
    expect(builderConfig).toContain('forceCodeSigning: isPublishCommand && !allowUnsignedTestRelease');
    expect(releaseWorkflow).toContain('Create unsigned test release tag');
    expect(releaseWorkflow).toContain('git push origin $tag');
    expect(verifier).not.toContain('LYOR_REQUIRE_PRODUCTION_RUNTIME_CONFIG');
  });
});
