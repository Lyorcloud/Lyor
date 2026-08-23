import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const script = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('pre-paint theme bootstrap', () => {
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });

  it('applies the persisted theme before the renderer starts', () => {
    expect(indexHtml.indexOf('theme-init.js')).toBeLessThan(indexHtml.indexOf('/src/main.tsx'));
    localStorage.setItem('lyor.settings.v1', JSON.stringify({ version: 1, theme: 'dark' }));
    window.eval(script);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('migrates the removed light theme back to Ice Max', () => {
    localStorage.setItem('lyor.settings.v1', JSON.stringify({ version: 1, theme: 'light' }));
    window.eval(script);
    expect(document.documentElement.dataset.theme).toBe('ice-max');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('falls back safely for malformed settings', () => {
    localStorage.setItem('lyor.settings.v1', '{bad');
    window.eval(script);
    expect(document.documentElement.dataset.theme).toBe('ice-max');
  });
});
