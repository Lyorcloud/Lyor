import { authenticate, handleError, json, parseJsonObject, signerRequest } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (input.action === 'move') {
      if (typeof input.billboardId !== 'string' || ![-1, 1].includes(Number(input.direction)) || !Number.isInteger(input.expectedRevision)) throw new Error('invalid-request');
      const { data, error } = await context.database.rpc('planaria_move_billboard', {
        subject: context.subject, target_billboard: input.billboardId,
        move_direction: input.direction, expected_revision: input.expectedRevision,
      });
      if (error || data !== true) throw new Error('request-failed');
      return json(200, { moved: true });
    }
    if (input.action === 'publish') {
      if (typeof input.billboardId !== 'string' || !Number.isInteger(input.expectedRevision)) throw new Error('invalid-request');
      const { data, error } = await context.database.rpc('planaria_publish_billboard', {
        subject: context.subject, target_billboard: input.billboardId, expected_revision: input.expectedRevision,
      });
      if (error || data !== true) throw new Error('request-failed');
      return json(200, { published: true });
    }
    if (input.action === 'create-upload') {
      if (typeof input.mimeType !== 'string' || !Number.isSafeInteger(input.expectedSize) || typeof input.expectedSha256 !== 'string') throw new Error('invalid-request');
      const storage = await signerRequest('/billboards/multipart/create', input);
      return json(200, storage);
    }
    if (input.action === 'disable') {
      if (typeof input.billboardId !== 'string' || !Number.isInteger(input.expectedRevision)) throw new Error('invalid-request');
      const { data, error } = await context.database.rpc('planaria_disable_billboard', {
        subject: context.subject, target_billboard: input.billboardId, expected_revision: input.expectedRevision,
      });
      if (error || data !== true) throw new Error('request-failed');
      return json(200, { disabled: true });
    }
    if (input.action === 'delete') {
      if (typeof input.billboardId !== 'string' || typeof input.objectKey !== 'string') throw new Error('invalid-request');
      const { data: objectKey, error } = await context.database.rpc('planaria_delete_billboard', {
        subject: context.subject, target_billboard: input.billboardId, expected_object_key: input.objectKey,
      });
      if (error || typeof objectKey !== 'string') throw new Error('request-failed');
      await signerRequest('/object/delete', { objectKey });
      return json(200, { deleted: true });
    }
    throw new Error('invalid-request');
  } catch (error) { return handleError(error); }
});
