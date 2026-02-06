const dom = {
  fileInput: document.getElementById("fileInput"),
  fileList: document.getElementById("fileList"),
  clearBtn: document.getElementById("clearBtn"),
  status: document.getElementById("status"),
  notice: document.getElementById("notice"),
  quality: document.getElementById("quality"),
  qualityValue: document.getElementById("qualityValue"),
  qualityLockHint: document.getElementById("qualityLockHint"),
  maxKb: document.getElementById("maxKb"),
  enableMaxKb: document.getElementById("enableMaxKb"),
  lowPowerMode: document.getElementById("lowPowerMode"),
  suffix: document.getElementById("suffix"),
  convertBtn: document.getElementById("convertBtn"),
  clearDoneBtn: document.getElementById("clearDoneBtn"),
  downloadAllBtn: document.getElementById("downloadAllBtn"),
  outputList: document.getElementById("outputList"),
  inputTotal: document.getElementById("inputTotal"),
  outputTotal: document.getElementById("outputTotal"),
  savedTotal: document.getElementById("savedTotal"),
};

const formatDefs = {
  jpg: { label: "JPG", mime: "image/jpeg", ext: "jpg", lossy: true },
  webp: { label: "WEBP", mime: "image/webp", ext: "webp", lossy: true },
  png: { label: "PNG", mime: "image/png", ext: "png", lossy: false },
};

const MAX_FILES = 10;
const LOW_POWER_BATCH_LIMIT = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const QUALITY_STEPS_NORMAL = 7;
const QUALITY_STEPS_LOW_POWER = 4;
const LOW_POWER_DELAY_MS = 120;

const state = {
  files: [],
  outputs: [],
  rejected: [],
  queue: [],
};

init();

function init() {
  dom.qualityValue.textContent = dom.quality.value;
  setupFormatSupport();
  runCapabilityCheck();
  dom.fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files);
  });
  dom.clearBtn.addEventListener("click", clearAll);
  dom.quality.addEventListener("input", () => {
    dom.qualityValue.textContent = dom.quality.value;
  });
  dom.enableMaxKb.addEventListener("change", syncMaxSizeState);
  dom.lowPowerMode.addEventListener("change", applyLowPowerMode);
  dom.convertBtn.addEventListener("click", convertAll);
  dom.clearDoneBtn.addEventListener("click", clearDone);
  dom.downloadAllBtn.addEventListener("click", downloadAll);
  setupDragDrop();
  syncMaxSizeState();
  applyLowPowerMode();
  renderFileList();
  updateTotals();
}

function setupFormatSupport() {
  const inputs = document.querySelectorAll("input[data-format]");
  inputs.forEach((input) => {
    const key = input.getAttribute("data-format");
    const def = formatDefs[key];
    if (!def) return;
    if (key === "jpg" || key === "png") return;
    if (!supportsType(def.mime)) {
      input.checked = false;
      input.disabled = true;
      const label = input.closest("label");
      if (label) {
        label.append(" (not supported)");
        label.classList.add("disabled");
      }
      input.dataset.supported = "false";
    } else {
      input.dataset.supported = "true";
    }
  });
}

function setupDragDrop() {
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.files) {
      handleFiles(event.dataTransfer.files);
    }
  });
}

function handleFiles(fileList) {
  const { accepted, rejected, queued } = filterFiles(Array.from(fileList || []), getBatchLimit());
  state.files = accepted;
  state.rejected = rejected;
  state.queue = queued;
  clearOutputs();
  renderFileList();
  updateTotals();
  if (!state.files.length) {
    if (state.rejected.length) {
      setStatus(`No files accepted. Skipped ${rejected.length} (limit: ${getLimitLabel()}).`);
    } else {
      setStatus("Ready");
    }
    return;
  }
  if (rejected.length || queued.length) {
    const skippedText = rejected.length ? `Skipped ${rejected.length}` : "";
    const queuedText = queued.length ? `Queued ${queued.length}` : "";
    const divider = skippedText && queuedText ? ", " : "";
    setStatus(`Loaded ${accepted.length}. ${skippedText}${divider}${queuedText}.`);
    return;
  }
  setStatus("Files loaded");
}

function clearAll() {
  dom.fileInput.value = "";
  state.files = [];
  state.rejected = [];
  state.queue = [];
  clearOutputs();
  renderFileList();
  updateTotals();
  setStatus("Ready");
}

