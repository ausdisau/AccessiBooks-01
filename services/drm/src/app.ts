import express from "express";
import playbackTokenRouter from "./routes/playbackToken";
import { getJWKS } from "./keys";
import { verifyToken } from "./middleware/verifyToken";

const app = express();

app.use(express.json());
app.use(playbackTokenRouter);

app.get("/.well-known/jwks.json", (_req, res) => {
  res.json(getJWKS());
});

app.get("/api/playback/verify", verifyToken, (req, res) => {
  res.json({ claims: req.auth });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "drm", timestamp: new Date().toISOString() });
});

app.get("/readyz", (_req, res) => {
  res.json({ status: "ready", service: "drm", timestamp: new Date().toISOString() });
});

export default app;
