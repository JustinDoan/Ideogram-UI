"use strict";

const canvas = document.querySelector("#inpaint-canvas");
const context = canvas.getContext("2d");
let sourceImage = null;
let sourceDataUrl = "";
let mask = null;
let interaction = null;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("ideadraw.theme", theme);
  document.querySelector("#theme").textContent = theme === "dark" ? "Light" : "Dark";
  draw();
}

function imageFrame() {
  if (!sourceImage) return null;
  const padding = 32;
  const scale = Math.min(
    (canvas.clientWidth - padding * 2) / sourceImage.naturalWidth,
    (canvas.clientHeight - padding * 2) / sourceImage.naturalHeight,
  );
  const width = sourceImage.naturalWidth * scale;
  const height = sourceImage.naturalHeight * scale;
  return {
    x: (canvas.clientWidth - width) / 2,
    y: (canvas.clientHeight - height) / 2,
    width,
    height,
  };
}

function resize() {
  const ratio = devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function draw() {
  const styles = getComputedStyle(document.documentElement);
  context.fillStyle = styles.getPropertyValue("--bg").trim();
  context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const frame = imageFrame();
  if (!frame) return;
  context.drawImage(sourceImage, frame.x, frame.y, frame.width, frame.height);
  context.strokeStyle = styles.getPropertyValue("--line").trim();
  context.lineWidth = 2;
  context.strokeRect(frame.x, frame.y, frame.width, frame.height);
  if (!mask) return;
  const x = frame.x + mask.x * frame.width;
  const y = frame.y + mask.y * frame.height;
  const width = mask.w * frame.width;
  const height = mask.h * frame.height;
  context.fillStyle = "#ffffff45";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#ffad32";
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);
  context.fillStyle = "#ffad32";
  context.fillRect(x + width - 7, y + height - 7, 14, 14);
}

function point(event) {
  const frame = imageFrame();
  if (!frame) return { inside: false };
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return {
    x: Math.max(0, Math.min(1, (x - frame.x) / frame.width)),
    y: Math.max(0, Math.min(1, (y - frame.y) / frame.height)),
    inside:
      x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height,
  };
}

function makeMaskDataUrl() {
  const output = document.createElement("canvas");
  output.width = sourceImage.naturalWidth;
  output.height = sourceImage.naturalHeight;
  const ctx = output.getContext("2d");
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.fillStyle = "white";
  ctx.fillRect(
    mask.x * output.width,
    mask.y * output.height,
    mask.w * output.width,
    mask.h * output.height,
  );
  return output.toDataURL("image/png");
}

document.querySelector("#source-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    sourceDataUrl = reader.result;
    sourceImage = new Image();
    sourceImage.onload = draw;
    sourceImage.src = sourceDataUrl;
    mask = null;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const p = point(event);
  if (!p.inside) return;
  mask = { x: Math.max(0, p.x - 0.15), y: Math.max(0, p.y - 0.15), w: 0.3, h: 0.3 };
  if (mask.x + mask.w > 1) mask.x = 1 - mask.w;
  if (mask.y + mask.h > 1) mask.y = 1 - mask.h;
  draw();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !mask) return;
  const p = point(event);
  const frame = imageFrame();
  const hx = 18 / frame.width;
  const hy = 18 / frame.height;
  const resize = Math.abs(p.x - (mask.x + mask.w)) <= hx && Math.abs(p.y - (mask.y + mask.h)) <= hy;
  const inside = p.x >= mask.x && p.x <= mask.x + mask.w && p.y >= mask.y && p.y <= mask.y + mask.h;
  if (!resize && !inside) return;
  interaction = { mode: resize ? "resize" : "move", offsetX: p.x - mask.x, offsetY: p.y - mask.y };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!interaction) return;
  const p = point(event);
  if (interaction.mode === "resize") {
    mask.w = Math.max(0.02, Math.min(1 - mask.x, p.x - mask.x));
    mask.h = Math.max(0.02, Math.min(1 - mask.y, p.y - mask.y));
  } else {
    mask.x = Math.max(0, Math.min(1 - mask.w, p.x - interaction.offsetX));
    mask.y = Math.max(0, Math.min(1 - mask.h, p.y - interaction.offsetY));
  }
  draw();
});
canvas.addEventListener("pointerup", () => (interaction = null));
document.querySelector("#clear-mask").addEventListener("click", () => {
  mask = null;
  draw();
});
document
  .querySelector("#theme")
  .addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
  );

document.querySelector("#inpaint-run").addEventListener("click", async () => {
  const button = document.querySelector("#inpaint-run");
  const output = document.querySelector("#inpaint-output");
  const prompt = document.querySelector("#edit-prompt").value.trim();
  if (!sourceImage || !mask || !prompt)
    return (output.textContent = "Upload an image, place a mask, and enter a prompt.");
  button.disabled = true;
  button.textContent = "Inpainting...";
  output.textContent = "Editing with GPT Image...";
  try {
    const response = await fetch("/api/inpaint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: sourceDataUrl,
        mask: makeMaskDataUrl(),
        prompt,
        quality: document.querySelector("#quality").value,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.error === "string" ? result.error : JSON.stringify(result.error),
      );
    output.innerHTML = `<img src="${result.images[0].url}" alt="Inpaint result">`;
  } catch (error) {
    output.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Inpaint";
  }
});

fetch("/api/config")
  .then((r) => r.json())
  .then((config) => {
    const status = document.querySelector("#falstatus");
    status.classList.toggle("ok", config.falConfigured);
    status.querySelector("span").textContent = config.falConfigured
      ? "fal.ai configured"
      : "fal.ai key missing";
  });
new ResizeObserver(resize).observe(canvas.parentElement);
setTheme(JSON.parse(localStorage.getItem("ideadraw.theme") || '"dark"'));
