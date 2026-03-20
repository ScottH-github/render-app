// src/main.js
// --------------------------------------------------
// Main logic for the AI 渲染助手 web app.
// --------------------------------------------------
import { COMFYUI_ENDPOINT, COMFYUI_WS_ENDPOINT, LLM_ENDPOINT } from "../config.js";

// ---------- Default Params (loaded from JSON) ----------
let DEFAULT_PARAMS = null; // will be populated by loadAndApplyDefaults()
let SCENE_PRESETS = {};    // populated from JSON scenePresets

async function loadAndApplyDefaults() {
  try {
    const res = await fetch("./docs/default-params.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DEFAULT_PARAMS = await res.json();
    console.log("[Config] Loaded default-params.json");

    // --- Apply UI slider/checkbox defaults (only if no localStorage override) ---
    const applySlider = (paramDef, valEl) => {
      const el = document.getElementById(paramDef.htmlId);
      if (!el) return;
      // Set range attributes from JSON
      if (paramDef.min != null) el.min = paramDef.min;
      if (paramDef.max != null) el.max = paramDef.max;
      if (paramDef.step != null) el.step = paramDef.step;
      // Set default value (localStorage may override later in restoreControlNetSettings)
      el.value = paramDef.default;
      if (valEl) {
        const displayEl = document.getElementById(valEl);
        if (displayEl) displayEl.textContent = typeof paramDef.default === "number" && paramDef.step < 1
          ? parseFloat(paramDef.default).toFixed(2)
          : paramDef.default;
      }
    };

    const applyCheckbox = (paramDef) => {
      const el = document.getElementById(paramDef.htmlId);
      if (el) el.checked = paramDef.default;
    };

    const applySelect = (paramDef) => {
      const el = document.getElementById(paramDef.htmlId);
      if (el) el.value = paramDef.default;
    };

    // Rendering
    const r = DEFAULT_PARAMS.rendering;
    if (r) {
      if (r.denoise) applySlider(r.denoise, "denoise-val");
      if (r.steps) applySlider(r.steps, "steps-val");
    }

    // ControlNet
    const cn = DEFAULT_PARAMS.controlnet;
    if (cn) {
      if (cn.enabled) applyCheckbox(cn.enabled);
      if (cn.type) applySelect(cn.type);
      if (cn.strength) applySlider(cn.strength, "cn-strength-val");
      if (cn.preprocess) applyCheckbox(cn.preprocess);
    }

    // Style Reference
    const sr = DEFAULT_PARAMS.styleReference;
    if (sr) {
      if (sr.weight) applySlider(sr.weight, "style-weight-val");
      if (sr.mode) applySelect(sr.mode);
    }

    // Scene Presets → populate global SCENE_PRESETS
    if (DEFAULT_PARAMS.scenePresets) {
      const presets = {};
      for (const [key, val] of Object.entries(DEFAULT_PARAMS.scenePresets)) {
        if (key.startsWith("_")) continue; // skip meta fields
        presets[key] = val;
      }
      SCENE_PRESETS = presets;
    }

  } catch (err) {
    console.warn("[Config] Failed to load default-params.json, using hardcoded fallbacks:", err);
    // Fallback: keep inline defaults from HTML attributes
    SCENE_PRESETS = SCENE_PRESETS_FALLBACK;
  }
}

// Hardcoded fallback in case JSON fails to load
const SCENE_PRESETS_FALLBACK = {
  "interior-realistic": {
    name: "室內寫實", desc: "SketchUp → 照片級寫實", checkpoint: "Q5_K_S.gguf", checkpointFallback: "flux1-dev-fp8",
    controlnet: { enabled: true, type: "lineart", keyword: "union-pro", keywordFallback: "mistoline", strength: 0.45, preprocess: true, endPercent: 0.80 },
    denoise: 0.92,
    promptTemplate: "photorealistic interior design, fixed configuration, preserve architectural integrity, maintain original spatial layout, warm wood flooring, soft fabric furniture, recessed lighting, natural daylight from windows, professional architectural photography, ultra detailed, realistic materials and textures",
    negativeTemplate: "altered layout, moved furniture, modified decor, different room configuration, added objects, removed objects",
  },
};

// ---------- UI Elements ----------
const fileInput = document.getElementById("file-input");
const uploadSection = document.getElementById("upload-section");
const canvasWrapper = document.getElementById("canvas-wrapper");
const canvas = document.getElementById("preview-canvas");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");
const promptInput = document.getElementById("prompt-input");
const renderBtn = document.getElementById("render-btn");
const cancelRenderBtn = document.getElementById("cancel-render-btn");
const resultSection = document.getElementById("result-section");
const resultImg = document.getElementById("result-image");

const uploadLabel = document.getElementById("upload-label");
const filePreview = document.getElementById("file-preview");
const thumbImg = document.getElementById("thumb-img");
const thumbName = document.getElementById("thumb-name");
const removeFileBtn = document.getElementById("remove-file-btn");

// Progress UI
const renderProgress = document.getElementById("render-progress");
const renderStatus = document.getElementById("render-status");
const renderElapsed = document.getElementById("render-elapsed");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressPercent = document.getElementById("progress-percent");

// Model selector
const modelSelect = document.getElementById("model-select");
const modelHelpBtn = document.getElementById("model-help-btn");
const helpOverlay = document.getElementById("model-help-overlay");
const helpCloseBtn = document.getElementById("help-close-btn");

// ControlNet UI
const controlnetEnabled = document.getElementById("controlnet-enabled");
const controlnetOptions = document.getElementById("controlnet-options");
const controlnetType = document.getElementById("controlnet-type");
const controlnetModel = document.getElementById("controlnet-model");
const controlnetStrength = document.getElementById("controlnet-strength");
const cnStrengthVal = document.getElementById("cn-strength-val");
const controlnetPreprocess = document.getElementById("controlnet-preprocess");

// Steps & Denoise sliders (declared early for use in applyPreset)
const stepsSlider = document.getElementById("steps-slider");
const stepsValEl = document.getElementById("steps-val");

// AI Enhance UI
const aiEnhanceBtn = document.getElementById("ai-enhance-btn");
const negativePromptRow = document.getElementById("negative-prompt-row");
const negativePromptInput = document.getElementById("negative-prompt-input");
const aiThinkingPanel = document.getElementById("ai-thinking-panel");
const aiThinkingContent = document.getElementById("ai-thinking-content");
const aiThinkingTime = document.getElementById("ai-thinking-time");
const promptTranslationRow = document.getElementById("prompt-translation-row");
const promptTranslation = document.getElementById("prompt-translation");

// Style Reference (IP-Adapter) UI
const styleRefEnabled = document.getElementById("style-ref-enabled");
const styleRefOptions = document.getElementById("style-ref-options");
const styleRefInput = document.getElementById("style-ref-input");
const styleRefLabel = document.getElementById("style-ref-label");
const styleRefPreview = document.getElementById("style-ref-preview");
const styleRefThumb = document.getElementById("style-ref-thumb");
const styleRefRemove = document.getElementById("style-ref-remove");
const styleWeight = document.getElementById("style-weight");
const styleWeightVal = document.getElementById("style-weight-val");
const styleTransferMode = document.getElementById("style-transfer-mode");

// 3D Viewer UI
const modelViewerWrapper = document.getElementById("model-viewer-wrapper");
const modelPreview = document.getElementById("model-preview");
const modelUnsupported = document.getElementById("model-unsupported");

// ---------- State ----------
let currentTool = "brush"; // brush | color | shape
let brushColor = "#ff6b6b";
let brushSize = 4;
let isDrawing = false;
let startX = 0;
let startY = 0;
let cachedOriginalImage = null;
let currentUploadedDataURL = null; // in-memory fallback when localStorage is full
let is3DMode = false;
let current3DObjectURL = null;

// ---------- Undo State ----------
let undoStack = [];
const MAX_UNDO = 20;

function pushToUndoStack() {
  undoStack.push(canvas.toDataURL());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0) return;
  const previous = undoStack.pop();
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    saveCurrentState();
  };
  img.src = previous;
}

// ---------- Helper Functions ----------
function showCanvas() {
  canvasWrapper.classList.remove("hidden");
}

function loadImageToCanvas(dataURL) {
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    cachedOriginalImage = img;
    currentUploadedDataURL = dataURL;
    try {
      localStorage.setItem("uploadedImage", dataURL);
    } catch (err) {
      console.warn("localStorage quota exceeded, using in-memory fallback.", err);
    }
    showCanvas();
  };
  img.src = dataURL;
}

function exportCanvasBase64() {
  return canvas.toDataURL("image/png");
}

function saveCurrentState() {
  const annotation = exportCanvasBase64();
  try {
    localStorage.setItem("annotationImage", annotation);
  } catch (err) {
    console.warn("localStorage quota exceeded.", err);
  }
}

function restoreStateIfExists() {
  const uploaded = currentUploadedDataURL || localStorage.getItem("uploadedImage");
  const annotation = localStorage.getItem("annotationImage");
  if (uploaded) {
    uploadLabel.classList.add("hidden");
    filePreview.classList.remove("hidden");
    thumbName.textContent = "已上傳的檔案";
    thumbImg.src = uploaded;
    loadImageToCanvas(uploaded);
    if (annotation) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = annotation;
    }
  }
}

// ---------- Progress Bar Helpers ----------
let renderTimerInterval = null;

function updateProgress(value, max) {
  const pct = Math.round((value / max) * 100);
  if (progressBarFill) progressBarFill.style.width = pct + "%";
  if (progressPercent) progressPercent.textContent = `${value}/${max}`;
}

function resetProgress() {
  if (progressBarFill) progressBarFill.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "";
  if (renderElapsed) renderElapsed.textContent = "";
  if (renderTimerInterval) { clearInterval(renderTimerInterval); renderTimerInterval = null; }
  // Reset all steps
  document.querySelectorAll(".render-step").forEach((el) => {
    el.classList.remove("active", "completed");
  });
}

function startRenderTimer() {
  const start = Date.now();
  renderTimerInterval = setInterval(() => {
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    if (renderElapsed) renderElapsed.textContent = `${sec}s`;
  }, 100);
}

function setRenderStep(stepName) {
  const steps = ["upload", "queue", "render", "done"];
  const idx = steps.indexOf(stepName);
  steps.forEach((s, i) => {
    const el = document.getElementById(`step-${s}`);
    if (!el) return;
    el.classList.remove("active", "completed");
    if (i < idx) el.classList.add("completed");
    else if (i === idx) el.classList.add("active");
  });
}

// ---------- 3D File Helpers ----------
const SUPPORTED_3D_EXTENSIONS = [".glb", ".gltf", ".usdz"];
const ALL_3D_EXTENSIONS = [".glb", ".gltf", ".usdz", ".obj", ".skp"];

function getFileExtension(filename) {
  return filename.toLowerCase().slice(filename.lastIndexOf("."));
}

let modelViewerLoaded = false;
async function loadModelViewerScript() {
  if (modelViewerLoaded) return;
  modelViewerLoaded = true;
  try {
    await import("https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js");
  } catch (err) {
    console.warn("model-viewer 載入失敗:", err);
  }
}

function show3DViewer(file) {
  is3DMode = true;
  canvasWrapper.classList.add("hidden");

  const ext = getFileExtension(file.name);

  if (SUPPORTED_3D_EXTENSIONS.includes(ext)) {
    // Lazy-load model-viewer only when a 3D file is opened
    loadModelViewerScript();
    if (current3DObjectURL) URL.revokeObjectURL(current3DObjectURL);
    current3DObjectURL = URL.createObjectURL(file);
    modelPreview.src = current3DObjectURL;
    modelPreview.style.display = "block";
    modelUnsupported.classList.add("hidden");
  } else {
    // .obj, .skp — not supported in model-viewer
    modelPreview.style.display = "none";
    modelUnsupported.classList.remove("hidden");
  }

  modelViewerWrapper.classList.remove("hidden");
}

function hide3DViewer() {
  is3DMode = false;
  modelViewerWrapper.classList.add("hidden");
  modelPreview.removeAttribute("src");
  modelPreview.style.display = "block";
  modelUnsupported.classList.add("hidden");
  if (current3DObjectURL) {
    URL.revokeObjectURL(current3DObjectURL);
    current3DObjectURL = null;
  }
}

// ---------- File Upload ----------
uploadSection.addEventListener("click", (e) => {
  if (e.target.closest("label") || e.target === fileInput || e.target.closest(".file-preview")) return;
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadLabel.classList.add("hidden");
  filePreview.classList.remove("hidden");
  thumbName.textContent = file.name;

  const ext = getFileExtension(file.name);

  if (ALL_3D_EXTENSIONS.includes(ext)) {
    // 3D file
    thumbImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='gray' stroke-width='1.5'><path d='M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z'/></svg>";
    show3DViewer(file);
    try {
      // For 3D files, we won't store the raw data to localStorage (too large)
      currentUploadedDataURL = null;
  localStorage.removeItem("uploadedImage");
      localStorage.removeItem("annotationImage");
    } catch {}
  } else {
    // Image file
    hide3DViewer();
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataURL = ev.target.result;
      thumbImg.src = dataURL;
      loadImageToCanvas(dataURL);
    };
    reader.readAsDataURL(file);
  }
});

removeFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.value = "";
  filePreview.classList.add("hidden");
  uploadLabel.classList.remove("hidden");
  canvasWrapper.classList.add("hidden");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  thumbImg.src = "";
  thumbName.textContent = "";
  cachedOriginalImage = null;
  undoStack = [];
  hide3DViewer();
  currentUploadedDataURL = null;
  localStorage.removeItem("uploadedImage");
  localStorage.removeItem("annotationImage");
});

// ---------- Drag & Drop Upload ----------
uploadSection.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadSection.classList.add("drag-over");
});

