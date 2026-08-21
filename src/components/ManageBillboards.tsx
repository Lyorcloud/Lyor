import { useMemo, useState } from 'react';

import type {
  PlanariaBillboard,
  PlanariaFileSelection,
  PlanariaUploadProgress,
} from '../../electron/shared/planaria';
import type { TranslationKey } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { HomeBillboard } from './HomeBillboard';

interface ManageBillboardsProps {
  readonly items: readonly PlanariaBillboard[];
  readonly progress: PlanariaUploadProgress | null;
  readonly onRefresh: () => Promise<void>;
}
const stateKeys: Readonly<Record<PlanariaBillboard['state'], TranslationKey>> = {
  draft: 'planaria.state.draft', published: 'planaria.state.published', disabled: 'planaria.state.disabled',
};
const uploadKeys: Readonly<Record<PlanariaUploadProgress['status'], TranslationKey>> = {
  preparing: 'planaria.upload.preparing', uploading: 'planaria.upload.uploading',
  finalizing: 'planaria.upload.finalizing', success: 'planaria.upload.success', error: 'planaria.upload.error',
};

export function ManageBillboards({ items, progress, onRefresh }: ManageBillboardsProps) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<PlanariaFileSelection | null>(null);
  const [alt, setAlt] = useState('');
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const ordered = useMemo(() => [...items].sort((left, right) => left.displayOrder - right.displayOrder), [items]);
  const active = useMemo(() => ordered.filter((item) => item.state !== 'disabled'), [ordered]);
  const selected = items.find((item) => item.id === selectedId) ?? ordered[0];

  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await operation();
      await onRefresh();
    } catch {
      setError(t('planaria.requestFailed'));
    } finally {
      setPending(false);
    }
  };

  const choose = async () => {
    setError('');
    try {
      const next = await window.lyorPlanaria.selectFile('billboard');
      if (next) {
        setSelection(next);
        setAlt(next.name.replace(/\.[^.]+$/u, ''));
      }
    } catch {
      setError(t('billboardAdmin.invalidMedia'));
    }
  };

  const mutate = (item: PlanariaBillboard, action: 'move' | 'publish' | 'disable' | 'delete', direction?: -1 | 1) => run(async () => {
    if (action === 'delete' && !window.confirm(t('billboardAdmin.confirmDelete'))) return;
    await window.lyorPlanaria.mutateBillboard({
      action,
      billboardId: item.id,
      ...(action === 'move' ? { direction: direction ?? 1, expectedRevision: item.revision } : {}),
      ...(action === 'publish' || action === 'disable' ? { expectedRevision: item.revision } : {}),
    });
  });

  const upload = () => {
    if (!selection || !alt.trim()) return;
    return run(async () => {
      await window.lyorPlanaria.uploadBillboard({ selectionId: selection.id, alt: alt.trim() });
      setSelection(null);
      setAlt('');
    });
  };

  const previewItem = selected?.previewUrl ? [{
    id: selected.id, kind: selected.kind, alt: selected.alt, displayOrder: 0,
    published: true, src: selected.previewUrl,
  }] : [];

  return (
    <section className="planaria-panel billboard-admin">
      <div className="planaria-panel__heading">
        <div><p className="planaria-eyebrow">Home</p><h2>{t('billboardAdmin.title')}</h2></div>
        <span className="planaria-status-chip">{t('planaria.publishedOnlyFeed')}</span>
      </div>
      <div className="planaria-upload-strip">
        <button className="planaria-secondary-button" disabled={pending} onClick={() => void choose()} type="button">
          {selection ? selection.name : t('billboardAdmin.selectMedia')}
        </button>
        <label>{t('billboardAdmin.altText')}<input maxLength={240} onChange={(event) => setAlt(event.target.value)} value={alt} /></label>
        <button className="planaria-primary-button" disabled={pending || !selection || !alt.trim()} onClick={() => void upload()} type="button">
          {t('billboardAdmin.upload')}
        </button>
      </div>
      {progress && progress.purpose === 'billboard' ? (
        <div className="planaria-progress" aria-live="polite">
          <progress max={100} value={progress.percent} /><span>{Math.round(progress.percent)}% · {t(uploadKeys[progress.status])}</span>
        </div>
      ) : null}
      {error ? <p className="planaria-error" role="alert">{error}</p> : null}
      <div className="billboard-admin__layout">
        <div className="billboard-admin__list" role="list">
          {ordered.map((item) => {
            const activeIndex = active.findIndex((candidate) => candidate.id === item.id);
            return <article aria-current={item.id === selected?.id} key={item.id} role="listitem">
              <button className="billboard-admin__select" onClick={() => setSelectedId(item.id)} type="button">
                <strong>{item.alt}</strong>
                <small>{item.kind} · {t(stateKeys[item.state])} · #{item.displayOrder + 1}</small>
              </button>
              <div className="billboard-admin__actions">
                <button aria-label={t('billboardAdmin.moveUp')} disabled={pending || activeIndex <= 0} onClick={() => void mutate(item, 'move', -1)} type="button">↑</button>
                <button aria-label={t('billboardAdmin.moveDown')} disabled={pending || activeIndex < 0 || activeIndex === active.length - 1} onClick={() => void mutate(item, 'move', 1)} type="button">↓</button>
                {item.state === 'draft' ? <button disabled={pending} onClick={() => void mutate(item, 'publish')} type="button">{t('billboardAdmin.publish')}</button> : null}
                {item.state === 'published' ? <button disabled={pending} onClick={() => void mutate(item, 'disable')} type="button">{t('billboardAdmin.disable')}</button> : null}
                {item.state === 'disabled' ? <button className="planaria-danger-button" disabled={pending} onClick={() => void mutate(item, 'delete')} type="button">{t('billboardAdmin.delete')}</button> : null}
              </div>
            </article>;
          })}
          {ordered.length === 0 ? <p>{t('billboardAdmin.empty')}</p> : null}
        </div>
        <div className="billboard-admin__preview">
          <h3>{t('billboardAdmin.preview')}</h3>
          {previewItem.length ? <HomeBillboard fallbackLabel={t('billboard.fallback')} items={previewItem} nextLabel={t('billboard.next')} previousLabel={t('billboard.previous')} /> : <div className="planaria-empty-preview">{t('billboardAdmin.previewUnavailable')}</div>}
        </div>
      </div>
    </section>
  );
}
