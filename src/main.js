// src/main.js
// --------------------------------------------------
// Main logic for the AI 渲染助手 web app.
// --------------------------------------------------
import { COMFYUI_ENDPOINT } from "../config.js";

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

// ---------- UI Elements (Progress) ----------
const renderProgress = document.getElementById("render-progress");
const renderStatus = document.getElementById("render-status");

// ---------- State ----------
let currentTool = "brush"; // brush | color | shape
let brushColor = "#ff6b6b";
let brushSize = 4;
let isDrawing = false;
let startX = 0;
let startY = 0;
let cachedOriginalImage = null; // Cached image to avoid async reload flicker

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
    cachedOriginalImage = img; // Cache for shape tool redraw (avoids flicker)
    // Save original image for later re‑use
    try {
      localStorage.setItem("uploadedImage", dataURL);
    } catch (err) {
      console.warn("localStorage quota exceeded. Cannot save image.", err);
    }
    showCanvas();
  };
  img.src = dataURL;
}

function exportCanvasBase64() {
  return canvas.toDataURL("image/png");
}

function saveCurrentState() {
  // Store both original image and annotation overlay
  const annotation = exportCanvasBase64();
  try {
    localStorage.setItem("annotationImage", annotation);
  } catch (err) {
    console.warn("localStorage quota exceeded. Cannot save annotation image.", err);
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

  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataURL = ev.target.result;
    if (file.type.startsWith("image/")) {
      thumbImg.src = dataURL;
      loadImageToCanvas(dataURL);
    } else {
      // Show generic document icon for 3D files
      thumbImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='gray'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z'/></svg>";
      canvasWrapper.classList.add("hidden");
      try {
        localStorage.setItem("uploadedImage", dataURL);
      } catch (err) {
        console.warn("localStorage quota exceeded. Cannot save 3D file data.", err);
      }
    }
  };
  reader.readAsDataURL(file);
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

  // Handle undo button
  if (tool === "undo") {
    undo();
    return;
  }

  if (tool) {
    currentTool = tool;
    // Update active state indicator
    toolbar.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  if (tool === "color") {
    // Open native color picker (fixed: delay removal until interaction completes)
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

// Helper: get canvas coordinates from mouse or touch event
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
  pushToUndoStack(); // Save state before drawing for undo
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
    // Synchronous redraw using cached image (no flicker)
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

// Mouse events
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

// Touch events (mobile/tablet support)
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
  // touchend has no touches, use changedTouches
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const touch = e.changedTouches[0];
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  handleDrawEnd(x, y);
}, { passive: false });

// Keyboard shortcut: Ctrl+Z / Cmd+Z for undo
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }
});

// ---------- Render Request ----------
renderBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    alert("請輸入渲染提示文字");
    return;
  }
  const uploaded = localStorage.getItem("uploadedImage");
  if (!uploaded) {
    alert("請先上傳圖片或模型");
    return;
  }
  const annotation = exportCanvasBase64();
  renderBtn.disabled = true;
  renderBtn.textContent = "渲染中...";
  if (renderProgress) renderProgress.classList.remove("hidden");

  // Convert data URI to Blob
  function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  }

  try {
    renderBtn.textContent = "上傳草圖至 ComfyUI...";
    if (renderStatus) renderStatus.textContent = "上傳草圖至 ComfyUI...";
    const blob = dataURItoBlob(annotation);
    const formData = new FormData();
    formData.append("image", blob, "canvas_annotation.png");
    
    // 1. Upload image
    let uploadResp;
    try {
      uploadResp = await fetch(`${COMFYUI_ENDPOINT}/upload/image`, {
        method: "POST",
        body: formData
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

    // 2. Generate standard ComfyUI JSON payload for simple img2img
    // 註: 底下使用的 Checkpoint 名稱 ("v1-5-pruned-emaonly.safetensors") 如果您電腦裡沒有這顆模型會報錯，可以將名字換成您電腦裡有的模型名稱。
    const promptJSON = {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "seed": Math.floor(Math.random() * 1000000000),
          "steps": 20,
          "cfg": 8,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 0.5, // 0.5 會有大約 50% 的影像改變，用於保留你的構圖
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["8", 0]
        }
      },
      "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": "v1-5-pruned-emaonly.safetensors"
        }
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": prompt,
          "clip": ["4", 1]
        }
      },
      "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": "text, watermark, ugly, lowres, bad quality",
          "clip": ["4", 1]
        }
      },
      "8": {
        "class_type": "VAEEncode",
        "inputs": {
          "pixels": ["10", 0],
          "vae": ["4", 2]
        }
      },
      "9": {
        "class_type": "SaveImage",
        "inputs": {
          "filename_prefix": "RenderApp",
          "images": ["11", 0]
        }
      },
      "10": {
        "class_type": "LoadImage",
        "inputs": {
          "image": imageName
        }
      },
      "11": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["3", 0],
          "vae": ["4", 2]
        }
      }
    };
    
    renderBtn.textContent = "送出任務...";
    if (renderStatus) renderStatus.textContent = "送出渲染任務...";
    const reqBody = { prompt: promptJSON };
    const queueResp = await fetch(`${COMFYUI_ENDPOINT}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
    });
    if (!queueResp.ok) throw new Error("傳送渲染工作至 ComfyUI 失敗");
    const queueData = await queueResp.json();
    const promptId = queueData.prompt_id;

    // 3. Poll for the result in History Endpoint every 2 seconds
    renderBtn.textContent = "正在排隊與渲染中...";
    if (renderStatus) renderStatus.textContent = "正在排隊與渲染中...";
    let renderedImageFile = null;
    let pollCount = 0;
    const MAX_POLLS = 30; // 最大輪詢 30 次，每次 2 秒 (共 1 分鐘超時)

    while (!renderedImageFile && pollCount < MAX_POLLS) {
      pollCount++;
      await new Promise(r => setTimeout(r, 2000));
      const historyResp = await fetch(`${COMFYUI_ENDPOINT}/history/${promptId}`);
      if (!historyResp.ok) continue;
      const historyData = await historyResp.json();
      
      // If the prompt is finished and has outputs
      if (historyData[promptId] && historyData[promptId].outputs) {
         const outputs = historyData[promptId].outputs;
         for (let nodeId in outputs) {
            if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
               renderedImageFile = outputs[nodeId].images[0];
               break;
            }
         }
      }
    }

    if (!renderedImageFile) {
      throw new Error("渲染任務已超時（等待超過 1 分鐘），請檢查 ComfyUI 伺服器是否正常運作");
    }

    // 4. Retrieve the actual image
    const imageUrl = `${COMFYUI_ENDPOINT}/view?filename=${renderedImageFile.filename}&subfolder=${renderedImageFile.subfolder}&type=${renderedImageFile.type}`;
    resultImg.src = imageUrl;
    resultSection.classList.remove("hidden");
    
    // Optional: save to local storage
    try {
       const finalImageRes = await fetch(imageUrl);
       const finalBlob = await finalImageRes.blob();
       const reader = new FileReader();
       reader.readAsDataURL(finalBlob);
       reader.onloadend = () => localStorage.setItem("renderResult", reader.result);
    } catch(err) {
       console.warn("無法緩存圖片", err);
    }

  } catch (err) {
    console.error(err);
    alert(err.message || "渲染失敗，請檢查網路連線");
  } finally {
    renderBtn.disabled = false;
    renderBtn.textContent = "渲染";
    if (renderProgress) renderProgress.classList.add("hidden");
  }
});

// ---------- Init ----------
restoreStateIfExists();
// Set initial active tool indicator
document.querySelector('[data-tool="brush"]')?.classList.add("active");
