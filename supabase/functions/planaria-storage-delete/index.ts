import { authenticate, handleError, json, parseJsonObject, signerRequest } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (typeof input.versionId !== 'string' || typeof input.objectKey !== 'string') throw new Error('invalid-request');
    const { data, error } = await context.database.rpc('planaria_delete_package_metadata', {
      subject: context.subject, target_version: input.versionId, expected_object_key: input.objectKey,
    });
    if (error || data !== true) throw new Error('request-failed');
    await signerRequest('/object/delete', { objectKey: input.objectKey });
    return json(200, { deleted: true });
  } catch (error) { return handleError(error); }
});
