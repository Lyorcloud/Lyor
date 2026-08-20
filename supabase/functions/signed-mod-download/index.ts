import { authenticate, handleError, json, parseJsonObject, signerRequest } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const context = await authenticate(request, false);
    const input = await parseJsonObject(request);
    if (typeof input.versionId !== 'string') throw new Error('invalid-request');
    const { data, error } = await context.database.rpc('planaria_get_download_metadata', {
      subject: context.subject, target_version: input.versionId,
    });
    const metadata = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    if (error || !metadata || typeof metadata.object_key !== 'string') throw new Error('forbidden');
    const signed = await signerRequest('/download/sign', { objectKey: metadata.object_key, expiresInSeconds: 300 });
    return json(200, { url: signed.url, size: metadata.byte_size, sha256: metadata.sha256, expiresInSeconds: 300 });
  } catch (error) { return handleError(error); }
});
