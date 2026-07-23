import * as z from 'zod';

const MailTransportSchema = z.enum(['smtp', 'brevo']);
type MailTransport = z.infer<typeof MailTransportSchema>;

// Environment-specific schema
const NodeEnvSchema = z.enum(['development', 'production', 'test']).default('development');

// Validation schemas for common types
const PortSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65535));

// Define which variables are required vs optional based on environment
const ConfigSchema = z.object({
  // App configuration
  NODE_ENV: NodeEnvSchema,
  APP_PORT: PortSchema.default(3000),
  API_PORT: PortSchema.default(3010),
  WEBBROWSER_PORT: PortSchema.default(3011),
  WEBBROWSER_BASE_URL: z
    .string()
    .trim()
    .default('')
    .transform((val) => {
      if (val) return val;
      const port = process.env.WEBBROWSER_PORT || '3011';
      return `http://localhost:${port}`;
    }),
  BROWSER_NAVIGATION_TIMEOUT: z
    .string()
    .optional()
    .transform((val) => Number(val) || 25_000),
  BROWSER_BODY_LOAD_TIMEOUT: z
    .string()
    .optional()
    .transform((val) => Number(val) || 10_000),
  BROWSER_MAX_CONCURRENCY: z
    .string()
    .optional()
    .transform((val) => Number(val) || 4),
  APP_URL: z
    .string()
    .trim()
    .default('')
    .transform((val) => {
      if (val) return val;
      const port = process.env.APP_PORT || '3000';
      return `http://localhost:${port}`;
    }),
  API_BASE_URL: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'normal', 'debug', 'info', 'warn', 'error']).default('info'),

  // Encryption
  ENCRYPTION_PASSWORD: z
    .string()
    .trim()
    .min(16, 'Encryption password must be at least 16 characters long')
    .default('replace-me-with-a-strong-password'),

  // Database connection components
  DB_TYPE: z.string().default('postgres'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: PortSchema.default(5432),
  DB_SSL: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default(false),
  DB_DATABASE: z.string().default('studio'),
  DB_USERNAME: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('mypassword'),

  // Database - composed from individual parts if not provided
  DATABASE_URL: z
    .string()
    .optional()
    .transform((val) => {
      // If DATABASE_URL is explicitly provided, use it
      if (val) {
        return val;
      }

      // Otherwise, compose it from individual components
      const dbType = process.env.DB_TYPE || 'postgres';
      const dbUser = process.env.DB_USERNAME || 'postgres';
      const dbPass = process.env.DB_PASSWORD || 'mypassword';
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5432';
      const dbName = process.env.DB_DATABASE || 'studio';

      // Format: protocol://username:password@host:port/database
      const password = dbPass ? `:${dbPass}` : '';
      return `${dbType}://${dbUser}${password}@${dbHost}:${dbPort}/${dbName}`;
    }),

  DATABASE_POOL_SIZE: z
    .string()
    .optional()
    .transform((val) => Number(val) || 10),

  // Redis configuration
  REDIS_HOST: z.string().default(''),
  REDIS_PORT: PortSchema.default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // SMTP configuration
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: PortSchema.default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  MAIL_TRANSPORT: MailTransportSchema.default('smtp'),

  // Email service
  BREVO_API_KEY: z.string().optional().default(''),

  // CORS
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((val) =>
      val
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .filter((origin) => {
          try {
            new URL(origin);
            return true;
          } catch {
            console.warn(`Invalid origin URL: ${origin}`);
            return false;
          }
        }),
    ),

  // Payment URLs - validate as URLs if provided
  PAYMENT_SUCCESS_URL: z.string().optional().default(''),
  PAYMENT_CANCEL_URL: z.string().optional().default(''),

  // Stripe - required in production
  STRIPE_API_KEY: z.string().optional().default(''),
  STRIPE_SECRET_KEY: z.string().optional().default('replace-me'),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_PRICE_ID_SMALL_MONTHLY: z.string().optional().default(''),
  STRIPE_PRICE_ID_MEDIUM_MONTHLY: z.string().optional().default(''),
  STRIPE_PRICE_ID_LARGE_MONTHLY: z.string().optional().default(''),

  // External APIs
  SERP_API_KEY: z.string().optional().default(''),

  // Cloudflare R2
  CF_REGION: z.string().optional().default('auto'),
  CF_ACCOUNT_ID: z.string().optional().default(''),
  CF_ACCESS_KEY_ID: z.string().optional().default(''),
  CF_SECRET_ACCESS_KEY: z.string().optional().default(''),
  CF_IMAGES_BUCKET_NAME: z.string().optional().default(''),
  CF_DOCUMENTS_BUCKET_NAME: z.string().optional().default(''),

  // AI Service Base URLs
  BFL_API_BASE_URL: z.string().optional(),
  BFL_API_KEY: z.string().optional().default(''),
  OPENAI_API_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  GOOGLE_VERTEX_API_BASE_URL: z.string().optional(),
  GOOGLE_VERTEX_PROJECT_ID: z.string().optional().default(''),
  GOOGLE_VERTEX_LOCATION: z.string().optional().default(''),
  GOOGLE_VERTEX_CLIENT_EMAIL: z.string().optional().default(''),
  GOOGLE_VERTEX_PRIVATE_KEY: z.string().optional().default(''),
  GOOGLE_GENAI_API_BASE_URL: z.string().optional(),
  GOOGLE_GENAI_API_KEY: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),

  LINKEDIN_SCOPES: z.array(z.string()).default([]),
  LINKEDIN_CLIENT_ID: z.string().optional().default(''),
  LINKEDIN_CLIENT_SECRET: z.string().optional().default(''),

  MICROSOFT_CLIENT_ID: z.string().optional().default(''),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(''),
  MICROSOFT_TENANT_ID: z.string().optional().default('common'),

  APPLE_CLIENT_ID: z.string().optional().default(''),
  APPLE_TEAM_ID: z.string().optional().default(''),
  APPLE_KEY_ID: z.string().optional().default(''),
  APPLE_PRIVATE_KEY: z.string().optional().default(''),
});

