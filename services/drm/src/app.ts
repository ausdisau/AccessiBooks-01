import express from "express";
import type { JWTClaims } from "@accessibooks/shared";

const app = express();

app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "drm", timestamp: new Date().toISOString() });
});

app.get("/readyz", (_req, res) => {
  res.json({ status: "ready", service: "drm", timestamp: new Date().toISOString() });
});

export default app;
