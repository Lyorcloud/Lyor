import type { ChangeEventHandler, FocusEventHandler } from 'react';

interface SearchBarProps {
  readonly onChange: ChangeEventHandler<HTMLInputElement>;
  readonly onFocus?: FocusEventHandler<HTMLInputElement>;
  readonly placeholder: string;
  readonly value: string;
}

export function SearchBar({ onChange, onFocus, placeholder, value }: SearchBarProps) {
  return (
    <label className={`search-bar ${value ? 'search-bar--expanded' : ''}`} data-no-drag>
      <span aria-hidden="true" className="search-bar__icon">
        <img alt="" className="search-bar__lens" src="./assets/figma/icon-search-a.svg" />
        <img alt="" className="search-bar__handle" src="./assets/figma/icon-search-b.svg" />
      </span>
      <input
        aria-label={placeholder}
        onChange={onChange}
        onFocus={onFocus}
        placeholder={placeholder}
        spellCheck={false}
        type="search"
        value={value}
      />
    </label>
  );
}
