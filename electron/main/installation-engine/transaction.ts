import type { DownloadRequest, DownloadResult } from './download-manager';
import { DownloadManager } from './download-manager';
import { InstallationEngineError } from './errors';
import { TransactionJournalStore, type JournalPhase, type TransactionJournalV1 } from './journal';
import { runPreflight, type PreflightInput } from './preflight';

export interface TransactionRequest {
  readonly transactionId: string;
  readonly modId: string;
  readonly modVersion: string;
  readonly gameDetectionId: string;
  readonly preflight: PreflightInput;
  readonly download: DownloadRequest;
}

export interface TransactionHooks {
  validate(download: DownloadResult): Promise<void>;
  stage(download: DownloadResult): Promise<void>;
  backup(): Promise<void>;
  apply(): Promise<void>;
  verify(): Promise<void>;
  rollback(): Promise<void>;
}

export type RecoveryDecision = 'resume-download' | 'rollback' | 'none';

export class InstallationTransactionCoordinator {
  constructor(
    readonly journal: TransactionJournalStore,
    readonly downloader = new DownloadManager(),
  ) {}

  async execute(request: TransactionRequest, hooks: TransactionHooks): Promise<TransactionJournalV1> {
    await this.journal.create({
      transactionId: request.transactionId,
      modId: request.modId,
      modVersion: request.modVersion,
      gameDetectionId: request.gameDetectionId,
    });
    try {
      await runPreflight(request.preflight);
      await this.journal.transition(request.transactionId, 'downloading');
      const download = await this.downloader.download(request.download);
      await this.#phase(request.transactionId, 'validating', () => hooks.validate(download));
      await this.#phase(request.transactionId, 'staging', () => hooks.stage(download));
      await this.#phase(request.transactionId, 'backing_up', hooks.backup);
      await this.#phase(request.transactionId, 'installing', hooks.apply);
      await this.#phase(request.transactionId, 'verifying', hooks.verify);
      return await this.journal.transition(request.transactionId, 'installed');
    } catch (error) {
      const current = await this.journal.read(request.transactionId);
      const mutationStarted = current !== null && ['backing_up', 'installing', 'verifying', 'rolling_back'].includes(current.phase);
      if (mutationStarted) {
        await this.journal.transition(request.transactionId, 'rolling_back');
        try { await hooks.rollback(); }
        catch { return await this.journal.transition(request.transactionId, 'failed', 'rollback-failed'); }
      }
      const code = error instanceof InstallationEngineError ? error.code : 'operation-failed';
      return await this.journal.transition(request.transactionId, 'failed', code);
    }
  }

  async #phase(transactionId: string, phase: JournalPhase, action: () => Promise<void>): Promise<void> {
    await this.journal.transition(transactionId, phase);
    await action();
  }

  recoveryDecision(journal: TransactionJournalV1): RecoveryDecision {
    if (['pending', 'downloading', 'validating', 'staging'].includes(journal.phase)) return 'resume-download';
    if (['backing_up', 'installing', 'verifying', 'rolling_back'].includes(journal.phase)) return 'rollback';
    return 'none';
  }

  async recover(handlers: {
    resume(journal: TransactionJournalV1): Promise<void>;
    rollback(journal: TransactionJournalV1): Promise<void>;
  }): Promise<void> {
    for (const entry of await this.journal.listUnfinished()) {
      const decision = this.recoveryDecision(entry);
      if (decision === 'resume-download') await handlers.resume(entry);
      if (decision === 'rollback') {
        await this.journal.transition(entry.transactionId, 'rolling_back');
        try {
          await handlers.rollback(entry);
          await this.journal.transition(entry.transactionId, 'failed', 'recovered-by-rollback');
        } catch {
          await this.journal.transition(entry.transactionId, 'failed', 'rollback-failed');
        }
      }
    }
  }
}
