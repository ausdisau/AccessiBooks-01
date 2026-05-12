import app from "./app";

const PORT = process.env.DRM_PORT || 4000;

app.listen(PORT, () => {
  console.log(`[DRM] Service running on port ${PORT}`);
});
