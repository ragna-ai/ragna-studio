import { db } from '../db';

export async function getDefaultAssistant() {
  const defaultAssistant = await db.query.defaultAssistant.findFirst({
    // where: { name: 'RAGNA Agent' },
    with: {
      aiModel: true,
    },
  });

  if (!defaultAssistant) {
    throw new Error('Default assistant not found. Please seed the database.');
  }

  return defaultAssistant;
}
