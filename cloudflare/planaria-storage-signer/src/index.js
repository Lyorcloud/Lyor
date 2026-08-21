/* global TextEncoder, TextDecoder, Response, btoa, atob, crypto, URL */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const fromBase64url = (value) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), (char) => char.charCodeAt(0));
const timingSafeEqual = async (left, right) => {
  const leftDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(left)));
  const rightDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(right)));
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) difference |= leftDigest[index] ^ rightDigest[index];
  return difference === 0;
};
const hmacKey = (secret) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const sign = async (payload, secret) => {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body)));
  return `${body}.${base64url(signature)}`;
};
const verify = async (token, secret) => {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64url(signature), encoder.encode(body));
  if (!valid) return null;
  const payload = JSON.parse(decoder.decode(fromBase64url(body)));
  return Number(payload.exp) >= Date.now() ? payload : null;
};
const readJson = async (request) => {
  if (Number(request.headers.get('content-length') || '0') > 65536) throw new Error('invalid');
  const value = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
  return value;
};
const validKey = (value) => typeof value === 'string' && value.length <= 512 && /^(content|packages|media|billboards)\/[a-z0-9/_-]+$/i.test(value);
const dimensions = async (object) => {
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length >= 24 && bytes[0] === 0x89 && decoder.decode(bytes.slice(1, 4)) === 'PNG') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  return { width: 0, height: 0 };
};
const authorized = async (request, env) => {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') && await timingSafeEqual(value.slice(7), env.SIGNER_SECRET);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'PUT' && url.pathname === '/upload-part') {
        const payload = await verify(url.searchParams.get('token') || '', env.SIGNER_SECRET);
        if (!payload || payload.action !== 'part' || !validKey(payload.key) || !Number.isInteger(payload.part)) return json(403, { error: 'forbidden' });
        const upload = env.BUCKET.resumeMultipartUpload(payload.key, payload.uploadId);
        const part = await upload.uploadPart(payload.part, request.body);
        return new Response(null, { status: 204, headers: { etag: part.etag } });
      }
      if (request.method === 'GET' && url.pathname === '/object') {
        const payload = await verify(url.searchParams.get('token') || '', env.SIGNER_SECRET);
        if (!payload || payload.action !== 'read' || !validKey(payload.key)) return json(403, { error: 'forbidden' });
        const object = await env.BUCKET.get(payload.key);
        if (!object) return json(404, { error: 'not-found' });
        return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType || 'application/octet-stream', etag: object.httpEtag, 'cache-control': 'private, max-age=300' } });
      }
      if (request.method !== 'POST' || !await authorized(request, env)) return json(401, { error: 'unauthorized' });
      const input = await readJson(request);
      if (url.pathname.endsWith('/multipart/create')) {
        const prefix = url.pathname.startsWith('/billboards/') ? 'billboards' : url.pathname.startsWith('/media/') ? 'media' : url.pathname.startsWith('/content/') ? 'content' : 'packages';
        if (!Number.isSafeInteger(input.expectedSize) || input.expectedSize <= 0 || !/^[a-f0-9]{64}$/i.test(String(input.expectedSha256)) || typeof input.mimeType !== 'string') return json(400, { error: 'invalid' });
        const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
        const upload = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: input.mimeType }, customMetadata: { expectedSha256: input.expectedSha256, expectedSize: String(input.expectedSize) } });
        return json(200, { objectKey: key, uploadId: upload.uploadId, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      }
      if (url.pathname === '/multipart/sign-part') {
        if (!validKey(input.objectKey) || typeof input.uploadId !== 'string' || !Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10000) return json(400, { error: 'invalid' });
        const token = await sign({ action: 'part', key: input.objectKey, uploadId: input.uploadId, part: input.partNumber, exp: Date.now() + 900000 }, env.SIGNER_SECRET);
        return json(200, { uploadUrl: `${url.origin}/upload-part?token=${encodeURIComponent(token)}` });
      }
      if (url.pathname.endsWith('/multipart/finalize')) {
        if (!validKey(input.objectKey) || typeof input.uploadId !== 'string' || !Array.isArray(input.parts) || input.parts.length === 0) return json(400, { error: 'invalid' });
        const upload = env.BUCKET.resumeMultipartUpload(input.objectKey, input.uploadId);
        let metadata = await env.BUCKET.head(input.objectKey);
        if (!metadata) {
          try {
            await upload.complete(input.parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })));
          } catch (error) {
            metadata = await env.BUCKET.head(input.objectKey);
            if (!metadata) throw error;
          }
          metadata ||= await env.BUCKET.head(input.objectKey);
        }
        if (!metadata) throw new Error('missing');
        const header = await env.BUCKET.get(input.objectKey, { range: { offset: 0, length: 32 } });
        if (!header) throw new Error('missing');
        const measured = await dimensions(header);
        return json(200, { size: metadata.size, sha256: metadata.customMetadata?.expectedSha256, mimeType: metadata.httpMetadata?.contentType, width: measured.width, height: measured.height, durationMs: null });
      }
      if (url.pathname === '/multipart/abort') {
        if (!validKey(input.objectKey) || typeof input.uploadId !== 'string') return json(400, { error: 'invalid' });
        await env.BUCKET.resumeMultipartUpload(input.objectKey, input.uploadId).abort();
        return json(200, { aborted: true });
      }
      if (url.pathname === '/object/delete') {
        if (!validKey(input.objectKey)) return json(400, { error: 'invalid' });
        await env.BUCKET.delete(input.objectKey);
        return json(200, { deleted: true });
      }
      if (url.pathname === '/download/sign') {
        if (!validKey(input.objectKey)) return json(400, { error: 'invalid' });
        const expiresIn = Math.min(3600, Math.max(60, Number(input.expiresInSeconds) || 300));
        const token = await sign({ action: 'read', key: input.objectKey, exp: Date.now() + expiresIn * 1000 }, env.SIGNER_SECRET);
        const signedUrl = `${url.origin}/object?token=${encodeURIComponent(token)}`;
        return json(200, { url: signedUrl, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
      }
      return json(404, { error: 'not-found' });
    } catch {
      return json(503, { error: 'request-failed' });
    }
  },
};
