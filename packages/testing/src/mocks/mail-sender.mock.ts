// packages/testing/src/mocks/mail-sender.mock.ts
//
// Fakes `@repo/mail`'s `sendEmail`, the only boundary of the worker's
// email processor. The rest of the package stays real.
// Registered by apps/worker/test/preload.ts, not on import.
import * as mailPackage from '@repo/mail';
import { mock } from 'bun:test';

type SendEmailParams = Parameters<typeof mailPackage.sendEmail>[0];

function defaultSendEmailImpl(_params: SendEmailParams): Promise<void> {
  return Promise.resolve();
}

export const sendEmailMock = mock(defaultSendEmailImpl);

export function resetMailSenderMock(): void {
  sendEmailMock.mockClear();
  sendEmailMock.mockImplementation(defaultSendEmailImpl);
}

export const mailModuleMock: Record<string, unknown> = {
  ...mailPackage,
  sendEmail: sendEmailMock,
};
