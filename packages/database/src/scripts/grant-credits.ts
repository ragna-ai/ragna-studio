// Manual credit grant (docs/credits/prd.md, "Grants"): the only way credits
// enter the system in v1. Resolves the user by email, creates their credit
// account if this is their first grant, and writes the grant through the
// same transaction as every other ledger write, so the balance cache and
// the ledger cannot drift.
//
// Usage: pnpm --filter @repo/database credits:grant -- <userEmail> <credits> "<description>"

import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { getOrCreateCreditAccountByUserId, grantCredits } from '../repositories/credit.repo';
import { getUserByEmail } from '../repositories/user.repo';

// No floating-point in the money path (docs/credits/prd.md): parsed by hand
// rather than `Number(input) * 1_000_000`, so "31.500001" can't silently
// lose or gain a micro-credit to float rounding.
function parseCreditsToMicroCredits(input: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid credits amount: "${input}". Expected a number like "100" or "31.5".`);
  }

  const [, sign, whole, fraction = ''] = match;
  const microCredits = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return sign === '-' ? -microCredits : microCredits;
}

function formatMicroCredits(microCredits: bigint): string {
  const sign = microCredits < 0n ? '-' : '';
  const abs = microCredits < 0n ? -microCredits : microCredits;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

async function main() {
  const [email, creditsArg, description] = process.argv.slice(2);

  if (!email || !creditsArg) {
    console.error(
      'Usage: pnpm --filter @repo/database credits:grant -- <userEmail> <credits> "<description>"',
    );
    process.exit(1);
  }

  const user = await getUserByEmail({ email });
  if (!user) {
    console.error(`No user found with email "${email}".`);
    process.exit(1);
  }

  const amountMicroCredits = parseCreditsToMicroCredits(creditsArg);
  const account = await getOrCreateCreditAccountByUserId({ userId: user.id });

  await grantCredits({
    creditAccountId: account.id,
    amountMicroCredits,
    kind: 'grant',
    description: description ?? null,
    idempotencyKey: `grant:${randomUUID()}`,
  });

  // grantCredits returns void (docs/credits/prd.md, "Code placement"), so
  // the new balance is read back separately for the confirmation message.
  const updatedAccount = await db.query.creditAccount.findFirst({ where: { id: account.id } });
  const balanceMicroCredits = updatedAccount?.balanceMicroCredits ?? account.balanceMicroCredits;

  console.log(
    `Granted ${formatMicroCredits(amountMicroCredits)} credits to ${email}. ` +
      `New balance: ${formatMicroCredits(balanceMicroCredits)} credits.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Grant failed:', error);
    process.exit(1);
  });
