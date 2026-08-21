import {
  authenticate,
  boundedString,
  handleError,
  json,
  parseJsonObject,
  sha256String,
  signerRequest,
  uploadedParts,
  uuidString,
} from '../_shared/planaria.ts';

const contextFor = async (
  database: Awaited<ReturnType<typeof authenticate>>['database'], subject: string, sessionId: string,
): Promise<Record<string, unknown>> => {
  const { data, error } = await database.rpc('planaria_get_billboard_upload_context', {
    subject, upload_session: sessionId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || typeof row !== 'object' || row === null) throw new Error('request-failed');
  return row as Record<string, unknown>;
};

const audit = async (
  context: Awaited<ReturnType<typeof authenticate>>, action: string, billboardId: string, summary: string,
): Promise<void> => {
  const { error } = await context.database.rpc('planaria_record_audit', {
    subject: context.subject, audit_action: action, audit_entity_type: 'billboard',
    audit_entity_id: billboardId, audit_summary: summary,
  });
  if (error) throw new Error('request-failed');
};

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (input.action === 'move') {
      if (!uuidString(input.billboardId) || ![-1, 1].includes(Number(input.direction)) || !Number.isInteger(input.expectedRevision)) throw new Error('invalid-request');
      const { data, error } = await context.database.rpc('planaria_move_billboard', {
        subject: context.subject, target_billboard: input.billboardId,
        move_direction: input.direction, expected_revision: input.expectedRevision,
      });
      if (error || data !== true) throw new Error('request-failed');
      await audit(context, 'billboard.moved', input.billboardId, 'Billboard display order changed.');
      return json(200, { moved: true });
    }
    if (input.action === 'publish') {
      if (!uuidString(input.billboardId) || !Number.isInteger(input.expectedRevision)) throw new Error('invalid-request');
      const { data, error } = await context.database.rpc('planaria_publish_billboard', {
        subject: context.subject, target_billboard: input.billboardId, expected_revision: input.expectedRevision,
      });
      if (error || data !== true) throw new Error('request-failed');
      await audit(context, 'billboard.published', input.billboardId, 'Billboard published to the Home feed.');
      return json(200, { published: true });
    }
    if (input.action === 'create-upload') {
      if (!['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(String(input.mimeType)) ||
          !Number.isSafeInteger(input.expectedSize) || Number(input.expectedSize) <= 0 ||
          Number(input.expectedSize) > 524288000 || !sha256String(input.expectedSha256)) throw new Error('invalid-request');
      const storage = await signerRequest('/billboards/multipart/create', {
        purpose: 'billboard', mimeType: input.mimeType,
        expectedSize: input.expectedSize, expectedSha256: input.expectedSha256,
      });
      if (!boundedString(storage.objectKey, 1, 512) || !boundedString(storage.uploadId, 1, 512) ||
          !boundedString(storage.expiresAt, 1, 80)) throw new Error('storage-provider-failed');
      const { data, error } = await context.database.rpc('planaria_create_billboard_upload_session', {
        subject: context.subject, storage_provider: 's3-compatible',
        generated_object_key: storage.objectKey, storage_upload_id: storage.uploadId,
        expected_bytes: input.expectedSize, expected_digest: input.expectedSha256,
        expected_mime: input.mimeType, session_expires_at: storage.expiresAt,
      });
      if (error || !uuidString(data)) throw new Error('request-failed');
      return json(200, { sessionId: data, expiresAt: storage.expiresAt });
    }
    if (input.action === 'sign-part') {
      if (!uuidString(input.sessionId) || !Number.isInteger(input.partNumber) ||
          Number(input.partNumber) < 1 || Number(input.partNumber) > 10000) throw new Error('invalid-request');
      const stored = await contextFor(context.database, context.subject, input.sessionId);
      if (!boundedString(stored.object_key, 1, 512) || !boundedString(stored.provider_upload_id, 1, 512)) throw new Error('request-failed');
      const storage = await signerRequest('/multipart/sign-part', {
        purpose: 'billboard', objectKey: stored.object_key,
        uploadId: stored.provider_upload_id, partNumber: input.partNumber,
      });
      if (!boundedString(storage.uploadUrl, 1, 4096)) throw new Error('storage-provider-failed');
      return json(200, { uploadUrl: storage.uploadUrl });
    }
    if (input.action === 'finalize') {
      if (!uuidString(input.sessionId) || !uploadedParts(input.parts) || !boundedString(input.alt, 1, 240)) throw new Error('invalid-request');
      const stored = await contextFor(context.database, context.subject, input.sessionId);
      if (!boundedString(stored.object_key, 1, 512) || !boundedString(stored.provider_upload_id, 1, 512)) throw new Error('request-failed');
      const storage = await signerRequest('/billboards/multipart/finalize', {
        purpose: 'billboard', objectKey: stored.object_key,
        uploadId: stored.provider_upload_id, parts: input.parts,
      });
      if (!Number.isSafeInteger(storage.size) || !sha256String(storage.sha256) ||
          !['image/png', 'image/jpeg', 'image/webp', 'video/mp4'].includes(String(storage.mimeType)) ||
          !Number.isInteger(storage.width) || !Number.isInteger(storage.height) ||
          !(storage.durationMs === null || Number.isInteger(storage.durationMs))) throw new Error('storage-provider-failed');
      const { data, error } = await context.database.rpc('planaria_finalize_billboard_upload', {
        subject: context.subject, upload_session: input.sessionId, actual_bytes: storage.size,
        actual_digest: storage.sha256, actual_mime: storage.mimeType,
        actual_width: storage.width, actual_height: storage.height,
        actual_duration_ms: storage.durationMs, requested_alt_text: input.alt,
      });
      if (error || !uuidString(data)) throw new Error('request-failed');
      return json(200, { billboardId: data, verified: true });
    }
    if (input.action === 'abort') {
      if (!uuidString(input.sessionId)) throw new Error('invalid-request');
      const stored = await contextFor(context.database, context.subject, input.sessionId);
      if (!boundedString(stored.object_key, 1, 512) || !boundedString(stored.provider_upload_id, 1, 512)) throw new Error('request-failed');
      await signerRequest('/multipart/abort', {
        purpose: 'billboard', objectKey: stored.object_key, uploadId: stored.provider_upload_id,
      });
      const { error } = await context.database.rpc('planaria_abort_billboard_upload', {
        subject: context.subject, upload_session: input.sessionId,
      });
      if (error) throw new Error('request-failed');
      return json(200, { aborted: true });
    }
    if (input.action === 'disable') {
      if (!uuidString(input.billboardId) || !Number.isInteger(input.expectedRevision)) throw new Error('invalid-request');
      const { data, error } = await context.database.rpc('planaria_disable_billboard', {
        subject: context.subject, target_billboard: input.billboardId, expected_revision: input.expectedRevision,
      });
      if (error || data !== true) throw new Error('request-failed');
      await audit(context, 'billboard.disabled', input.billboardId, 'Billboard removed from the Home feed.');
      return json(200, { disabled: true });
    }
    if (input.action === 'delete') {
      if (!uuidString(input.billboardId)) throw new Error('invalid-request');
      const { data: row, error: selectError } = await context.database.from('billboards')
        .select('object_key,publish_state').eq('id', input.billboardId).maybeSingle();
      if (selectError || !row || row.publish_state !== 'disabled' || !boundedString(row.object_key, 1, 512)) throw new Error('request-failed');
      await signerRequest('/object/delete', { objectKey: row.object_key });
      const { data: objectKey, error } = await context.database.rpc('planaria_delete_billboard', {
        subject: context.subject, target_billboard: input.billboardId, expected_object_key: row.object_key,
      });
      if (error || objectKey !== row.object_key) throw new Error('request-failed');
      await audit(context, 'billboard.deleted', input.billboardId, 'Disabled billboard metadata and object deleted.');
      return json(200, { deleted: true });
    }
    throw new Error('invalid-request');
  } catch (error) {
    return handleError(error);
  }
});
