import { sendEmail } from '@repo/mail'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const to: string = body?.to ?? 'test@example.com'

  await sendEmail({
    templateId: 'welcome',
    variables: { name: 'Test User' },
    to,
    subject: 'Test email',
  })

  return { ok: true, to }
})
