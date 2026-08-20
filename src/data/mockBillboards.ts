export type BillboardMediaKind = 'image' | 'video';
export interface HomeBillboardItem {
  readonly alt: string;
  readonly displayOrder: number;
  readonly id: string;
  readonly kind: BillboardMediaKind;
  readonly posterSrc?: string;
  readonly published: boolean;
  readonly src: string;
}

/** Renderer-only catalog shaped for a future published/displayOrder cloud feed. */
const billboardCatalog = [
  { alt: 'Lyor Coming Hardcore', displayOrder: 1, id: 'lyor-coming-hardcore', kind: 'image', published: true, src: './assets/lyor/home-billboard.png' },
  { alt: 'Lyor V1.2 preview', displayOrder: 2, id: 'lyor-v1-2-preview', kind: 'video', posterSrc: './assets/lyor/home-billboard.png', published: true, src: './assets/lyor/home-billboard-preview.mp4' },
] as const satisfies readonly HomeBillboardItem[];

export const mockHomeBillboards: readonly HomeBillboardItem[] = billboardCatalog
  .filter((item) => item.published)
  .sort((left, right) => left.displayOrder - right.displayOrder);