uploadSection.addEventListener("dragleave", () => {
  uploadSection.classList.remove("drag-over");
});

uploadSection.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadSection.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  }
});

// ---------- Toolbar ----------
toolbar.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const tool = btn.dataset.tool;

  if (tool === "undo") {
    undo();
    return;
  }

  if (tool) {
    currentTool = tool;
    toolbar.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  if (tool === "color") {
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = brushColor;
    colorInput.style.position = "fixed";
    colorInput.style.opacity = "0";
    colorInput.style.pointerEvents = "none";
    document.body.appendChild(colorInput);
    colorInput.addEventListener("input", (ev) => {
      brushColor = ev.target.value;
    });
    colorInput.addEventListener("change", () => {
      colorInput.remove();
    });
    colorInput.addEventListener("blur", () => {
      setTimeout(() => { if (colorInput.parentNode) colorInput.remove(); }, 200);
    });
    colorInput.click();
  }
});

// ---------- Drawing Logic ----------
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const source = e.touches ? e.touches[0] : e;
  return {
    x: (source.clientX - rect.left) * scaleX,
    y: (source.clientY - rect.top) * scaleY,
  };
}

function handleDrawStart(x, y) {
  pushToUndoStack();
  if (currentTool === "brush") {
    isDrawing = true;
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  } else if (currentTool === "shape") {
    isDrawing = true;
    startX = x;
    startY = y;
  }
}

function handleDrawMove(x, y) {
  if (!isDrawing) return;
  if (currentTool === "brush") {
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (currentTool === "shape") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (cachedOriginalImage) {
      ctx.drawImage(cachedOriginalImage, 0, 0);
    }
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, x - startX, y - startY);
  }
}

function handleDrawEnd(x, y) {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentTool === "shape" && x !== undefined) {
    const w = x - startX;
    const h = y - startY;
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, w, h);
  }
  saveCurrentState();
}

canvas.addEventListener("mousedown", (e) => {
  const { x, y } = getCanvasCoords(e);
  handleDrawStart(x, y);
});
canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasCoords(e);
  handleDrawMove(x, y);
});
canvas.addEventListener("mouseup", (e) => {
  const { x, y } = getCanvasCoords(e);
  handleDrawEnd(x, y);
});
canvas.addEventListener("mouseleave", () => {
  if (isDrawing && currentTool === "brush") {
    ctx.closePath();
    isDrawing = false;
    saveCurrentState();
  }
});

// Touch events
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  handleDrawStart(x, y);
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  handleDrawMove(x, y);
}, { passive: false });
canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const touch = e.changedTouches[0];
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  handleDrawEnd(x, y);
}, { passive: false });

// Keyboard shortcut: Ctrl+Z / Cmd+Z
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }
});

// ---------- ControlNet UI ----------
controlnetEnabled.addEventListener("change", () => {
  controlnetOptions.classList.toggle("hidden", !controlnetEnabled.checked);
  localStorage.setItem("controlnetEnabled", controlnetEnabled.checked);
  if (controlnetEnabled.checked) loadControlNetModels();
});

controlnetStrength.addEventListener("input", () => {
  cnStrengthVal.textContent = controlnetStrength.value;
  localStorage.setItem("controlnetStrength", controlnetStrength.value);
});

controlnetType.addEventListener("change", () => {
  localStorage.setItem("controlnetType", controlnetType.value);
});

controlnetModel.addEventListener("change", () => {
  localStorage.setItem("controlnetModelName", controlnetModel.value);
  if (typeof updateCnModelDesc === "function") updateCnModelDesc();
});

controlnetPreprocess.addEventListener("change", () => {
  localStorage.setItem("controlnetPreprocess", controlnetPreprocess.checked);
});

// ---------- Style Reference (IP-Adapter) UI ----------
let styleRefImageData = null;

if (styleRefEnabled) {
  styleRefEnabled.addEventListener("change", () => {
    styleRefOptions.classList.toggle("hidden", !styleRefEnabled.checked);
    localStorage.setItem("styleRefEnabled", styleRefEnabled.checked);
  });
}

if (styleRefInput) {
  styleRefInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      styleRefImageData = ev.target.result;
      styleRefThumb.src = styleRefImageData;
      styleRefLabel.classList.add("hidden");
      styleRefPreview.classList.remove("hidden");
      try { localStorage.setItem("styleRefImage", styleRefImageData); } catch (_) {}
    };
    reader.readAsDataURL(file);
  });
}

if (styleRefRemove) {
  styleRefRemove.addEventListener("click", () => {
    styleRefImageData = null;
    styleRefThumb.src = "";
    styleRefLabel.classList.remove("hidden");
    styleRefPreview.classList.add("hidden");
    styleRefInput.value = "";
    localStorage.removeItem("styleRefImage");
  });
}

if (styleWeight) {
  styleWeight.addEventListener("input", () => {
    styleWeightVal.textContent = parseFloat(styleWeight.value).toFixed(2);
    localStorage.setItem("styleWeight", styleWeight.value);
  });
  const savedWeight = localStorage.getItem("styleWeight");
  if (savedWeight) { styleWeight.value = savedWeight; styleWeightVal.textContent = parseFloat(savedWeight).toFixed(2); }
}

if (styleTransferMode) {
  styleTransferMode.addEventListener("change", () => {
    localStorage.setItem("styleTransferMode", styleTransferMode.value);
  });
  const savedMode = localStorage.getItem("styleTransferMode");
  if (savedMode) styleTransferMode.value = savedMode;
}

// Restore style ref state
(function restoreStyleRef() {
  const enabled = localStorage.getItem("styleRefEnabled") === "true";
  if (styleRefEnabled) styleRefEnabled.checked = enabled;
  if (styleRefOptions) styleRefOptions.classList.toggle("hidden", !enabled);
  const savedImg = localStorage.getItem("styleRefImage");
  if (savedImg && styleRefThumb && styleRefLabel && styleRefPreview) {
    styleRefImageData = savedImg;
    styleRefThumb.src = savedImg;
    styleRefLabel.classList.add("hidden");
    styleRefPreview.classList.remove("hidden");
  }
})();

// ---------- AI Prompt Enhancement ----------
const SD_SYSTEM_PROMPT = `You are an interior design rendering prompt expert. Given a user's scene description (in any language, possibly brief keywords), generate a highly detailed, professional description for AI image generation.

CRITICAL RULES:
- Strictly adhere to the original interior design and spatial layout from the reference image.
- Do not modify, move, or alter any decorative elements, furniture, or architectural configurations.
- Focus only on enhancing photorealistic quality while keeping the fixed configuration bit-for-bit identical.
- Apply non-destructive editing principles — preserve architectural integrity at all times.

Your description style must follow this pattern — describe the scene element by element:
1. State the space type and overall style
2. Describe the focal furniture piece (shape, material, color)
3. Describe surrounding furniture and decorative items one by one
4. Describe materials and textures (wood type, fabric, stone, metal)
5. Describe lighting conditions and atmosphere
6. Describe the background and spatial depth

Example output style for "translation" field:
"室內設計 3D 渲染，呈現一個現代風格的客廳。畫面焦點是圓弧形的米色布沙發，上面擺放著幾個深橘色和棕色的抱枕。沙發前方是一張獨特的現代黑色單腳邊桌，上面放著一個咖啡杯。沙發旁邊是一塊具有抽象黑線圖案的淺色大地色系地毯。地毯上放著一張精美的大理石紋圓形咖啡桌。整體光線明亮自然，營造出舒適時尚的氛圍。"

Output ONLY a valid JSON object with exactly three fields:
- "positive": a detailed English prompt optimized for Stable Diffusion / FLUX image generation. MUST include these preservation keywords: "fixed configuration, preserve architectural integrity, maintain original spatial layout". Also include specific furniture descriptions, material names, lighting details, and quality tags (photorealistic, professional architectural photography, ultra detailed, 8K)
- "negative": a negative prompt that MUST include: "altered layout, moved furniture, modified decor, different room configuration". Also include: sketch lines, 3D model look, blurry, watermark, text, deformed
- "translation": a detailed Traditional Chinese (繁體中文) scene description following the element-by-element style shown above. Describe each piece of furniture, its material, color, and placement. End with overall atmosphere description

Do not include any explanation, markdown, or extra text. Output ONLY the JSON object.`;

