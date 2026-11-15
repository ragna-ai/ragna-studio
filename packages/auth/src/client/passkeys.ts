import * as z from 'zod';
import type { AuthDate, AuthResult } from './auth-client-vue';

export const PASSKEY_NAME_MAX_LENGTH = 64;

export const passkeyNameSchema = z.string().trim().min(1).max(PASSKEY_NAME_MAX_LENGTH);

// Hand-typed like OrganizationActions: the plugin's client type isn't portable.
// Shapes verified against @better-auth/passkey 1.7.20 routes.
export interface PasskeyRecord {
  id: string;
  name?: string;
  userId: string;
  credentialID: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: AuthDate;
  aaguid?: string;
}

export interface AddPasskeyInput {
  name: string;
}

export interface UpdatePasskeyInput {
  id: string;
  name: string;
}

export interface DeletePasskeyInput {
  id: string;
}

export interface UpdatePasskeyResult {
  passkey: PasskeyRecord;
}

export interface DeletePasskeyResult {
  status: boolean;
}

export interface PasskeySignInResult {
  user: { id: string };
}

export interface PasskeyActions {
  addPasskey: (data: AddPasskeyInput) => Promise<AuthResult<PasskeyRecord>>;
  listUserPasskeys: () => Promise<AuthResult<PasskeyRecord[]>>;
  updatePasskey: (data: UpdatePasskeyInput) => Promise<AuthResult<UpdatePasskeyResult>>;
  deletePasskey: (data: DeletePasskeyInput) => Promise<AuthResult<DeletePasskeyResult>>;
}

export interface PasskeySignIn {
  passkey: () => Promise<AuthResult<PasskeySignInResult>>;
}
