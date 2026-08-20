import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname } from 'node:path';

import { InstallationEngineError } from './errors';
import { sha256File } from './generic-file-adapter';

export interface DownloadRequest {
  readonly url: string;
  readonly destinationPath: string;
  readonly expectedSha256: string;
  readonly expectedSize: number;
  readonly maximumAttempts?: number;
}

export interface DownloadResult {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly resumed: boolean;
}

export interface DownloadManagerOptions {
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly backoffMilliseconds?: (attempt: number) => number;
}

const existingSize = async (path: string): Promise<number> => {
  try { return (await stat(path)).size; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
};

export class DownloadManager {
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #backoff: (attempt: number) => number;

  constructor(options: DownloadManagerOptions = {}) {
    this.#sleep = options.sleep ?? (async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#backoff = options.backoffMilliseconds ?? ((attempt) => Math.min(250 * (2 ** attempt), 4000));
  }

  async download(input: DownloadRequest): Promise<DownloadResult> {
    if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256) || !Number.isSafeInteger(input.expectedSize) || input.expectedSize < 0) {
      throw new InstallationEngineError('invalid-request', 'Download integrity metadata is invalid.');
    }
    const url = new URL(input.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new InstallationEngineError('invalid-request', 'Download URL is not an approved HTTP endpoint.');
    }
    const partialPath = `${input.destinationPath}.partial`;
    await mkdir(dirname(input.destinationPath), { recursive: true });
    const maximumAttempts = Math.min(Math.max(input.maximumAttempts ?? 3, 1), 8);
    let lastError: unknown;
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      try {
        const resumed = await this.#attempt(url, partialPath);
        const size = await existingSize(partialPath);
        const sha256 = await sha256File(partialPath);
        if (size !== input.expectedSize || sha256 !== input.expectedSha256) {
          await rm(partialPath, { force: true });
          throw new InstallationEngineError('integrity-failed', 'Downloaded package failed size or SHA-256 validation.');
        }
        await rename(partialPath, input.destinationPath);
        return { path: input.destinationPath, sha256, size, resumed };
      } catch (error) {
        lastError = error;
        if (error instanceof InstallationEngineError && error.code === 'integrity-failed') throw error;
        if (attempt + 1 < maximumAttempts) await this.#sleep(this.#backoff(attempt));
      }
    }
    throw new InstallationEngineError('operation-failed',
      lastError instanceof Error ? 'Download retry limit was reached.' : 'Download failed.');
  }

  async #attempt(url: URL, partialPath: string): Promise<boolean> {
    const offset = await existingSize(partialPath);
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return await new Promise<boolean>((resolve, reject) => {
      const request = transport(url, {
        method: 'GET',
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
      }, (response) => {
        const status = response.statusCode ?? 0;
        const append = offset > 0 && status === 206;
        if (![200, 206].includes(status)) {
          response.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const output = createWriteStream(partialPath, { flags: append ? 'a' : 'w' });
        response.pipe(output);
        response.on('error', reject);
        output.on('error', reject);
        output.on('finish', () => {
          output.close();
          resolve(append);
        });
      });
      request.on('error', reject);
      request.setTimeout(15000, () => request.destroy(new Error('Download timed out.')));
      request.end();
    });
  }
}

export const hashBytes = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

export const createPartialDownload = async (path: string, bytes: Uint8Array): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(`${path}.partial`, 'w');
  try { await handle.write(bytes); } finally { await handle.close(); }
};
