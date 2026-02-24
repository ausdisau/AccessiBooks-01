import express from "express";
import playbackTokenRouter from "./routes/playbackToken";

const app = express();

app.use(express.json());
app.use(playbackTokenRouter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "drm", timestamp: new Date().toISOString() });
});

app.get("/readyz", (_req, res) => {
  res.json({ status: "ready", service: "drm", timestamp: new Date().toISOString() });
});

export default app;
