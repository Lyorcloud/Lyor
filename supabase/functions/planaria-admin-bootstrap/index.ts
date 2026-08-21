import {
  boundedString,
  createAdminDatabase,
  handleError,
  json,
  parseJsonObject,
  requiredEnvironment,
} from '../_shared/planaria.ts';

const digest = async (value: string): Promise<Uint8Array> => new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
);
const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
};
const validEmail = (value: unknown): value is string =>
  boundedString(value, 3, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
const validUsername = (value: unknown): value is string =>
  boundedString(value, 3, 64) && /^[a-z0-9][a-z0-9._-]{2,63}$/u.test(value);
const validPassword = (value: unknown): value is string =>
  boundedString(value, 10, 128) &&
  /[a-z]/u.test(value) &&
  /[A-Z]/u.test(value) &&
  /\d/u.test(value) &&
  /[^A-Za-z0-9]/u.test(value);

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method-not-allowed' });
  try {
    const suppliedToken = request.headers.get('x-planaria-bootstrap-token') ?? '';
    if (!boundedString(suppliedToken, 32, 512) || !equalBytes(
      await digest(suppliedToken), await digest(requiredEnvironment('PLANARIA_ADMIN_BOOTSTRAP_TOKEN')),
    )) throw new Error('forbidden');

    const input = await parseJsonObject(request);
    if (!validEmail(input.email) || !validUsername(input.username) || !validPassword(input.password)) {
      throw new Error('invalid-request');
    }
    const database = createAdminDatabase();
    const { data, error } = await database.auth.admin.createUser({
      email: input.email.toLowerCase(), password: input.password, email_confirm: true,
    });
    if (error || !data.user) throw new Error('request-failed');
    const { data: bootstrapped, error: bootstrapError } = await database.rpc(
      'planaria_bootstrap_first_admin', { subject: data.user.id, requested_username: input.username },
    );
    if (bootstrapError || bootstrapped !== true) {
      await database.auth.admin.deleteUser(data.user.id, false);
      throw new Error('request-failed');
    }
    return json(201, { id: data.user.id, email: data.user.email, username: input.username, role: 'super_admin' });
  } catch (error) {
    return handleError(error);
  }
});
