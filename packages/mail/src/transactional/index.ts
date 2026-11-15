import type { UserLocale } from '@repo/utils';
import { invitationContent, type InvitationVariables } from './invitation';
import { passkeyAddedContent, type PasskeyAddedVariables } from './passkey-added';
import type { LocalizedContent, TransactionalContent } from './types';
import { welcomeContent, type WelcomeVariables } from './welcome';

export type { InvitationVariables, PasskeyAddedVariables, WelcomeVariables, TransactionalContent };

export type TransactionalEmail =
  | { id: 'welcome'; variables: WelcomeVariables }
  | { id: 'invitation'; variables: InvitationVariables }
  | { id: 'passkey-added'; variables: PasskeyAddedVariables };

type TransactionalEmailId = TransactionalEmail['id'];

type VariablesById = {
  [Email in TransactionalEmail as Email['id']]: Email['variables'];
};

type ContentRegistry = {
  [Id in TransactionalEmailId]: LocalizedContent<VariablesById[Id]>;
};

/** A new email id without content here fails type-check. */
const contentRegistry: ContentRegistry = {
  welcome: welcomeContent,
  invitation: invitationContent,
  'passkey-added': passkeyAddedContent,
};

function contentFor<Id extends TransactionalEmailId>(
  locale: UserLocale,
  id: Id,
  variables: VariablesById[Id],
): TransactionalContent {
  return contentRegistry[id][locale](variables);
}

export function buildTransactionalContent(
  locale: UserLocale,
  email: TransactionalEmail,
): TransactionalContent {
  return contentFor(locale, email.id, email.variables);
}
