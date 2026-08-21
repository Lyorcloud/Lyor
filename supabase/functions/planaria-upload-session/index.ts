import {
  authenticate,
  boundedString,
  handleError,
  json,
  parseJsonObject,
  safeIdentifier,
  sha256String,
  signerRequest,
  uploadedParts,
  uuidString,
} from '../_shared/planaria.ts';

const uploadContext = async (
  database: Awaited<ReturnType<typeof authenticate>>['database'],
  subject: string,
  sessionId: string,
): Promise<Record<string, unknown>> => {
  const { data, error } = await database.rpc('planaria_get_upload_context', {
    subject,
    upload_session: sessionId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || typeof row !== 'object' || row === null) throw new Error('request-failed');
  return row as Record<string, unknown>;
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (input.action === 'create') {
      if (!uuidString(input.versionId) || !safeIdentifier(input.modId) || !safeIdentifier(input.version, 80) ||
          !boundedString(input.relativePath, 1, 1024) || String(input.relativePath).startsWith('/') ||
          /^[a-z]:/iu.test(String(input.relativePath)) || String(input.relativePath).split('/').includes('..') || String(input.relativePath).includes('\\') ||
          !Number.isSafeInteger(input.expectedSize) || Number(input.expectedSize) <= 0 ||
          Number(input.expectedSize) > 536870912000 || !sha256String(input.expectedSha256)) throw new Error('invalid-request');
      const storage = await signerRequest('/content/multipart/create', {
        purpose: 'mod-content', versionId: input.versionId, modId: input.modId,
        version: input.version, expectedSize: input.expectedSize, expectedSha256: input.expectedSha256,
      });
      if (typeof storage.objectKey !== 'string' || typeof storage.uploadId !== 'string' || typeof storage.expiresAt !== 'string') {
        throw new Error('storage-provider-failed');
      }
      const { data, error } = await context.database.rpc('planaria_create_content_upload_session', {
        subject: context.subject, target_version: input.versionId, storage_provider: 's3-compatible',
        relative_file_path: input.relativePath,
        generated_object_key: storage.objectKey, expected_bytes: input.expectedSize,
        expected_digest: input.expectedSha256, storage_upload_id: storage.uploadId,
        session_expires_at: storage.expiresAt,
      });
      if (error) throw new Error('request-failed');
      return json(200, { sessionId: data, expiresAt: storage.expiresAt });
    }
    if (input.action === 'sign-part') {
      if (!uuidString(input.sessionId) || !Number.isInteger(input.partNumber) ||
          Number(input.partNumber) < 1 || Number(input.partNumber) > 10000) throw new Error('invalid-request');
      const stored = await uploadContext(context.database, context.subject, input.sessionId);
      if (!boundedString(stored.object_key, 1, 512) || !boundedString(stored.provider_upload_id, 1, 512) ||
          stored.state !== 'pending' || !boundedString(stored.expires_at, 1, 80)) throw new Error('request-failed');
      const storage = await signerRequest('/multipart/sign-part', {
        purpose: 'mod-content', objectKey: stored.object_key,
        uploadId: stored.provider_upload_id, partNumber: input.partNumber,
      });
      if (!boundedString(storage.uploadUrl, 1, 4096)) throw new Error('storage-provider-failed');
      return json(200, { uploadUrl: storage.uploadUrl });
    }
    if (input.action === 'finalize') {
      if (!uuidString(input.sessionId) || !uploadedParts(input.parts)) throw new Error('invalid-request');
      const stored = await uploadContext(context.database, context.subject, input.sessionId);
      if (!boundedString(stored.object_key, 1, 512) || !boundedString(stored.provider_upload_id, 1, 512)) {
        throw new Error('request-failed');
      }
      const storage = await signerRequest('/content/multipart/finalize', {
        purpose: 'mod-content', objectKey: stored.object_key,
        uploadId: stored.provider_upload_id, parts: input.parts,
      });
      if (!Number.isSafeInteger(storage.size) || !sha256String(storage.sha256)) throw new Error('storage-provider-failed');
      const { data, error } = await context.database.rpc('planaria_finalize_content_upload', {
        subject: context.subject, upload_session: input.sessionId,
        actual_bytes: storage.size, actual_digest: storage.sha256,
      });
      if (error) throw new Error('request-failed');
      return json(200, { versionId: data, verified: true });
    }
    if (input.action === 'abort') {
      if (!uuidString(input.sessionId)) throw new Error('invalid-request');
      const stored = await uploadContext(context.database, context.subject, input.sessionId);
      if (!boundedString(stored.object_key, 1, 512) || !boundedString(stored.provider_upload_id, 1, 512)) {
        throw new Error('request-failed');
      }
      await signerRequest('/multipart/abort', {
        purpose: 'mod-content', objectKey: stored.object_key, uploadId: stored.provider_upload_id,
      });
      const { error } = await context.database.rpc('planaria_abort_upload', { subject: context.subject, upload_session: input.sessionId });
      if (error) throw new Error('request-failed');
      return json(200, { aborted: true });
    }
    throw new Error('invalid-request');
  } catch (error) { return handleError(error); }
});
