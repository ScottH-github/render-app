// src/main.js
// --------------------------------------------------
// Main logic for the AI 渲染助手 web app.
// --------------------------------------------------
import { COMFYUI_ENDPOINT, COMFYUI_WS_ENDPOINT, LLM_ENDPOINT } from "../config.js";

// ---------- UI Elements ----------
const fileInput = document.getElementById("file-input");
const uploadSection = document.getElementById("upload-section");
const canvasWrapper = document.getElementById("canvas-wrapper");
const canvas = document.getElementById("preview-canvas");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");
const promptInput = document.getElementById("prompt-input");
const renderBtn = document.getElementById("render-btn");
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

// AI Enhance UI
const aiEnhanceBtn = document.getElementById("ai-enhance-btn");
const negativePromptRow = document.getElementById("negative-prompt-row");
const negativePromptInput = document.getElementById("negative-prompt-input");
const aiThinkingPanel = document.getElementById("ai-thinking-panel");
const aiThinkingContent = document.getElementById("ai-thinking-content");
const aiThinkingTime = document.getElementById("ai-thinking-time");

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
    try {
      localStorage.setItem("uploadedImage", dataURL);
    } catch (err) {
      console.warn("localStorage quota exceeded.", err);
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
  const uploaded = localStorage.getItem("uploadedImage");
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

// ---------- AI Prompt Enhancement ----------
const SD_SYSTEM_PROMPT = `You are a Stable Diffusion prompt expert. Given a user's scene description in any language, generate an optimized English prompt for Stable Diffusion image generation.

Output ONLY a valid JSON object with exactly two fields:
- "positive": an optimized English prompt with quality tags (photorealistic, highly detailed, etc.)
- "negative": a negative prompt to avoid common artifacts

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
  // SD 1.5 indicators
  if (n.includes("sd15") || n.includes("v11p") || n.includes("v11f")) return "SD1.5";
  // Default heuristic: common SD1.5-only model families
  if (n.includes("dreamshaper") || n.includes("realistic") || n.includes("deliberate") || n.includes("serenity")) return "SD1.5";
  return "unknown";
}

// ---------- Model Descriptions ----------
const CHECKPOINT_INFO = {
  noobai:       { style: "動漫／插畫", desc: "NoobAI — 高品質動漫插畫，支援 V-Prediction" },
  realvis:      { style: "寫實攝影", desc: "RealVisXL — 照片級寫實，適合室內外場景渲染" },
  dreamshaper:  { style: "通用創意", desc: "DreamShaper — 風格多變，兼顧寫實與插畫" },
  juggernaut:   { style: "寫實／精緻", desc: "Juggernaut — 高細節寫實，人像與場景表現優秀" },
  nightvision:  { style: "暗色／夜景", desc: "NightVision — 擅長夜景、低光、電影氛圍" },
  serenity:     { style: "柔和寫實", desc: "Serenity — 柔和色調，適合自然光場景" },
  zavychroma:   { style: "高飽和寫實", desc: "ZavyChroma — 色彩鮮豔、高對比度的寫實風格" },
  flux1dev:     { style: "通用高品質", desc: "FLUX.1-dev — 高品質通用模型，20-30 步出圖" },
  flux1schnell: { style: "快速生成", desc: "FLUX.1-schnell — 極速模型，4 步即可出圖" },
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
  if (ckptArch !== cnArch) {
    return `Checkpoint 是 ${ckptArch} 架構，但 ControlNet 是 ${cnArch} 架構。\n兩者必須使用相同架構，否則會出現 tensor shape 錯誤。`;
  }
  return null;
}

// ---------- Build ComfyUI Workflow JSON ----------
function buildWorkflowJSON(imageName, promptText, negativeText, selectedModel, controlnetOpts) {
  const arch = detectModelArch(selectedModel);

  // ===== FLUX workflow =====
  if (arch === "FLUX") {
    const isGGUF = selectedModel.toLowerCase().endsWith(".gguf");
    const isSchnell = selectedModel.toLowerCase().includes("schnell");
    const fluxSteps = isSchnell ? 4 : 20;
    const fluxCfg = 1.0;
    const denoiseVal = parseFloat(document.getElementById("denoise-slider")?.value ?? 0.75);

    // Node 4: Model loader — UnetLoaderGGUF for .gguf, CheckpointLoaderSimple for .safetensors
    const modelLoaderNode = isGGUF
      ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: selectedModel } }
      : { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: selectedModel } };

    // For GGUF we need separate CLIP and VAE loaders; for safetensors they come from checkpoint
    const clipSource = isGGUF ? ["5", 0] : ["4", 1];
    const vaeSource = isGGUF ? ["15", 0] : ["4", 2];
    const modelSource = isGGUF ? ["4", 0] : ["4", 0];

    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: Math.floor(Math.random() * 1000000000),
          steps: fluxSteps,
          cfg: fluxCfg,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: denoiseVal,
          model: [modelSource[0], modelSource[1]],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["8", 0],
        },
      },
      "4": modelLoaderNode,
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: promptText, clip: clipSource },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: { text: "", clip: clipSource },
      },
      "8": {
        class_type: "VAEEncode",
        inputs: { pixels: ["10", 0], vae: vaeSource },
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
        inputs: { samples: ["3", 0], vae: vaeSource },
      },
    };

    // For GGUF models, add DualCLIPLoader and VAELoader
    if (isGGUF) {
      workflow["5"] = {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "clip_l.safetensors",
          clip_name2: "t5xxl_fp8_e4m3fn.safetensors",
          type: "flux",
        },
      };
      workflow["15"] = {
        class_type: "VAELoader",
        inputs: { vae_name: "ae.safetensors" },
      };
    }

    // Add ControlNet nodes if enabled
    if (controlnetOpts && controlnetOpts.enabled && controlnetOpts.modelName) {
      workflow["12"] = {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: controlnetOpts.modelName },
      };

      let cnImageSource = ["10", 0];

      if (controlnetOpts.preprocess) {
        const preprocessorMap = {
          canny: { class_type: "CannyEdgePreprocessor", inputs: { image: ["10", 0], low_threshold: 100, high_threshold: 200, resolution: 1024 } },
          depth: { class_type: "MiDaS-DepthMapPreprocessor", inputs: { image: ["10", 0], a: 6.283185307179586, bg_threshold: 0.1, resolution: 1024 } },
          scribble: { class_type: "ScribblePreprocessor", inputs: { image: ["10", 0], resolution: 1024 } },
          openpose: { class_type: "OpenposePreprocessor", inputs: { image: ["10", 0], detect_hand: "enable", detect_body: "enable", detect_face: "enable", resolution: 1024 } },
        };
        const preprocessor = preprocessorMap[controlnetOpts.type];
        if (preprocessor) {
          workflow["13"] = preprocessor;
          cnImageSource = ["13", 0];
        }
      }

      workflow["14"] = {
        class_type: "ControlNetApplyAdvanced",
        inputs: {
          positive: ["6", 0],
          negative: ["7", 0],
          control_net: ["12", 0],
          image: cnImageSource,
          vae: vaeSource,
          strength: parseFloat(controlnetOpts.strength),
          start_percent: 0,
          end_percent: 1,
        },
      };

      workflow["3"].inputs.positive = ["14", 0];
      workflow["3"].inputs.negative = ["14", 1];
    }

    return workflow;
  }

  // ===== SD1.5 / SDXL workflow (default) =====
  const isXL = arch === "SDXL";
  const sdSteps = isXL ? 28 : 25;
  const sdCfg = isXL ? 6 : 7;
  const sdSampler = "dpmpp_2m";
  const sdScheduler = "karras";
  const denoiseVal = parseFloat(document.getElementById("denoise-slider")?.value ?? 0.75);

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
      inputs: { text: negativeText || "text, watermark, ugly, lowres, bad quality", clip: ["4", 1] },
    },
    "8": {
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

  // Add ControlNet nodes if enabled
  if (controlnetOpts && controlnetOpts.enabled && controlnetOpts.modelName) {
    // Node 12: Load ControlNet model
    workflow["12"] = {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: controlnetOpts.modelName },
    };

    // Determine the image source for ControlNet
    let cnImageSource = ["10", 0]; // default: use the uploaded image directly

    // Node 13: Preprocessor (optional)
    if (controlnetOpts.preprocess) {
      const ppRes = isXL ? 1024 : 512;
      const preprocessorMap = {
        canny: { class_type: "CannyEdgePreprocessor", inputs: { image: ["10", 0], low_threshold: 100, high_threshold: 200, resolution: ppRes } },
        depth: { class_type: "MiDaS-DepthMapPreprocessor", inputs: { image: ["10", 0], a: 6.283185307179586, bg_threshold: 0.1, resolution: ppRes } },
        scribble: { class_type: "ScribblePreprocessor", inputs: { image: ["10", 0], resolution: ppRes } },
        openpose: { class_type: "OpenposePreprocessor", inputs: { image: ["10", 0], detect_hand: "enable", detect_body: "enable", detect_face: "enable", resolution: ppRes } },
      };
      const preprocessor = preprocessorMap[controlnetOpts.type];
      if (preprocessor) {
        workflow["13"] = preprocessor;
        cnImageSource = ["13", 0];
      }
    }

    // Node 14: Apply ControlNet (with VAE from checkpoint)
    workflow["14"] = {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["6", 0],
        negative: ["7", 0],
        control_net: ["12", 0],
        image: cnImageSource,
        vae: ["4", 2],
        strength: parseFloat(controlnetOpts.strength),
        start_percent: 0,
        end_percent: 1,
      },
    };

    // Rewire KSampler to use ControlNet conditioned outputs
    workflow["3"].inputs.positive = ["14", 0];
    workflow["3"].inputs.negative = ["14", 1];
  }

  return workflow;
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
  const MAX_POLLS = 60;

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
    }, 120000);

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
  const uploaded = localStorage.getItem("uploadedImage");
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

    const negativePrompt = negativePromptInput.value.trim();
    const promptJSON = buildWorkflowJSON(imageName, prompt, negativePrompt, selectedModel, controlnetOpts);

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

    // Step 4: Get result
    setRenderStep("done");
    if (renderStatus) renderStatus.textContent = "取得渲染結果...";

    const imageUrl = `${COMFYUI_ENDPOINT}/view?filename=${encodeURIComponent(renderedImageFile.filename)}&subfolder=${encodeURIComponent(renderedImageFile.subfolder)}&type=${encodeURIComponent(renderedImageFile.type)}`;
    resultImg.src = imageUrl;
    resultSection.classList.remove("hidden");

    // Cache result image
    try {
      const finalImageRes = await fetch(imageUrl);
      const finalBlob = await finalImageRes.blob();
      const reader = new FileReader();
      reader.readAsDataURL(finalBlob);
      reader.onloadend = () => localStorage.setItem("renderResult", reader.result);
    } catch (err) {
      console.warn("無法緩存圖片", err);
    }
  } catch (err) {
    console.error(err);
    alert(err.message || "渲染失敗，請檢查網路連線");
  } finally {
    renderBtn.disabled = false;
    renderBtn.textContent = "渲染";
    if (renderTimerInterval) { clearInterval(renderTimerInterval); renderTimerInterval = null; }
    setTimeout(() => {
      if (renderProgress) renderProgress.classList.add("hidden");
      resetProgress();
    }, 2000);
  }
});

// ---------- Load Available Models from ComfyUI ----------
async function loadAvailableModels() {
  try {
    const resp = await fetch(`${COMFYUI_ENDPOINT}/object_info/CheckpointLoaderSimple`);
    if (!resp.ok) throw new Error("Failed to fetch models");
    const data = await resp.json();
    const models = data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];

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

    const archOrder = ["SDXL", "SD1.5", "FLUX", "SD3", "其他"];
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

    const lastModel = localStorage.getItem("selectedModel");
    if (lastModel && models.includes(lastModel)) {
      modelSelect.value = lastModel;
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

    const archOrder = ["SDXL", "SD1.5", "FLUX", "SD3", "其他"];
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

// Track active tags
const activeTags = new Set();

document.getElementById("tags-body")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tag-btn");
  if (!btn) return;

  const tag = btn.dataset.tag;
  const isActive = btn.classList.toggle("active");

  if (isActive) {
    activeTags.add(tag);
    // Append to prompt
    const current = promptInput.value.trim();
    promptInput.value = current ? `${current}, ${tag}` : tag;
  } else {
    activeTags.delete(tag);
    // Remove from prompt
    let current = promptInput.value;
    // Remove the tag and cleanup commas
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    current = current.replace(new RegExp(",?\\s*" + escaped + "\\s*,?"), (match) => {
      if (match.startsWith(",") && match.endsWith(",")) return ",";
      return "";
    });
    current = current.replace(/^[,\s]+|[,\s]+$/g, "").replace(/,\s*,/g, ", ");
    promptInput.value = current;
  }
});

// ---------- Scene Presets ----------
const SCENE_PRESETS = {
  "interior-realistic": {
    name: "室內寫實",
    desc: "SketchUp 線圖 → 照片級寫實渲染。自動配置 JuggernautXL + Depth ControlNet",
    checkpoint: "juggernaut",
    checkpointFallback: "realvis",
    controlnet: { enabled: true, type: "depth", keyword: "depth", strength: 0.85 },
    denoise: 0.65,
    promptTemplate: "photorealistic interior design, professional architectural photography, warm natural lighting, detailed materials and textures, 8K, ray tracing, soft shadows",
    negativeTemplate: "cartoon, painting, sketch, blurry, low quality, deformed, unrealistic, oversaturated, plastic texture, flat lighting, watermark, text",
  },
  "interior-style": {
    name: "風格轉換",
    desc: "已渲染圖 → 換風格。低重繪幅度保留配置，只改材質/色調",
    checkpoint: "juggernaut",
    checkpointFallback: "realvis",
    controlnet: { enabled: true, type: "depth", keyword: "depth", strength: 0.9 },
    denoise: 0.45,
    promptTemplate: "same layout, same furniture arrangement, photorealistic interior design, professional photography",
    negativeTemplate: "different layout, moved furniture, cartoon, blurry, low quality, watermark",
  },
  "exterior": {
    name: "建築外觀",
    desc: "建築外觀渲染。ZavyChroma 高色彩 + Canny 保留結構線條",
    checkpoint: "zavychroma",
    checkpointFallback: "juggernaut",
    controlnet: { enabled: true, type: "canny", keyword: "canny", strength: 0.85 },
    denoise: 0.65,
    promptTemplate: "photorealistic architectural exterior, professional photography, blue sky, landscaping, natural lighting, detailed facade materials, 8K",
    negativeTemplate: "cartoon, painting, blurry, low quality, deformed, watermark",
  },
  "night-scene": {
    name: "夜景氣氛",
    desc: "夜景/低光氛圍渲染。NightVision 模型擅長電影級暗調場景",
    checkpoint: "nightvision",
    checkpointFallback: "juggernaut",
    controlnet: { enabled: true, type: "depth", keyword: "depth", strength: 0.75 },
    denoise: 0.7,
    promptTemplate: "night scene interior, warm ambient lighting, cozy atmosphere, cinematic mood, professional photography, dramatic shadows, 8K",
    negativeTemplate: "bright daylight, overexposed, cartoon, blurry, low quality, watermark",
  },
};

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

    // Ensure preprocess is on
    controlnetPreprocess.checked = true;
    localStorage.setItem("controlnetPreprocess", "true");

    // Load ControlNet models and auto-select matching one
    loadControlNetModels().then(() => {
      const arch = detectModelArch(modelSelect.value);
      const cnOptions = Array.from(controlnetModel.options);
      // Find matching: same arch + matching keyword
      let cnMatch = cnOptions.find((o) => {
        const oArch = detectModelArch(o.value);
        return oArch === arch && o.value.toLowerCase().includes(preset.controlnet.keyword);
      });
      // Fallback: just keyword match
      if (!cnMatch) {
        cnMatch = cnOptions.find((o) => o.value.toLowerCase().includes(preset.controlnet.keyword));
      }
      if (cnMatch) {
        controlnetModel.value = cnMatch.value;
        localStorage.setItem("controlnetModelName", cnMatch.value);
        updateCnModelDesc();
      }
    });
  }

  // 4. Set prompt template (only if prompt is empty)
  if (!promptInput.value.trim()) {
    promptInput.value = preset.promptTemplate;
  }

  // 5. Set negative prompt
  negativePromptInput.value = preset.negativeTemplate;
  negativePromptRow.classList.remove("hidden");

  // 6. Show description
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

// Restore active preset on load
const savedPreset = localStorage.getItem("activePreset");
if (savedPreset) {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === savedPreset);
  });
  const presetDesc = document.getElementById("preset-desc");
  if (presetDesc && SCENE_PRESETS[savedPreset]) {
    presetDesc.textContent = `✓ ${SCENE_PRESETS[savedPreset].desc}`;
  }
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

// ---------- Init ----------
restoreStateIfExists();
document.querySelector('[data-tool="brush"]')?.classList.add("active");
loadAvailableModels();
restoreControlNetSettings();