function filterFiles(files, batchLimit) {
  const accepted = [];
  const rejected = [];
  const queued = [];

  files.forEach((file) => {
    if (!isAllowedFile(file)) {
      rejected.push({ file, reason: "type" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      rejected.push({ file, reason: "size" });
      return;
    }
    accepted.push(file);
  });

  if (accepted.length > batchLimit) {
    const overflow = accepted.splice(batchLimit);
    overflow.forEach((file) => queued.push({ file, reason: "count" }));
  }

  return { accepted, rejected, queued };
}

function isAllowedFile(file) {
  if (ALLOWED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp");
}

function clearOutputs() {
  state.outputs.forEach((item) => URL.revokeObjectURL(item.url));
  state.outputs = [];
  dom.outputList.innerHTML = "";
  dom.downloadAllBtn.disabled = true;
  updateTotals();
}

function renderFileList() {
  dom.fileList.innerHTML = "";
  if (!state.files.length && !state.rejected.length) {
    const empty = document.createElement("li");
    empty.className = "file-item";
    empty.textContent = "No files selected. Batch limit 10 (low-power: 5), 20 MB each.";
    dom.fileList.appendChild(empty);
    return;
  }

  state.files.forEach((file) => {
    const item = document.createElement("li");
    item.className = "file-item";

    const name = document.createElement("div");
    name.textContent = file.name;

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${formatBytes(file.size)} | loading size...`;

    item.appendChild(name);
    item.appendChild(meta);
    dom.fileList.appendChild(item);

    loadImageDimensions(file)
      .then((dims) => {
        meta.textContent = `${formatBytes(file.size)} | ${dims.width}x${dims.height}`;
      })
      .catch(() => {
        meta.textContent = `${formatBytes(file.size)} | unknown size`;
      });
  });

  if (state.rejected.length) {
    const note = document.createElement("li");
    note.className = "file-item rejected";
    note.textContent = "Skipped files (unsupported or too large)";
    dom.fileList.appendChild(note);

    state.rejected.forEach(({ file, reason }) => {
      const item = document.createElement("li");
      item.className = "file-item rejected";

      const name = document.createElement("div");
      name.textContent = file.name;

      const meta = document.createElement("div");
      meta.className = "file-meta";
      const reasonText =
        reason === "size"
          ? "over 20 MB"
          : reason === "type"
            ? "unsupported file type"
            : "skipped";
      meta.textContent = `${formatBytes(file.size)} | skipped: ${reasonText}`;

      item.appendChild(name);
      item.appendChild(meta);
      dom.fileList.appendChild(item);
    });
  }

  if (state.queue.length) {
    const note = document.createElement("li");
    note.className = "file-item";
    note.textContent = `Queued for next batch (${state.queue.length} files)`;
    dom.fileList.appendChild(note);

    state.queue.forEach(({ file }) => {
      const item = document.createElement("li");
      item.className = "file-item";

      const name = document.createElement("div");
      name.textContent = file.name;

      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = `${formatBytes(file.size)} | queued`;

      item.appendChild(name);
      item.appendChild(meta);
      dom.fileList.appendChild(item);
    });
  }
}

async function convertAll() {
  if (!state.files.length) {
    setStatus("Select files first.");
    return;
  }
  const formats = getSelectedFormats();
  if (!formats.length) {
    setStatus("Select at least one format.");
    return;
  }

  setStatus("Converting...");
  dom.convertBtn.disabled = true;
  dom.downloadAllBtn.disabled = true;
  clearOutputs();

  const maxEdge = 0;
  const quality = Number(dom.quality.value) / 100;
  const maxKb = dom.enableMaxKb.checked ? Number(dom.maxKb.value) || 0 : 0;
  const autoQuality = dom.enableMaxKb.checked;
  const qualityIterations = getQualityIterations();
  const lowPowerEnabled = isLowPowerEnabled();
  const suffix = (dom.suffix.value || "").trim();

  let index = 0;
  for (const file of state.files) {
    index += 1;
    setStatus(`Processing ${index}/${state.files.length}: ${file.name}`);
    await nextFrame();
    let canvasData;
    try {
      canvasData = await drawToCanvas(file, maxEdge);
    } catch (error) {
      setStatus(`Skipped ${file.name}: unreadable image.`);
      continue;
    }
    const { canvas, width, height } = canvasData;
    for (const format of formats) {
      const outputCanvas = format.mime === "image/jpeg" ? addWhiteBackground(canvas) : canvas;
      let blobData;
      if (maxKb > 0 && autoQuality && format.lossy) {
        blobData = await encodeWithTarget(
          outputCanvas,
          format.mime,
          maxKb * 1024,
          quality,
          qualityIterations
        );
      } else {
        const blob = await canvasToBlob(outputCanvas, format.mime, format.lossy ? quality : undefined);
        blobData = { blob, quality: format.lossy ? quality : null, hitTarget: true };
      }
      if (!blobData || !blobData.blob) {
        setStatus(`Browser cannot encode ${format.label} for ${file.name}.`);
        continue;
      }
      const outputName = buildOutputName(file.name, suffix, format.ext);
      const url = URL.createObjectURL(blobData.blob);
      const item = {
        url,
        name: outputName,
        size: blobData.blob.size,
        width,
        height,
        format: format.label,
        source: file.name,
        quality: blobData.quality,
        hitTarget: blobData.hitTarget,
      };
      state.outputs.push(item);
      addOutputCard(item);
    }
    if (lowPowerEnabled) {
      await pause(LOW_POWER_DELAY_MS);
    }
  }

  updateTotals();
  dom.convertBtn.disabled = false;
  dom.downloadAllBtn.disabled = state.outputs.length === 0;
  setStatus("Done. Scroll down for downloads.");
}

function addOutputCard(item) {
  const card = document.createElement("div");
  card.className = "output-card";

  const title = document.createElement("strong");
  title.textContent = `${item.name} (${item.format})`;

  const meta = document.createElement("div");
  meta.className = "meta";
  const qualityText = item.quality ? `q:${Math.round(item.quality * 100)}` : "lossless";
  const targetText = item.hitTarget === false ? "target not reached" : "";
  meta.textContent = `${item.width}x${item.height} | ${formatBytes(item.size)} | ${qualityText}${targetText ? ` | ${targetText}` : ""} | from ${item.source}`;

  const button = document.createElement("button");
  button.className = "ghost";
  button.textContent = "Download";
  button.addEventListener("click", () => triggerDownload(item.url, item.name));

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(button);
  dom.outputList.appendChild(card);
}

async function downloadAll() {
  if (!state.outputs.length) return;
  if (!window.JSZip) {
    setStatus("Zip library not loaded.");
    return;
  }
  setStatus("Building ZIP...");
  dom.downloadAllBtn.disabled = true;
  try {
    const zip = new JSZip();
    for (const item of state.outputs) {
      const response = await fetch(item.url);
      const blob = await response.blob();
      zip.file(item.name, blob);
    }
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const zipUrl = URL.createObjectURL(zipBlob);
    triggerDownload(zipUrl, "optimized-images.zip");
    setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
    setStatus("ZIP downloaded.");
  } catch (error) {
    setStatus("Failed to build ZIP.");
  } finally {
    dom.downloadAllBtn.disabled = false;
  }
}

function triggerDownload(url, name) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getSelectedFormats() {
  return Array.from(document.querySelectorAll("input[data-format]:checked"))
    .map((input) => formatDefs[input.getAttribute("data-format")])
    .filter(Boolean);
}

function buildOutputName(originalName, suffix, ext) {
  const base = originalName.replace(/\.[^.]+$/, "");
  const safeSuffix = suffix ? suffix.replace(/\s+/g, "-") : "";
  return `${base}${safeSuffix}.${ext}`;
}

async function drawToCanvas(file, maxEdge) {
  const bitmap = await loadBitmap(file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = maxEdge > 0 && longEdge > maxEdge ? maxEdge / longEdge : 1;
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();
  return { canvas, width, height };
}

function addWhiteBackground(canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const ctx = tmp.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(canvas, 0, 0);
  return tmp;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (!canvas.toBlob) {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function encodeWithTarget(canvas, type, maxBytes, maxQuality, iterations = QUALITY_STEPS_NORMAL) {
  const minQuality = 0.4;
  const upper = Math.min(0.95, Math.max(minQuality, maxQuality));
  let low = minQuality;
  let high = upper;
  let bestBlob = null;
  let bestQuality = upper;

  for (let i = 0; i < iterations; i += 1) {
    const q = (low + high) / 2;
    const blob = await canvasToBlob(canvas, type, q);
    if (!blob) return { blob: null, quality: q, hitTarget: false };

    if (blob.size <= maxBytes) {
      bestBlob = blob;
      bestQuality = q;
      low = q;
    } else {
      high = q;
    }
  }

  if (!bestBlob) {
    const fallback = await canvasToBlob(canvas, type, minQuality);
    if (!fallback) return { blob: null, quality: minQuality, hitTarget: false };
    return { blob: fallback, quality: minQuality, hitTarget: fallback.size <= maxBytes };
  }

  return { blob: bestBlob, quality: bestQuality, hitTarget: true };
}

async function loadImageDimensions(file) {
  const bitmap = await loadBitmap(file);
  const dims = { width: bitmap.width, height: bitmap.height };
  if (bitmap.close) bitmap.close();
  return dims;
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

function supportsType(type) {
  const canvas = document.createElement("canvas");
  if (!canvas.toDataURL) return false;
  return canvas.toDataURL(type).startsWith(`data:${type}`);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function updateTotals() {
  const input = state.files.reduce((sum, file) => sum + file.size, 0);
  const output = state.outputs.reduce((sum, item) => sum + item.size, 0);
  dom.inputTotal.textContent = formatBytes(input);
  dom.outputTotal.textContent = formatBytes(output);
  const saved = input - output;
  const savedLabel = saved >= 0 ? formatBytes(saved) : `-${formatBytes(Math.abs(saved))}`;
  dom.savedTotal.textContent = savedLabel;
}

function setStatus(message) {
  dom.status.textContent = message;
}

function clearDone() {
  clearOutputs();
  if (state.queue.length) {
    loadNextBatch();
    setStatus(`Loaded queued batch (${state.files.length} files).`);
  } else {
    setStatus("Cleared done images.");
  }
}

function loadNextBatch() {
  const nextBatch = state.queue.splice(0, getBatchLimit()).map((item) => item.file);
  state.files = nextBatch;
  renderFileList();
  updateTotals();
}

function setNotice(message) {
  dom.notice.textContent = message;
  dom.notice.classList.toggle("active", Boolean(message));
}

function isLowPowerEnabled() {
  return Boolean(dom.lowPowerMode && dom.lowPowerMode.checked);
}

function getBatchLimit() {
  return isLowPowerEnabled() ? LOW_POWER_BATCH_LIMIT : MAX_FILES;
}

function getLimitLabel() {
  return `${getBatchLimit()} files, 20 MB each`;
}

function getQualityIterations() {
  return isLowPowerEnabled() ? QUALITY_STEPS_LOW_POWER : QUALITY_STEPS_NORMAL;
}

function applyLowPowerMode() {
  rebalanceBatches();
}

function rebalanceBatches() {
  const limit = getBatchLimit();
  if (state.files.length > limit) {
    const overflow = state.files.splice(limit);
    const queuedItems = overflow.map((file) => ({ file, reason: "count" }));
    state.queue = queuedItems.concat(state.queue);
  } else if (state.files.length < limit && state.queue.length) {
    const needed = limit - state.files.length;
    const pulled = state.queue.splice(0, needed).map((item) => item.file);
    state.files = state.files.concat(pulled);
  }
  renderFileList();
  updateTotals();
}

function runCapabilityCheck() {
  const warnings = [];
  if (!HTMLCanvasElement.prototype.toBlob) {
    warnings.push("Your browser does not support canvas export. Conversion may fail.");
  }
  const memory = navigator.deviceMemory;
  if (memory && memory <= 4) {
    warnings.push(`Low memory device detected (${memory} GB). Use fewer files for smoother results.`);
  }
  const cores = navigator.hardwareConcurrency;
  if (cores && cores <= 4) {
    warnings.push(`Limited CPU detected (${cores} cores). Processing may be slower.`);
  }
  if ((memory && memory <= 4) || (cores && cores <= 4)) {
    warnings.push("Consider enabling Low-power mode if you have 4 GB RAM or an older PC.");
  }
  setNotice(warnings.join(" "));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncMaxSizeState() {
  const enabled = dom.enableMaxKb.checked;
  dom.maxKb.disabled = !enabled;
  dom.quality.disabled = enabled;
  dom.qualityLockHint.style.display = enabled ? "block" : "none";
}
