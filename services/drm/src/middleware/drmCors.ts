import { Request, Response, NextFunction } from "express";

const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:5000";

export function drmCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin === WEB_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", WEB_ORIGIN);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Access-Control-Allow-Credentials", "false");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}