async function enhancePromptWithAI(userText) {
  // Show thinking panel
  aiThinkingPanel.classList.remove("hidden", "done");
  aiThinkingContent.textContent = "";
  aiThinkingTime.textContent = "";
  const startTime = Date.now();
  const timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    aiThinkingTime.textContent = `${elapsed}s`;
  }, 100);

  try {
    // Use streaming to show thinking process in real-time
    const resp = await fetch(`${LLM_ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen",
        messages: [
          { role: "system", content: SD_SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        temperature: 0.7,
        max_tokens: 8000,
        stream: true,
      }),
    });

    if (!resp.ok) throw new Error(`LLM API 錯誤: HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let reasoningText = "";
    let contentText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Thinking/reasoning content
          if (delta.reasoning_content) {
            reasoningText += delta.reasoning_content;
            aiThinkingContent.textContent = reasoningText;
            // Auto-scroll to bottom
            aiThinkingContent.scrollTop = aiThinkingContent.scrollHeight;
          }
          // Final answer content
          if (delta.content) {
            contentText += delta.content;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    // Mark thinking as done
    clearInterval(timerInterval);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    aiThinkingTime.textContent = `${totalTime}s`;
    aiThinkingPanel.classList.add("done");
    aiThinkingPanel.querySelector(".ai-thinking-indicator span").textContent = "AI 分析完成";

    // Parse the content
    const trimmed = contentText.trim();
    if (!trimmed) throw new Error("LLM 未產生輸出（可能思考 token 不足）");

    let jsonStr = trimmed;
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const parsed = JSON.parse(jsonStr);
    if (!parsed.positive) throw new Error("LLM 輸出缺少 positive 欄位");
    return parsed;
  } catch (err) {
    clearInterval(timerInterval);
    aiThinkingPanel.classList.add("done");
    throw err;
  }
}

aiEnhanceBtn.addEventListener("click", async () => {
  const userText = promptInput.value.trim();
  if (!userText) {
    alert("請先輸入描述文字");
    return;
  }

  aiEnhanceBtn.disabled = true;
  const originalText = aiEnhanceBtn.querySelector("span").textContent;
  aiEnhanceBtn.querySelector("span").textContent = "思考中...";

  try {
    const result = await enhancePromptWithAI(userText);
    promptInput.value = result.positive;
    if (result.negative) {
      negativePromptInput.value = result.negative;
      negativePromptRow.classList.remove("hidden");
    }
    if (result.translation && promptTranslationRow && promptTranslation) {
      promptTranslation.textContent = result.translation;
      promptTranslationRow.classList.remove("hidden");
    }
  } catch (err) {
    console.error("AI enhance error:", err);
    alert(`AI 優化失敗: ${err.message}\n\n請確認 LLM 服務 (${LLM_ENDPOINT}) 是否正常運行`);
  } finally {
    aiEnhanceBtn.disabled = false;
    aiEnhanceBtn.querySelector("span").textContent = originalText;
  }
});

// ---------- Model Architecture Detection ----------
function detectModelArch(name) {
  const n = name.toLowerCase();
  if (n.includes("xl") || n.includes("sdxl")) return "SDXL";
  if (n.includes("flux")) return "FLUX";
  if (n.includes("sd3")) return "SD3";
  // GGUF diffusion models are FLUX-based (e.g. flux1-dev-Q5_K_S.gguf)
  if (n.endsWith(".gguf")) return "FLUX";
  if (n.includes("interiorscene")) return "SDXL";
  // SD 1.5 indicators
  if (n.includes("sd15") || n.includes("v11p") || n.includes("v11f")) return "SD1.5";
  // Default heuristic: common SD1.5-only model families
  if (n.includes("dreamshaper") || n.includes("realistic") || n.includes("deliberate") || n.includes("serenity")) return "SD1.5";
  return "unknown";
}

// ---------- Model Descriptions ----------
const CHECKPOINT_INFO = {
  interiorscene:{ style: "⭐ 室內設計專用", desc: "InteriorSceneXL — 室內設計專用模型，自動搭配室內設計 LoRA + 專用 VAE" },
  noobai:       { style: "動漫／插畫", desc: "NoobAI — 高品質動漫插畫，支援 V-Prediction" },
  realvis:      { style: "寫實攝影", desc: "RealVisXL — 照片級寫實，適合室內外場景渲染" },
  dreamshaper:  { style: "通用創意", desc: "DreamShaper — 風格多變，兼顧寫實與插畫" },
  juggernaut:   { style: "寫實／精緻", desc: "Juggernaut — 高細節寫實，人像與場景表現優秀" },
  nightvision:  { style: "暗色／夜景", desc: "NightVision — 擅長夜景、低光、電影氛圍" },
  serenity:     { style: "柔和寫實", desc: "Serenity — 柔和色調，適合自然光場景" },
  zavychroma:   { style: "高飽和寫實", desc: "ZavyChroma — 色彩鮮豔、高對比度的寫實風格" },
  "flux1-dev-fp8":{ style: "⭐ FLUX 最佳品質", desc: "FLUX.1-dev fp8 — 最高品質 FLUX 模型，搭配 MistoLine + 室內 LoRA 最強室內渲染" },
  "flux1-dev-q5":{ style: "⭐ FLUX GGUF 推薦", desc: "FLUX.1-dev Q5 GGUF — 品質接近 fp16，VRAM 僅 ~8.5GB，完美支援 RTX 5070 Ti + LoRA" },
  "flux1-dev-q4":{ style: "FLUX GGUF 輕量", desc: "FLUX.1-dev Q4 GGUF — 更小更快，品質略低於 Q5，適合快速預覽" },
  "flux1-dev-q8":{ style: "FLUX GGUF 高品質", desc: "FLUX.1-dev Q8 GGUF — 接近原版品質，VRAM 需求較大（~12GB）" },
  flux1dev:     { style: "FLUX 高品質", desc: "FLUX.1-dev — 高品質通用模型，20-30 步出圖" },
  flux1schnell: { style: "快速生成", desc: "FLUX.1-schnell — 極速模型，4 步即可出圖" },
  krea:         { style: "FLUX 寫實渲染", desc: "FLUX Krea Dev — 搭配室內 LoRA，室內設計渲染" },
  kontext:      { style: "FLUX 圖像編輯", desc: "FLUX Kontext Dev — 圖像編輯和風格轉換" },
};

function getCheckpointInfo(name) {
  const n = name.toLowerCase();
  for (const [key, info] of Object.entries(CHECKPOINT_INFO)) {
    if (n.includes(key)) return info;
  }
  return null;
}

const CONTROLNET_INFO = {
  canny:      { func: "邊緣偵測", desc: "偵測圖片邊緣輪廓，精確保留線條結構" },
  depth:      { func: "深度圖", desc: "分析場景深度，保持空間透視關係" },
  lineart:    { func: "線稿", desc: "提取乾淨線稿，適合插畫風格轉換" },
  softedge:   { func: "柔邊偵測", desc: "柔和邊緣提取，效果比 Canny 更自然" },
  scribble:   { func: "塗鴉", desc: "從粗略手繪草圖生成圖像" },
  openpose:   { func: "姿態偵測", desc: "辨識人體骨架姿態，控制人物動作" },
  tile:       { func: "細節增強", desc: "保留原圖細節進行高解析度放大" },
  inpaint:    { func: "局部重繪", desc: "遮罩區域重新生成，保留其餘部分" },
  normalbae:  { func: "法線圖", desc: "分析表面法線方向，精確控制光影" },
  seg:        { func: "語意分割", desc: "按區塊語意分割，獨立控制各區域" },
  qrcode:     { func: "QR Code", desc: "將 QR Code 嵌入生成圖像中" },
  mistoline:  { func: "⭐ FLUX 線稿專用", desc: "MistoLine — FLUX 專用線稿 ControlNet，最適合 SketchUp 線圖轉寫實" },
  union:      { func: "多合一", desc: "Union — 單一模型支援多種控制類型" },
};

function getControlNetInfo(name) {
  const n = name.toLowerCase();
  for (const [key, info] of Object.entries(CONTROLNET_INFO)) {
    if (n.includes(key)) return info;
  }
  return null;
}

const modelDesc = document.getElementById("model-desc");
const cnModelDesc = document.getElementById("cn-model-desc");

function checkModelCompatibility(checkpointName, controlnetName) {
  const ckptArch = detectModelArch(checkpointName);
  const cnArch = detectModelArch(controlnetName);
  if (ckptArch === "unknown" || cnArch === "unknown") return null; // can't determine
  // Union ControlNet and MistoLine are cross-compatible
  const cnLower = controlnetName.toLowerCase();
  if (cnLower.includes("union") || cnLower.includes("mistoline")) return null;
  if (ckptArch !== cnArch) {
    return `Checkpoint 是 ${ckptArch} 架構，但 ControlNet 是 ${cnArch} 架構。\n兩者必須使用相同架構，否則會出現 tensor shape 錯誤。`;
  }
  return null;
}

// ---------- Build ComfyUI Workflow JSON ----------
// LoRA auto-selection based on checkpoint
function getAutoLora(selectedModel) {
  const n = selectedModel.toLowerCase();
  // InteriorSceneXL — already fine-tuned for interior, no extra LoRA needed
  // JuggernautXL / RealVisXL → use xsarchitectural for better interior rendering
  if (n.includes("juggernaut") || n.includes("realvis")) return { name: "xsarchitectural-7.safetensors", strength: 0.4 };
  return null;
}

function buildWorkflowJSON(imageName, promptText, negativeText, selectedModel, controlnetOpts, styleRefOpts) {
  const arch = detectModelArch(selectedModel);

  // ===== FLUX workflow =====
  if (arch === "FLUX") {
    const denoiseVal = parseFloat(document.getElementById("denoise-slider")?.value ?? 0.75);
    const fluxSteps = parseInt(document.getElementById("steps-slider")?.value ?? 25, 10);
    const fluxParams = DEFAULT_PARAMS?.workflow?.flux || {};
    const fluxCfg = fluxParams.cfg ?? 1.0;
    const fluxSampler = fluxParams.sampler || "euler";
    const fluxScheduler = fluxParams.scheduler || "simple";
    const dimMultiple = fluxParams.dimensionMultiple || 16;
    const minDim = fluxParams.minDimension || 512;

    // Calculate image dimensions rounded to nearest multiple of dimensionMultiple (FLUX requirement)
    let fluxW = Math.round(canvas.width / dimMultiple) * dimMultiple || (fluxParams.defaultWidth || 1024);
    let fluxH = Math.round(canvas.height / dimMultiple) * dimMultiple || (fluxParams.defaultHeight || 768);
    // Cap to maxPixels to fit in VRAM
    const maxPixels = fluxParams.maxPixels || (768 * 512);
    if (fluxW * fluxH > maxPixels) {
      const scale = Math.sqrt(maxPixels / (fluxW * fluxH));
      fluxW = Math.round((fluxW * scale) / dimMultiple) * dimMultiple;
      fluxH = Math.round((fluxH * scale) / dimMultiple) * dimMultiple;
    }
    fluxW = Math.max(minDim, fluxW);
    fluxH = Math.max(minDim, fluxH);
    console.log(`[FLUX] Image resize: ${canvas.width}x${canvas.height} → ${fluxW}x${fluxH}`);

    // FLUX uses UNETLoader + DualCLIPLoader + VAELoader (not CheckpointLoaderSimple)
    // For GGUF models, use UnetLoaderGGUF (no weight_dtype needed — uses native CUDA kernels)
    const isGGUF = selectedModel.toLowerCase().endsWith(".gguf");
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: Math.floor(Math.random() * 1000000000),
          steps: fluxSteps,
          cfg: fluxCfg,
          sampler_name: fluxSampler,
          scheduler: fluxScheduler,
          denoise: denoiseVal,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["8", 0],
        },
      },
      "4": isGGUF
        ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: selectedModel } }
        : { class_type: "UNETLoader", inputs: { unet_name: selectedModel, weight_dtype: "fp8_e4m3fn" } },
      "5": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "clip_l.safetensors",
          clip_name2: "t5xxl_fp8_e4m3fn.safetensors",
          type: "flux",
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: promptText, clip: ["5", 0] },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: { text: "", clip: ["5", 0] },
      },
      // Node 19: Resize image to FLUX-compatible dimensions (must be multiple of 16)
      "19": {
        class_type: "ImageScale",
        inputs: {
          image: ["10", 0],
          upscale_method: "lanczos",
          width: fluxW,
          height: fluxH,
          crop: "disabled",
        },
      },
      "8": {
        class_type: "VAEEncode",
        inputs: { pixels: ["19", 0], vae: ["15", 0] },
      },
      "9": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "RenderApp", images: ["11", 0] },
      },
      "10": {
        class_type: "LoadImage",
        inputs: { image: imageName },
      },
      "11": {
        class_type: "VAEDecode",
        inputs: { samples: ["3", 0], vae: ["15", 0] },
      },
      "15": {
        class_type: "VAELoader",
        inputs: { vae_name: "flux_vae.safetensors" },
      },
    };

    // Add interior-flux-lora for interior design rendering
    // NOTE: Skip LoRA for fp8 models — LoRA merges weights back to fp8 causing CUDA "mul_cuda not implemented" error
    // GGUF models use native CUDA kernels and CAN safely use LoRA
    const fluxModel = selectedModel.toLowerCase();
    const isFp8Model = fluxModel.includes("fp8") && !isGGUF;
    if (!isFp8Model && (fluxModel.includes("krea") || fluxModel.includes("dev") || isGGUF)) {
      workflow["16"] = {
        class_type: "LoraLoader",
        inputs: {
          model: ["4", 0],
          clip: ["5", 0],
          lora_name: "interior-flux-lora.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      };
      // Rewire to use LoRA output
      workflow["3"].inputs.model = ["16", 0];
      workflow["6"].inputs.clip = ["16", 1];
      workflow["7"].inputs.clip = ["16", 1];
    }

    // Add ControlNet nodes if enabled (FLUX ControlNet Union Pro 2.0)
    if (controlnetOpts && controlnetOpts.enabled && controlnetOpts.modelName) {
      workflow["12"] = {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: controlnetOpts.modelName },
      };

      // For FLUX Union ControlNet, set the mode type
      const isUnionCN = controlnetOpts.modelName.toLowerCase().includes("union");
      if (isUnionCN) {
        const unionTypeMap = {
          depth: "depth",
          canny: "canny/lineart/anime_lineart/mlsd",
          lineart: "canny/lineart/anime_lineart/mlsd",
          softedge: "hed/pidi/scribble/ted",
          scribble: "hed/pidi/scribble/ted",
          tile: "tile",
          inpaint: "repaint",
        };
        workflow["17"] = {
          class_type: "SetUnionControlNetType",
          inputs: {
            control_net: ["12", 0],
            type: unionTypeMap[controlnetOpts.type] || "auto",
          },
        };
      }

      // GGUF models: auto-optimize ControlNet params for best quality
      // GGUF feeds raw SketchUp images to CN → must enable preprocessor to extract edges only
      // Also reduce strength and end_percent to give more creative freedom
      let cnStrength = parseFloat(controlnetOpts.strength);
      let cnEndPercent = parseFloat(controlnetOpts.endPercent ?? 1);
      let forcePreprocess = controlnetOpts.preprocess;
      if (isGGUF && !controlnetOpts.preprocess) {
        console.log("[GGUF] Auto-enabling preprocessor + adjusting CN params for optimal quality");
        forcePreprocess = true;
        cnStrength = Math.min(cnStrength, 0.45);
        cnEndPercent = Math.min(cnEndPercent, 0.80);
        // Also boost denoise if too low for line-art → photorealistic conversion
        if (workflow["3"].inputs.denoise < 0.88) {
          console.log(`[GGUF] Auto-adjusting denoise: ${workflow["3"].inputs.denoise} → 0.92`);
          workflow["3"].inputs.denoise = 0.92;
        }
        // Reduce steps for GGUF (Blackwell dequant is slower per step, 20 steps is sufficient with euler+simple)
        if (workflow["3"].inputs.steps > 20) {
          console.log(`[GGUF] Auto-adjusting steps: ${workflow["3"].inputs.steps} → 20`);
          workflow["3"].inputs.steps = 20;
        }
      }

      // Use resized image ["19", 0] for ControlNet (must match FLUX latent dimensions)
      let cnImageSource = ["19", 0];

      if (forcePreprocess) {
        const preprocessorMap = {
          canny: { class_type: "CannyEdgePreprocessor", inputs: { image: ["19", 0], low_threshold: 100, high_threshold: 200, resolution: fluxW } },
          depth: { class_type: "MiDaS-DepthMapPreprocessor", inputs: { image: ["19", 0], a: 6.283185307179586, bg_threshold: 0.1, resolution: fluxW } },
          softedge: { class_type: "HEDPreprocessor", inputs: { image: ["19", 0], safe: "enable", resolution: fluxW } },
          lineart: { class_type: "LineArtPreprocessor", inputs: { image: ["19", 0], coarse: "disable", resolution: fluxW } },
          scribble: { class_type: "ScribblePreprocessor", inputs: { image: ["19", 0], resolution: fluxW } },
        };
        const preprocessor = preprocessorMap[controlnetOpts.type];
        if (preprocessor) {
          workflow["13"] = preprocessor;
          cnImageSource = ["13", 0];
        }
      }

      const cnSource = isUnionCN ? ["17", 0] : ["12", 0];
      workflow["14"] = {
        class_type: "ControlNetApplyAdvanced",
        inputs: {
          positive: ["6", 0],
          negative: ["7", 0],
          control_net: cnSource,
          image: cnImageSource,
          vae: ["15", 0],
          strength: cnStrength,
          start_percent: 0,
          end_percent: cnEndPercent,
        },
      };

      workflow["3"].inputs.positive = ["14", 0];
      workflow["3"].inputs.negative = ["14", 1];
    }

    return workflow;
  }

  // ===== SD1.5 / SDXL workflow (default) =====
  const isXL = arch === "SDXL";
  const denoiseVal = parseFloat(document.getElementById("denoise-slider")?.value ?? 0.82);
  const sdParams = DEFAULT_PARAMS?.workflow?.sd || {};
  const sdDenoiseThreshold = sdParams.stepsXL_denoiseThreshold ?? 0.70;
  const sdSteps = isXL
    ? (denoiseVal >= sdDenoiseThreshold ? (sdParams.stepsXL_highDenoise || 35) : (sdParams.stepsXL_lowDenoise || 28))
    : (sdParams.stepsDefault || 25);
  const sdCfg = isXL ? (sdParams.cfgXL ?? 6) : (sdParams.cfg ?? 7);
  const sdSampler = sdParams.sampler || "dpmpp_2m";
  const sdScheduler = sdParams.scheduler || "karras";

  const workflow = {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1000000000),
        steps: sdSteps,
        cfg: sdCfg,
        sampler_name: sdSampler,
        scheduler: sdScheduler,
        denoise: denoiseVal,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["8", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: selectedModel },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: promptText, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: negativeText || (sdParams.defaultNegative || "text, watermark, ugly, lowres, bad quality"), clip: ["4", 1] },
    },
    "8": denoiseVal >= 0.95
      ? {
          // txt2img mode: generate from empty latent (no SketchUp pixels in latent space)
          class_type: "EmptyLatentImage",
          inputs: { width: isXL ? (sdParams.defaultWidthXL || 1344) : (sdParams.defaultWidth || 768), height: isXL ? (sdParams.defaultHeightXL || 768) : (sdParams.defaultHeight || 512), batch_size: 1 },
        }
      : {
          // img2img mode: encode uploaded image into latent space
          class_type: "VAEEncode",
          inputs: { pixels: ["10", 0], vae: ["4", 2] },
        },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "RenderApp", images: ["11", 0] },
    },
    "10": {
      class_type: "LoadImage",
      inputs: { image: imageName },
    },
    "11": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
  };

  // Use dedicated SDXL VAE for better color/detail quality
  if (isXL) {
    workflow["15"] = {
      class_type: "VAELoader",
      inputs: { vae_name: "sdxl_vae.safetensors" },
    };
    // Rewire VAE references from checkpoint ["4",2] to dedicated VAE ["15",0]
    if (workflow["8"].class_type === "VAEEncode") {
      workflow["8"].inputs.vae = ["15", 0];
    }
    workflow["11"].inputs.vae = ["15", 0];
  }

  // Add LoRA if auto-detected for this checkpoint
  const autoLora = getAutoLora(selectedModel);
  if (autoLora) {
    // Node 16: LoraLoader — insert between checkpoint and everything else
    workflow["16"] = {
      class_type: "LoraLoader",
      inputs: {
        model: ["4", 0],
        clip: ["4", 1],
        lora_name: autoLora.name,
        strength_model: autoLora.strength,
        strength_clip: autoLora.strength,
      },
    };
    // Rewire: KSampler, CLIP encoders, IP-Adapter all use LoRA output
    workflow["3"].inputs.model = ["16", 0];
    workflow["6"].inputs.clip = ["16", 1];
    workflow["7"].inputs.clip = ["16", 1];
  }

  // Add ControlNet nodes if enabled
  if (controlnetOpts && controlnetOpts.enabled && controlnetOpts.modelName) {
    const isUnionCN = controlnetOpts.modelName.toLowerCase().includes("union");

    // Node 12: Load ControlNet model
    workflow["12"] = {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: controlnetOpts.modelName },
    };

    // For Union ControlNet, set the mode type
    if (isUnionCN) {
      const unionTypeMap = {
        depth: "depth",
        canny: "canny/lineart/anime_lineart/mlsd",
        lineart: "canny/lineart/anime_lineart/mlsd",
        softedge: "hed/pidi/scribble/ted",
        scribble: "hed/pidi/scribble/ted",
        openpose: "openpose",
        tile: "tile",
        normal: "normal",
        segment: "segment",
        inpaint: "repaint",
      };
      workflow["17"] = {
        class_type: "SetUnionControlNetType",
        inputs: {
          control_net: ["12", 0],
          type: unionTypeMap[controlnetOpts.type] || "auto",
        },
      };
    }

    // Determine the image source for ControlNet
    let cnImageSource = ["10", 0]; // default: use the uploaded image directly

    // Node 13: Preprocessor (optional)
    if (controlnetOpts.preprocess) {
      const ppRes = isXL ? 1024 : 512;
      const preprocessorMap = {
        canny: { class_type: "CannyEdgePreprocessor", inputs: { image: ["10", 0], low_threshold: 100, high_threshold: 200, resolution: ppRes } },
        depth: { class_type: "MiDaS-DepthMapPreprocessor", inputs: { image: ["10", 0], a: 6.283185307179586, bg_threshold: 0.1, resolution: ppRes } },
        softedge: { class_type: "HEDPreprocessor", inputs: { image: ["10", 0], safe: "enable", resolution: ppRes } },
        lineart: { class_type: "LineArtPreprocessor", inputs: { image: ["10", 0], coarse: "disable", resolution: ppRes } },
        scribble: { class_type: "ScribblePreprocessor", inputs: { image: ["10", 0], resolution: ppRes } },
        openpose: { class_type: "OpenposePreprocessor", inputs: { image: ["10", 0], detect_hand: "enable", detect_body: "enable", detect_face: "enable", resolution: ppRes } },
      };
      const preprocessor = preprocessorMap[controlnetOpts.type];
      if (preprocessor) {
        workflow["13"] = preprocessor;
        cnImageSource = ["13", 0];
      }
    }

    // Node 14: Apply ControlNet (use dedicated VAE if available, else checkpoint VAE)
    const cnVaeSource = workflow["15"] ? ["15", 0] : ["4", 2];
    const cnSource = isUnionCN ? ["17", 0] : ["12", 0];
    workflow["14"] = {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["6", 0],
        negative: ["7", 0],
        control_net: cnSource,
        image: cnImageSource,
        vae: cnVaeSource,
        strength: parseFloat(controlnetOpts.strength),
        start_percent: 0,
        end_percent: 1,
      },
    };

    // Rewire KSampler to use ControlNet conditioned outputs
    workflow["3"].inputs.positive = ["14", 0];
    workflow["3"].inputs.negative = ["14", 1];
  }

  // Add IP-Adapter (Style Reference) nodes if enabled — SD1.5/SDXL only
  if (styleRefOpts && styleRefOpts.enabled && styleRefOpts.imageName) {
    const ipaWeight = parseFloat(styleRefOpts.weight || 0.8);
    const isStyleOnly = styleRefOpts.mode === "style-only";

    // Node 20: Load IP-Adapter model manually
    const ipaModelFile = isXL ? "ip-adapter_sdxl_vit-h.safetensors" : "ip-adapter_sd15.safetensors";
    workflow["20"] = {
      class_type: "IPAdapterModelLoader",
      inputs: {
        ipadapter_file: ipaModelFile,
      },
    };

    // Node 23: Load CLIP Vision model manually
    const clipVisionFile = isXL ? "clip-vision_vit-h.safetensors" : "clip-vision_vit-h.safetensors";
    workflow["23"] = {
      class_type: "CLIPVisionLoader",
      inputs: {
        clip_name: clipVisionFile,
      },
    };

    // Node 21: Load style reference image
    workflow["21"] = {
      class_type: "LoadImage",
      inputs: { image: styleRefOpts.imageName },
    };

    // Node 22: Apply IP-Adapter (model source: LoRA output if available, else checkpoint)
    const ipaModelSource = autoLora ? ["16", 0] : ["4", 0];
    if (isStyleOnly) {
      workflow["22"] = {
        class_type: "IPAdapterPreciseStyleTransfer",
        inputs: {
          model: ipaModelSource,
          ipadapter: ["20", 0],
          clip_vision: ["23", 0],
          image: ["21", 0],
          weight: ipaWeight,
          style_boost: 1.0,
          combine_embeds: "concat",
          start_at: 0.0,
          end_at: 1.0,
          embeds_scaling: "V only",
        },
      };
    } else {
      // Style+Composition mode: style from reference, composition from ORIGINAL uploaded image
      workflow["22"] = {
        class_type: "IPAdapterStyleComposition",
        inputs: {
          model: ipaModelSource,
          ipadapter: ["20", 0],
          clip_vision: ["23", 0],
          image_style: ["21", 0],
          image_composition: ["10", 0],  // use original uploaded image for layout
          weight_style: ipaWeight,
          weight_composition: 1.0,  // strong composition preservation
          expand_style: false,
          combine_embeds: "average",
          start_at: 0.0,
          end_at: 1.0,
          embeds_scaling: "V only",
        },
      };
    }

    // Rewire: KSampler model → IP-Adapter output model
    workflow["3"].inputs.model = ["22", 0];
  }

  return workflow;
}

