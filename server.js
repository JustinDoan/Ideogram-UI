"use strict";

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PORT = 4173;
const DEFAULT_COMFY_URL = "http://127.0.0.1:8000";
const ROOT = __dirname;

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, filename), "utf8"));
}

function getComfyBaseUrl(req) {
  const value = req.get("x-comfy-url") || req.query.comfy_url || DEFAULT_COMFY_URL;
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("ComfyUI URL must use HTTP or HTTPS.");
  }

  return url.toString().replace(/\/$/, "");
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "20mb" }));
  app.use(express.static(path.join(ROOT, "public")));

  app.get("/api-workflow", (_req, res) => res.json(readJson("api-workflow.json")));

  app.all(/^\/comfy(\/.*)?$/, async (req, res) => {
    try {
      const targetUrl = new URL(getComfyBaseUrl(req) + req.originalUrl.replace(/^\/comfy/, ""));
      targetUrl.searchParams.delete("comfy_url");

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: { "content-type": "application/json" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
      });

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.status(502).json({
        error: "Unable to reach ComfyUI.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return app;
}

function startServer(port = Number(process.env.PORT) || DEFAULT_PORT) {
  return createApp().listen(port, () => {
    console.log(`IdeaDraw is running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
