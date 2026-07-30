// Bun test preload (registered in apps/api/bunfig.toml). Runs before any
// test file, and therefore before any test file's imports of @repo/config.
//
// @repo/config loads the root .env via dotenv, and dotenv only fills in
// variables that are NOT already set. Setting DB_DATABASE here first means
// every test, and everything it imports (the API app, @repo/database,
// @repo/auth), connects to the dedicated test database instead of the dev
// one. See docs/testing/strategy.md, "Database: real Postgres, dedicated
// test database".
process.env.NODE_ENV = 'test';
process.env.DB_DATABASE = 'studio_test';

// Credits (docs/credits/prd.md; apps/api/test/credit-service.test.ts,
// credit-repo.test.ts). @repo/config is a singleton snapshotted at import,
// so every test in this process shares one CREDITS_ENABLED/CREDIT_MARKUP_BPS
// pair; pin them here rather than mutating process.env mid-test, per
// docs/testing/strategy.md.
//
// CREDITS_ENABLED=true: assertCanSpend's gate logic (the finding-1 pricing
// check in particular) is otherwise unreachable, since it short-circuits to
// null before querying anything when credits are off. No other test in this
// suite hits a credit-gated route, so flipping this on process-wide is safe.
//
// CREDIT_MARKUP_BPS="NULL" pins the global markup to disabled (normalizes to
// 10_000 bps / 1.0x, docs/credits/prd.md's "Config" table via commit
// 651c7d2), which is the more interesting, exactly-assertable state: it lets
// credit-repo.test.ts confirm computeCharge's config fallback charges cost
// price with no markup. A non-default positive global value (e.g. 20000) is
// NOT separately tested in this process; computeCharge's per-model
// `pricing.markupBps` override is a parameterized path exercised directly
// instead, and is how a non-1.0x markup gets covered end to end.
process.env.CREDITS_ENABLED = 'true';
process.env.CREDIT_MARKUP_BPS = 'NULL';