// ---------- Refine & Upscale Workflows ----------
function buildRefineWorkflow(imageName, promptText, selectedModel) {
  const isGGUF = selectedModel.toLowerCase().endsWith(".gguf");
  const arch = detectModelArch(selectedModel);
  if (arch === "FLUX") {
    return {
      "10": { class_type: "LoadImage", inputs: { image: imageName } },
      "4": isGGUF
        ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: selectedModel } }
        : { class_type: "UNETLoader", inputs: { unet_name: selectedModel, weight_dtype: "fp8_e4m3fn" } },
      "5": { class_type: "DualCLIPLoader", inputs: { clip_name1: "clip_l.safetensors", clip_name2: "t5xxl_fp8_e4m3fn.safetensors", type: "flux" } },
      "15": { class_type: "VAELoader", inputs: { vae_name: "flux_vae.safetensors" } },
      "6": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["5", 0] } },
      "7": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["5", 0] } },
      "8": { class_type: "VAEEncode", inputs: { pixels: ["10", 0], vae: ["15", 0] } },
      "3": { class_type: "KSampler", inputs: {
        seed: Math.floor(Math.random() * 1000000000),
        steps: 15, cfg: 1.0, sampler_name: "euler", scheduler: "simple",
        denoise: 0.35, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["8", 0]
      }},
      "11": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["15", 0] } },
      "9": { class_type: "SaveImage", inputs: { filename_prefix: "Refined", images: ["11", 0] } },
    };
  }
  // SDXL / SD1.5 fallback
  return {
    "10": { class_type: "LoadImage", inputs: { image: imageName } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: selectedModel } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: promptText, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: "blurry, low quality", clip: ["4", 1] } },
    "8": { class_type: "VAEEncode", inputs: { pixels: ["10", 0], vae: ["4", 2] } },
    "3": { class_type: "KSampler", inputs: {
      seed: Math.floor(Math.random() * 1000000000),
      steps: 20, cfg: 7.0, sampler_name: "euler_ancestral", scheduler: "normal",
      denoise: 0.35, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["8", 0]
    }},
    "11": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "Refined", images: ["11", 0] } },
  };
}

function buildUpscaleWorkflow(imageName) {
  return {
    "10": { class_type: "LoadImage", inputs: { image: imageName } },
    "40": { class_type: "UpscaleModelLoader", inputs: { model_name: "Real_HAT_GAN_sharper.pth" } },
    "41": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["40", 0], image: ["10", 0] } },
    "42": { class_type: "ImageScale", inputs: { image: ["41", 0], upscale_method: "lanczos", width: 1632, height: 1024, crop: "disabled" } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "Upscaled", images: ["42", 0] } },
  };
}

// Re-upload a ComfyUI output image back to input folder for use in next workflow
async function reuploadToInput(imageFile) {
  const viewUrl = `${COMFYUI_ENDPOINT}/view?filename=${encodeURIComponent(imageFile.filename)}&subfolder=${encodeURIComponent(imageFile.subfolder || "")}&type=${encodeURIComponent(imageFile.type || "output")}`;
  const resp = await fetch(viewUrl);
  const blob = await resp.blob();
  const formData = new FormData();
  formData.append("image", blob, imageFile.filename);
  formData.append("overwrite", "true");
  const uploadResp = await fetch(`${COMFYUI_ENDPOINT}/upload/image`, { method: "POST", body: formData });
  if (!uploadResp.ok) throw new Error("重新上傳圖片失敗");
  const uploadData = await uploadResp.json();
  return uploadData.name;
}

