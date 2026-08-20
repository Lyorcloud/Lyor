import { useEffect, useRef, useState } from 'react';

export interface SortOption<T extends string> { readonly id: T; readonly label: string; }
interface SortPopoverProps<T extends string> {
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly SortOption<T>[];
  readonly value: T;
}

export function SortPopover<T extends string>({ label, onChange, options, value }: SortPopoverProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  return (
    <div className="sort-popover" ref={rootRef}>
      <button aria-expanded={open} aria-haspopup="listbox" className="sort-popover__trigger" onClick={() => setOpen((current) => !current)} ref={triggerRef} type="button">
        <span className="sort-popover__label">{label}</span><span>{selected?.label}</span><span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div aria-label={label} className="sort-popover__menu" role="listbox">
          {options.map((option) => (
            <button aria-selected={option.id === value} className="sort-popover__option" key={option.id} onClick={() => { onChange(option.id); setOpen(false); triggerRef.current?.focus(); }} role="option" type="button">{option.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
