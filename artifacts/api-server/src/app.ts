import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import compression from "compression";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

export function createApp(): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );

  // @ts-ignore — compression types
  app.use(compression({ level: 6, threshold: 1024 }));
  app.use(cors());

  // Stripe webhook needs raw body for signature verification
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  // AgentMail inbound webhook also needs raw body for HMAC-SHA256 verification.
  app.use('/api/agentmail/webhook', express.raw({ type: '*/*', limit: '1mb' }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // cookieParser must run before authMiddleware (which reads replit_sid).
  // It's also harmless before the legacy express-session middleware that
  // gets registered later in setupMultiAuth.
  app.use(cookieParser());

  // Replit Auth: populate req.user from a replit_sid cookie/bearer if
  // present. No-op when no Replit session exists, leaving the request
  // intact for Passport's middleware to handle as before.
  app.use(authMiddleware);

  return app;
}
