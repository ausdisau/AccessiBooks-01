import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import compression from "compression";
import { logger } from "./lib/logger";

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

  app.use(cookieParser());

  return app;
}
