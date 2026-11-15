import { config } from '@repo/config';
import { db, sql } from '@repo/database';
import { user as userTable } from '@repo/database/schema';
import { PASSKEY_ADDED_EMAIL_JOB } from '@repo/queue';
import {
  createSoftwareAuthenticator,
  queueAddMock,
  resetQueueMock,
  seedAuthenticatedUser,
  truncateAllTables,
  type SoftwareAuthenticator,
} from '@repo/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

const RP_ID = config.appHostname;
const BANNED_MESSAGE = 'You were removed from your organization.';

const creationOptionsSchema = z.looseObject({
  challenge: z.string(),
  user: z.looseObject({ id: z.string() }),
});
const registrationUserSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
});
const requestOptionsSchema = z.looseObject({ challenge: z.string() });

const passkeySchema = z.strictObject({
  id: z.string(),
  name: z.string().nullable(),
  publicKey: z.string(),
  userId: z.string(),
  credentialID: z.string(),
  counter: z.number(),
  deviceType: z.string(),
  backedUp: z.boolean(),
  transports: z.string().nullable(),
  createdAt: z.string(),
  aaguid: z.string().nullable(),
});
const passkeyListSchema = z.array(passkeySchema);
const updatedPasskeySchema = z.strictObject({ passkey: passkeySchema });
const deletedPasskeySchema = z.strictObject({ status: z.boolean() });
const errorSchema = z.strictObject({ message: z.string(), code: z.string().optional() });

