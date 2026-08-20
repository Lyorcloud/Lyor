import { useMemo, useState } from 'react';

import type { HomeBillboardItem } from '../data/mockBillboards';
import { useI18n } from '../i18n/I18nContext';
import { HomeBillboard } from './HomeBillboard';

interface ManageBillboardsProps {
  readonly items: readonly HomeBillboardItem[];
  readonly onChange: (items: readonly HomeBillboardItem[]) => void;
}

type ManagedBillboard = HomeBillboardItem & { readonly disabled?: boolean; readonly localObjectUrl?: boolean };

export function ManageBillboards({ items, onChange }: ManageBillboardsProps) {
  const { t } = useI18n();
  const [managed, setManaged] = useState<readonly ManagedBillboard[]>(items);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const [error, setError] = useState('');
  const selected = managed.find((item) => item.id === selectedId) ?? managed[0];
  const active = useMemo(() => managed.filter((item) => !item.disabled).sort((a, b) => a.displayOrder - b.displayOrder), [managed]);

  const commit = (next: readonly ManagedBillboard[]) => {
    setManaged(next);
    onChange(next.filter((item) => !item.disabled));
  };

  const move = (id: string, direction: -1 | 1) => {
    const index = active.findIndex((item) => item.id === id);
    const other = active[index + direction];
    const current = active[index];
    if (!current || !other) return;
    commit(managed.map((item) => item.id === current.id ? { ...item, displayOrder: other.displayOrder }
      : item.id === other.id ? { ...item, displayOrder: current.displayOrder } : item));
  };

  const selectFile = (file: File | undefined) => {
    setError('');
    if (!file) return;
    const kind = file.type.startsWith('image/') ? 'image' : file.type === 'video/mp4' ? 'video' : null;
    const maximum = kind === 'video' ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!kind || file.size === 0 || file.size > maximum) {
      setError(t('billboardAdmin.invalidMedia'));
      return;
    }
    const next: ManagedBillboard = {
      id: `local-${crypto.randomUUID()}`, alt: file.name, displayOrder: active.length + 1,
      kind, published: false, src: URL.createObjectURL(file), localObjectUrl: true,
    };
    commit([...managed, next]);
    setSelectedId(next.id);
  };

  return (
    <section className="billboard-admin">
      <div className="billboard-admin__heading">
        <div><h2>{t('billboardAdmin.title')}</h2><small>{t('billboardAdmin.localPreview')}</small></div>
        <label className="billboard-admin__upload">{t('billboardAdmin.upload')}<input accept="image/png,image/jpeg,image/webp,video/mp4" onChange={(event) => selectFile(event.target.files?.[0])} type="file" /></label>
      </div>
      {error ? <p className="billboard-admin__error" role="alert">{error}</p> : null}
      <div className="billboard-admin__layout">
        <div className="billboard-admin__list" role="list">
          {active.map((item, index) => (
            <article aria-current={item.id === selected?.id} key={item.id} role="listitem">
              <button className="billboard-admin__select" onClick={() => setSelectedId(item.id)} type="button">
                <strong>{item.alt}</strong><small>{item.kind} · {item.published ? 'Published' : 'Draft'} · #{item.displayOrder}</small>
              </button>
              <div className="billboard-admin__actions">
                <button aria-label={t('billboardAdmin.moveUp')} disabled={index === 0} onClick={() => move(item.id, -1)} type="button">↑</button>
                <button aria-label={t('billboardAdmin.moveDown')} disabled={index === active.length - 1} onClick={() => move(item.id, 1)} type="button">↓</button>
                <button onClick={() => commit(managed.map((entry) => entry.id === item.id ? { ...entry, published: !entry.published } : entry))} type="button">{item.published ? t('billboardAdmin.disable') : t('billboardAdmin.publish')}</button>
                <button onClick={() => { if (item.localObjectUrl) URL.revokeObjectURL(item.src); commit(managed.filter((entry) => entry.id !== item.id)); setSelectedId(''); }} type="button">{t('billboardAdmin.delete')}</button>
              </div>
            </article>
          ))}
        </div>
        <div className="billboard-admin__preview">
          <h3>{t('billboardAdmin.preview')}</h3>
          {selected ? <HomeBillboard fallbackLabel={t('billboard.fallback')} items={[{ ...selected, published: true }]} nextLabel={t('billboard.next')} previousLabel={t('billboard.previous')} /> : <p>{t('billboardAdmin.empty')}</p>}
        </div>
      </div>
    </section>
  );
}
