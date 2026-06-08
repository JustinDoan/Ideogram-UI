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
let viewerState = { scale: 1, x: 0, y: 0, drag: null };

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

function renderViewer() {
  document.querySelector("#inpaint-viewer-stage").style.transform =
    `translate(calc(-50% + ${viewerState.x}px), calc(-50% + ${viewerState.y}px)) scale(${viewerState.scale})`;
  document.querySelector("#inpaint-zoom-label").textContent =
    `${Math.round(viewerState.scale * 100)}%`;
}

function openViewer(url) {
  document.querySelector("#inpaint-viewer-image").src = url;
  document.querySelector("#inpaint-viewer").classList.add("open");
  document.querySelector("#inpaint-viewer").setAttribute("aria-hidden", "false");
  viewerState = { scale: 1, x: 0, y: 0, drag: null };
  renderViewer();
}

function closeViewer() {
  document.querySelector("#inpaint-viewer").classList.remove("open");
  document.querySelector("#inpaint-viewer").setAttribute("aria-hidden", "true");
}

function zoomViewer(factor) {
  viewerState.scale = Math.max(0.1, Math.min(10, viewerState.scale * factor));
  renderViewer();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the generated image."));
    image.src = url;
  });
}

async function compositeMaskedResult(resultUrl) {
  const generated = await loadImage(resultUrl);
  const output = document.createElement("canvas");
  output.width = sourceImage.naturalWidth;
  output.height = sourceImage.naturalHeight;
  const outputContext = output.getContext("2d");
  outputContext.drawImage(sourceImage, 0, 0);

  const editedArea = document.createElement("canvas");
  editedArea.width = output.width;
  editedArea.height = output.height;
  const editedContext = editedArea.getContext("2d");
  editedContext.drawImage(generated, 0, 0, output.width, output.height);
  editedContext.globalCompositeOperation = "destination-in";
  editedContext.drawImage(maskCanvas, 0, 0);

  outputContext.drawImage(editedArea, 0, 0);
  return output.toDataURL("image/png");
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
    const compositedUrl = await compositeMaskedResult(result.images[0].url);
    output.innerHTML = `<img src="${compositedUrl}" alt="Inpaint result">`;
    output.querySelector("img").addEventListener("click", () => openViewer(compositedUrl));
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

document.querySelector("#inpaint-viewer-close").addEventListener("click", closeViewer);
document.querySelector("#inpaint-zoom-reset").addEventListener("click", () => {
  viewerState = { scale: 1, x: 0, y: 0, drag: null };
  renderViewer();
});
document.querySelector("#inpaint-zoom-in").addEventListener("click", () => zoomViewer(1.25));
document.querySelector("#inpaint-zoom-out").addEventListener("click", () => zoomViewer(0.8));
document.querySelector("#inpaint-viewer").addEventListener("wheel", (event) => {
  event.preventDefault();
  zoomViewer(event.deltaY < 0 ? 1.15 : 0.87);
});
document.querySelector("#inpaint-viewer-stage").addEventListener("pointerdown", (event) => {
  viewerState.drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    originX: viewerState.x,
    originY: viewerState.y,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("dragging");
});
document.querySelector("#inpaint-viewer-stage").addEventListener("pointermove", (event) => {
  if (!viewerState.drag || viewerState.drag.pointerId !== event.pointerId) return;
  viewerState.x = viewerState.drag.originX + event.clientX - viewerState.drag.x;
  viewerState.y = viewerState.drag.originY + event.clientY - viewerState.drag.y;
  renderViewer();
});
function finishViewerDrag() {
  viewerState.drag = null;
  document.querySelector("#inpaint-viewer-stage").classList.remove("dragging");
}
document.querySelector("#inpaint-viewer-stage").addEventListener("pointerup", finishViewerDrag);
document.querySelector("#inpaint-viewer-stage").addEventListener("pointercancel", finishViewerDrag);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeViewer();
});
new ResizeObserver(resize).observe(canvas.parentElement);
setTheme(JSON.parse(localStorage.getItem("ideadraw.theme") || '"dark"'));
