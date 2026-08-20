import type { Locale } from '../../i18n';

interface LanguageOptionProps {
  readonly label: string;
  readonly locale: Locale;
  readonly onSelect: (locale: Locale) => void;
  readonly selected: boolean;
}

export function LanguageOption({ label, locale, onSelect, selected }: LanguageOptionProps) {
  return (
    <button
      aria-pressed={selected}
      className={`language-option ${selected ? 'is-selected' : ''}`}
      lang={locale}
      onClick={() => onSelect(locale)}
      type="button"
    >
      <span aria-hidden="true" className="language-option__marker" />
      <span>{label}</span>
    </button>
  );
}
