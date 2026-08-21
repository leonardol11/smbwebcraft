import { z } from "zod";

const DEV_DEFAULT_SECRET = "dev-only-secret-not-for-prod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("pglite://.data/outreach"),

  ADMIN_PASSWORD: z.string().min(8).default("admin-dev-password"),
  SESSION_SECRET: z.string().min(16).default(DEV_DEFAULT_SECRET),

  PROVIDER_MODE: z.enum(["fake", "live"]).default("fake"),

  GOOGLE_PLACES_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PAYMENT_LINK_URL: z.string().url().optional(),
  HUNTER_API_KEY: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  SENDING_DOMAIN: z.string().default("mail.example.com"),
  SENDER_NAME: z.string().default("Outreach"),
  SENDER_LOCAL_PART: z.string().default("hello"),
  PHYSICAL_ADDRESS: z.string().default("123 Example Street, Anytown, ST 00000"),
  CLIENT_SITES_DOMAIN: z.string().default("sites.example.com"),
  ALERT_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof schema>;

/** Keys that must be present when PROVIDER_MODE=live. */
const LIVE_REQUIRED: (keyof Env)[] = [
  "GOOGLE_PLACES_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PAYMENT_LINK_URL",
  "HUNTER_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
];

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  const env = parsed.data;

  const missing: string[] = [];
  if (env.PROVIDER_MODE === "live") {
    for (const key of LIVE_REQUIRED) if (!env[key]) missing.push(key);
  }
  if (env.NODE_ENV === "production") {
    if (env.SESSION_SECRET === DEV_DEFAULT_SECRET) missing.push("SESSION_SECRET");
    if (env.ADMIN_PASSWORD === "admin-dev-password") missing.push("ADMIN_PASSWORD");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${env.PROVIDER_MODE === "live" ? "live provider mode" : "production"}:\n` +
        missing.map((k) => `  - ${k}`).join("\n"),
    );
  }
  return env;
}

let cached: Env | undefined;

/** Lazily-validated singleton. Throws at first access if the env is invalid. */
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Test helper: clears the cached env so a new one is read from process.env. */
export function resetEnvForTests(): void {
  cached = undefined;
}
