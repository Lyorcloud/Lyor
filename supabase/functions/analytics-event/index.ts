import { authenticate, handleError, json, parseJsonObject } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, false);
    const input = await parseJsonObject(request);
    if (typeof input.modId !== 'string' || typeof input.name !== 'string' || typeof input.idempotencyKey !== 'string') {
      throw new Error('invalid-request');
    }
    const serverVerified = input.name === 'download_completed' ? request.headers.get('x-lyor-download-verification') === Deno.env.get('ANALYTICS_VERIFICATION_SECRET') : false;
    const { data, error } = await context.database.rpc('planaria_record_event', {
      subject: context.subject, target_mod: input.modId, event_type: input.name,
      event_key: input.idempotencyKey, server_verified: serverVerified,
    });
    if (error) throw new Error('request-failed');
    return json(202, { accepted: data === true });
  } catch (error) { return handleError(error); }
});
