import { describe, expect, it } from 'vitest';

import { mockMods } from '../src/data/mockMods';
import { sortFavoriteMods, sortHomeMods, sortLibraryMods } from '../src/services/modSortService';

describe('typed local sorting', () => {
  it('sorts Home by recommendation, newest and downloads', () => {
    expect(sortHomeMods(mockMods, 'recommended')[0]?.id).toBe('rampage-trainer-rdr2');
    expect(sortHomeMods(mockMods, 'newest')[0]?.id).toBe('simple-trainer-rdr2');
    expect(sortHomeMods(mockMods, 'most-downloaded')[0]?.id).toBe('seamless-co-op-elden-ring');
  });

  it('sorts Library by install chronology and size', () => {
    const entries = [
      { modId: mockMods[0]!.id, addedAt: '2026-01-01', installedAt: '2026-01-02' },
      { modId: mockMods[2]!.id, addedAt: '2026-01-03', installedAt: '2026-01-04' },
    ];
    const mods = [mockMods[0]!, mockMods[2]!];
    expect(sortLibraryMods(mods, entries, 'recently-installed')[0]?.id).toBe(mockMods[2]!.id);
    expect(sortLibraryMods(mods, entries, 'first-installed')[0]?.id).toBe(mockMods[0]!.id);
    expect(sortLibraryMods(mods, entries, 'file-size-desc')[0]?.id).toBe(mockMods[2]!.id);
  });

  it('sorts Favorites by local added date without treating it as cloud truth', () => {
    const dates = { [mockMods[0]!.id]: '2026-01-01', [mockMods[1]!.id]: '2026-02-01' };
    expect(sortFavoriteMods([mockMods[0]!, mockMods[1]!], dates, 'recently-added')[0]?.id).toBe(mockMods[1]!.id);
  });
});
