import { authenticate, handleError, json, parseJsonObject } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (typeof input.versionId !== 'string' || typeof input.expectedUpdatedAt !== 'string') throw new Error('invalid-request');
    const { data, error } = await context.database.rpc('planaria_publish_version', {
      subject: context.subject, target_version: input.versionId, expected_updated_at: input.expectedUpdatedAt,
    });
    if (error || data !== true) throw new Error('request-failed');
    return json(200, { published: true });
  } catch (error) { return handleError(error); }
});
