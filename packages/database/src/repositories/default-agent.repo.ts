import { db } from '../db';

export async function getDefaultAgent() {
  const defaultAgent = await db.query.defaultAgent.findFirst({
    // where: { name: 'RAGNA Agent' },
    with: {
      aiModel: true,
    },
  });

  if (!defaultAgent) {
    throw new Error('Default agent not found. Please seed the database.');
  }

  return defaultAgent;
}
