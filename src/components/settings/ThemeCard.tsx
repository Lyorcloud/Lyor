import type { ThemeId } from '../../settings/AppSettingsContext';

interface ThemeCardProps {
  readonly description: string;
  readonly label: string;
  readonly onSelect: (theme: ThemeId) => void;
  readonly selected: boolean;
  readonly selectedLabel: string;
  readonly selectLabel: string;
  readonly theme: ThemeId;
}

export function ThemeCard({
  description,
  label,
  onSelect,
  selected,
  selectedLabel,
  selectLabel,
  theme,
}: ThemeCardProps) {
  return (
    <button
      aria-label={selected ? selectedLabel : selectLabel}
      aria-pressed={selected}
      className={`theme-card theme-card--${theme} ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(theme)}
      type="button"
    >
      <span aria-hidden="true" className="theme-card__preview">
        <span className="theme-card__preview-sidebar" />
        <span className="theme-card__preview-content">
          <span />
          <span />
        </span>
      </span>
      <span className="theme-card__copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <span aria-hidden="true" className="theme-card__check">✓</span>
    </button>
  );
}
