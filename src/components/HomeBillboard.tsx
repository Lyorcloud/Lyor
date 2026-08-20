export interface HomeBillboardItem {
  readonly alt: string;
  readonly id: string;
  readonly imageSrc: string;
}

interface HomeBillboardProps {
  readonly items: readonly HomeBillboardItem[];
}

export function HomeBillboard({ items }: HomeBillboardProps) {
  const activeItem = items[0];

  if (!activeItem) {
    return null;
  }

  return (
    <figure className="home-billboard">
      <img
        alt={activeItem.alt}
        decoding="async"
        fetchPriority="high"
        src={activeItem.imageSrc}
      />
    </figure>
  );
}
