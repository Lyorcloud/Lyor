export type ProtectedAction = () => void | Promise<void>;

export class ProtectedActionCoordinator {
  #pending: ProtectedAction | null = null;

  requireAuthentication(authenticated: boolean, action: ProtectedAction, openSignIn: () => void): void {
    if (authenticated) {
      void action();
      return;
    }
    this.#pending = action;
    openSignIn();
  }

  authenticationSucceeded(): void {
    const action = this.#pending;
    this.#pending = null;
    if (action) void action();
  }

  cancel(): void {
    this.#pending = null;
  }
}