const signedInSchema = z.strictObject({
  session: z.strictObject({
    id: z.string(),
    userId: z.string(),
    token: z.string(),
    expiresAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    ipAddress: z.string().nullish(),
    userAgent: z.string().nullish(),
    impersonatedBy: z.string().nullish(),
    activeOrganizationId: z.string().nullish(),
  }),
  user: z.strictObject({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    image: z.string().nullish(),
    role: z.string().nullish(),
    locale: z.string().nullish(),
    banned: z.boolean().nullish(),
    banReason: z.string().nullish(),
    banExpires: z.string().nullish(),
    deletedAt: z.string().nullish(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});
const sessionUserSchema = z.looseObject({ user: z.looseObject({ id: z.string() }) });

beforeEach(async () => {
  resetQueueMock();
  await truncateAllTables();
});

afterEach(() => {
  Reflect.deleteProperty(config, 'allowedLoginEmails');
});

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .join('; ');
}

function joinCookies(...cookies: string[]): string {
  return cookies.filter(Boolean).join('; ');
}

function authRequest(path: string, method: 'GET' | 'POST', cookie: string, body?: object) {
  return app.request(`/auth/passkey/${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: config.appUrl, cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function newAuthenticator(): SoftwareAuthenticator {
  return createSoftwareAuthenticator({ origin: config.appOrigin, rpID: RP_ID });
}

async function addPasskey(
  sessionCookie: string,
  authenticator: SoftwareAuthenticator,
  name: string | undefined,
): Promise<Response> {
  const optionsResponse = await authRequest('generate-register-options', 'GET', sessionCookie);
  const options = creationOptionsSchema.parse(await optionsResponse.json());
  return authRequest(
    'verify-registration',
    'POST',
    joinCookies(sessionCookie, cookiesOf(optionsResponse)),
    { response: authenticator.register(options), ...(name === undefined ? {} : { name }) },
  );
}

async function signInWithPasskey(authenticator: SoftwareAuthenticator): Promise<Response> {
  const optionsResponse = await authRequest('generate-authenticate-options', 'GET', '');
  const options = requestOptionsSchema.parse(await optionsResponse.json());
  return authRequest('verify-authentication', 'POST', cookiesOf(optionsResponse), {
    response: authenticator.authenticate(options),
  });
}

async function registeredPasskey(sessionCookie: string, name = 'Laptop') {
  const authenticator = newAuthenticator();
  const response = await addPasskey(sessionCookie, authenticator, name);
  expect(response.status).toBe(StatusCodes.OK);
  return { authenticator, passkey: passkeySchema.parse(await response.json()) };
}

function enqueuedPasskeyEmails() {
  return queueAddMock.mock.calls.filter(([jobName]) => jobName === PASSKEY_ADDED_EMAIL_JOB);
}

function overrideAllowedLoginEmails(emails: string[]): void {
  Object.defineProperty(config, 'allowedLoginEmails', { get: () => emails, configurable: true });
}

describe('adding a passkey', () => {
  test('stores the passkey under the given name for the signed-in user', async () => {
    const owner = await seedAuthenticatedUser();

    const response = await addPasskey(owner.cookieHeader, newAuthenticator(), 'Work laptop');

    expect(response.status).toBe(StatusCodes.OK);
    const passkey = passkeySchema.parse(await response.json());
    expect(passkey.name).toBe('Work laptop');
    expect(passkey.userId).toBe(owner.userId);
  });

  test('identifies the account by email to the authenticator, not by the passkey name', async () => {
    const owner = await seedAuthenticatedUser({ email: 'owner@example.com' });
    const authenticator = newAuthenticator();

    const optionsResponse = await authRequest(
      `generate-register-options?name=${encodeURIComponent('Local laptop')}`,
      'GET',
      owner.cookieHeader,
    );

    expect(optionsResponse.status).toBe(StatusCodes.OK);
    const options = creationOptionsSchema.parse(await optionsResponse.json());
    expect(registrationUserSchema.parse(options.user)).toEqual({
      id: expect.any(String),
      name: 'owner@example.com',
      displayName: 'owner@example.com',
    });

    const verifyResponse = await authRequest(
      'verify-registration',
      'POST',
      joinCookies(owner.cookieHeader, cookiesOf(optionsResponse)),
      { response: authenticator.register(options), name: 'Local laptop' },
    );
    expect(passkeySchema.parse(await verifyResponse.json()).name).toBe('Local laptop');
  });

  test('lists the passkeys of the signed-in user', async () => {
    const owner = await seedAuthenticatedUser();
    const { passkey } = await registeredPasskey(owner.cookieHeader, 'Phone');

    const response = await authRequest('list-user-passkeys', 'GET', owner.cookieHeader);

    expect(response.status).toBe(StatusCodes.OK);
    expect(passkeyListSchema.parse(await response.json()).map(({ id }) => id)).toEqual([
      passkey.id,
    ]);
  });

  test('emails the user that a passkey with that name was added', async () => {
    const owner = await seedAuthenticatedUser({ email: 'owner@example.com' });

    await addPasskey(owner.cookieHeader, newAuthenticator(), 'Work laptop');

    const [job] = enqueuedPasskeyEmails();
    expect(job?.[1]).toEqual({
      email: 'owner@example.com',
      userName: expect.any(String),
      passkeyName: 'Work laptop',
      locale: 'de',
      settingsUrl: `${config.appUrl}/settings/sign-in/passkeys`,
    });
    expect(enqueuedPasskeyEmails()).toHaveLength(1);
  });

  test('writes the passkey email in the language of the signed-in user', async () => {
    const owner = await seedAuthenticatedUser();
    await db
      .update(userTable)
      .set({ locale: 'en' })
      .where(sql`${userTable.id} = ${owner.userId}`);

    await addPasskey(owner.cookieHeader, newAuthenticator(), 'Work laptop');

    expect(enqueuedPasskeyEmails()[0]?.[1]).toMatchObject({ locale: 'en' });
  });

  test.each([
    ['no name', undefined],
    ['a blank name', '   '],
    ['a name over 64 characters', 'x'.repeat(65)],
  ])('rejects adding a passkey with %s and stores nothing', async (_label, name) => {
    const owner = await seedAuthenticatedUser();

    const response = await addPasskey(owner.cookieHeader, newAuthenticator(), name);

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await db.query.passkey.findMany()).toHaveLength(0);
    expect(enqueuedPasskeyEmails()).toHaveLength(0);
  });

  test('requires a signed-in user', async () => {
    const response = await authRequest('generate-register-options', 'GET', '');

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('renaming a passkey', () => {
  test('changes the name', async () => {
    const owner = await seedAuthenticatedUser();
    const { passkey } = await registeredPasskey(owner.cookieHeader);

    const response = await authRequest('update-passkey', 'POST', owner.cookieHeader, {
      id: passkey.id,
      name: 'Renamed',
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(updatedPasskeySchema.parse(await response.json()).passkey.name).toBe('Renamed');
  });

  test('rejects a name over 64 characters and keeps the old one', async () => {
    const owner = await seedAuthenticatedUser();
    const { passkey } = await registeredPasskey(owner.cookieHeader, 'Laptop');

    const response = await authRequest('update-passkey', 'POST', owner.cookieHeader, {
      id: passkey.id,
      name: 'x'.repeat(65),
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const stored = await db.query.passkey.findFirst({ where: { id: passkey.id } });
    expect(stored?.name).toBe('Laptop');
  });

  test('rejects an empty name and keeps the old one', async () => {
    const owner = await seedAuthenticatedUser();
    const { passkey } = await registeredPasskey(owner.cookieHeader, 'Laptop');

    const response = await authRequest('update-passkey', 'POST', owner.cookieHeader, {
      id: passkey.id,
      name: '  ',
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const stored = await db.query.passkey.findFirst({ where: { id: passkey.id } });
    expect(stored?.name).toBe('Laptop');
  });
});

describe('signing in with a passkey', () => {
  test('returns a session the user can use afterwards', async () => {
    const owner = await seedAuthenticatedUser();
    const { authenticator } = await registeredPasskey(owner.cookieHeader);

    const response = await signInWithPasskey(authenticator);

    expect(response.status).toBe(StatusCodes.OK);
    const signedIn = signedInSchema.parse(await response.json());
    expect(signedIn.user.id).toBe(owner.userId);
    const sessionResponse = await app.request('/auth/get-session', {
      headers: { cookie: cookiesOf(response), origin: config.appUrl },
    });
    expect(sessionUserSchema.parse(await sessionResponse.json()).user.id).toBe(owner.userId);
  });

  test('records passkey as the last login method', async () => {
    const owner = await seedAuthenticatedUser();
    const { authenticator } = await registeredPasskey(owner.cookieHeader);

    const response = await signInWithPasskey(authenticator);

    expect(response.headers.getSetCookie().join('\n')).toContain('last_used_login_method=passkey');
  });

  test('rejects a banned user with the ban message', async () => {
    const owner = await seedAuthenticatedUser();
    const { authenticator } = await registeredPasskey(owner.cookieHeader);
    await db
      .update(userTable)
      .set({ banned: true, banReason: 'member_removed' })
      .where(sql`${userTable.id} = ${owner.userId}`);

    const response = await signInWithPasskey(authenticator);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(errorSchema.parse(await response.json()).message).toBe(BANNED_MESSAGE);
  });

  test('rejects a user whose email left the allowlist', async () => {
    const owner = await seedAuthenticatedUser({ email: 'owner@example.com' });
    const { authenticator } = await registeredPasskey(owner.cookieHeader);
    overrideAllowedLoginEmails(['someone-else@example.com']);

    const response = await signInWithPasskey(authenticator);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(errorSchema.parse(await response.json()).code).toBe('email_not_allowed');
  });

  test('lets a user on the allowlist sign in', async () => {
    const owner = await seedAuthenticatedUser({ email: 'owner@example.com' });
    const { authenticator } = await registeredPasskey(owner.cookieHeader);
    overrideAllowedLoginEmails(['Owner@example.com'.toLowerCase()]);

    const response = await signInWithPasskey(authenticator);

    expect(response.status).toBe(StatusCodes.OK);
  });
});

describe('deleting a passkey', () => {
  test('removes it from the list', async () => {
    const owner = await seedAuthenticatedUser();
    const { passkey } = await registeredPasskey(owner.cookieHeader);

    const response = await authRequest('delete-passkey', 'POST', owner.cookieHeader, {
      id: passkey.id,
    });

    expect(response.status).toBe(StatusCodes.OK);
    expect(deletedPasskeySchema.parse(await response.json()).status).toBe(true);
    const list = await authRequest('list-user-passkeys', 'GET', owner.cookieHeader);
    expect(passkeyListSchema.parse(await list.json())).toEqual([]);
  });

  test('a deleted passkey can no longer sign in', async () => {
    const owner = await seedAuthenticatedUser();
    const { authenticator, passkey } = await registeredPasskey(owner.cookieHeader);
    await authRequest('delete-passkey', 'POST', owner.cookieHeader, { id: passkey.id });

    const response = await signInWithPasskey(authenticator);

    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe("another user's passkey", () => {
  test('cannot be renamed or deleted and stays unchanged', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    const { passkey } = await registeredPasskey(owner.cookieHeader, 'Laptop');

    const rename = await authRequest('update-passkey', 'POST', other.cookieHeader, {
      id: passkey.id,
      name: 'Hijacked',
    });
    const remove = await authRequest('delete-passkey', 'POST', other.cookieHeader, {
      id: passkey.id,
    });

    expect(rename.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(remove.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(errorSchema.parse(await rename.json()).code).toBe(
      'YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY',
    );
    expect(await remove.text()).toBe('');
    const stored = await db.query.passkey.findFirst({ where: { id: passkey.id } });
    expect(stored?.name).toBe('Laptop');
  });

  test('does not show up in the list of another user', async () => {
    const owner = await seedAuthenticatedUser();
    const other = await seedAuthenticatedUser();
    await registeredPasskey(owner.cookieHeader);

    const response = await authRequest('list-user-passkeys', 'GET', other.cookieHeader);

    expect(passkeyListSchema.parse(await response.json())).toEqual([]);
  });
});
