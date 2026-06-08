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

let boxes = [];
let selectedBoxIndex = -1;
let drawingState = null;
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
  const width = Number($("#width").value) || DEFAULT_WIDTH;
  const height = Number($("#height").value) || DEFAULT_HEIGHT;
  const stageWrapper = stage.parentElement;
  const wrapperStyle = getComputedStyle(stageWrapper);
  const horizontalPadding =
    Number.parseFloat(wrapperStyle.paddingLeft) + Number.parseFloat(wrapperStyle.paddingRight);
  const verticalPadding =
    Number.parseFloat(wrapperStyle.paddingTop) + Number.parseFloat(wrapperStyle.paddingBottom);
  const availableWidth = Math.max(1, stageWrapper.clientWidth - horizontalPadding);
  const availableHeight = Math.max(1, stageWrapper.clientHeight - verticalPadding);
  const scale = Math.min(availableWidth / width, availableHeight / height, 1);

  stage.style.width = `${width * scale}px`;
  stage.style.height = `${height * scale}px`;
}

function boxLabel(box) {
  return box.desc || "Untitled region";
}

function updateBoxElement(element, box, index) {
  element.style.left = `${box.x * 100}%`;
  element.style.top = `${box.y * 100}%`;
  element.style.width = `${box.w * 100}%`;
  element.style.height = `${box.h * 100}%`;
  element.classList.toggle("sel", selectedBoxIndex === index);
}

function renderBoxes() {
  stage.replaceChildren();

  boxes.forEach((box, index) => {
    stage.append(createBoxElement(box, index));
  });

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
      if (key === "desc") {
        const label = document.querySelectorAll(".box")[selectedBoxIndex]?.querySelector("span");
        if (label) label.textContent = boxLabel(box);
      }
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
  const rect = stage.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function addBox() {
  boxes.push({
    x: 0.1,
    y: 0.1,
    w: 0.3,
    h: 0.3,
    type: "obj",
    text: "",
    desc: "New region",
    palette: [],
  });
  selectedBoxIndex = boxes.length - 1;
  renderBoxes();
}

function createBoxElement(box, index) {
  const element = document.createElement("div");
  const label = document.createElement("span");

  element.className = "box";
  element.style.borderColor = BOX_COLORS[index % BOX_COLORS.length];
  label.style.background = BOX_COLORS[index % BOX_COLORS.length];
  label.textContent = boxLabel(box);
  element.append(label);
  updateBoxElement(element, box, index);
  element.addEventListener("pointerdown", (event) => startBoxDrag(event, index, element));
  return element;
}

function startBoxDrag(event, index, element) {
  event.stopPropagation();
  selectedBoxIndex = index;

  const box = boxes[index];
  const pointerStart = normalizedPoint(event);
  const grabOffset = {
    x: pointerStart.x - box.x,
    y: pointerStart.y - box.y,
  };
  const resize =
    event.offsetX > element.clientWidth - 18 && event.offsetY > element.clientHeight - 18;

  element.setPointerCapture(event.pointerId);
  document.querySelectorAll(".box").forEach((item, itemIndex) => {
    item.classList.toggle("sel", itemIndex === index);
  });
  renderRegionList();

  element.onpointermove = (moveEvent) => {
    const point = normalizedPoint(moveEvent);

    if (resize) {
      box.w = Math.max(0.02, Math.min(1 - box.x, point.x - box.x));
      box.h = Math.max(0.02, Math.min(1 - box.y, point.y - box.y));
    } else {
      box.x = Math.max(0, Math.min(1 - box.w, point.x - grabOffset.x));
      box.y = Math.max(0, Math.min(1 - box.h, point.y - grabOffset.y));
    }

    updateBoxElement(element, box, index);
  };

  element.onpointerup = () => {
    element.onpointermove = null;
    element.onpointerup = null;
    renderRegionList();
    saveDraft();
  };
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
    if (event.target !== stage) return;
    const start = normalizedPoint(event);
    const box = {
      x: start.x,
      y: start.y,
      w: 0.01,
      h: 0.01,
      type: "obj",
      text: "",
      desc: "New region",
      palette: [],
    };
    boxes.push(box);
    selectedBoxIndex = boxes.length - 1;
    const element = createBoxElement(box, selectedBoxIndex);
    stage.append(element);
    drawingState = { box, element, start };
    stage.setPointerCapture(event.pointerId);
    renderRegionList();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drawingState) return;
    const point = normalizedPoint(event);
    const left = Math.min(drawingState.start.x, point.x);
    const top = Math.min(drawingState.start.y, point.y);
    drawingState.box.x = left;
    drawingState.box.y = top;
    drawingState.box.w = Math.max(0.01, Math.abs(point.x - drawingState.start.x));
    drawingState.box.h = Math.max(0.01, Math.abs(point.y - drawingState.start.y));
    updateBoxElement(drawingState.element, drawingState.box, selectedBoxIndex);
  });
  stage.addEventListener("pointerup", () => {
    if (!drawingState) return;
    drawingState = null;
    renderRegionList();
    saveDraft();
  });
  stage.addEventListener("pointercancel", () => {
    if (!drawingState) return;
    drawingState = null;
    renderBoxes();
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
