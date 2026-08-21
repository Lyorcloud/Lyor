import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { basename, dirname, extname } from 'node:path';

import { BrowserWindow, dialog } from 'electron';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  PlanariaBillboardMutationInput,
  PlanariaBillboardUploadInput,
  PlanariaCreateAdminInput,
  PlanariaDashboardSnapshot,
  PlanariaFilePurpose,
  PlanariaFileSelection,
  PlanariaModMediaUploadInput,
  PlanariaPackageUploadInput,
  PlanariaSaveDraftInput,
  PlanariaSaveDraftResult,
  PlanariaTransitionInput,
  PlanariaUploadProgress,
  PublicBillboardItem,
} from '../shared/planaria';
import type { AuthService } from './auth-service';

interface SelectedFile extends PlanariaFileSelection { readonly path: string }
interface UploadedPart { readonly partNumber: number; readonly etag: string; readonly size: number }
interface UploadJournalEntry {
  readonly key: string; readonly purpose: PlanariaFilePurpose; readonly target: string;
  readonly localPath: string; readonly size: number; readonly sha256: string;
  readonly sessionId: string; readonly expiresAt: string; readonly parts: readonly UploadedPart[];
}

const PART_SIZE = 8 * 1024 * 1024;
const MAX_SELECTIONS = 20;
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.rar': 'application/vnd.rar',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4',
};
const PURPOSE_EXTENSIONS: Readonly<Record<PlanariaFilePurpose, readonly string[]>> = {
  'mod-package': ['zip', '7z', 'rar'],
  'mod-image': ['png', 'jpg', 'jpeg', 'webp'],
  billboard: ['png', 'jpg', 'jpeg', 'webp', 'mp4'],
};
const MAX_BYTES: Readonly<Record<PlanariaFilePurpose, number>> = {
  'mod-package': 500 * 1024 * 1024 * 1024,
  'mod-image': 20 * 1024 * 1024,
  billboard: 500 * 1024 * 1024,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value);
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const sha256File = async (path: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

const uploadUrl = (value: unknown): URL => {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Upload authorization failed.');
  const url = new URL(value);
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password) {
    throw new Error('Upload authorization failed.');
  }
  return url;
};

export interface PlanariaServiceOptions {
  readonly auth: AuthService;
  readonly journalPath: string;
  readonly emitProgress: (progress: PlanariaUploadProgress) => void;
}

export class PlanariaService {
  readonly #auth: AuthService;
  readonly #journalPath: string;
  readonly #emitProgress: (progress: PlanariaUploadProgress) => void;
  readonly #selections = new Map<string, SelectedFile>();
  readonly #activeUploads = new Set<string>();
  #journalLoaded = false;
  #journal = new Map<string, UploadJournalEntry>();

  constructor(options: PlanariaServiceOptions) {
    this.#auth = options.auth;
    this.#journalPath = options.journalPath;
    this.#emitProgress = options.emitProgress;
  }

  async getDashboard(): Promise<PlanariaDashboardSnapshot> {
    const result = await this.#invoke('planaria-admin-api', { action: 'snapshot' });
    return result as unknown as PlanariaDashboardSnapshot;
  }

  async getPublicBillboards(): Promise<readonly PublicBillboardItem[]> {
    const result = await this.#invoke('planaria-public-feed', {}, false);
    if (!Array.isArray(result.items)) throw new Error('The billboard feed returned an invalid response.');
    return result.items as unknown as readonly PublicBillboardItem[];
  }