// Submit a workflow and wait for result (returns image file info)
async function submitAndWait(workflow, statusText) {
  const clientId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  const reqBody = { prompt: workflow, client_id: clientId };
  const resp = await fetch(`${COMFYUI_ENDPOINT}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  if (!resp.ok) throw new Error(`ComfyUI 排程失敗: HTTP ${resp.status}`);
  const data = await resp.json();
  const promptId = data.prompt_id;

  if (renderStatus) renderStatus.textContent = statusText || "處理中...";

  let result = null;
  try {
    result = await waitForResultViaWS(promptId, clientId);
  } catch {
    result = await pollForResult(promptId);
  }
  if (!result) throw new Error("處理超時");
  return result;
}

// ---------- WebSocket-based Render with HTTP Fallback ----------
function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(",")[1]);
  const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

async function pollForResult(promptId) {
  let renderedImageFile = null;
  let pollCount = 0;
  const MAX_POLLS = 900; // 900 × 2s = 30 minutes — GGUF on Blackwell is ~50s/step

  while (!renderedImageFile && pollCount < MAX_POLLS) {
    pollCount++;
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const historyResp = await fetch(`${COMFYUI_ENDPOINT}/history/${promptId}`);
      if (!historyResp.ok) continue;
      const historyData = await historyResp.json();
      const entry = historyData[promptId];
      if (!entry) continue;

      // Check for execution errors
      const status = entry.status;
      if (status && status.status_str === "error") {
        const errMsg = status.messages
          ?.find((m) => m[0] === "execution_error")?.[1];
        throw new Error(
          `ComfyUI 執行錯誤 (${errMsg?.node_type || "unknown"}): ${errMsg?.exception_message || "未知錯誤"}`
        );
      }

      if (entry.outputs) {
        const outputs = entry.outputs;
        for (const nodeId in outputs) {
          if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
            renderedImageFile = outputs[nodeId].images[0];
            break;
          }
        }
      }
    } catch (e) {
      if (e.message.startsWith("ComfyUI")) throw e; // re-throw ComfyUI errors
      // continue polling for network errors
    }
  }
  return renderedImageFile;
}

function waitForResultViaWS(promptId, clientId) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(`${COMFYUI_WS_ENDPOINT}/ws?clientId=${clientId}`);
    } catch {
      reject(new Error("WebSocket not available"));
      return;
    }

    let connected = false;

    // Quick connection timeout — if WS doesn't open in 5s, fall back
    const connectTimeout = setTimeout(() => {
      if (!connected) {
        ws.close();
        reject(new Error("WebSocket connect timeout"));
      }
    }, 5000);

    ws.onopen = () => {
      connected = true;
      clearTimeout(connectTimeout);
    };

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket timeout"));
    }, 1800000); // 30 minutes — GGUF on Blackwell ~50s/step, full pipeline needs time

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "progress" && msg.data) {
          updateProgress(msg.data.value, msg.data.max);
          if (renderStatus) renderStatus.textContent = `渲染中 (${msg.data.value}/${msg.data.max})...`;
        }

        if (msg.type === "executing" && msg.data) {
          if (msg.data.node === null && msg.data.prompt_id === promptId) {
            // Execution complete
            clearTimeout(timeout);
            ws.close();
            // Fetch result from history
            fetch(`${COMFYUI_ENDPOINT}/history/${promptId}`)
              .then((r) => r.json())
              .then((historyData) => {
                const entry = historyData[promptId];
                if (!entry) { reject(new Error("找不到渲染結果")); return; }

                // Check for errors in history
                const status = entry.status;
                if (status && status.status_str === "error") {
                  const errMsg = status.messages?.find((m) => m[0] === "execution_error")?.[1];
                  reject(new Error(`ComfyUI 執行錯誤 (${errMsg?.node_type || "unknown"}): ${errMsg?.exception_message || "未知錯誤"}`));
                  return;
                }

                if (entry.outputs) {
                  const outputs = entry.outputs;
                  for (const nodeId in outputs) {
                    if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
                      resolve(outputs[nodeId].images[0]);
                      return;
                    }
                  }
                }
                reject(new Error("渲染完成但未找到輸出圖片"));
              })
              .catch(reject);
          }
        }

        if (msg.type === "execution_error" && msg.data && msg.data.prompt_id === promptId) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error("ComfyUI 執行錯誤: " + (msg.data.exception_message || "unknown")));
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error"));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };
  });
}

// ---------- Render Request ----------
renderBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    alert("請輸入渲染提示文字");
    return;
  }
  const uploaded = currentUploadedDataURL || localStorage.getItem("uploadedImage");
  if (!uploaded && !is3DMode) {
    alert("請先上傳圖片或模型");
    return;
  }

  // For 3D mode, capture the model-viewer as an image
  let annotation;
  if (is3DMode && modelPreview.src) {
    try {
      const blob = await modelPreview.toBlob({ idealAspect: true });
      annotation = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      alert("無法擷取 3D 模型截圖，請改用圖片上傳");
      return;
    }
  } else {
    annotation = exportCanvasBase64();
  }

  renderBtn.disabled = true;
  renderBtn.textContent = "渲染中...";
  if (cancelRenderBtn) cancelRenderBtn.classList.remove("hidden");
  resetProgress();
  startRenderTimer();
  if (renderProgress) renderProgress.classList.remove("hidden");

  try {
    // Step 1: Upload image
    setRenderStep("upload");
    if (renderStatus) renderStatus.textContent = "上傳草圖至 ComfyUI...";
    const blob = dataURItoBlob(annotation);
    const formData = new FormData();
    formData.append("image", blob, "canvas_annotation.png");

    let uploadResp;
    try {
      uploadResp = await fetch(`${COMFYUI_ENDPOINT}/upload/image`, {
        method: "POST",
        body: formData,
      });
      if (!uploadResp.ok) throw new Error("Image upload failed");
    } catch (e) {
      console.error(e);
      alert(`無法連接至 ComfyUI API (${COMFYUI_ENDPOINT})。請確認本機有開啟且加上 --enable-cors-header`);
      renderBtn.disabled = false;
      renderBtn.textContent = "渲染";
      return;
    }
    const uploadData = await uploadResp.json();
    const imageName = uploadData.name;

    // Step 2: Build & send workflow
    setRenderStep("queue");
    if (renderStatus) renderStatus.textContent = "送出渲染任務...";

    const selectedModel = modelSelect.value;
    if (!selectedModel) {
      alert("請先選擇一個模型");
      renderBtn.disabled = false;
      renderBtn.textContent = "渲染";
      if (renderProgress) renderProgress.classList.add("hidden");
      return;
    }

    const controlnetOpts = controlnetEnabled.checked
      ? {
          enabled: true,
          type: controlnetType.value,
          modelName: controlnetModel.value,
          strength: controlnetStrength.value,
          preprocess: controlnetPreprocess.checked,
          endPercent: parseFloat(localStorage.getItem("controlnetEndPercent") ?? 1.0),
        }
      : { enabled: false };

    // Check model architecture compatibility
    if (controlnetOpts.enabled && controlnetOpts.modelName) {
      const mismatch = checkModelCompatibility(selectedModel, controlnetOpts.modelName);
      if (mismatch) {
        alert(`模型架構不匹配！\n\n${mismatch}\n\n請選擇相同架構的模型組合。`);
        renderBtn.disabled = false;
        renderBtn.textContent = "渲染";
        if (renderProgress) renderProgress.classList.add("hidden");
        resetProgress();
        return;
      }
    }

    // Upload style reference image if enabled
    let styleRefOpts = { enabled: false };
    if (styleRefEnabled?.checked && styleRefImageData) {
      if (renderStatus) renderStatus.textContent = "上傳風格參考圖...";
      const styleBlob = dataURItoBlob(styleRefImageData);
      const styleFormData = new FormData();
      styleFormData.append("image", styleBlob, "style_reference.png");
      try {
        const styleUploadResp = await fetch(`${COMFYUI_ENDPOINT}/upload/image`, {
          method: "POST",
          body: styleFormData,
        });
        if (styleUploadResp.ok) {
          const styleUploadData = await styleUploadResp.json();
          styleRefOpts = {
            enabled: true,
            imageName: styleUploadData.name,
            weight: styleWeight?.value || 0.8,
            mode: styleTransferMode?.value || "style-only",
          };
        }
      } catch (e) {
        console.warn("風格參考圖上傳失敗，將跳過 IP-Adapter:", e);
      }
    }

    const negativePrompt = negativePromptInput.value.trim();
    const promptJSON = buildWorkflowJSON(imageName, prompt, negativePrompt, selectedModel, controlnetOpts, styleRefOpts);
    console.log("[Render] Workflow nodes:", Object.keys(promptJSON).join(","), "Model:", promptJSON["4"]?.inputs?.unet_name || promptJSON["4"]?.inputs?.ckpt_name);
    console.log("[Render] ControlNet:", promptJSON["12"]?.inputs?.control_net_name, "LoRA:", promptJSON["16"] ? "YES" : "NO",
      "Preprocess:", promptJSON["13"] ? "YES" : "NO",
      "CN strength:", promptJSON["14"]?.inputs?.strength, "end%:", promptJSON["14"]?.inputs?.end_percent,
      "Denoise:", promptJSON["3"]?.inputs?.denoise);

    const clientId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const reqBody = { prompt: promptJSON, client_id: clientId };
    const queueResp = await fetch(`${COMFYUI_ENDPOINT}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    if (!queueResp.ok) {
      let errorDetail = "";
      try {
        const errorBody = await queueResp.json();
        errorDetail = errorBody.error?.message || errorBody.node_errors
          ? `\n\n${JSON.stringify(errorBody.node_errors || errorBody.error, null, 2)}`
          : `\n\nHTTP ${queueResp.status}`;
      } catch {
        errorDetail = `\n\nHTTP ${queueResp.status}`;
      }
      throw new Error(`傳送渲染工作至 ComfyUI 失敗${errorDetail}`);
    }
    const queueData = await queueResp.json();
    const promptId = queueData.prompt_id;

    // Step 3: Wait for render result
    setRenderStep("render");
    if (renderStatus) renderStatus.textContent = "AI 渲染中...";

    let renderedImageFile = null;
    try {
      renderedImageFile = await waitForResultViaWS(promptId, clientId);
    } catch (wsErr) {
      console.warn("WebSocket 不可用，回退至 HTTP 輪詢:", wsErr.message);
      if (renderStatus) renderStatus.textContent = "AI 渲染中（輪詢）...";
      renderedImageFile = await pollForResult(promptId);
    }

    if (!renderedImageFile) {
      throw new Error("渲染任務已超時，請檢查 ComfyUI 伺服器是否正常運作");
    }

    // Pipeline: auto-refine if checkbox checked
    const doRefine = document.getElementById("pipeline-refine")?.checked;
    const doUpscale = document.getElementById("pipeline-upscale")?.checked;

    if (doRefine) {
      if (renderStatus) renderStatus.textContent = "準備精修...";
      const inputName = await reuploadToInput(renderedImageFile);
      if (renderStatus) renderStatus.textContent = "精修中...";
      const refineWf = buildRefineWorkflow(inputName, promptInput.value, modelSelect.value);
      renderedImageFile = await submitAndWait(refineWf, "精修中...");
      if (!renderedImageFile) throw new Error("精修超時");
    }

    if (doUpscale) {
      if (renderStatus) renderStatus.textContent = "準備放大...";
      const inputName = await reuploadToInput(renderedImageFile);
      if (renderStatus) renderStatus.textContent = "放大中...";
      const upscaleWf = buildUpscaleWorkflow(inputName);
      renderedImageFile = await submitAndWait(upscaleWf, "放大中...");
      if (!renderedImageFile) throw new Error("放大超時");
    }

    // Step 4: Get result
    setRenderStep("done");
    if (renderStatus) renderStatus.textContent = "取得渲染結果...";

    const imageUrl = `${COMFYUI_ENDPOINT}/view?filename=${encodeURIComponent(renderedImageFile.filename)}&subfolder=${encodeURIComponent(renderedImageFile.subfolder)}&type=${encodeURIComponent(renderedImageFile.type)}`;
    resultImg.src = imageUrl;
    resultSection.classList.remove("hidden");

    // Cache result image + save to history
    try {
      const finalImageRes = await fetch(imageUrl);
      const finalBlob = await finalImageRes.blob();
      const reader = new FileReader();
      reader.readAsDataURL(finalBlob);
      reader.onloadend = async () => {
        const dataURL = reader.result;
        localStorage.setItem("renderResult", dataURL);
        // Save to render history
        try {
          const thumb = await generateThumbnail(dataURL);
          const activePresetKey = localStorage.getItem("activePreset") || "";
          const presetName = activePresetKey && SCENE_PRESETS[activePresetKey] ? SCENE_PRESETS[activePresetKey].name : "";
          await RenderHistoryDB.save({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            prompt: promptInput.value || "",
            negativePrompt: negativePromptInput.value || "",
            translation: promptTranslation ? promptTranslation.textContent || "" : "",
            model: modelSelect.value || "",
            imageDataURL: dataURL,
            thumbnail: thumb || dataURL,
            params: {
              preset: presetName,
              denoise: parseFloat(document.getElementById("denoise-slider")?.value ?? 0),
              steps: parseInt(document.getElementById("steps-slider")?.value ?? 25, 10),
              controlnet: controlnetOpts.enabled ? {
                type: controlnetOpts.type,
                model: controlnetOpts.modelName,
                strength: parseFloat(controlnetOpts.strength),
                preprocess: controlnetOpts.preprocess,
                endPercent: controlnetOpts.endPercent,
              } : null,
              styleRef: styleRefOpts.enabled ? {
                weight: parseFloat(styleRefOpts.weight),
                mode: styleRefOpts.mode,
              } : null,
            },
          });
          console.log("[History] Render saved to history");
        } catch (histErr) {
          console.warn("[History] Failed to save:", histErr);
        }
      };
    } catch (err) {
      console.warn("無法緩存圖片", err);
    }
  } catch (err) {
    console.error(err);
    alert(err.message || "渲染失敗，請檢查網路連線");
  } finally {
    renderBtn.disabled = false;
    renderBtn.textContent = "渲染";
    if (cancelRenderBtn) cancelRenderBtn.classList.add("hidden");
    if (renderTimerInterval) { clearInterval(renderTimerInterval); renderTimerInterval = null; }
    setTimeout(() => {
      if (renderProgress) renderProgress.classList.add("hidden");
      resetProgress();
    }, 2000);
  }
});

// Refine button — use rendered result as new input with low denoise
// Refine button — one-click refinement via ComfyUI
const refineBtn = document.getElementById("refine-btn");
if (refineBtn) {
  refineBtn.addEventListener("click", async () => {
    const src = resultImg.src;
    if (!src) return;
    // Extract filename from ComfyUI URL
    const urlParams = new URL(src).searchParams;
    const filename = urlParams.get("filename");
    if (!filename) { alert("無法取得圖片檔名"); return; }

    refineBtn.disabled = true;
    refineBtn.textContent = "精修中...";
    resetProgress();
    startRenderTimer();
    if (renderProgress) renderProgress.classList.remove("hidden");
    if (renderStatus) renderStatus.textContent = "上傳圖片...";
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      const formData = new FormData();
      formData.append("image", blob, filename);
      formData.append("overwrite", "true");
      const uploadResp = await fetch(`${COMFYUI_ENDPOINT}/upload/image`, { method: "POST", body: formData });
      if (!uploadResp.ok) throw new Error("上傳圖片失敗");
      const uploadData = await uploadResp.json();
      const inputName = uploadData.name;

      if (renderStatus) renderStatus.textContent = "精修中...";
      const refineWf = buildRefineWorkflow(inputName, promptInput.value, modelSelect.value);
      const result = await submitAndWait(refineWf, "精修中...");
      if (!result) throw new Error("精修超時");
      const newUrl = `${COMFYUI_ENDPOINT}/view?filename=${encodeURIComponent(result.filename)}&subfolder=${encodeURIComponent(result.subfolder)}&type=${encodeURIComponent(result.type)}`;
      resultImg.src = newUrl;
      if (renderStatus) renderStatus.textContent = "精修完成";
    } catch (e) {
      alert("精修失敗: " + e.message);
    } finally {
      refineBtn.disabled = false;
      refineBtn.textContent = "🔄 精修";
      if (renderTimerInterval) { clearInterval(renderTimerInterval); renderTimerInterval = null; }
      setTimeout(() => { if (renderProgress) renderProgress.classList.add("hidden"); resetProgress(); }, 2000);
    }
  });
}

