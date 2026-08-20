import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface MultipartUploadRequest {
  readonly modId: string;
  readonly version: string;
  readonly expectedSize: number;
  readonly expectedSha256: string;
}
export interface MultipartUploadSession {
  readonly sessionId: string;
  readonly objectKey: string;
  readonly providerUploadId: string;
  readonly expiresAt: string;
}
export interface UploadedPart {
  readonly partNumber: number;
  readonly etag: string;
  readonly size: number;
}
export interface StoredObjectMetadata {
  readonly provider: string;
  readonly objectKey: string;
  readonly size: number;
  readonly sha256: string;
  readonly immutable: boolean;
}
export interface ModStorageProvider {
  createMultipartUpload(input: MultipartUploadRequest): Promise<MultipartUploadSession>;
  createPartUploadUrl(sessionId: string, partNumber: number, expiresInSeconds: number): Promise<string>;
  finalizeMultipartUpload(sessionId: string, parts: readonly UploadedPart[]): Promise<StoredObjectMetadata>;
  abortMultipartUpload(sessionId: string): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
  objectExists(objectKey: string): Promise<boolean>;
  getMetadata(objectKey: string): Promise<StoredObjectMetadata | null>;
  createSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}

interface LocalSession extends MultipartUploadSession {
  readonly expectedSize: number;
  readonly expectedSha256: string;
  readonly parts: Map<number, Uint8Array>;
}

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const safeObjectSegment = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/gu, '-').slice(0, 120);

export class LocalS3CompatibleStorageProvider implements ModStorageProvider {
  readonly provider = 'local-s3-compatible-fixture';
  readonly #sessions = new Map<string, LocalSession>();
  readonly #metadata = new Map<string, StoredObjectMetadata>();

  constructor(
    readonly rootPath: string,
    readonly endpoint: string,
    readonly signingSecret: Uint8Array,
    readonly now: () => number = Date.now,
  ) {}

  async createMultipartUpload(input: MultipartUploadRequest): Promise<MultipartUploadSession> {
    if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256) || input.expectedSize < 0) throw new TypeError('Invalid object integrity metadata.');
    const sessionId = randomUUID();
    const objectKey = `mods/${safeObjectSegment(input.modId)}/${safeObjectSegment(input.version)}/${randomUUID()}.package`;
    const session: LocalSession = {
      sessionId, objectKey, providerUploadId: randomUUID(),
      expiresAt: new Date(this.now() + 60 * 60 * 1000).toISOString(),
      expectedSize: input.expectedSize, expectedSha256: input.expectedSha256, parts: new Map(),
    };
    this.#sessions.set(sessionId, session);
    return { sessionId, objectKey, providerUploadId: session.providerUploadId, expiresAt: session.expiresAt };
  }

  async createPartUploadUrl(sessionId: string, partNumber: number, expiresInSeconds: number): Promise<string> {
    const session = this.#requireSession(sessionId);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new TypeError('Invalid part number.');
    return this.#sign(`upload/${session.sessionId}/${partNumber}`, expiresInSeconds);
  }

  async putFixturePart(sessionId: string, partNumber: number, bytes: Uint8Array): Promise<UploadedPart> {
    const session = this.#requireSession(sessionId);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new TypeError('Invalid part number.');
    session.parts.set(partNumber, Uint8Array.from(bytes));
    return { partNumber, etag: hash(bytes), size: bytes.length };
  }

  async finalizeMultipartUpload(sessionId: string, parts: readonly UploadedPart[]): Promise<StoredObjectMetadata> {
    const session = this.#requireSession(sessionId);
    const unique = new Set(parts.map((part) => part.partNumber));
    if (unique.size !== parts.length || parts.length === 0) throw new Error('Multipart part list is invalid.');
    const ordered = [...parts].sort((left, right) => left.partNumber - right.partNumber);
    const buffers: Buffer[] = [];
    for (const part of ordered) {
      const bytes = session.parts.get(part.partNumber);
      if (!bytes || part.etag !== hash(bytes) || part.size !== bytes.length) throw new Error('Multipart part verification failed.');
      buffers.push(Buffer.from(bytes));
    }
    const object = Buffer.concat(buffers);
    if (object.length !== session.expectedSize || hash(object) !== session.expectedSha256) throw new Error('Final object integrity verification failed.');
    const target = join(this.rootPath, ...session.objectKey.split('/'));
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, object, { flag: 'wx' });
    const metadata: StoredObjectMetadata = {
      provider: this.provider, objectKey: session.objectKey, size: object.length,
      sha256: hash(object), immutable: true,
    };
    this.#metadata.set(session.objectKey, metadata);
    this.#sessions.delete(sessionId);
    return metadata;
  }

  async abortMultipartUpload(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const metadata = this.#metadata.get(objectKey);
    if (!metadata) return;
    await rm(join(this.rootPath, ...objectKey.split('/')), { force: true });
    this.#metadata.delete(objectKey);
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try { return (await stat(join(this.rootPath, ...objectKey.split('/')))).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }

  async getMetadata(objectKey: string): Promise<StoredObjectMetadata | null> {
    return this.#metadata.get(objectKey) ?? null;
  }

  async createSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    if (!await this.objectExists(objectKey)) throw new Error('Object not found.');
    return this.#sign(`download/${objectKey}`, expiresInSeconds);
  }

  verifySignedUrl(value: string): boolean {
    const url = new URL(value);
    const expires = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('signature') ?? '';
    if (!Number.isSafeInteger(expires) || expires < this.now()) return false;
    const payload = `${url.pathname.replace(/^\//u, '')}:${expires}`;
    const expected = createHmac('sha256', this.signingSecret).update(payload).digest();
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async readFixtureObject(objectKey: string): Promise<Uint8Array> {
    return readFile(join(this.rootPath, ...objectKey.split('/')));
  }

  #requireSession(sessionId: string): LocalSession {
    const session = this.#sessions.get(sessionId);
    if (!session || Date.parse(session.expiresAt) <= this.now()) throw new Error('Upload session is missing or expired.');
    return session;
  }

  #sign(path: string, expiresInSeconds: number): string {
    const boundedLifetime = Math.min(Math.max(Math.trunc(expiresInSeconds), 1), 900);
    const expires = this.now() + boundedLifetime * 1000;
    const payload = `${path}:${expires}`;
    const signature = createHmac('sha256', this.signingSecret).update(payload).digest('hex');
    const url = new URL(path, this.endpoint.endsWith('/') ? this.endpoint : `${this.endpoint}/`);
    url.searchParams.set('expires', String(expires));
    url.searchParams.set('signature', signature);
    return url.href;
  }
}

