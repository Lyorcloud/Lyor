interface SidebarArrowProps {
  readonly direction?: 'down' | 'left' | 'right' | 'up';
}

/** Shared rendering of the arrow glyph already used by the Figma-aligned sidebar. */
export function SidebarArrow({ direction = 'left' }: SidebarArrowProps) {
  return <span aria-hidden="true" className={`sidebar-arrow sidebar-arrow--${direction}`}>❮</span>;
}