// Upscale button — one-click upscale via ComfyUI
const upscaleBtn = document.getElementById("upscale-btn");
if (upscaleBtn) {
  upscaleBtn.addEventListener("click", async () => {
    const src = resultImg.src;
    if (!src) return;
    const urlParams = new URL(src).searchParams;
    const filename = urlParams.get("filename");
    if (!filename) { alert("無法取得圖片檔名"); return; }

    upscaleBtn.disabled = true;
    upscaleBtn.textContent = "放大中...";
    resetProgress();
    startRenderTimer();
    if (renderProgress) renderProgress.classList.remove("hidden");
    if (renderStatus) renderStatus.textContent = "上傳圖片...";
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      const formData = new FormData();
      formData.append("image", blob, filename);
      formData.append("overwrite", "true");
      const uploadResp = await fetch(`${COMFYUI_ENDPOINT}/upload/image`, { method: "POST", body: formData });
      if (!uploadResp.ok) throw new Error("上傳圖片失敗");
      const uploadData = await uploadResp.json();
      const inputName = uploadData.name;

      if (renderStatus) renderStatus.textContent = "放大中...";
      const upscaleWf = buildUpscaleWorkflow(inputName);
      const result = await submitAndWait(upscaleWf, "放大中...");
      if (!result) throw new Error("放大超時");
      const newUrl = `${COMFYUI_ENDPOINT}/view?filename=${encodeURIComponent(result.filename)}&subfolder=${encodeURIComponent(result.subfolder)}&type=${encodeURIComponent(result.type)}`;
      resultImg.src = newUrl;
      if (renderStatus) renderStatus.textContent = "放大完成";
    } catch (e) {
      alert("放大失敗: " + e.message);
    } finally {
      upscaleBtn.disabled = false;
      upscaleBtn.textContent = "🔍 放大";
      if (renderTimerInterval) { clearInterval(renderTimerInterval); renderTimerInterval = null; }
      setTimeout(() => { if (renderProgress) renderProgress.classList.add("hidden"); resetProgress(); }, 2000);
    }
  });
}

// Download button
const downloadBtn = document.getElementById("download-btn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", async () => {
    const src = resultImg.src;
    if (!src) return;
    try {
      downloadBtn.disabled = true;
      downloadBtn.textContent = "下載中...";
      const resp = await fetch(src);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `render_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
      // Fallback: open in new tab
      window.open(src, "_blank");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "下載";
    }
  });
}

// Cancel render button — interrupts ComfyUI and resets UI
if (cancelRenderBtn) {
  cancelRenderBtn.addEventListener("click", async () => {
    cancelRenderBtn.disabled = true;
    cancelRenderBtn.textContent = "取消中...";
    try {
      await fetch(`${COMFYUI_ENDPOINT}/interrupt`, { method: "POST" });
      await fetch(`${COMFYUI_ENDPOINT}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
    } catch (e) {
      console.error("Cancel failed:", e);
    } finally {
      cancelRenderBtn.disabled = false;
      cancelRenderBtn.textContent = "⏹ 取消";
      cancelRenderBtn.classList.add("hidden");
    }
  });
}

// ---------- Load Available Models from ComfyUI ----------
async function loadAvailableModels() {
  try {
    // Load checkpoint models, diffusion_models (FLUX UNet), and GGUF models
    const [ckptResp, unetResp, ggufResp] = await Promise.all([
      fetch(`${COMFYUI_ENDPOINT}/object_info/CheckpointLoaderSimple`),
      fetch(`${COMFYUI_ENDPOINT}/object_info/UNETLoader`).catch(() => null),
      fetch(`${COMFYUI_ENDPOINT}/object_info/UnetLoaderGGUF`).catch(() => null),
    ]);
    if (!ckptResp.ok) throw new Error("Failed to fetch models");
    const ckptData = await ckptResp.json();
    const ckptModels = ckptData.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];

    let unetModels = [];
    if (unetResp && unetResp.ok) {
      const unetData = await unetResp.json();
      unetModels = unetData.UNETLoader?.input?.required?.unet_name?.[0] || [];
    }

    let ggufModels = [];
    if (ggufResp && ggufResp.ok) {
      const ggufData = await ggufResp.json();
      ggufModels = ggufData.UnetLoaderGGUF?.input?.required?.unet_name?.[0] || [];
    }

    // Merge all model lists, dedup (GGUF models may also appear in UNet list)
    const modelSet = new Set([...ckptModels, ...unetModels, ...ggufModels]);
    const models = [...modelSet];

    modelSelect.innerHTML = "";
    if (models.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "無可用模型";
      modelSelect.appendChild(opt);
      if (modelDesc) modelDesc.textContent = "";
      return;
    }

    // Group by architecture
    const groups = {};
    models.forEach((name) => {
      const arch = detectModelArch(name);
      const key = arch !== "unknown" ? arch : "其他";
      if (!groups[key]) groups[key] = [];
      groups[key].push(name);
    });

    const archOrder = ["FLUX", "SDXL", "SD1.5", "SD3", "其他"];
    archOrder.forEach((archKey) => {
      const list = groups[archKey];
      if (!list) return;
      const group = document.createElement("optgroup");
      group.label = archKey === "其他" ? "其他模型" : `── ${archKey} ──`;
      list.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        const baseName = name.replace(/\.safetensors$/, "").replace(/\.ckpt$/, "");
        const info = getCheckpointInfo(name);
        opt.textContent = info ? `${baseName}（${info.style}）` : baseName;
        group.appendChild(opt);
      });
      modelSelect.appendChild(group);
    });

    // Re-apply active preset now that models are loaded (preset runs before models load)
    const activePreset = localStorage.getItem("activePreset");
    if (activePreset && SCENE_PRESETS[activePreset]) {
      const preset = SCENE_PRESETS[activePreset];
      let matched = findModelByKeyword(modelSelect, preset.checkpoint);
      if (!matched && preset.checkpointFallback) {
        matched = findModelByKeyword(modelSelect, preset.checkpointFallback);
      }
      if (matched) {
        modelSelect.value = matched.value;
        localStorage.setItem("selectedModel", matched.value);
      } else {
        // No preset match — fall back to last used model
        const lastModel = localStorage.getItem("selectedModel");
        if (lastModel && models.includes(lastModel)) {
          modelSelect.value = lastModel;
        }
      }
    } else {
      const lastModel = localStorage.getItem("selectedModel");
      if (lastModel && models.includes(lastModel)) {
        modelSelect.value = lastModel;
      }
    }
    updateModelDesc();
  } catch (err) {
    console.warn("無法從 ComfyUI 取得模型列表:", err);
    modelSelect.innerHTML = '<option value="">無法連接 ComfyUI</option>';
    if (modelDesc) modelDesc.textContent = "";
  }
}

function updateModelDesc() {
  if (!modelDesc) return;
  const info = getCheckpointInfo(modelSelect.value);
  const arch = detectModelArch(modelSelect.value);
  const archLabel = arch !== "unknown" ? `${arch} 架構` : "";
  modelDesc.textContent = info ? `${archLabel}${archLabel ? " · " : ""}${info.desc}` : archLabel;
}

modelSelect.addEventListener("change", () => {
  localStorage.setItem("selectedModel", modelSelect.value);
  updateModelDesc();
});

// ---------- Help Popup ----------
if (modelHelpBtn && helpOverlay) {
  modelHelpBtn.addEventListener("click", () => {
    helpOverlay.classList.remove("hidden");
  });
  helpCloseBtn?.addEventListener("click", () => {
    helpOverlay.classList.add("hidden");
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) helpOverlay.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.classList.contains("hidden")) {
      helpOverlay.classList.add("hidden");
    }
  });
}

// ---------- Load ControlNet Models ----------
async function loadControlNetModels() {
  try {
    const resp = await fetch(`${COMFYUI_ENDPOINT}/object_info/ControlNetLoader`);
    if (!resp.ok) throw new Error("Failed to fetch ControlNet models");
    const data = await resp.json();
    const models = data.ControlNetLoader?.input?.required?.control_net_name?.[0] || [];

    controlnetModel.innerHTML = "";
    if (models.length === 0) {
      controlnetModel.innerHTML = '<option value="">無可用 ControlNet 模型</option>';
      if (cnModelDesc) cnModelDesc.textContent = "";
      return;
    }

    // Group by architecture
    const groups = {};
    models.forEach((name) => {
      const arch = detectModelArch(name);
      const key = arch !== "unknown" ? arch : "其他";
      if (!groups[key]) groups[key] = [];
      groups[key].push(name);
    });

    const archOrder = ["FLUX", "SDXL", "SD1.5", "SD3", "其他"];
    archOrder.forEach((archKey) => {
      const list = groups[archKey];
      if (!list) return;
      const group = document.createElement("optgroup");
      group.label = archKey === "其他" ? "其他" : `── ${archKey} ──`;
      list.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        const baseName = name.replace(/\.safetensors$/, "").replace(/\.pth$/, "");
        const info = getControlNetInfo(name);
        opt.textContent = info ? `${baseName}（${info.func}）` : baseName;
        group.appendChild(opt);
      });
      controlnetModel.appendChild(group);
    });

    const lastCN = localStorage.getItem("controlnetModelName");
    if (lastCN && models.includes(lastCN)) {
      controlnetModel.value = lastCN;
    }
    updateCnModelDesc();
  } catch (err) {
    console.warn("無法從 ComfyUI 取得 ControlNet 模型列表:", err);
    controlnetModel.innerHTML = '<option value="">無法載入</option>';
    if (cnModelDesc) cnModelDesc.textContent = "";
  }
}

function updateCnModelDesc() {
  if (!cnModelDesc) return;
  const info = getControlNetInfo(controlnetModel.value);
  const arch = detectModelArch(controlnetModel.value);
  const archLabel = arch !== "unknown" ? `${arch} 架構` : "";
  cnModelDesc.textContent = info ? `${archLabel}${archLabel ? " · " : ""}${info.desc}` : archLabel;
}

// ---------- Restore ControlNet Settings ----------
function restoreControlNetSettings() {
  const enabled = localStorage.getItem("controlnetEnabled") === "true";
  controlnetEnabled.checked = enabled;
  controlnetOptions.classList.toggle("hidden", !enabled);

  const type = localStorage.getItem("controlnetType");
  if (type) controlnetType.value = type;

  const strength = localStorage.getItem("controlnetStrength");
  if (strength) {
    controlnetStrength.value = strength;
    cnStrengthVal.textContent = strength;
  }

  const preprocess = localStorage.getItem("controlnetPreprocess");
  if (preprocess !== null) controlnetPreprocess.checked = preprocess === "true";

  if (enabled) loadControlNetModels();
}

// ---------- Model Store (Recommended Models) ----------
const RECOMMENDED_MODELS = [
  {
    name: "Interior Scene XL",
    filename: "interiorSceneXL_v1.safetensors",
    type: "checkpoint",
    arch: "SDXL",
    size: "6.46 GB",
    desc: "專為室內設計場景訓練的 SDXL 模型，擅長生成高品質室內空間",
    civitaiUrl: "https://civitai.com/models/715747/interior-scene-xl",
    downloadUrl: "https://civitai.com/api/download/models/800407",
    savePath: "checkpoints",
  },
  {
    name: "RealVisXL V5.0",
    filename: "RealVisXL_V5.0",
    type: "checkpoint",
    arch: "SDXL",
    size: "6.46 GB",
    desc: "照片級寫實模型，適合室內外場景、建築渲染",
    civitaiUrl: "https://civitai.com/models/139562/realvisxl",
    downloadUrl: "https://civitai.com/api/download/models/789646",
    savePath: "checkpoints",
  },
  {
    name: "Interior Design Universal SDXL",
    filename: "Interior-Design-Universal",
    type: "lora",
    arch: "SDXL",
    size: "1.27 GB",
    desc: "室內設計通用 LoRA，可搭配任何 SDXL 模型強化室內風格",
    civitaiUrl: "https://civitai.com/models/496075/interior-design-universal-sdxl",
    downloadUrl: "https://civitai.com/api/download/models/551362",
    savePath: "loras",
  },
  {
    name: "JuggernautXL Ragnarok",
    filename: "juggernautXL",
    type: "checkpoint",
    arch: "SDXL",
    size: "6.46 GB",
    desc: "高細節寫實模型，人像與場景渲染表現優秀",
    civitaiUrl: "https://civitai.com/models/133005/juggernaut-xl",
    downloadUrl: "https://civitai.com/api/download/models/782002",
    savePath: "checkpoints",
  },
];

const storeToggleBtn = document.getElementById("store-toggle-btn");
const storeBody = document.getElementById("store-body");
const storeList = document.getElementById("store-list");

let installedModels = [];

function isModelInstalled(recModel) {
  return installedModels.some(
    (m) => m.toLowerCase().includes(recModel.filename.toLowerCase())
  );
}

function renderModelStore() {
  if (!storeList) return;
  storeList.innerHTML = "";

  RECOMMENDED_MODELS.forEach((model) => {
    const installed = isModelInstalled(model);
    const card = document.createElement("div");
    card.className = "store-card";
    card.innerHTML = `
      <div class="store-card-icon ${model.type}">
        ${model.type === "checkpoint" ? "CP" : "Lo"}
      </div>
      <div class="store-card-body">
        <div class="store-card-name">${model.name}</div>
        <div class="store-card-meta">${model.arch} · ${model.type} · ${model.size}</div>
      </div>
      <div class="store-card-actions">
        ${
          installed
            ? '<span class="store-installed-badge">&#10003; 已安裝</span>'
            : '<button class="store-download-btn">下載指引</button>'
        }
      </div>
    `;
    if (!installed) {
      card.querySelector(".store-download-btn").addEventListener("click", () => {
        showDownloadModal(model);
      });
    }
    storeList.appendChild(card);
  });
}

