// apps/api/test/mcp-env.preload.ts (registered first in bunfig.toml
// [test].preload, ahead of test/preload.ts)
//
// Must have no imports: @repo/config reads process.env once, at first
// import, anywhere in the process. Setting MCP_ENABLED here guarantees it's
// present before that happens, regardless of dotenv (which never overwrites
// a var already set). MCP_ENABLED defaults to "false" in .env, since the
// feature ships dark; the mcp test domain needs it on.
process.env.MCP_ENABLED = 'true';
