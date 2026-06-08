"use strict";

const DEFAULT_WIDTH = 1376;
const DEFAULT_HEIGHT = 768;
const MAX_HISTORY_ITEMS = 60;
const MAX_LAYOUTS = 30;
const BOX_COLORS = ["#e8ff58", "#5de1ff", "#ff6b65", "#c894ff", "#ffbd59"];
const STORAGE_KEYS = {
  draft: "ideadraw.draft",
  history: "ideadraw.history",
  layouts: "ideadraw.layouts",
  theme: "ideadraw.theme",
};

const $ = (selector) => document.querySelector(selector);
const stage = $("#stage");
const stageContext = stage.getContext("2d");

let boxes = [];
let selectedBoxIndex = -1;
let canvasInteraction = null;
let lastImageSrc = "";
let viewerState = { scale: 1, x: 0, y: 0, drag: null };

function clone(value) {
  return structuredClone(value);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function currentState() {
  return {
    width: Number($("#width").value) || DEFAULT_WIDTH,
    height: Number($("#height").value) || DEFAULT_HEIGHT,
    scene: $("#scene").value,
    background: $("#background").value,
    url: $("#url").value,
    boxes: clone(boxes),
    lastImageSrc,
  };
}

function saveDraft() {
  writeStorage(STORAGE_KEYS.draft, currentState());
}

function loadState(state) {
  $("#width").value = state.width;
  $("#height").value = state.height;
  $("#scene").value = state.scene;
  $("#background").value = state.background;
  $("#url").value = state.url || $("#url").value;
  boxes = clone(state.boxes || []);
  lastImageSrc = state.lastImageSrc || "";
  selectedBoxIndex = -1;

  resizeStage();
  renderBoxes();
  if (lastImageSrc) showOutputUrl(lastImageSrc);
  saveDraft();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writeStorage(STORAGE_KEYS.theme, theme);
  $("#theme").textContent = theme === "dark" ? "Light" : "Dark";
}

function selectTab(group, name) {
  const nav = document.querySelector(`[data-tabs="${group}"]`);
  const container =
    group === "left"
      ? document.querySelector(".properties")
      : document.querySelector(".outputrail");

  nav.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  container.querySelectorAll(".tabpane").forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.pane === name);
  });

  localStorage.setItem(`ideadraw.tab.${group}`, name);
}

function setupTabs() {
  document.querySelectorAll("[data-tabs]").forEach((nav) => {
    const group = nav.dataset.tabs;
    nav.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => selectTab(group, button.dataset.tab));
    });

    selectTab(
      group,
      localStorage.getItem(`ideadraw.tab.${group}`) || nav.querySelector("[data-tab]").dataset.tab,
    );
  });
}

function resizeStage() {
  const ratio = window.devicePixelRatio || 1;
  const workspace = stage.parentElement;
  const width = Math.max(1, workspace.clientWidth);
  const height = Math.max(1, workspace.clientHeight);
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.width = Math.round(width * ratio);
  stage.height = Math.round(height * ratio);
  stageContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawCanvas();
}

function boxLabel(box) {
  return box.desc || "Untitled region";
}

function imageFrame() {
  const workspaceWidth = stage.clientWidth;
  const workspaceHeight = stage.clientHeight;
  const outputWidth = Number($("#width").value) || DEFAULT_WIDTH;
  const outputHeight = Number($("#height").value) || DEFAULT_HEIGHT;
  const padding = 32;
  const maxWidth = Math.max(1, workspaceWidth - padding * 2);
  const maxHeight = Math.max(1, workspaceHeight - padding * 2);
  const scale = Math.min(maxWidth / outputWidth, maxHeight / outputHeight);
  const width = outputWidth * scale;
  const height = outputHeight * scale;

  return {
    x: (workspaceWidth - width) / 2,
    y: (workspaceHeight - height) / 2,
    width,
    height,
  };
}

