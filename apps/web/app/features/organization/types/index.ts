import type { OrganizationAssignableRole } from '@repo/auth/client';

export interface OrganizationResponse {
  id: string;
  name: string;
  role: string;
  deletedAt: string | null;
}

export interface OrganizationMemberUser {
  name: string;
  email: string;
  image: string | null;
  deletedAt: string | null;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: OrganizationMemberUser;
}

export interface OrganizationMembersResponse {
  members: OrganizationMember[];
}

export interface MemberUsageResponse {
  userId: string | null;
  name: string | null;
  eventCount: number;
  credits: number;
}

export interface OrganizationUsageResponse {
  members: MemberUsageResponse[];
}

export const ASSIGNABLE_ROLES = [
  'member',
  'admin',
] as const satisfies readonly OrganizationAssignableRole[];
