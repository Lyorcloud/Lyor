import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

export interface PlanariaContext {
  readonly subject: string;
  readonly database: SupabaseClient;
}

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

export const requiredEnvironment = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing backend environment: ${name}`);
  return value;
};

const backendKey = (): string => {
  const directKey = Deno.env.get('SUPABASE_SECRET_KEY');
  if (directKey) return directKey;

  const configuredKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (configuredKeys) {
    try {
      const keys: unknown = JSON.parse(configuredKeys);
      if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
        const defaultKey = (keys as Record<string, unknown>).default;
        if (typeof defaultKey === 'string' && defaultKey.length > 0) return defaultKey;
      }
    } catch {
      // Fall through to the hosted legacy key for older Supabase projects.
    }
  }

  return requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
};

export const createAdminDatabase = (): SupabaseClient => createClient(
  requiredEnvironment('SUPABASE_URL'),
  backendKey(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const authenticate = async (request: Request, adminOnly: boolean): Promise<PlanariaContext> => {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new Error('unauthorized');
  const database = createAdminDatabase();
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

export const boundedString = (value: unknown, minimum: number, maximum: number): value is string =>
  typeof value === 'string' && value.length >= minimum && value.length <= maximum;

export const uuidString = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value);

export const safeIdentifier = (value: unknown, maximum = 120): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= maximum && /^[a-z0-9][a-z0-9._-]*$/u.test(value);

export const sha256String = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

export interface UploadedPartInput { readonly partNumber: number; readonly etag: string; readonly size: number }

export const uploadedParts = (value: unknown): value is readonly UploadedPartInput[] =>
  Array.isArray(value) && value.length >= 1 && value.length <= 10000 && value.every((part) =>
    typeof part === 'object' && part !== null && !Array.isArray(part) &&
    Number.isInteger((part as Record<string, unknown>).partNumber) &&
    Number((part as Record<string, unknown>).partNumber) >= 1 &&
    Number((part as Record<string, unknown>).partNumber) <= 10000 &&
    boundedString((part as Record<string, unknown>).etag, 1, 512) &&
    Number.isSafeInteger((part as Record<string, unknown>).size) &&
    Number((part as Record<string, unknown>).size) > 0
  ) && new Set(value.map((part) => (part as UploadedPartInput).partNumber)).size === value.length;

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