function showDownloadModal(model) {
  const existing = document.querySelector(".download-overlay");
  if (existing) existing.remove();

  const psCmd = `Invoke-WebRequest -Uri "${model.downloadUrl}" -OutFile "ComfyUI\\models\\${model.savePath}\\${model.filename}${model.filename.endsWith('.safetensors') ? '' : '.safetensors'}"`;

  const overlay = document.createElement("div");
  overlay.className = "download-overlay";
  overlay.innerHTML = `
    <div class="download-popup glass">
      <div class="download-popup-header">
        <h3>${model.name} 下載指引</h3>
        <button class="help-close-btn" id="dl-close-btn">&times;</button>
      </div>
      <div class="download-popup-body">
        <div class="download-step">
          <span class="download-step-num">1</span>
          <div class="download-step-content">
            在 ComfyUI 的 Windows 電腦上開啟瀏覽器，前往：<br/>
            <a href="${model.civitaiUrl}" target="_blank">${model.civitaiUrl}</a>
          </div>
        </div>
        <div class="download-step">
          <span class="download-step-num">2</span>
          <div class="download-step-content">
            點擊 <strong>Download</strong> 下載模型檔案（${model.size}）
          </div>
        </div>
        <div class="download-step">
          <span class="download-step-num">3</span>
          <div class="download-step-content">
            將檔案放到 <code>ComfyUI\\models\\${model.savePath}\\</code>
          </div>
        </div>
        <div class="download-step">
          <span class="download-step-num">&#9889;</span>
          <div class="download-step-content">
            或用 PowerShell 一鍵下載：
            <div class="download-cmd">
              <button class="copy-cmd-btn" data-cmd="${psCmd.replace(/"/g, '&quot;')}">複製</button>
              ${psCmd}
            </div>
          </div>
        </div>
        <p class="download-note">下載完成後模型會自動出現在上方模型選單中（不需重啟 ComfyUI）</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector("#dl-close-btn");
  closeBtn.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", escHandler);
    }
  });

  overlay.querySelector(".copy-cmd-btn").addEventListener("click", (e) => {
    const cmd = e.target.getAttribute("data-cmd");
    navigator.clipboard.writeText(cmd).then(() => {
      e.target.textContent = "已複製!";
      setTimeout(() => { e.target.textContent = "複製"; }, 1500);
    });
  });
}

if (storeToggleBtn && storeBody) {
  const headerArea = storeToggleBtn.closest(".store-header");
  headerArea.addEventListener("click", () => {
    storeBody.classList.toggle("hidden");
    storeToggleBtn.classList.toggle("open");
  });
}

// Patch loadAvailableModels to also populate installedModels for store
const _origLoadModels = loadAvailableModels;
loadAvailableModels = async function () {
  await _origLoadModels();
  try {
    const resp = await fetch(`${COMFYUI_ENDPOINT}/api/models/checkpoints`);
    if (resp.ok) {
      const ckpts = await resp.json();
      const loraResp = await fetch(`${COMFYUI_ENDPOINT}/api/models/loras`);
      const loras = loraResp.ok ? await loraResp.json() : [];
      installedModels = [...ckpts, ...loras];
    }
  } catch (_) {
    // Fall back to model select options
    installedModels = Array.from(modelSelect.options).map((o) => o.value).filter(Boolean);
  }
  renderModelStore();
};

// ---------- Prompt Tags ----------
const tagsToggleBtn = document.getElementById("tags-toggle-btn");
const tagsBody = document.getElementById("tags-body");

if (tagsToggleBtn && tagsBody) {
  const tagsHeader = tagsToggleBtn.closest(".tags-header");
  tagsHeader.addEventListener("click", () => {
    tagsBody.classList.toggle("hidden");
    tagsToggleBtn.classList.toggle("open");
  });
}

// Collapsible tag groups (furniture categories)
document.querySelectorAll(".tags-group-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    toggle.closest(".tags-group").classList.toggle("collapsed");
  });
});

// Track active tags (declared early for use in custom tags)
const activeTags = new Set();
const activeNegTags = new Set();

// ---------- Custom Tags ----------
const customTagLabelInput = document.getElementById("custom-tag-label");
const customTagValueInput = document.getElementById("custom-tag-value");
const customTagAddBtn = document.getElementById("custom-tag-add-btn");
const customTagsRow = document.getElementById("custom-tags-row");

function getCustomTags() {
  try { return JSON.parse(localStorage.getItem("customTags") || "[]"); } catch { return []; }
}
function saveCustomTags(tags) {
  localStorage.setItem("customTags", JSON.stringify(tags));
}
function renderCustomTags() {
  if (!customTagsRow) return;
  customTagsRow.innerHTML = "";
  getCustomTags().forEach((t, idx) => {
    const btn = document.createElement("button");
    btn.className = "tag-btn custom-tag";
    btn.dataset.tag = t.value;
    btn.innerHTML = `${t.label}<span class="tag-delete" data-idx="${idx}">✕</span>`;
    customTagsRow.appendChild(btn);
  });
}
if (customTagAddBtn) {
  customTagAddBtn.addEventListener("click", () => {
    const label = customTagLabelInput.value.trim();
    const value = customTagValueInput.value.trim();
    if (!label || !value) { alert("請輸入顯示名稱和英文關鍵詞"); return; }
    const tags = getCustomTags();
    tags.push({ label, value });
    saveCustomTags(tags);
    renderCustomTags();
    customTagLabelInput.value = "";
    customTagValueInput.value = "";
  });
}
if (customTagsRow) {
  customTagsRow.addEventListener("click", (e) => {
    // Delete button
    const del = e.target.closest(".tag-delete");
    if (del) {
      e.stopPropagation();
      const idx = parseInt(del.dataset.idx);
      const tags = getCustomTags();
      const removed = tags.splice(idx, 1)[0];
      saveCustomTags(tags);
      // Remove from active tags & prompt
      if (removed) {
        activeTags.delete(removed.value);
        removeTagFromInput(promptInput, removed.value);
      }
      renderCustomTags();
      return;
    }
    // Tag toggle (same logic as built-in tags)
    const btn = e.target.closest(".tag-btn");
    if (!btn) return;
    btn.classList.toggle("active");
    const tag = btn.dataset.tag;
    if (btn.classList.contains("active")) {
      activeTags.add(tag);
      appendTagToInput(promptInput, tag);
    } else {
      activeTags.delete(tag);
      removeTagFromInput(promptInput, tag);
    }
  });
}
renderCustomTags();

// activeTags & activeNegTags declared above (before custom tags section)

function removeTagFromInput(inputEl, tag) {
  let current = inputEl.value;
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  current = current.replace(new RegExp(",?\\s*" + escaped + "\\s*,?"), (match) => {
    if (match.startsWith(",") && match.endsWith(",")) return ",";
    return "";
  });
  current = current.replace(/^[,\s]+|[,\s]+$/g, "").replace(/,\s*,/g, ", ");
  inputEl.value = current;
}

function appendTagToInput(inputEl, tag) {
  const current = inputEl.value.trim();
  inputEl.value = current ? `${current}, ${tag}` : tag;
}

document.getElementById("tags-body")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tag-btn");
  if (!btn) return;

  const tag = btn.dataset.tag;
  const isNeg = btn.dataset.neg === "true";
  const isActive = btn.classList.toggle("active");

  if (isNeg) {
    // Negative tag → add/remove from negative prompt
    if (isActive) {
      activeNegTags.add(tag);
      appendTagToInput(negativePromptInput, tag);
      negativePromptRow.classList.remove("hidden");
    } else {
      activeNegTags.delete(tag);
      removeTagFromInput(negativePromptInput, tag);
    }
  } else {
    // Positive tag → add/remove from positive prompt
    if (isActive) {
      activeTags.add(tag);
      appendTagToInput(promptInput, tag);
    } else {
      activeTags.delete(tag);
      removeTagFromInput(promptInput, tag);
    }
  }
});

// ---------- Prompt Clear & Reset ----------
function clearAllPrompts() {
  promptInput.value = "";
  negativePromptInput.value = "";
  // Hide translation & negative row
  if (promptTranslationRow) promptTranslationRow.classList.add("hidden");
  negativePromptRow.classList.add("hidden");
  // Deselect all tag buttons
  document.querySelectorAll(".tag-btn.active").forEach((btn) => btn.classList.remove("active"));
  activeTags.clear();
  activeNegTags.clear();
  // Hide AI thinking panel
  if (aiThinkingPanel) aiThinkingPanel.classList.add("hidden");
}

function rebuildPromptFromTags() {
  // Rebuild positive prompt from active tags
  const posTags = [...activeTags];
  promptInput.value = posTags.join(", ");
  // Rebuild negative prompt from active neg tags
  const negTags = [...activeNegTags];
  negativePromptInput.value = negTags.join(", ");
  if (negTags.length > 0) {
    negativePromptRow.classList.remove("hidden");
  } else {
    negativePromptRow.classList.add("hidden");
  }
  // Hide stale translation
  if (promptTranslationRow) promptTranslationRow.classList.add("hidden");
}

document.getElementById("prompt-clear-btn")?.addEventListener("click", clearAllPrompts);
document.getElementById("prompt-reset-btn")?.addEventListener("click", rebuildPromptFromTags);

// ---------- Scene Presets ----------
// Design principle: All SketchUp-based presets use Depth ControlNet
// (ignores lines/text, preserves 3D spatial structure only)
// SCENE_PRESETS is now loaded from docs/default-params.json via loadAndApplyDefaults()
// See SCENE_PRESETS_FALLBACK at top of file for offline fallback.

function findModelByKeyword(selectEl, keyword) {
  const options = Array.from(selectEl.options);
  return options.find((o) => o.value.toLowerCase().includes(keyword.toLowerCase()));
}

function applyPreset(presetKey) {
  const preset = SCENE_PRESETS[presetKey];
  if (!preset) return;

  // 1. Select checkpoint
  let matched = findModelByKeyword(modelSelect, preset.checkpoint);
  if (!matched && preset.checkpointFallback) {
    matched = findModelByKeyword(modelSelect, preset.checkpointFallback);
  }
  if (matched) {
    modelSelect.value = matched.value;
    localStorage.setItem("selectedModel", matched.value);
    updateModelDesc();
  }

  // 2. Set denoise
  const denoiseSliderEl = document.getElementById("denoise-slider");
  const denoiseValEl = document.getElementById("denoise-val");
  if (denoiseSliderEl) {
    denoiseSliderEl.value = preset.denoise;
    if (denoiseValEl) denoiseValEl.textContent = preset.denoise.toFixed(2);
    localStorage.setItem("denoiseValue", preset.denoise);
  }

  // 2b. Set steps
  if (preset.steps && stepsSlider) {
    stepsSlider.value = preset.steps;
    if (stepsValEl) stepsValEl.textContent = preset.steps;
    localStorage.setItem("stepsValue", preset.steps);
  }

  // 3. Enable and configure ControlNet
  if (preset.controlnet.enabled) {
    controlnetEnabled.checked = true;
    controlnetOptions.classList.remove("hidden");
    localStorage.setItem("controlnetEnabled", "true");

    // Set type
    controlnetType.value = preset.controlnet.type;
    localStorage.setItem("controlnetType", preset.controlnet.type);

    // Set strength
    controlnetStrength.value = preset.controlnet.strength;
    cnStrengthVal.textContent = preset.controlnet.strength;
    localStorage.setItem("controlnetStrength", preset.controlnet.strength);

    // Set preprocess based on preset (SketchUp lines don't need preprocessing)
    const shouldPreprocess = preset.controlnet.preprocess !== false;
    controlnetPreprocess.checked = shouldPreprocess;
    localStorage.setItem("controlnetPreprocess", shouldPreprocess.toString());

    // Set endPercent if specified
    if (preset.controlnet.endPercent !== undefined) {
      localStorage.setItem("controlnetEndPercent", preset.controlnet.endPercent);
    }

    // Load ControlNet models and auto-select matching one
    loadControlNetModels().then(() => {
      const arch = detectModelArch(modelSelect.value);
      const cnOptions = Array.from(controlnetModel.options);
      const keywords = [preset.controlnet.keyword.toLowerCase()];
      if (preset.controlnet.keywordFallback) {
        keywords.push(preset.controlnet.keywordFallback.toLowerCase());
      }
      let cnMatch = null;
      for (const cnKeyword of keywords) {
        // Find matching: same arch + matching keyword
        cnMatch = cnOptions.find((o) => {
          const oArch = detectModelArch(o.value);
          return oArch === arch && o.value.toLowerCase().includes(cnKeyword);
        });
        // Fallback: just keyword match (ignore arch)
        if (!cnMatch) {
          cnMatch = cnOptions.find((o) => o.value.toLowerCase().includes(cnKeyword));
        }
        if (cnMatch) break;
      }
      if (cnMatch) {
        controlnetModel.value = cnMatch.value;
        localStorage.setItem("controlnetModelName", cnMatch.value);
        updateCnModelDesc();
      }
    });
  }

  // 4. Configure Style Reference (IP-Adapter) if preset specifies it
  if (preset.styleRef) {
    if (styleRefEnabled) {
      styleRefEnabled.checked = preset.styleRef.enabled;
      styleRefOptions?.classList.toggle("hidden", !preset.styleRef.enabled);
      localStorage.setItem("styleRefEnabled", preset.styleRef.enabled);
    }
    if (styleTransferMode && preset.styleRef.mode) {
      styleTransferMode.value = preset.styleRef.mode;
      localStorage.setItem("styleTransferMode", preset.styleRef.mode);
    }
    if (styleWeight && preset.styleRef.weight) {
      styleWeight.value = preset.styleRef.weight;
      if (styleWeightVal) styleWeightVal.textContent = preset.styleRef.weight.toFixed(2);
      localStorage.setItem("styleWeight", preset.styleRef.weight);
    }
  }

  // 5. Always set prompt template (overwrite)
  promptInput.value = preset.promptTemplate;

  // 6. Set negative prompt
  negativePromptInput.value = preset.negativeTemplate;
  negativePromptRow.classList.remove("hidden");

  // 7. Show description
  const presetDesc = document.getElementById("preset-desc");
  if (presetDesc) presetDesc.textContent = `✓ ${preset.desc}`;

  // Highlight active preset button
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === presetKey);
  });

  localStorage.setItem("activePreset", presetKey);
}

// Bind preset buttons
document.getElementById("preset-grid")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;
  applyPreset(btn.dataset.preset);
});

// Restore active preset on load, default to "interior-realistic"
const savedPreset = localStorage.getItem("activePreset") || "interior-realistic";
applyPreset(savedPreset);

// ---------- Queue Manager ----------
const queueManagerBtn = document.getElementById("queue-manager-btn");
const queueModal = document.getElementById("queue-modal");
const queueModalClose = document.getElementById("queue-modal-close");
const queueList = document.getElementById("queue-list");
const queueRefreshBtn = document.getElementById("queue-refresh-btn");
const queueClearAllBtn = document.getElementById("queue-clear-all-btn");

async function fetchQueueAndRender() {
  queueList.innerHTML = '<div class="queue-loading">載入中...</div>';
  try {
    const resp = await fetch(`${COMFYUI_ENDPOINT}/queue`);
    const data = await resp.json();
    const running = data.queue_running || [];
    const pending = data.queue_pending || [];
    const total = running.length + pending.length;

    if (total === 0) {
      queueList.innerHTML = '<div class="queue-empty">排程為空，沒有進行中或等待中的任務</div>';
      return;
    }

    queueList.innerHTML = "";

    // Running tasks
    for (const task of running) {
      queueList.appendChild(createQueueItem(task, "running"));
    }
    // Pending tasks
    for (const task of pending) {
      queueList.appendChild(createQueueItem(task, "pending"));
    }
  } catch (e) {
    queueList.innerHTML = `<div class="queue-empty">無法連線 ComfyUI: ${e.message}</div>`;
  }
}

function createQueueItem(task, status) {
  const [idx, promptId, wf, meta] = task;
  // Find model name
  let modelName = "unknown";
  let promptText = "";
  for (const nv of Object.values(wf)) {
    const ct = nv.class_type || "";
    if (ct.includes("UnetLoader") || ct.includes("UNETLoader") || ct.includes("CheckpointLoader")) {
      modelName = nv.inputs?.unet_name || nv.inputs?.ckpt_name || "?";
    }
    if (ct === "CLIPTextEncode" && nv.inputs?.text && !promptText) {
      promptText = nv.inputs.text;
    }
  }

  const isGGUF = modelName.toLowerCase().includes(".gguf");
  const statusIcon = status === "running" ? "🔄" : "⏳";
  const statusLabel = status === "running" ? "執行中" : "等待中";
  const shortPrompt = promptText.length > 50 ? promptText.slice(0, 50) + "..." : promptText;

  const el = document.createElement("div");
  el.className = `queue-item ${status}`;
  el.innerHTML = `
    <div class="queue-item-status">${statusIcon}</div>
    <div class="queue-item-info">
      <div class="queue-item-model">${isGGUF ? "🟢" : "🔵"} ${modelName}</div>
      <div class="queue-item-detail">${statusLabel} · ${shortPrompt || "(no prompt)"}</div>
    </div>
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "queue-item-cancel";
  cancelBtn.textContent = status === "running" ? "中斷" : "移除";
  cancelBtn.addEventListener("click", async () => {
    cancelBtn.disabled = true;
    cancelBtn.textContent = "...";
    try {
      if (status === "running") {
        await fetch(`${COMFYUI_ENDPOINT}/interrupt`, { method: "POST" });
      } else {
        await fetch(`${COMFYUI_ENDPOINT}/queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: [promptId] }),
        });
      }
      // Wait a moment then refresh
      setTimeout(fetchQueueAndRender, 500);
    } catch (e) {
      cancelBtn.textContent = "失敗";
    }
  });
  el.appendChild(cancelBtn);
  return el;
}

if (queueManagerBtn) {
  queueManagerBtn.addEventListener("click", () => {
    queueModal.classList.remove("hidden");
    fetchQueueAndRender();
  });
}
if (queueModalClose) {
  queueModalClose.addEventListener("click", () => queueModal.classList.add("hidden"));
}
if (queueModal) {
  queueModal.addEventListener("click", (e) => {
    if (e.target === queueModal) queueModal.classList.add("hidden");
  });
}
if (queueRefreshBtn) {
  queueRefreshBtn.addEventListener("click", fetchQueueAndRender);
}
if (queueClearAllBtn) {
  queueClearAllBtn.addEventListener("click", async () => {
    queueClearAllBtn.disabled = true;
    queueClearAllBtn.textContent = "清空中...";
    try {
      // Interrupt running + clear pending
      await fetch(`${COMFYUI_ENDPOINT}/interrupt`, { method: "POST" });
      await fetch(`${COMFYUI_ENDPOINT}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      setTimeout(fetchQueueAndRender, 800);
    } catch (e) {
      console.error("Failed to clear queue:", e);
    } finally {
      queueClearAllBtn.disabled = false;
      queueClearAllBtn.textContent = "⏹ 全部清空";
    }
  });
}

// ---------- Denoise Slider ----------
const denoiseSlider = document.getElementById("denoise-slider");
const denoiseVal = document.getElementById("denoise-val");
if (denoiseSlider && denoiseVal) {
  const saved = localStorage.getItem("denoiseValue");
  if (saved) { denoiseSlider.value = saved; denoiseVal.textContent = parseFloat(saved).toFixed(2); }
  denoiseSlider.addEventListener("input", () => {
    denoiseVal.textContent = parseFloat(denoiseSlider.value).toFixed(2);
    localStorage.setItem("denoiseValue", denoiseSlider.value);
  });
}

// ---------- Steps Slider ----------
// stepsSlider & stepsValEl declared at top of file (before applyPreset)
if (stepsSlider && stepsValEl) {
  const saved = localStorage.getItem("stepsValue");
  if (saved) { stepsSlider.value = saved; stepsValEl.textContent = saved; }
  stepsSlider.addEventListener("input", () => {
    stepsValEl.textContent = stepsSlider.value;
    localStorage.setItem("stepsValue", stepsSlider.value);
  });
}

// ---------- Advanced Settings Toggle ----------
const advToggleBtn = document.getElementById("advanced-toggle-btn");
const advBody = document.getElementById("advanced-body");
if (advToggleBtn && advBody) {
  const advHeader = advToggleBtn.closest(".advanced-header");
  advHeader.addEventListener("click", () => {
    advBody.classList.toggle("hidden");
    advToggleBtn.classList.toggle("open");
  });
}

// ---------- Usage Guide ----------
const guideBtn = document.getElementById("guide-btn");
const guideOverlay = document.getElementById("guide-overlay");
const guideCloseBtn = document.getElementById("guide-close-btn");
if (guideBtn && guideOverlay) {
  guideBtn.addEventListener("click", () => guideOverlay.classList.remove("hidden"));
  guideCloseBtn?.addEventListener("click", () => guideOverlay.classList.add("hidden"));
  guideOverlay.addEventListener("click", (e) => {
    if (e.target === guideOverlay) guideOverlay.classList.add("hidden");
  });
}

// ---------- Render History (IndexedDB) ----------
const RenderHistoryDB = (() => {
  const DB_NAME = "render-history";
  const STORE_NAME = "renders";
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function save(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        items.sort((a, b) => b.id - a.id); // newest first
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteByIds(ids) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return { save, getAll, deleteByIds, clearAll };
})();

// Generate thumbnail from image URL
function generateThumbnail(imgSrc, maxW = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = maxW / img.width;
      const c = document.createElement("canvas");
      c.width = maxW;
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

// ---------- History Modal ----------
const historyBtn = document.getElementById("history-btn");
const historyModal = document.getElementById("history-modal");
const historyModalClose = document.getElementById("history-modal-close");
const historyList = document.getElementById("history-list");
const historyDeleteSelected = document.getElementById("history-delete-selected");
const historyClearAll = document.getElementById("history-clear-all");
const historySelectCount = document.getElementById("history-select-count");

let historySelectedIds = new Set();

async function fetchAndRenderHistory() {
  historyList.innerHTML = '<div class="queue-loading">載入中...</div>';
  historySelectedIds.clear();
  updateHistorySelectionUI();
  try {
    const records = await RenderHistoryDB.getAll();
    if (records.length === 0) {
      historyList.innerHTML = '<div class="queue-empty">尚無渲染歷史</div>';
      return;
    }
    historyList.innerHTML = "";
    records.forEach((rec) => {
      historyList.appendChild(createHistoryCard(rec));
    });
  } catch (e) {
    historyList.innerHTML = `<div class="queue-empty">讀取失敗: ${e.message}</div>`;
  }
}

function createHistoryCard(rec) {
  const card = document.createElement("div");
  card.className = "history-card";
  card.dataset.id = rec.id;

  const time = new Date(rec.timestamp).toLocaleString("zh-TW", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const shortModel = (rec.model || "").replace(/\.safetensors$/, "").replace(/\.gguf$/, "");
  const shortPrompt = rec.prompt && rec.prompt.length > 60 ? rec.prompt.slice(0, 60) + "..." : rec.prompt || "";

  // Build params summary
  let paramTags = "";
  if (rec.params) {
    const p = rec.params;
    const tags = [];
    if (p.preset) tags.push(p.preset);
    if (p.denoise != null) tags.push(`重繪${p.denoise.toFixed(2)}`);
    if (p.steps) tags.push(`${p.steps}步`);
    if (p.controlnet) {
      tags.push(`CN:${p.controlnet.type} ${parseFloat(p.controlnet.strength).toFixed(2)}`);
      if (p.controlnet.preprocess) tags.push("預處理");
    }
    if (p.styleRef) tags.push(`風格參考 ${parseFloat(p.styleRef.weight).toFixed(1)}`);
    if (tags.length > 0) paramTags = `<div class="history-card-params">${tags.map(t => `<span class="history-param-tag">${t}</span>`).join("")}</div>`;
  }

  card.innerHTML = `
    <label class="history-card-checkbox"><input type="checkbox" /></label>
    <div class="history-card-thumb-wrap">
      <img class="history-card-thumb" src="${rec.thumbnail || rec.imageDataURL}" alt="render" loading="lazy" />
    </div>
    <div class="history-card-info">
      <div class="history-card-meta">${time} · ${shortModel}</div>
      <div class="history-card-prompt-en">${shortPrompt}</div>
      ${rec.translation ? `<div class="history-card-prompt-zh">${rec.translation}</div>` : ""}
      ${paramTags}
    </div>
  `;

  // Checkbox toggle
  const cb = card.querySelector("input[type=checkbox]");
  cb.addEventListener("change", () => {
    if (cb.checked) {
      historySelectedIds.add(rec.id);
      card.classList.add("selected");
    } else {
      historySelectedIds.delete(rec.id);
      card.classList.remove("selected");
    }
    updateHistorySelectionUI();
  });

  // Click thumbnail → show full image
  card.querySelector(".history-card-thumb").addEventListener("click", (e) => {
    e.stopPropagation();
    showHistoryDetail(rec);
  });

  return card;
}

function showHistoryDetail(rec) {
  // Reuse result section to show history image
  resultImg.src = rec.imageDataURL;
  resultSection.classList.remove("hidden");
  // Scroll to result
  resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
  // Close modal
  historyModal.classList.add("hidden");
}

function updateHistorySelectionUI() {
  const count = historySelectedIds.size;
  if (historySelectCount) historySelectCount.textContent = count > 0 ? `(${count})` : "";
  if (historyDeleteSelected) historyDeleteSelected.disabled = count === 0;
}

if (historyBtn) {
  historyBtn.addEventListener("click", () => {
    historyModal.classList.remove("hidden");
    fetchAndRenderHistory();
  });
}
if (historyModalClose) {
  historyModalClose.addEventListener("click", () => historyModal.classList.add("hidden"));
}
if (historyModal) {
  historyModal.addEventListener("click", (e) => {
    if (e.target === historyModal) historyModal.classList.add("hidden");
  });
}
if (historyDeleteSelected) {
  historyDeleteSelected.addEventListener("click", async () => {
    if (historySelectedIds.size === 0) return;
    if (!confirm(`確定刪除 ${historySelectedIds.size} 筆記錄？`)) return;
    historyDeleteSelected.disabled = true;
    historyDeleteSelected.textContent = "刪除中...";
    try {
      await RenderHistoryDB.deleteByIds([...historySelectedIds]);
      fetchAndRenderHistory();
    } catch (e) {
      alert("刪除失敗: " + e.message);
    } finally {
      historyDeleteSelected.textContent = "🗑 刪除選取";
      historyDeleteSelected.disabled = false;
    }
  });
}
if (historyClearAll) {
  historyClearAll.addEventListener("click", async () => {
    if (!confirm("確定清空所有渲染歷史？此操作無法復原。")) return;
    historyClearAll.disabled = true;
    historyClearAll.textContent = "清空中...";
    try {
      await RenderHistoryDB.clearAll();
      fetchAndRenderHistory();
    } catch (e) {
      alert("清空失敗: " + e.message);
    } finally {
      historyClearAll.textContent = "🗑 全部刪除";
      historyClearAll.disabled = false;
    }
  });
}

// ---------- Init ----------
loadAndApplyDefaults().then(() => {
  restoreStateIfExists();
  document.querySelector('[data-tool="brush"]')?.classList.add("active");
  loadAvailableModels();
  restoreControlNetSettings();
});
