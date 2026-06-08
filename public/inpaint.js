"use strict";

const canvas = document.querySelector("#inpaint-canvas");
const context = canvas.getContext("2d");
const brushInput = document.querySelector("#brush-size");
const brushValue = document.querySelector("#brush-size-value");
let sourceImage = null;
let sourceDataUrl = "";
let maskCanvas = null;
let maskContext = null;
let hasMask = false;
let interaction = null;
let hoverPoint = null;

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
  if (maskCanvas) {
    context.save();
    context.globalAlpha = 0.42;
    context.drawImage(maskCanvas, frame.x, frame.y, frame.width, frame.height);
    context.restore();
  }
  context.strokeStyle = styles.getPropertyValue("--line").trim();
  context.lineWidth = 2;
  context.strokeRect(frame.x, frame.y, frame.width, frame.height);
  if (hoverPoint?.inside) {
    context.strokeStyle = "#ffad32";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(
      frame.x + hoverPoint.x * frame.width,
      frame.y + hoverPoint.y * frame.height,
      (Number(brushInput.value) / sourceImage.naturalWidth) * frame.width * 0.5,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
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

function initializeMask() {
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = sourceImage.naturalWidth;
  maskCanvas.height = sourceImage.naturalHeight;
  maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskContext.fillStyle = "black";
  maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  hasMask = false;
}

function paint(from, to, erase) {
  if (!maskContext) return;
  maskContext.strokeStyle = erase ? "black" : "white";
  maskContext.fillStyle = erase ? "black" : "white";
  maskContext.lineWidth = Number(brushInput.value);
  maskContext.lineCap = "round";
  maskContext.lineJoin = "round";
  maskContext.beginPath();
  maskContext.moveTo(from.x * maskCanvas.width, from.y * maskCanvas.height);
  maskContext.lineTo(to.x * maskCanvas.width, to.y * maskCanvas.height);
  maskContext.stroke();
  maskContext.beginPath();
  maskContext.arc(
    to.x * maskCanvas.width,
    to.y * maskCanvas.height,
    Number(brushInput.value) / 2,
    0,
    Math.PI * 2,
  );
  maskContext.fill();
  if (!erase) hasMask = true;
  draw();
}

document.querySelector("#source-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    sourceDataUrl = reader.result;
    sourceImage = new Image();
    sourceImage.onload = () => {
      initializeMask();
      draw();
    };
    sourceImage.src = sourceDataUrl;
  };
  reader.readAsDataURL(file);
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  if ((event.button !== 0 && event.button !== 2) || !maskCanvas) return;
  const p = point(event);
  if (!p.inside) return;
  event.preventDefault();
  interaction = { erase: event.button === 2, last: p };
  canvas.setPointerCapture(event.pointerId);
  paint(p, p, interaction.erase);
});
canvas.addEventListener("pointermove", (event) => {
  hoverPoint = point(event);
  if (interaction) {
    paint(interaction.last, hoverPoint, interaction.erase);
    interaction.last = hoverPoint;
  } else {
    draw();
  }
});
canvas.addEventListener("pointerleave", () => {
  if (!interaction) {
    hoverPoint = null;
    draw();
  }
});
function finishInteraction() {
  interaction = null;
}
canvas.addEventListener("pointerup", finishInteraction);
canvas.addEventListener("pointercancel", finishInteraction);

brushInput.addEventListener("input", () => {
  brushValue.value = `${brushInput.value} px`;
  draw();
});
document.querySelector("#clear-mask").addEventListener("click", () => {
  if (!maskContext) return;
  maskContext.fillStyle = "black";
  maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  hasMask = false;
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
  if (!sourceImage || !hasMask || !prompt)
    return (output.textContent = "Upload an image, paint a mask, and enter a prompt.");
  button.disabled = true;
  button.textContent = "Inpainting...";
  output.textContent = "Editing with GPT Image...";
  try {
    const response = await fetch("/api/inpaint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: sourceDataUrl,
        mask: maskCanvas.toDataURL("image/png"),
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