function boxPixels(box) {
  const frame = imageFrame();
  return {
    x: frame.x + box.x * frame.width,
    y: frame.y + box.y * frame.height,
    width: box.w * frame.width,
    height: box.h * frame.height,
  };
}

function drawCanvas() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const frame = imageFrame();
  const styles = getComputedStyle(document.documentElement);
  stageContext.clearRect(0, 0, width, height);

  stageContext.fillStyle = styles.getPropertyValue("--panel2").trim();
  stageContext.fillRect(0, 0, width, height);
  stageContext.fillStyle = styles.getPropertyValue("--panel").trim();
  stageContext.fillRect(frame.x, frame.y, frame.width, frame.height);
  stageContext.strokeStyle = styles.getPropertyValue("--line").trim();
  stageContext.lineWidth = 2;
  stageContext.strokeRect(frame.x, frame.y, frame.width, frame.height);

  boxes.forEach((box, index) => {
    const rect = boxPixels(box);
    const color = BOX_COLORS[index % BOX_COLORS.length];
    const selected = index === selectedBoxIndex;

    stageContext.fillStyle = `${color}18`;
    stageContext.fillRect(rect.x, rect.y, rect.width, rect.height);
    stageContext.strokeStyle = color;
    stageContext.lineWidth = selected ? 3 : 2;
    stageContext.strokeRect(rect.x, rect.y, rect.width, rect.height);

    const label = boxLabel(box);
    stageContext.font = "600 11px Inter, Segoe UI, sans-serif";
    const labelWidth = Math.min(stageContext.measureText(label).width + 12, rect.width);
    const labelY = Math.max(0, rect.y - 22);
    stageContext.fillStyle = color;
    stageContext.fillRect(rect.x, labelY, labelWidth, 22);
    stageContext.fillStyle = "#17120b";
    stageContext.save();
    stageContext.beginPath();
    stageContext.rect(rect.x + 5, labelY, Math.max(0, labelWidth - 8), 22);
    stageContext.clip();
    stageContext.fillText(label, rect.x + 6, labelY + 15);
    stageContext.restore();

    if (selected) {
      stageContext.fillStyle = color;
      stageContext.fillRect(rect.x + rect.width - 6, rect.y + rect.height - 6, 12, 12);
    }
  });
}

function renderBoxes() {
  drawCanvas();
  renderRegionList(false);
  saveDraft();
}

function renderRegionList(renderInspector = true) {
  $("#regions").innerHTML =
    boxes
      .map(
        (box, index) => `
          <div class="region ${index === selectedBoxIndex ? "active" : ""}" data-region-index="${index}">
            <b>${escapeHtml(boxLabel(box))}</b>
            <small>${Math.round(box.w * 100)}% x ${Math.round(box.h * 100)}%</small>
          </div>`,
      )
      .join("") || "<small>No regions yet.</small>";

  document.querySelectorAll("[data-region-index]").forEach((element) => {
    element.addEventListener("click", () => {
      selectedBoxIndex = Number(element.dataset.regionIndex);
      renderBoxes();
    });
  });

  if (renderInspector) renderInspectorPanel();
  renderPreviewOverlay();
  renderViewerOverlay();
}

function renderInspectorPanel() {
  const inspector = $("#inspector");
  const box = boxes[selectedBoxIndex];

  if (!box) {
    inspector.className = "empty";
    inspector.textContent = "Select a region to edit it.";
    return;
  }

  inspector.className = "";
  inspector.innerHTML = `
    <label>Description<textarea id="desc" rows="5">${escapeHtml(box.desc)}</textarea></label>
    <label>Exact text<textarea id="text" rows="2">${escapeHtml(box.text)}</textarea></label>
    <label>Type
      <select id="type">
        <option value="obj">Object</option>
        <option value="text">Text</option>
      </select>
    </label>
    <button id="delete-region" class="danger">Delete region</button>`;

  $("#type").value = box.type;
  ["desc", "text", "type"].forEach((key) => {
    const input = $(`#${key}`);
    input.addEventListener("input", (event) => {
      box[key] = event.target.value;
      if (key === "desc") drawCanvas();
      saveDraft();
    });
    input.addEventListener("change", () => renderRegionList());
  });

  $("#delete-region").addEventListener("click", () => {
    boxes.splice(selectedBoxIndex, 1);
    selectedBoxIndex = -1;
    renderBoxes();
  });
}

