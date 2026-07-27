import "server-only";

import { Pool } from "@neondatabase/serverless";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

export const authConfigured = Boolean(
  process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET,
);

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://demo:demo@127.0.0.1:55432/demo?sslmode=disable";

export const auth = betterAuth({
  appName: "Monitor Legal",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "demo-only-better-auth-secret-not-for-production",
  database: new Pool({ connectionString }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    disableSignUp: process.env.MONITOR_LEGAL_ALLOW_SIGN_UP !== "true",
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  plugins: [nextCookies()],
});
