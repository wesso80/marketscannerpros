// sw.js (ok to leave simple for now)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());