type ParsedConfig = z.output<typeof ConfigSchema>;

export class ConfigService {
  private readonly _config: ParsedConfig;
  private readonly _secrets: Set<keyof ParsedConfig>;

  constructor() {
    try {
      // Validate and parse environment variables
      this._config = ConfigSchema.parse(process.env);

      // Track sensitive keys
      this._secrets = new Set([
        'ENCRYPTION_PASSWORD',
        'DATABASE_URL',
        'REDIS_PASSWORD',
        'SMTP_PASSWORD',
        'BREVO_API_KEY',
        'STRIPE_API_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'SERP_API_KEY',
        'CF_SECRET_ACCESS_KEY',
        'BFL_API_KEY',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'GOOGLE_GENAI_API_KEY',
        'GOOGLE_CLIENT_SECRET',
        'LINKEDIN_CLIENT_SECRET',
        'MICROSOFT_CLIENT_SECRET',
        'APPLE_PRIVATE_KEY',
      ]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Invalid environment configuration:');
        console.error(JSON.stringify(error.issues, null, 2));
        throw new Error('Environment validation failed');
      }
      throw error;
    }
  }

  // Public getters for non-sensitive data
  get appPort(): string {
    return this._config.APP_PORT.toString();
  }

  get apiPort(): number {
    return this._config.API_PORT;
  }

  get webBrowserPort(): number {
    return this._config.WEBBROWSER_PORT;
  }

  get webBrowserBaseUrl(): string {
    return this._config.WEBBROWSER_BASE_URL;
  }

  get browserNavigationTimeout(): number {
    return this._config.BROWSER_NAVIGATION_TIMEOUT;
  }

  get browserBodyLoadTimeout(): number {
    return this._config.BROWSER_BODY_LOAD_TIMEOUT;
  }

  get browserMaxConcurrency(): number {
    return this._config.BROWSER_MAX_CONCURRENCY;
  }

  get appUrl(): string {
    return this._config.APP_URL;
  }

  get apiBaseUrl(): string {
    return this._config.API_BASE_URL || `${this._config.APP_URL}/`;
  }

  get logLevel(): string {
    return this._config.LOG_LEVEL;
  }

  get dbSSL(): boolean {
    return this._config.DB_SSL;
  }

  get dbPoolSize(): number {
    return this._config.DATABASE_POOL_SIZE;
  }

  get redisHost(): string {
    return this._config.REDIS_HOST;
  }

  get redisPort(): number {
    return this._config.REDIS_PORT;
  }

  get smtpHost(): string {
    return this._config.SMTP_HOST;
  }

  get smtpPort(): number {
    return this._config.SMTP_PORT;
  }

  get smtpUser(): string {
    return this._config.SMTP_USER;
  }

  get mailFrom(): string {
    return this._config.MAIL_FROM;
  }

  get mailTransport(): MailTransport {
    return this._config.MAIL_TRANSPORT;
  }

  get trustedOrigins(): string[] {
    return this._config.TRUSTED_ORIGINS;
  }

  get paymentSuccessUrl(): string {
    return this._config.PAYMENT_SUCCESS_URL;
  }

