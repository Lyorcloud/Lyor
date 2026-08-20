import type { MockCloudLibraryEntry, Mod, ModId } from '../types/domain';

export type HomeSortId = 'recommended' | 'newest' | 'most-popular' | 'most-downloaded';
export type LibrarySortId = 'recently-installed' | 'first-installed' | 'file-size-desc';
export type FavoritesSortId = 'recently-added' | 'most-popular' | 'newest';
export type SortId = HomeSortId | LibrarySortId | FavoritesSortId;

const byName = (left: Mod, right: Mod) => left.name.localeCompare(right.name);

export function sortHomeMods(mods: readonly Mod[], sortId: HomeSortId): readonly Mod[] {
  return [...mods].sort((left, right) => {
    if (sortId === 'newest') return Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || byName(left, right);
    if (sortId === 'most-popular') return right.downloadCount - left.downloadCount || right.recommendedRank - left.recommendedRank;
    if (sortId === 'most-downloaded') return right.downloadCount - left.downloadCount || byName(left, right);
    return left.recommendedRank - right.recommendedRank;
  });
}

export function sortLibraryMods(
  mods: readonly Mod[],
  entries: readonly MockCloudLibraryEntry[],
  sortId: LibrarySortId,
): readonly Mod[] {
  const entryById = new Map<ModId, MockCloudLibraryEntry>(entries.map((entry) => [entry.modId, entry]));
  return [...mods].sort((left, right) => {
    if (sortId === 'file-size-desc') return right.fileSizeBytes - left.fileSizeBytes || byName(left, right);
    const leftDate = Date.parse(entryById.get(left.id)?.installedAt ?? entryById.get(left.id)?.addedAt ?? '1970-01-01');
    const rightDate = Date.parse(entryById.get(right.id)?.installedAt ?? entryById.get(right.id)?.addedAt ?? '1970-01-01');
    return (sortId === 'recently-installed' ? rightDate - leftDate : leftDate - rightDate) || byName(left, right);
  });
}

export function sortFavoriteMods(
  mods: readonly Mod[],
  favoriteAddedAt: Readonly<Partial<Record<ModId, string>>>,
  sortId: FavoritesSortId,
): readonly Mod[] {
  return [...mods].sort((left, right) => {
    if (sortId === 'most-popular') return right.downloadCount - left.downloadCount || byName(left, right);
    if (sortId === 'newest') return Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || byName(left, right);
    return Date.parse(favoriteAddedAt[right.id] ?? '1970-01-01') - Date.parse(favoriteAddedAt[left.id] ?? '1970-01-01') || byName(left, right);
  });
}
