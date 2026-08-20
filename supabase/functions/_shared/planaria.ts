import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

export interface PlanariaContext {
  readonly subject: string;
  readonly database: SupabaseClient;
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const requiredEnvironment = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing backend environment: ${name}`);
  return value;
};

export const authenticate = async (request: Request, adminOnly: boolean): Promise<PlanariaContext> => {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new Error('unauthorized');
  const database = createClient(requiredEnvironment('SUPABASE_URL'), requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await database.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error('unauthorized');
  if (adminOnly) {
    const { data: allowed, error: adminError } = await database.rpc('planaria_authorize_admin', { subject: data.user.id });
    if (adminError || allowed !== true) throw new Error('forbidden');
  }
  return { subject: data.user.id, database };
};

export const parseJsonObject = async (request: Request): Promise<Record<string, unknown>> => {
  if (Number(request.headers.get('content-length') ?? '0') > 65536) throw new Error('invalid-request');
  const value: unknown = await request.json();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid-request');
  return value as Record<string, unknown>;
};

export const signerRequest = async (path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const endpoint = requiredEnvironment('PLANARIA_STORAGE_SIGNER_URL');
  const secret = requiredEnvironment('PLANARIA_STORAGE_SIGNER_SECRET');
  const response = await fetch(new URL(path, endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('storage-provider-failed');
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('storage-provider-failed');
  return value as Record<string, unknown>;
};

export const handleError = (error: unknown): Response => {
  const message = error instanceof Error ? error.message : 'request-failed';
  if (message === 'unauthorized') return json(401, { error: 'unauthorized' });
  if (message === 'forbidden') return json(403, { error: 'forbidden' });
  if (message === 'invalid-request') return json(400, { error: 'invalid-request' });
  return json(503, { error: 'request-failed' });
};
