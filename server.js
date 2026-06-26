"use strict";

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PORT = 4173;
const DEFAULT_COMFY_URL = "http://127.0.0.1:8000";
const ROOT = __dirname;

function loadEnvFile() {
  const filename = path.join(ROOT, ".env");
  if (!fs.existsSync(filename)) return;
  fs.readFileSync(filename, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    });
}

loadEnvFile();

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
  app.use(express.json({ limit: "60mb" }));
  app.use(express.static(path.join(ROOT, "public")));

  app.get("/api-workflow", (_req, res) => res.json(readJson("api-workflow.json")));
  app.get("/api/config", (_req, res) => res.json({ falConfigured: Boolean(process.env.FAL_KEY) }));

  app.post("/api/inpaint", async (req, res) => {
    const apiKey = process.env.FAL_KEY;
    const { image, mask, prompt, quality = "medium" } = req.body;
    if (!apiKey) return res.status(503).json({ error: "FAL_KEY is not configured." });
    if (!image || !mask || !prompt)
      return res.status(400).json({ error: "Image, mask, and prompt are required." });

    try {
      const response = await fetch("https://fal.run/openai/gpt-image-2/edit", {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          image_urls: [image],
          mask_image_url: mask,
          image_size: "auto",
          quality: ["low", "medium", "high"].includes(quality) ? quality : "medium",
          num_images: 1,
          output_format: "png",
          sync_mode: true,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        return res.status(response.status).json({ error: result.detail || result.error || result });
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: "Unable to complete fal.ai inpaint request.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    const apiKey = process.env.FAL_KEY;
    const {
      prompt,
      quality = "low",
      imageSize = "landscape_4_3",
      numImages = 1,
      outputFormat = "png",
    } = req.body;
    if (!apiKey) return res.status(503).json({ error: "FAL_KEY is not configured." });
    if (!prompt) return res.status(400).json({ error: "Prompt is required." });

    const safeQuality = ["auto", "low", "medium", "high"].includes(quality) ? quality : "low";
    const safeSize = [
      "square_hd",
      "square",
      "portrait_4_3",
      "portrait_16_9",
      "landscape_4_3",
      "landscape_16_9",
      "auto",
    ].includes(imageSize)
      ? imageSize
      : "landscape_4_3";
    const safeNumImages = Number(numImages) === 4 ? 4 : 1;
    const safeFormat = ["jpeg", "png", "webp"].includes(outputFormat) ? outputFormat : "png";

    try {
      const response = await fetch("https://fal.run/openai/gpt-image-2", {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          image_size: safeSize,
          quality: safeQuality,
          num_images: safeNumImages,
          output_format: safeFormat,
          sync_mode: true,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        return res.status(response.status).json({ error: result.detail || result.error || result });
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: "Unable to complete fal.ai image request.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

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
