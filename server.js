// server.js
// Simple static server for the built web app (dist/)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// serve static files from dist
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));

// SPA fallback -> index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`MarketScanner web is running on http://localhost:${PORT}`);
});
