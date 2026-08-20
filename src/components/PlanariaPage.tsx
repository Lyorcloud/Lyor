import { useMemo, useState } from 'react';

import { useI18n } from '../i18n/I18nContext';

export function PlanariaPage() {
  const { t } = useI18n();
  const [manifestText, setManifestText] = useState('{\n  "schemaVersion": 2\n}');
  const validation = useMemo(() => {
    try {
      const value: unknown = JSON.parse(manifestText);
      if (typeof value !== 'object' || value === null || (value as { schemaVersion?: unknown }).schemaVersion !== 2) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [manifestText]);

  return (
    <div className="planaria-page">
      <header className="planaria-page__header">
        <div>
          <p>Planaria</p>
          <h1>{t('planaria.title')}</h1>
        </div>
        <span className="planaria-page__admin-badge">{t('planaria.adminOnly')}</span>
      </header>
      <p className="planaria-page__notice" role="status">{t('planaria.localNotice')}</p>
      <div className="planaria-page__grid">
        <section>
          <h2>{t('planaria.metadata')}</h2>
          <label>{t('planaria.modId')}<input autoComplete="off" placeholder="mod-id" /></label>
          <label>{t('planaria.version')}<input autoComplete="off" placeholder="1.0.0" /></label>
          <label>{t('planaria.game')}<input autoComplete="off" placeholder="game-synthetic-fixture" /></label>
          <label>{t('planaria.edition')}<input autoComplete="off" placeholder="standard" /></label>
        </section>
        <section>
          <h2>{t('planaria.package')}</h2>
          <label>{t('planaria.sha256')}<input autoComplete="off" maxLength={64} placeholder="SHA-256" /></label>
          <label>{t('planaria.size')}<input inputMode="numeric" min="0" type="number" /></label>
          <p>{t('planaria.multipart')}</p>
        </section>
        <section className="planaria-page__manifest">
          <h2>{t('planaria.manifest')}</h2>
          <label>
            <span className="sr-only">{t('planaria.manifest')}</span>
            <textarea onChange={(event) => setManifestText(event.target.value)} spellCheck={false} value={manifestText} />
          </label>
          <span className={validation ? 'planaria-page__valid' : 'planaria-page__invalid'}>
            {validation ? t('planaria.manifestValid') : t('planaria.manifestInvalid')}
          </span>
        </section>
        <section>
          <h2>{t('planaria.lifecycle')}</h2>
          <ol><li>Draft</li><li>Ready</li><li>Published</li><li>Disabled</li></ol>
          <button disabled type="button">{t('planaria.publish')}</button>
          <small>{t('planaria.deployRequired')}</small>
        </section>
      </div>
    </div>
  );
}
