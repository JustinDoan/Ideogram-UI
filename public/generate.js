"use strict";

const images = [];
let selectedImage = null;
let viewerState = { scale: 1, x: 0, y: 0, drag: null };

function $(selector) {
  return document.querySelector(selector);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("ideadraw.theme", theme);
  $("#theme").textContent = theme === "dark" ? "Light" : "Dark";
}

function setStatus(text) {
  $("#viewer-title").textContent = text;
}

function selectImage(image) {
  selectedImage = image;
  document.querySelectorAll(".generated-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.url === image.url);
  });
  $("#download-image").disabled = false;
  $("#copy-image").disabled = false;
  setStatus(`${image.width || "?"} x ${image.height || "?"}`);
}

function renderImages(nextImages) {
  images.splice(0, images.length, ...nextImages);
  selectedImage = images[0] || null;
  const grid = $("#image-grid");
  grid.classList.toggle("empty", images.length === 0);
  grid.classList.toggle("single", images.length === 1);
  if (!images.length) {
    grid.innerHTML = "<span>Generated images will appear here.</span>";
    $("#download-image").disabled = true;
    $("#copy-image").disabled = true;
    return;
  }
  grid.innerHTML = images
    .map(
      (image, index) => `
        <button class="generated-card${index === 0 ? " selected" : ""}" data-url="${image.url}">
          <img src="${image.url}" alt="Generated image ${index + 1}" />
          <span>${index + 1}</span>
        </button>`,
    )
    .join("");
  grid.querySelectorAll(".generated-card").forEach((card) => {
    const image = images.find((item) => item.url === card.dataset.url);
    card.addEventListener("click", () => selectImage(image));
    card.addEventListener("dblclick", () => openViewer(image.url));
  });
  selectImage(images[0]);
}

function renderViewer() {
  $("#viewer-stage").style.transform =
    `translate(calc(-50% + ${viewerState.x}px), calc(-50% + ${viewerState.y}px)) scale(${viewerState.scale})`;
  $("#zoom-label").textContent = `${Math.round(viewerState.scale * 100)}%`;
}

function openViewer(url) {
  $("#viewer-image").src = url;
  $("#generate-viewer").classList.add("open");
  $("#generate-viewer").setAttribute("aria-hidden", "false");
  viewerState = { scale: 1, x: 0, y: 0, drag: null };
  renderViewer();
}

function closeViewer() {
  $("#generate-viewer").classList.remove("open");
  $("#generate-viewer").setAttribute("aria-hidden", "true");
}

function zoomViewer(factor) {
  viewerState.scale = Math.max(0.1, Math.min(10, viewerState.scale * factor));
  renderViewer();
}

async function copySelectedImage() {
  if (!selectedImage) return;
  const response = await fetch(selectedImage.url);
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

function downloadSelectedImage() {
  if (!selectedImage) return;
  const link = document.createElement("a");
  link.href = selectedImage.url;
  link.download = selectedImage.file_name || "gpt-image-2.png";
  link.click();
}

async function generate() {
  const button = $("#generate-run");
  const prompt = $("#prompt").value.trim();
  if (!prompt) return setStatus("Enter a prompt first.");
  button.disabled = true;
  button.textContent = "Generating...";
  $("#image-grid").className = "empty";
  $("#image-grid").innerHTML = "<span>Generating with GPT Image 2...</span>";
  setStatus("Working");
  try {
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        quality: $("#quality").value,
        imageSize: $("#image-size").value,
        outputFormat: $("#output-format").value,
        numImages: $("#four-up").checked ? 4 : 1,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.error === "string" ? result.error : JSON.stringify(result.error),
      );
    renderImages(result.images || []);
  } catch (error) {
    $("#image-grid").className = "empty";
    $("#image-grid").innerHTML = `<span>${error.message}</span>`;
    setStatus("Error");
  } finally {
    button.disabled = false;
    button.textContent = "Generate";
  }
}

$("#generate-run").addEventListener("click", generate);
$("#download-image").addEventListener("click", downloadSelectedImage);
$("#copy-image").addEventListener("click", () => {
  copySelectedImage().catch((error) => setStatus(error.message));
});
$("#theme").addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
);
$("#viewer-close").addEventListener("click", closeViewer);
$("#zoom-reset").addEventListener("click", () => {
  viewerState = { scale: 1, x: 0, y: 0, drag: null };
  renderViewer();
});
$("#zoom-in").addEventListener("click", () => zoomViewer(1.25));
$("#zoom-out").addEventListener("click", () => zoomViewer(0.8));
$("#generate-viewer").addEventListener("wheel", (event) => {
  event.preventDefault();
  zoomViewer(event.deltaY < 0 ? 1.15 : 0.87);
});
$("#viewer-stage").addEventListener("pointerdown", (event) => {
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
$("#viewer-stage").addEventListener("pointermove", (event) => {
  if (!viewerState.drag || viewerState.drag.pointerId !== event.pointerId) return;
  viewerState.x = viewerState.drag.originX + event.clientX - viewerState.drag.x;
  viewerState.y = viewerState.drag.originY + event.clientY - viewerState.drag.y;
  renderViewer();
});
function finishViewerDrag() {
  viewerState.drag = null;
  $("#viewer-stage").classList.remove("dragging");
}
$("#viewer-stage").addEventListener("pointerup", finishViewerDrag);
$("#viewer-stage").addEventListener("pointercancel", finishViewerDrag);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeViewer();
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generate();
});

fetch("/api/config")
  .then((response) => response.json())
  .then((config) => {
    const status = $("#falstatus");
    status.classList.toggle("ok", config.falConfigured);
    status.querySelector("span").textContent = config.falConfigured
      ? "fal.ai configured"
      : "fal.ai key missing";
  });
setTheme(JSON.parse(localStorage.getItem("ideadraw.theme") || '"dark"'));
