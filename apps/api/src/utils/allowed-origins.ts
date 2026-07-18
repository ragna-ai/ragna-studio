// file: allowed-origins.ts

import { config } from '@repo/config';

// Origins allowed to call the API with credentials (cookies) or open a
// WebSocket. Always include the web app origin so this holds even if
// TRUSTED_ORIGINS is empty. Shared by the CORS middleware (app.ts) and the
// WS origin allowlist (middlewares/originMiddleware.ts), since CORS does
// not apply to WebSocket upgrades and both need the same source of truth.
export const allowedOrigins = [config.appUrl, ...config.trustedOrigins];
