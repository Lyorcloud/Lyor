interface ToggleProps {
  readonly checked: boolean;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}

export function Toggle({ checked, description, disabled = false, label, onChange }: ToggleProps) {
  return (
    <label className={`settings-toggle ${disabled ? 'is-disabled' : ''}`}>
      <span className="settings-toggle__copy">
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="settings-toggle__track">
        <span className="settings-toggle__thumb" />
      </span>
    </label>
  );
}
