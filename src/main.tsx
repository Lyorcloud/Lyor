import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/700.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { AppSettingsProvider } from './settings/AppSettingsProvider';
import './styles/app.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <AppSettingsProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </AppSettingsProvider>
  </StrictMode>,
);
