// server.js — serve the static site in ./dist on Replit
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "dist");

// Serve static assets
app.use(express.static(DIST, { maxAge: "1h", extensions: ["html"] }));

// SPA fallback: return index.html for any route we don't have a file for
app.get("*", (_, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Serving ./dist on http://localhost:${PORT}`);
});
