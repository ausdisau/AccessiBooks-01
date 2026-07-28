/**
 * logger.ts — pino logger for the Next.js server, matching the Express
 * api-server's logger (same level env var and sensitive-header redaction).
 *
 * Server-side only: import from route handlers, server components, or
 * lib code that runs on the server. Do not import into client components.
 */
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "token",
    "*.token",
    "*.accessToken",
    "*.refreshToken",
    "*.id_token",
    "*.access_token",
    "*.refresh_token",
    "*.clientSecret",
    "*.client_secret",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

/**
 * Reduce an unknown error to a log-safe shape. In production we deliberately
 * drop stack traces and the `cause` chain (both can embed request URLs with
 * tokens, provider response bodies, etc.); in development the stack is kept
 * for debugging.
 */
export function safeError(err: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(isProduction ? {} : { stack: err.stack }),
    };
  }
  return { name: "UnknownError", message: String(err) };
}
