/* global document, localStorage */
(() => {
  const allowedThemes = new Set(['ice-max', 'dark', 'light']);
  let theme = 'ice-max';
  try {
    const stored = JSON.parse(localStorage.getItem('lyor.settings.v1') || 'null');
    if (allowedThemes.has(stored?.theme)) theme = stored.theme;
  } catch {
    // The default theme remains safe when storage is unavailable or malformed.
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
})();
