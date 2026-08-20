import type { PropsWithChildren, ReactNode, Ref } from 'react';

interface WindowShellProps extends PropsWithChildren {
  readonly contentRef?: Ref<HTMLElement>;
  readonly sidebar: ReactNode;
  readonly sidebarOpen: boolean;
  readonly titleBar: ReactNode;
}

export function WindowShell({
  children,
  contentRef,
  sidebar,
  sidebarOpen,
  titleBar,
}: WindowShellProps) {
  return (
    <div className={`window-shell ${sidebarOpen ? 'has-open-sidebar' : 'has-closed-sidebar'}`}>
      {sidebar}
      {titleBar}
      <main className="content-scroll" ref={contentRef}>{children}</main>
    </div>
  );
}