function normalizedPoint(event) {
  const stageRect = stage.getBoundingClientRect();
  const frame = imageFrame();
  const canvasX = event.clientX - stageRect.left;
  const canvasY = event.clientY - stageRect.top;
  return {
    x: Math.max(0, Math.min(1, (canvasX - frame.x) / frame.width)),
    y: Math.max(0, Math.min(1, (canvasY - frame.y) / frame.height)),
    inside:
      canvasX >= frame.x &&
      canvasX <= frame.x + frame.width &&
      canvasY >= frame.y &&
      canvasY <= frame.y + frame.height,
  };
}

function addBox() {
  addBoxAt(0.25, 0.25);
}

function addBoxAt(centerX, centerY) {
  const width = 0.3;
  const height = 0.3;
  boxes.push({
    x: Math.max(0, Math.min(1 - width, centerX - width / 2)),
    y: Math.max(0, Math.min(1 - height, centerY - height / 2)),
    w: width,
    h: height,
    type: "obj",
    text: "",
    desc: "New region",
    palette: [],
  });
  selectedBoxIndex = boxes.length - 1;
  renderBoxes();
}

function hitTest(point) {
  const frame = imageFrame();
  const handleX = 28 / frame.width;
  const handleY = 28 / frame.height;
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    const inside =
      point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
    if (!inside) continue;
    const resize = point.x >= box.x + box.w - handleX && point.y >= box.y + box.h - handleY;
    return { index, resize };
  }
  return null;
}

function renderLayouts() {
  const layouts = readStorage(STORAGE_KEYS.layouts, []);
  $("#layouts").innerHTML =
    layouts
      .map(
        (layout, index) => `
          <div class="layoutitem">
            <button data-layout-load="${index}">${escapeHtml(layout.name)}</button>
            <button class="danger" data-layout-delete="${index}" aria-label="Delete ${escapeHtml(layout.name)}">x</button>
          </div>`,
      )
      .join("") || "<small>No saved layouts yet.</small>";

  document.querySelectorAll("[data-layout-load]").forEach((button) => {
    button.addEventListener("click", () =>
      loadState(layouts[Number(button.dataset.layoutLoad)].state),
    );
  });
  document.querySelectorAll("[data-layout-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      layouts.splice(Number(button.dataset.layoutDelete), 1);
      writeStorage(STORAGE_KEYS.layouts, layouts);
      renderLayouts();
    });
  });
}

function saveLayout() {
  const name = $("#layoutname").value.trim() || new Date().toLocaleString();
  const layouts = readStorage(STORAGE_KEYS.layouts, []).filter((layout) => layout.name !== name);
  layouts.unshift({ name, state: currentState(), savedAt: Date.now() });
  writeStorage(STORAGE_KEYS.layouts, layouts.slice(0, MAX_LAYOUTS));
  $("#layoutname").value = "";
  renderLayouts();
}