  get paymentCancelUrl(): string {
    return this._config.PAYMENT_CANCEL_URL;
  }

  get stripePriceIdSmallMonthly(): string {
    return this._config.STRIPE_PRICE_ID_SMALL_MONTHLY;
  }

  get stripePriceIdMediumMonthly(): string {
    return this._config.STRIPE_PRICE_ID_MEDIUM_MONTHLY;
  }

  get stripePriceIdLargeMonthly(): string {
    return this._config.STRIPE_PRICE_ID_LARGE_MONTHLY;
  }

  get cfRegion(): string {
    return this._config.CF_REGION;
  }

  get cfAccountId(): string {
    return this._config.CF_ACCOUNT_ID;
  }

  get cfAccessKeyId(): string {
    return this._config.CF_ACCESS_KEY_ID;
  }

  get cfImagesBucketName(): string {
    return this._config.CF_IMAGES_BUCKET_NAME;
  }

  get cfDocumentsBucketName(): string {
    return this._config.CF_DOCUMENTS_BUCKET_NAME;
  }

  // AI service URLs (non-sensitive)
  get bflApiBaseUrl(): string | undefined {
    return this._config.BFL_API_BASE_URL;
  }

  get googleVertexApiBaseUrl(): string | undefined {
    return this._config.GOOGLE_VERTEX_API_BASE_URL;
  }

  get googleVertexProjectId(): string {
    return this._config.GOOGLE_VERTEX_PROJECT_ID;
  }

  get googleVertexLocation(): string {
    return this._config.GOOGLE_VERTEX_LOCATION;
  }

  get openAiApiBaseUrl(): string | undefined {
    return this._config.OPENAI_API_BASE_URL;
  }

  get anthropicApiBaseUrl(): string | undefined {
    return this._config.ANTHROPIC_API_BASE_URL;
  }

  get googleGenAiApiBaseUrl(): string | undefined {
    return this._config.GOOGLE_GENAI_API_BASE_URL;
  }

  get googleClientId(): string {
    return this._config.GOOGLE_CLIENT_ID;
  }

  get linkedInScopes(): string[] {
    return this._config.LINKEDIN_SCOPES;
  }

  get linkedInClientId(): string {
    return this._config.LINKEDIN_CLIENT_ID;
  }

  get microsoftClientId(): string {
    return this._config.MICROSOFT_CLIENT_ID;
  }

  get microsoftTenantId(): string {
    return this._config.MICROSOFT_TENANT_ID;
  }

  get appleClientId(): string {
    return this._config.APPLE_CLIENT_ID;
  }

  get appleTeamId(): string {
    return this._config.APPLE_TEAM_ID;
  }

  get appleKeyId(): string {
    return this._config.APPLE_KEY_ID;
  }

  // Secret getters - use carefully, never log these
  getSecret(key: 'ENCRYPTION_PASSWORD'): string;
  getSecret(key: 'DATABASE_URL'): string;
  getSecret(key: 'REDIS_PASSWORD'): string;
  getSecret(key: 'SMTP_PASSWORD'): string;
  getSecret(key: 'BREVO_API_KEY'): string;
  getSecret(key: 'STRIPE_API_KEY'): string;
  getSecret(key: 'STRIPE_SECRET_KEY'): string;
  getSecret(key: 'STRIPE_WEBHOOK_SECRET'): string;
  getSecret(key: 'SERP_API_KEY'): string;
  getSecret(key: 'CF_SECRET_ACCESS_KEY'): string;
  getSecret(key: 'BFL_API_KEY'): string;
  getSecret(key: 'OPENAI_API_KEY'): string;
  getSecret(key: 'ANTHROPIC_API_KEY'): string;
  getSecret(key: 'GOOGLE_GENAI_API_KEY'): string;
  getSecret(key: 'GOOGLE_CLIENT_SECRET'): string;
  getSecret(key: 'GOOGLE_VERTEX_CLIENT_EMAIL'): string;
  getSecret(key: 'GOOGLE_VERTEX_PRIVATE_KEY'): string;
  getSecret(key: 'LINKEDIN_CLIENT_SECRET'): string;
  getSecret(key: 'MICROSOFT_CLIENT_SECRET'): string;
  getSecret(key: 'APPLE_PRIVATE_KEY'): string;
  getSecret(key: keyof ParsedConfig): string {
    return this._config[key] as string;
  }

  // Safe for logging - excludes all secrets
  toSafeObject(): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this._config)) {
      if (!this._secrets.has(key as keyof ParsedConfig)) {
        safe[key] = value;
      } else {
        safe[key] = value ? '***REDACTED***' : '';
      }
    }
    return safe;
  }
}
