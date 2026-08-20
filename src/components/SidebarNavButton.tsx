interface SidebarNavButtonProps {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}

export function SidebarNavButton({ active, label, onClick }: SidebarNavButtonProps) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={`sidebar-nav-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
