import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const JOURNAL_PHASES = [
  'pending', 'downloading', 'validating', 'staging', 'backing_up', 'installing',
  'verifying', 'rolling_back', 'installed', 'failed',
] as const;
export type JournalPhase = (typeof JOURNAL_PHASES)[number];

export interface TransactionJournalV1 {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly modId: string;
  readonly modVersion: string;
  readonly gameDetectionId: string;
  readonly phase: JournalPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attempt: number;
  readonly errorCode: string | null;
}

const isSafeId = (value: string): boolean => /^[a-zA-Z0-9_-]{1,120}$/u.test(value);

export class TransactionJournalStore {
  constructor(readonly rootPath: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true });
  }

  #path(transactionId: string): string {
    if (!isSafeId(transactionId)) throw new TypeError('Invalid transaction ID.');
    return join(this.rootPath, `${transactionId}.json`);
  }

  async create(input: Omit<TransactionJournalV1, 'schemaVersion' | 'phase' | 'createdAt' | 'updatedAt' | 'attempt' | 'errorCode'>): Promise<TransactionJournalV1> {
    const now = new Date().toISOString();
    const journal: TransactionJournalV1 = {
      schemaVersion: 1,
      ...input,
      phase: 'pending',
      createdAt: now,
      updatedAt: now,
      attempt: 0,
      errorCode: null,
    };
    await this.write(journal);
    return journal;
  }

  async read(transactionId: string): Promise<TransactionJournalV1 | null> {
    try {
      const value = JSON.parse(await readFile(this.#path(transactionId), 'utf8')) as TransactionJournalV1;
      if (value.schemaVersion !== 1 || !JOURNAL_PHASES.includes(value.phase)) throw new Error('Unsupported journal.');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async transition(transactionId: string, phase: JournalPhase, errorCode: string | null = null): Promise<TransactionJournalV1> {
    const current = await this.read(transactionId);
    if (!current) throw new Error('Transaction journal does not exist.');
    const next = { ...current, phase, updatedAt: new Date().toISOString(),
      attempt: phase === 'downloading' ? current.attempt + 1 : current.attempt, errorCode };
    await this.write(next);
    return next;
  }

  async write(journal: TransactionJournalV1): Promise<void> {
    await this.initialize();
    const target = this.#path(journal.transactionId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  }

  async listUnfinished(): Promise<readonly TransactionJournalV1[]> {
    await this.initialize();
    const names = await readdir(this.rootPath);
    const journals: TransactionJournalV1[] = [];
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const journal = await this.read(name.slice(0, -5));
      if (journal && journal.phase !== 'installed' && journal.phase !== 'failed') journals.push(journal);
    }
    return journals;
  }
}