  async selectFile(window: BrowserWindow, purpose: PlanariaFilePurpose): Promise<PlanariaFileSelection | null> {
    const response = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: purpose === 'mod-package' ? 'Mod packages' : 'Media', extensions: [...PURPOSE_EXTENSIONS[purpose]] }],
    });
    const path = response.filePaths[0];
    if (response.canceled || !path) return null;
    const extension = extname(path).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType || !PURPOSE_EXTENSIONS[purpose].includes(extension.slice(1))) throw new Error('Unsupported file type.');
    const file = await fs.stat(path);
    if (!file.isFile() || file.size <= 0 || file.size > MAX_BYTES[purpose]) throw new Error('File size is outside the allowed range.');
    const selection: SelectedFile = {
      id: randomUUID(), purpose, path, name: basename(path), mimeType, size: file.size,
      sha256: await sha256File(path),
    };
    this.#selections.set(selection.id, selection);
    while (this.#selections.size > MAX_SELECTIONS) {
      const oldest = this.#selections.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#selections.delete(oldest);
    }
    return {
      id: selection.id, purpose: selection.purpose, name: selection.name,
      mimeType: selection.mimeType, size: selection.size, sha256: selection.sha256,
    };
  }

  async saveDraft(input: PlanariaSaveDraftInput): Promise<PlanariaSaveDraftResult> {
    const result = await this.#invoke('planaria-admin-api', { action: 'save-draft', ...input });
    if (!isUuid(result.versionId) || typeof result.modUpdatedAt !== 'string' || typeof result.versionUpdatedAt !== 'string') {
      throw new Error('The draft response was invalid.');
    }
    return result as unknown as PlanariaSaveDraftResult;
  }

  async uploadPackage(input: PlanariaPackageUploadInput): Promise<void> {
    await this.#upload(input.selectionId, 'mod-package', `${input.versionId}:${input.modId}:${input.version}`,
      'planaria-upload-session', {
        versionId: input.versionId, modId: input.modId, version: input.version,
      });
  }

  async uploadModMedia(input: PlanariaModMediaUploadInput): Promise<void> {
    await this.#upload(input.selectionId, 'mod-image', input.modId, 'planaria-mod-media', { modId: input.modId });
  }

  async uploadBillboard(input: PlanariaBillboardUploadInput): Promise<void> {
    await this.#upload(input.selectionId, 'billboard', input.alt, 'planaria-billboard', { alt: input.alt });
  }

  async transitionVersion(input: PlanariaTransitionInput): Promise<void> {
    await this.#invoke('planaria-admin-api', { ...input });
  }

  async mutateBillboard(input: PlanariaBillboardMutationInput): Promise<void> {
    await this.#invoke('planaria-billboard', { ...input });
  }

  async createAdmin(input: PlanariaCreateAdminInput): Promise<void> {
    await this.#invoke('planaria-admin-accounts', { action: 'create', ...input });
  }

  async #invoke(functionName: string, body: Record<string, unknown>, adminRequired = true): Promise<Record<string, unknown>> {
    const client = adminRequired ? this.#client() : this.#configuredClient();
    const { data, error } = await client.functions.invoke(functionName, { body });
    if (error || !isRecord(data)) throw new Error('Planaria request could not be completed.');
    if (typeof data.error === 'string') throw new Error('Planaria request was rejected.');
    return data;
  }

  #client(): SupabaseClient {
    const client = this.#configuredClient();
    const state = this.#auth.getState();
    if (!client || state.status !== 'authenticated' ||
        (state.user?.role !== 'admin' && state.user?.role !== 'super_admin')) {
      throw new Error('Planaria administrator access is required.');
    }
    return client;
  }

  #configuredClient(): SupabaseClient {
    const client = this.#auth.getCloudClient();
    if (!client) throw new Error('Planaria cloud is not configured.');
    return client;
  }

  async #upload(
    selectionId: string,
    purpose: PlanariaFilePurpose,
    target: string,
    functionName: string,
    createContext: Record<string, unknown>,
  ): Promise<void> {
    const selected = this.#selections.get(selectionId);
    if (!selected || selected.purpose !== purpose || this.#activeUploads.has(selectionId)) throw new Error('Select the file again.');
    this.#activeUploads.add(selectionId);
    this.#emit(selectionId, purpose, 'preparing', 0, 0, selected.size, null);
    const key = `${purpose}:${target}:${selected.sha256}`;
    try {
      await this.#loadJournal();
      let journal = this.#journal.get(key);
      if (!journal || Date.parse(journal.expiresAt) <= Date.now() + 30_000 ||
          journal.size !== selected.size || journal.sha256 !== selected.sha256) {
        if (journal) this.#journal.delete(key);
        const created = await this.#invoke(functionName, {
          action: purpose === 'billboard' ? 'create-upload' : 'create',
          ...createContext, mimeType: selected.mimeType,
          expectedSize: selected.size, expectedSha256: selected.sha256,
        });
        if (!isUuid(created.sessionId) || typeof created.expiresAt !== 'string') throw new Error('Upload session creation failed.');
        journal = {
          key, purpose, target, localPath: selected.path, size: selected.size, sha256: selected.sha256,
          sessionId: created.sessionId, expiresAt: created.expiresAt, parts: [],
        };
        this.#journal.set(key, journal);
        await this.#saveJournal();
      }

      const completed = new Map(journal.parts.map((part) => [part.partNumber, part]));
      let transferred = journal.parts.reduce((sum, part) => sum + part.size, 0);
      const file = await fs.open(selected.path, 'r');
      try {
        const partCount = Math.ceil(selected.size / PART_SIZE);
        for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
          if (completed.has(partNumber)) continue;
          const offset = (partNumber - 1) * PART_SIZE;
          const length = Math.min(PART_SIZE, selected.size - offset);
          const buffer = Buffer.allocUnsafe(length);
          const read = await file.read(buffer, 0, length, offset);
          if (read.bytesRead !== length) throw new Error('The selected file changed during upload.');
          const signed = await this.#invoke(functionName, { action: 'sign-part', sessionId: journal.sessionId, partNumber });
          const url = uploadUrl(signed.uploadUrl);
          let response: Response | null = null;
          for (const backoff of [0, 500, 1500]) {
            if (backoff) await delay(backoff);
            try {
              response = await fetch(url, { method: 'PUT', body: buffer });
              if (response.ok) break;
            } catch {
              response = null;
            }
          }
          if (!response?.ok) throw new Error('Object storage rejected an upload part.');
          const etag = response.headers.get('etag');
          if (!etag || etag.length > 512) throw new Error('Object storage did not return a valid part identifier.');
          const part = { partNumber, etag, size: length };
          completed.set(partNumber, part);
          transferred += length;
          journal = { ...journal, parts: [...completed.values()].sort((left, right) => left.partNumber - right.partNumber) };
          this.#journal.set(key, journal);
          await this.#saveJournal();
          this.#emit(selectionId, purpose, 'uploading', transferred / selected.size * 100, transferred, selected.size, null);
        }
      } finally {
        await file.close();
      }

      this.#emit(selectionId, purpose, 'finalizing', 100, selected.size, selected.size, null);
      await this.#invoke(functionName, {
        action: 'finalize', sessionId: journal.sessionId, parts: journal.parts,
        ...(purpose === 'billboard' ? { alt: target } : {}),
      });
      this.#journal.delete(key);
      await this.#saveJournal();
      this.#selections.delete(selectionId);
      this.#emit(selectionId, purpose, 'success', 100, selected.size, selected.size, null);
    } catch {
      const retainedBytes = this.#journal.get(key)?.parts.reduce((sum, part) => sum + part.size, 0) ?? 0;
      this.#emit(selectionId, purpose, 'error', retainedBytes / selected.size * 100,
        retainedBytes, selected.size, 'Upload failed. You can retry safely.');
      throw new Error('Upload failed. You can retry safely.');
    } finally {
      this.#activeUploads.delete(selectionId);
    }
  }

  #emit(uploadId: string, purpose: PlanariaFilePurpose, status: PlanariaUploadProgress['status'],
    percent: number, transferred: number, total: number, error: string | null): void {
    this.#emitProgress({ uploadId, purpose, status, percent: Math.max(0, Math.min(100, percent)), transferred, total, error });
  }

  async #loadJournal(): Promise<void> {
    if (this.#journalLoaded) return;
    this.#journalLoaded = true;
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.#journalPath, 'utf8'));
      if (!Array.isArray(parsed)) return;
      for (const candidate of parsed) {
        if (!isRecord(candidate) || typeof candidate.key !== 'string' || typeof candidate.localPath !== 'string' ||
            !isUuid(candidate.sessionId) || !Array.isArray(candidate.parts)) continue;
        this.#journal.set(candidate.key, candidate as unknown as UploadJournalEntry);
      }
    } catch {
      // Missing or corrupt journal starts empty. Remote sessions expire and are
      // cleaned by provider lifecycle rules.
    }
  }

  async #saveJournal(): Promise<void> {
    await fs.mkdir(dirname(this.#journalPath), { recursive: true });
    const temporary = `${this.#journalPath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify([...this.#journal.values()]), { mode: 0o600 });
    await fs.rename(temporary, this.#journalPath);
  }
}
