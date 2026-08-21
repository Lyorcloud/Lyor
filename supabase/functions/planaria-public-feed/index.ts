import { createAdminDatabase, handleError, json, signerRequest } from '../_shared/planaria.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const database = createAdminDatabase();
    const { data, error } = await database.from('billboards')
      .select('id,media_type,object_key,alt_text,display_order')
      .eq('publish_state', 'published')
      .order('display_order', { ascending: true })
      .limit(50);
    if (error || !Array.isArray(data)) throw new Error('request-failed');
    const items = (await Promise.all(data.map(async (item) => {
      if (typeof item.object_key !== 'string') return null;
      try {
        const signed = await signerRequest('/download/sign', {
          objectKey: item.object_key, expiresInSeconds: 300,
        });
        if (typeof signed.url !== 'string') return null;
        return {
          id: item.id, kind: item.media_type, alt: item.alt_text,
          displayOrder: item.display_order, published: true, src: signed.url,
        };
      } catch {
        return null;
      }
    }))).filter((item) => item !== null);
    return json(200, { items, expiresInSeconds: 300 });
  } catch (error) {
    return handleError(error);
  }
});
