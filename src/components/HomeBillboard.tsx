import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { HomeBillboardItem } from '../data/mockBillboards';
import { SidebarArrow } from './SidebarArrow';

interface HomeBillboardProps {
  readonly fallbackLabel: string;
  readonly hidden?: boolean;
  readonly items: readonly HomeBillboardItem[];
  readonly nextLabel: string;
  readonly previousLabel: string;
}

export function HomeBillboard({ fallbackLabel, hidden = false, items, nextLabel, previousLabel }: HomeBillboardProps) {
  const availableItems = useMemo(() => items.filter((item) => item.published).sort((a, b) => a.displayOrder - b.displayOrder), [items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [playbackKey, setPlaybackKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeItem = availableItems[activeIndex];

  const move = useCallback((direction: 1 | -1, manual = false) => {
    if (availableItems.length === 0) return;
    setActiveIndex((current) => (current + direction + availableItems.length) % availableItems.length);
    if (manual) setPlaybackKey((current) => current + 1);
  }, [availableItems.length]);

  useEffect(() => {
    if (!activeItem || hidden || activeItem.kind !== 'image' || failedIds.has(activeItem.id)) return;
    const timer = window.setTimeout(() => move(1), 3_000);
    return () => window.clearTimeout(timer);
  }, [activeItem, failedIds, hidden, move, playbackKey]);

  useEffect(() => {
    if (!activeItem || !failedIds.has(activeItem.id) || availableItems.length < 2 || failedIds.size >= availableItems.length) return;
    const timer = window.setTimeout(() => move(1), 1_000);
    return () => window.clearTimeout(timer);
  }, [activeItem, availableItems.length, failedIds, move]);

  useEffect(() => {
    if (activeItem?.kind !== 'video' || hidden) return;
    videoRef.current?.load();
    const playback = videoRef.current?.play();
    if (playback) void playback.catch(() => undefined);
  }, [activeItem, hidden, playbackKey]);

  if (!activeItem) return null;
  const failed = failedIds.has(activeItem.id);

  return (
    <figure aria-hidden={hidden} className={`home-billboard ${hidden ? 'home-billboard--hidden' : ''}`} inert={hidden}>
      <div className="home-billboard__media">
        {failed ? <div className="home-billboard__fallback" role="img" aria-label={fallbackLabel}>{fallbackLabel}</div> : activeItem.kind === 'video' ? (
          <video
            aria-label={activeItem.alt}
            key={`${activeItem.id}-${playbackKey}`}
            muted
            onEnded={() => move(1)}
            onError={() => setFailedIds((current) => new Set(current).add(activeItem.id))}
            playsInline
            poster={activeItem.posterSrc}
            preload="metadata"
            ref={videoRef}
            src={activeItem.src}
          />
        ) : (
          <img alt={activeItem.alt} decoding="async" fetchPriority={activeIndex === 0 ? 'high' : 'auto'} onError={() => setFailedIds((current) => new Set(current).add(activeItem.id))} src={activeItem.src} />
        )}
      </div>
      {availableItems.length > 1 ? (
        <>
          <button aria-label={previousLabel} className="home-billboard__arrow home-billboard__arrow--previous" onClick={() => move(-1, true)} type="button"><SidebarArrow /></button>
          <button aria-label={nextLabel} className="home-billboard__arrow home-billboard__arrow--next" onClick={() => move(1, true)} type="button"><SidebarArrow direction="right" /></button>
          <div className="home-billboard__dots" role="group" aria-label={`${activeIndex + 1} / ${availableItems.length}`}>
            {availableItems.map((item, index) => <button aria-label={`${index + 1}`} aria-pressed={index === activeIndex} key={item.id} onClick={() => { setActiveIndex(index); setPlaybackKey((current) => current + 1); }} type="button" />)}
          </div>
        </>
      ) : null}
    </figure>
  );
}