function comfyFetch(path, options = {}) {
  return fetch(`/comfy${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "content-type": "application/json",
      "x-comfy-url": $("#url").value,
    },
  });
}

async function checkComfyConnection() {
  try {
    const response = await comfyFetch("/system_stats");
    if (!response.ok) throw new Error("Connection failed");
    $(".status").classList.add("ok");
    $("#status").textContent = "ComfyUI connected";
  } catch {
    $(".status").classList.remove("ok");
    $("#status").textContent = "ComfyUI unavailable";
  }
}

function imageUrl(image) {
  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || "",
    type: image.type || "output",
    comfy_url: $("#url").value,
  });
  return `/comfy/view?${query}`;
}

function rememberImage(src) {
  const history = readStorage(STORAGE_KEYS.history, []).filter((item) => item.src !== src);
  history.unshift({ src, state: currentState(), at: Date.now() });
  writeStorage(STORAGE_KEYS.history, history.slice(0, MAX_HISTORY_ITEMS));
  renderHistory();
}

function showOutputUrl(src) {
  lastImageSrc = src;
  $("#copyimage").disabled = false;
  $("#output").innerHTML = `<img src="${escapeHtml(src)}" alt="Generated image">`;
  const image = $("#output img");
  image.addEventListener("click", () => openViewer(src));
  image.addEventListener("load", renderPreviewOverlay);
  selectTab("right", "output");
  saveDraft();
}

function showOutput(image) {
  const src = imageUrl(image);
  showOutputUrl(src);
  rememberImage(src);
}

function overlayMarkup() {
  return boxes
    .map(
      (box, index) => `
        <div class="previewbox" style="left:${box.x * 100}%;top:${box.y * 100}%;width:${box.w * 100}%;height:${box.h * 100}%;border-color:${BOX_COLORS[index % BOX_COLORS.length]}">
          <span style="background:${BOX_COLORS[index % BOX_COLORS.length]}">${escapeHtml(box.desc || "Region")}</span>
        </div>`,
    )
    .join("");
}

function renderPreviewOverlay() {
  const image = $("#output img");
  if (!image) return;

  $("#output .previewoverlay")?.remove();
  if (!$("#overlaytoggle").checked) return;

  const output = $("#output");
  const ratio = image.naturalWidth / image.naturalHeight;
  let width = output.clientWidth;
  let height = width / ratio;
  if (height > output.clientHeight) {
    height = output.clientHeight;
    width = height * ratio;
  }

  const overlay = document.createElement("div");
  overlay.className = "previewoverlay";
  overlay.style.cssText = `width:${width}px;height:${height}px;left:${(output.clientWidth - width) / 2}px;top:${(output.clientHeight - height) / 2}px`;
  overlay.innerHTML = overlayMarkup();
  output.append(overlay);
}

function renderViewerOverlay() {
  $("#vieweroverlay").innerHTML = overlayMarkup();
  $("#vieweroverlay").classList.toggle("visible", $("#vieweroverlaytoggle").checked);
}

function findOutputImages(historyItem) {
  return historyItem.outputs?.["179"]?.images || historyItem.outputs?.["25"]?.images || [];
}

async function generate() {
  const button = $("#run");
  const output = $("#output");
  button.disabled = true;
  button.textContent = "Queueing...";

  try {
    const width = Number($("#width").value);
    const height = Number($("#height").value);
    const workflow = await fetch("/api-workflow").then((response) => response.json());

    workflow["165"].inputs.width = width;
    workflow["165"].inputs.height = height;
    workflow["165"].inputs.high_level_description = $("#scene").value;
    workflow["165"].inputs.background = $("#background").value;
    workflow["165"].inputs.elements_data = JSON.stringify(boxes);
    workflow["98:27"].inputs.value = width;
    workflow["98:28"].inputs.value = height;
    workflow["98:18"].inputs.noise_seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

    const response = await comfyFetch("/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt: workflow, client_id: "ideadraw-webui" }),
    });
    if (!response.ok) throw new Error(await response.text());

    const { prompt_id: promptId } = await response.json();
    button.textContent = "Generating...";
    output.innerHTML = "<span>Generating in ComfyUI...</span>";

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const history = await comfyFetch(`/history/${promptId}`).then((item) => item.json());
      const historyItem = history[promptId];
      if (!historyItem) continue;

      const images = findOutputImages(historyItem);
      if (images.length) {
        showOutput(images[0]);
        break;
      }
      if (historyItem.status?.status_str === "error") throw new Error("ComfyUI generation failed.");
    }
  } catch (error) {
    output.innerHTML = `<span class="danger">${escapeHtml(error.message)}</span>`;
  } finally {
    button.disabled = false;
    button.textContent = "Generate";
    checkComfyConnection();
  }
}

async function copyImage() {
  if (!lastImageSrc) return;
  const button = $("#copyimage");
  const originalText = button.textContent;

  try {
    const blob = await fetch(lastImageSrc).then((response) => response.blob());
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }

  setTimeout(() => {
    button.textContent = originalText;
  }, 1200);
}

function renderHistory() {
  const history = readStorage(STORAGE_KEYS.history, []);
  $("#history").innerHTML =
    history
      .map(
        (item, index) => `
          <button class="historyitem" data-history-index="${index}">
            <img src="${escapeHtml(item.src)}" alt="Generated history">
          </button>`,
      )
      .join("") || "<small>No generated images yet.</small>";

  document.querySelectorAll("[data-history-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = history[Number(button.dataset.historyIndex)];
      if (item.state) loadState(item.state);
      showOutputUrl(item.src);
    });
  });
}

async function refreshHistory() {
  try {
    const comfyHistory = await comfyFetch("/history").then((response) => response.json());
    const remoteItems = [];
    Object.values(comfyHistory)
      .reverse()
      .forEach((item) => {
        const image = findOutputImages(item)[0];
        if (image) remoteItems.push({ src: imageUrl(image), state: null, at: Date.now() });
      });

    const merged = [...readStorage(STORAGE_KEYS.history, []), ...remoteItems]
      .filter(
        (item, index, all) => all.findIndex((candidate) => candidate.src === item.src) === index,
      )
      .slice(0, MAX_HISTORY_ITEMS);
    writeStorage(STORAGE_KEYS.history, merged);
  } catch (error) {
    console.warn("Unable to refresh ComfyUI history:", error);
  } finally {
    renderHistory();
  }
}

function updateViewer() {
  $("#viewercontent").style.transform =
    `translate(calc(-50% + ${viewerState.x}px),calc(-50% + ${viewerState.y}px)) scale(${viewerState.scale})`;
  $("#zoomlabel").textContent = `${Math.round(viewerState.scale * 100)}%`;
}

function openViewer(src) {
  const image = $("#viewerimage");
  image.src = src;
  image.onload = () => {
    renderViewerOverlay();
    updateViewer();
  };
  $("#viewer").classList.add("open");
  $("#viewer").setAttribute("aria-hidden", "false");
  viewerState = { scale: 1, x: 0, y: 0, drag: null };
  updateViewer();
}

function closeViewer() {
  $("#viewer").classList.remove("open");
  $("#viewer").setAttribute("aria-hidden", "true");
}

function zoomViewer(factor) {
  viewerState.scale = Math.max(0.1, Math.min(10, viewerState.scale * factor));
  updateViewer();
}

function bindEvents() {
  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const point = normalizedPoint(event);
    if (!point.inside) {
      selectedBoxIndex = -1;
      drawCanvas();
      renderInspectorPanel();
      return;
    }
    const hit = hitTest(point);

    if (hit) {
      selectedBoxIndex = hit.index;
      const box = boxes[hit.index];
      canvasInteraction = {
        mode: hit.resize ? "resize" : "move",
        box,
        offsetX: point.x - box.x,
        offsetY: point.y - box.y,
      };
    } else {
      selectedBoxIndex = -1;
      canvasInteraction = null;
      drawCanvas();
      renderRegionList();
      return;
    }

    stage.setPointerCapture(event.pointerId);
    drawCanvas();
    renderRegionList();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!canvasInteraction) return;
    const point = normalizedPoint(event);
    const { box, mode } = canvasInteraction;

    if (mode === "move") {
      box.x = Math.max(0, Math.min(1 - box.w, point.x - canvasInteraction.offsetX));
      box.y = Math.max(0, Math.min(1 - box.h, point.y - canvasInteraction.offsetY));
    } else {
      box.w = Math.max(0.02, Math.min(1 - box.x, point.x - box.x));
      box.h = Math.max(0.02, Math.min(1 - box.y, point.y - box.y));
    }
    drawCanvas();
  });
  stage.addEventListener("pointerup", () => {
    if (!canvasInteraction) return;
    canvasInteraction = null;
    renderRegionList();
    saveDraft();
  });
  stage.addEventListener("pointercancel", () => {
    canvasInteraction = null;
    drawCanvas();
  });
  stage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const point = normalizedPoint(event);
    if (!point.inside) return;
    addBoxAt(point.x, point.y);
  });

  $("#add").addEventListener("click", addBox);
  $("#add2").addEventListener("click", addBox);
  $("#clear").addEventListener("click", () => {
    boxes = [];
    selectedBoxIndex = -1;
    renderBoxes();
  });
  $("#export").addEventListener("click", () =>
    navigator.clipboard.writeText(JSON.stringify(boxes)),
  );
  $("#savelayout").addEventListener("click", saveLayout);
  $("#refreshhistory").addEventListener("click", refreshHistory);
  $("#run").addEventListener("click", generate);
  $("#copyimage").addEventListener("click", copyImage);
  $("#theme").addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  ["width", "height"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      resizeStage();
      drawCanvas();
      saveDraft();
    });
  });
  ["scene", "background", "url"].forEach((id) => {
    $(`#${id}`).addEventListener("input", saveDraft);
  });
  $("#url").addEventListener("change", () => {
    saveDraft();
    checkComfyConnection();
    refreshHistory();
  });
  $("#overlaytoggle").addEventListener("change", renderPreviewOverlay);
  $("#vieweroverlaytoggle").addEventListener("change", renderViewerOverlay);

  $("#viewerclose").addEventListener("click", closeViewer);
  $("#zoomreset").addEventListener("click", () => {
    viewerState = { scale: 1, x: 0, y: 0, drag: null };
    updateViewer();
  });
  $("#zoomin").addEventListener("click", () => zoomViewer(1.25));
  $("#zoomout").addEventListener("click", () => zoomViewer(0.8));
  $("#viewport").addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomViewer(event.deltaY < 0 ? 1.15 : 0.87);
  });
  $("#viewport").addEventListener("pointerdown", (event) => {
    viewerState.drag = {
      x: event.clientX,
      y: event.clientY,
      originX: viewerState.x,
      originY: viewerState.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  });
  $("#viewport").addEventListener("pointermove", (event) => {
    if (!viewerState.drag) return;
    viewerState.x = viewerState.drag.originX + event.clientX - viewerState.drag.x;
    viewerState.y = viewerState.drag.originY + event.clientY - viewerState.drag.y;
    updateViewer();
  });
  $("#viewport").addEventListener("pointerup", (event) => {
    viewerState.drag = null;
    event.currentTarget.classList.remove("dragging");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeViewer();
  });
  addEventListener("resize", () => {
    resizeStage();
    renderPreviewOverlay();
  });
  new ResizeObserver(() => {
    resizeStage();
    renderPreviewOverlay();
  }).observe(stage.parentElement);
}

async function init() {
  setTheme(readStorage(STORAGE_KEYS.theme, "dark"));
  setupTabs();
  bindEvents();

  const workflow = await fetch("/api-workflow").then((response) => response.json());
  const inputs = workflow["165"].inputs;
  const fallback = {
    width: inputs.width,
    height: inputs.height,
    scene: inputs.high_level_description,
    background: inputs.background,
    url: $("#url").value,
    boxes: JSON.parse(inputs.elements_data),
    lastImageSrc: "",
  };

  loadState(readStorage(STORAGE_KEYS.draft, fallback));
  renderLayouts();
  renderHistory();
  checkComfyConnection();
  refreshHistory();
}

init().catch((error) => {
  console.error("IdeaDraw failed to initialize:", error);
  $("#status").textContent = "Initialization failed";
});
