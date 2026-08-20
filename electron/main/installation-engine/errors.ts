import type { InstallationEngineErrorCode } from '../../shared/installation-engine';

export class InstallationEngineError extends Error {
  constructor(
    readonly code: InstallationEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InstallationEngineError';
  }
}