export interface S3SignerClient {
  createMultipart(key: string): Promise<string>;
  signUploadPart(key: string, uploadId: string, partNumber: number, expiresInSeconds: number): Promise<string>;
  completeMultipart(key: string, uploadId: string, parts: readonly UploadedPart[]): Promise<StoredObjectMetadata>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<StoredObjectMetadata | null>;
  signDownload(key: string, expiresInSeconds: number): Promise<string>;
}

export class S3CompatibleStorageProvider implements ModStorageProvider {
  readonly #sessions = new Map<string, MultipartUploadSession>();
  constructor(readonly provider: string, readonly signer: S3SignerClient) {}
  async createMultipartUpload(input: MultipartUploadRequest): Promise<MultipartUploadSession> {
    const sessionId = randomUUID();
    const objectKey = `mods/${safeObjectSegment(input.modId)}/${safeObjectSegment(input.version)}/${randomUUID()}.package`;
    const providerUploadId = await this.signer.createMultipart(objectKey);
    const session = { sessionId, objectKey, providerUploadId, expiresAt: new Date(Date.now() + 3600000).toISOString() };
    this.#sessions.set(sessionId, session);
    return session;
  }
  async createPartUploadUrl(sessionId: string, partNumber: number, expiresInSeconds: number): Promise<string> {
    const session = this.#require(sessionId);
    return this.signer.signUploadPart(session.objectKey, session.providerUploadId, partNumber, Math.min(expiresInSeconds, 900));
  }
  async finalizeMultipartUpload(sessionId: string, parts: readonly UploadedPart[]): Promise<StoredObjectMetadata> {
    const session = this.#require(sessionId);
    const metadata = await this.signer.completeMultipart(session.objectKey, session.providerUploadId, parts);
    this.#sessions.delete(sessionId);
    return metadata;
  }
  async abortMultipartUpload(sessionId: string): Promise<void> { const session = this.#require(sessionId); await this.signer.abortMultipart(session.objectKey, session.providerUploadId); this.#sessions.delete(sessionId); }
  async deleteObject(objectKey: string): Promise<void> { await this.signer.delete(objectKey); }
  async objectExists(objectKey: string): Promise<boolean> { return await this.signer.head(objectKey) !== null; }
  async getMetadata(objectKey: string): Promise<StoredObjectMetadata | null> { return this.signer.head(objectKey); }
  async createSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string> { return this.signer.signDownload(objectKey, Math.min(expiresInSeconds, 900)); }
  #require(sessionId: string): MultipartUploadSession { const value = this.#sessions.get(sessionId); if (!value) throw new Error('Upload session not found.'); return value; }
}
