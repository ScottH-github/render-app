# RENDER-APP 開發說明文檔

本文件旨在協助開發人員快速理解 **RENDER-APP** 的架構、邏輯與開發流程。

---

## 🏗️ 系統架構

專案採三層架構設計，確保開發靈活性與安全性：

1.  **前端 (Frontend)**: 
    *   **位置**: 專案根目錄、`index.html` 與 `src/`。
    *   **技術**: 原生 JavaScript (Vanilla JS), HTML5 Canvas, CSS (Glassmorphism 風格)。
    *   **功能**: 處理檔案上傳、提供標註工具 (畫筆、形狀)、發送渲染請求及顯示結果。
2.  **代理 (Proxy)**:
    *   **位置**: `workers-proxy/`。
    *   **技術**: Cloudflare Worker (Wrangler)。
    *   **功能**: 轉發前端請求至本地 ComfyUI，解決瀏覽器 CORS 跨域限制，隱藏後端 API 位址（可視需求擴展）。
3.  **後端 (Backend/AI Engine)**:
    *   **位置**: 本地伺服器 (預設 IP: `http://192.168.0.242:8188`)。
    *   **技術**: ComfyUI (Stable Diffusion)。
    *   **功能**: 執行實時 AI 渲染任務。

---

## 🛠️ 開發環境設置

### 1. 前端環境
*   使用 `http-server` 運行靜態網頁。
*   啟動指令: `npm start` (運行於 `http://localhost:3000`)。

### 2. 代理伺服器 (Workers Proxy)
*   進入目錄: `cd workers-proxy`
*   啟動開發模式: `npx wrangler dev --port 8787` (運行於 `http://localhost:8787`)。
*   **注意**: 需確保 `index.js` 中的 `targetBase` 指向正確的 ComfyUI 位址。

### 3. ComfyUI 設置
*   啟動 ComfyUI 時需開啟監聽與 CORS 支援：
    ```bash
    python main.py --listen 0.0.0.0 --enable-cors-header
    ```

---

## 📂 專案目錄結構

```text
render-app/
├── index.html          # 主入口文件
├── config.js          # 設定檔 (包含 COMFYUI_ENDPOINT)
├── src/
│   ├── main.js        # 核心前端邏輯 (Canvas 繪圖、API 調用)
│   └── style.css      # UI 樣式 (現代玻璃擬態風格)
├── workers-proxy/
│   └── src/index.js   # Cloudflare Worker 代理邏輯
├── tests/
│   └── app.spec.ts    # Playwright E2E 測試腳本
└── package.json       # 專案依賴與腳本
```

---

## 💡 核心邏輯解析

### 1. Canvas 標註系統
*   **繪圖**: 利用 `ctx.beginPath()`、`ctx.lineTo()` 實現流暢畫筆。
*   **形狀**: 透過 `ctx.strokeRect()` 實現框選標註。
*   **持久化**: 使用 `localStorage` 存儲上傳的圖片與標註圖層的 Base64 數據，確保頁面重整後進度不丟失。

### 2. ComfyUI 渲染流程
程序在 `src/main.js` 的 `renderBtn.addEventListener` 中：
1.  **上傳圖片**: 將 Canvas 標註轉換為 Blob，透過 `/upload/image` 送往 ComfyUI。
2.  **發送 Prompt**: 構建 ComfyUI 格式的 JSON 任務 (包含 KSampler, CheckpointLoader 等節點)，送往 `/prompt`。
3.  **狀態輪詢**: 每 2 秒請求 `/history/{promptId}`，檢查任務是否完成。
4.  **獲取結果**: 任務完成後，從輸出節點獲取 `filename` 並透過 `/view` 顯示圖片。

### 3. Proxy 運作原理
*   前端並不直接呼叫 `192.168.0.242`，而是呼叫本地代理 `localhost:8787`。
*   Proxy 接收請求、封裝 Headers、轉發至 ComfyUI、並在回傳時注入 `Access-Control-Allow-Origin: *` 以通過瀏覽器安全檢查。

---

## 🧪 自動化測試 (E2E)

本專案使用專門的測試框架確保渲染流程的穩定性：
*   **執行測試**: `npx playwright test`
*   **測試範圍**:
    *   圖片上傳功能。
    *   UI 元素顯示 (Canvas, Input)。
    *   渲染按鈕觸發邏輯。

---

## 📝 後續優化方向 (TODO)
1.  **3D 支援**: 優化 `.skp`, `.usdz` 檔案的預覽體驗。
2.  **模型切換**: 支援從前端選擇不同的 Checkpoint 或 LoRA。
3.  **進度條**: 對接 ComfyUI WebSocket 以顯示精確的渲染進度。
