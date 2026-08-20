import type { MouseEventHandler } from 'react';

interface FavoriteButtonProps {
  readonly active?: boolean;
  readonly className?: string;
  readonly label: string;
  readonly onClick: MouseEventHandler<HTMLButtonElement>;
  readonly variant?: 'card' | 'headbar';
}

export function FavoriteButton({
  active = false,
  className = '',
  label,
  onClick,
  variant = 'card',
}: FavoriteButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={variant === 'card' ? active : undefined}
      className={`favorite-button favorite-button--${variant} ${active ? 'is-active' : ''} ${className}`}
      data-no-drag
      onClick={onClick}
      type="button"
    >
      <img alt="" aria-hidden="true" src="./assets/figma/head-icon-02.svg" />
    </button>
  );
}
