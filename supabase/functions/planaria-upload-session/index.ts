import { authenticate, handleError, json, parseJsonObject, signerRequest } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (input.action === 'create') {
      if (typeof input.versionId !== 'string' || typeof input.modId !== 'string' || typeof input.version !== 'string' ||
          !Number.isSafeInteger(input.expectedSize) || typeof input.expectedSha256 !== 'string') throw new Error('invalid-request');
      const storage = await signerRequest('/multipart/create', input);
      if (typeof storage.objectKey !== 'string' || typeof storage.uploadId !== 'string' || typeof storage.expiresAt !== 'string') {
        throw new Error('storage-provider-failed');
      }
      const { data, error } = await context.database.rpc('planaria_create_upload_session', {
        subject: context.subject, target_version: input.versionId, storage_provider: 's3-compatible',
        generated_object_key: storage.objectKey, expected_bytes: input.expectedSize,
        expected_digest: input.expectedSha256, storage_upload_id: storage.uploadId,
        session_expires_at: storage.expiresAt,
      });
      if (error) throw new Error('request-failed');
      return json(200, { sessionId: data, ...storage });
    }
    if (input.action === 'finalize') {
      if (typeof input.sessionId !== 'string') throw new Error('invalid-request');
      const storage = await signerRequest('/multipart/finalize', input);
      const { data, error } = await context.database.rpc('planaria_finalize_upload', {
        subject: context.subject, upload_session: input.sessionId,
        actual_bytes: storage.size, actual_digest: storage.sha256,
      });
      if (error) throw new Error('request-failed');
      return json(200, { versionId: data, verified: true });
    }
    if (input.action === 'abort') {
      if (typeof input.sessionId !== 'string') throw new Error('invalid-request');
      await signerRequest('/multipart/abort', input);
      const { error } = await context.database.rpc('planaria_abort_upload', { subject: context.subject, upload_session: input.sessionId });
      if (error) throw new Error('request-failed');
      return json(200, { aborted: true });
    }
    throw new Error('invalid-request');
  } catch (error) { return handleError(error); }
});
