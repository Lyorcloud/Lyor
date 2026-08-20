import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_AUTO_CHECK_ENABLED = true;

interface StoredUpdatePreferences {
  readonly autoCheckEnabled: boolean;
}

const isStoredUpdatePreferences = (
  value: unknown,
): value is StoredUpdatePreferences => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (
    'autoCheckEnabled' in value &&
    typeof value.autoCheckEnabled === 'boolean'
  );
};

export class UpdatePreferences {
  private autoCheckEnabled = DEFAULT_AUTO_CHECK_ENABLED;
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly preferencesPath: string,
    private readonly logWarning: (message: string) => void,
  ) {}

  public async getAutoCheckEnabled(): Promise<boolean> {
    await this.ensureLoaded();
    return this.autoCheckEnabled;
  }

  public async setAutoCheckEnabled(enabled: boolean): Promise<boolean> {
    await this.ensureLoaded();
    const previousValue = this.autoCheckEnabled;
    this.autoCheckEnabled = enabled;

    const snapshot: StoredUpdatePreferences = { autoCheckEnabled: enabled };
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.preferencesPath), { recursive: true });
        await writeFile(
          this.preferencesPath,
          `${JSON.stringify(snapshot)}\n`,
          { encoding: 'utf8', mode: 0o600 },
        );
      });

    try {
      await this.writeQueue;
    } catch {
      this.autoCheckEnabled = previousValue;
      this.logWarning('Could not save update preferences.');
      throw new Error('Could not save the update preference.');
    }

    return this.autoCheckEnabled;
  }

  private async ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.load();
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const rawPreferences = await readFile(this.preferencesPath, 'utf8');
      const parsed: unknown = JSON.parse(rawPreferences);

      if (!isStoredUpdatePreferences(parsed)) {
        this.logWarning('Ignored invalid update preferences.');
        return;
      }

      this.autoCheckEnabled = parsed.autoCheckEnabled;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }

      this.logWarning('Could not read update preferences; using defaults.');
    }
  }
}
