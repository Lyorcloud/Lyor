import {
  authenticate,
  boundedString,
  handleError,
  json,
  parseJsonObject,
} from '../_shared/planaria.ts';

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
    const context = await authenticate(request, true);
    const input = await parseJsonObject(request);
    if (input.action !== 'create' || !validEmail(input.email) ||
        !validUsername(input.username) || !validPassword(input.password)) {
      throw new Error('invalid-request');
    }
    const { data: allowed, error: permissionError } = await context.database.rpc(
      'planaria_can_manage_admins', { subject: context.subject },
    );
    if (permissionError || allowed !== true) throw new Error('forbidden');

    const { data, error } = await context.database.auth.admin.createUser({
      email: input.email.toLowerCase(),
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error('request-failed');

    const { data: registered, error: registrationError } = await context.database.rpc(
      'planaria_register_admin_account', {
        subject: context.subject,
        target_user: data.user.id,
        requested_username: input.username,
      },
    );
    if (registrationError || registered !== true) {
      await context.database.auth.admin.deleteUser(data.user.id, false);
      throw new Error('request-failed');
    }
    return json(201, { id: data.user.id, email: data.user.email, username: input.username, role: 'admin' });
  } catch (error) {
    return handleError(error);
  }
});
