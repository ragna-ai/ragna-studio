import { config } from '@repo/config';
import { db, sql } from '@repo/database';
import { member } from '@repo/database/schema';
import { seedAuthenticatedUser, seedOrganizationMember, truncateAllTables } from '@repo/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { activeOrganizationId, postOrganizationRoute } from './invitation-fixtures';

const errorBodySchema = z.strictObject({ message: z.string(), code: z.string().optional() });

const invitationBodySchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
});

beforeEach(async () => {
  await truncateAllTables();
});

afterEach(() => {
  // Drops the own-property override so the prototype getter applies again.
  Reflect.deleteProperty(config, 'allowedLoginEmails');
});

function overrideAllowedLoginEmails(emails: string[]): void {
  Object.defineProperty(config, 'allowedLoginEmails', { get: () => emails, configurable: true });
}

function inviteMember(cookieHeader: string, organizationId: string, email: string, role: string) {
  return postOrganizationRoute(cookieHeader, 'invite-member', { email, role, organizationId });
}

describe('creating invitations', () => {
  test('the owner can invite a member', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);

    const response = await inviteMember(
      owner.cookieHeader,
      organizationId,
      'new@example.com',
      'member',
    );

    expect(response.status).toBe(StatusCodes.OK);
    const body = invitationBodySchema.parse(await response.json());
    expect(body).toMatchObject({ email: 'new@example.com', role: 'member', status: 'pending' });
  });

  test('an admin can invite a member', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const admin = await seedOrganizationMember({ organizationId, role: 'admin' });

    const response = await inviteMember(
      admin.cookieHeader,
      organizationId,
      'new@example.com',
      'member',
    );

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('a plain member cannot invite', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const plainMember = await seedOrganizationMember({ organizationId, role: 'member' });

    const response = await inviteMember(
      plainMember.cookieHeader,
      organizationId,
      'new@example.com',
      'member',
    );

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  test('the owner role is rejected, even for the owner', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);

    for (const role of ['owner', 'admin,owner']) {
      const response = await inviteMember(
        owner.cookieHeader,
        organizationId,
        'new@example.com',
        role,
      );
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    }
  });

  test('an email with an existing account is rejected', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const outsider = await seedAuthenticatedUser();
    const existing = await db.query.user.findFirst({ where: { id: outsider.userId } });

    const response = await inviteMember(
      owner.cookieHeader,
      organizationId,
      (existing?.email ?? '').toUpperCase(),
      'member',
    );

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(errorBodySchema.parse(await response.json()).message).toBe(
      'This person already has an account.',
    );
  });

  test('an email outside the login allowlist is rejected', async () => {
    overrideAllowedLoginEmails(['listed@example.com']);
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);

    const rejected = await inviteMember(
      owner.cookieHeader,
      organizationId,
      'other@example.com',
      'member',
    );
    const accepted = await inviteMember(
      owner.cookieHeader,
      organizationId,
      'Listed@Example.com',
      'member',
    );

    expect(rejected.status).toBe(StatusCodes.BAD_REQUEST);
    expect(accepted.status).toBe(StatusCodes.OK);
  });
});

describe('role updates', () => {
  test('the owner role cannot be granted through update-member-role', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const colleague = await seedOrganizationMember({ organizationId, role: 'member' });

    const response = await postOrganizationRoute(owner.cookieHeader, 'update-member-role', {
      memberId: (await db.query.member.findFirst({ where: { userId: colleague.userId } }))?.id,
      role: 'owner',
      organizationId,
    });

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const after = await db
      .select()
      .from(member)
      .where(sql`${member.userId} = ${colleague.userId}`);
    expect(after[0]?.role).toBe('member');
  });

  test('admin and member roles can still be swapped', async () => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);
    const colleague = await seedOrganizationMember({ organizationId, role: 'member' });

    const response = await postOrganizationRoute(owner.cookieHeader, 'update-member-role', {
      memberId: (await db.query.member.findFirst({ where: { userId: colleague.userId } }))?.id,
      role: 'admin',
      organizationId,
    });

    expect(response.status).toBe(StatusCodes.OK);
  });
});

describe('disabled plugin routes', () => {
  test.each(['accept-invitation', 'leave', 'remove-member'])('%s returns 404', async (route) => {
    const owner = await seedAuthenticatedUser();
    const organizationId = await activeOrganizationId(owner.cookieHeader);

    const response = await postOrganizationRoute(owner.cookieHeader, route, { organizationId });

    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
