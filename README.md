# AI 渲染助手 (AI Render App)

這是一個結合前端繪圖、3D 模型預覽與本地 ComfyUI API 的 AI 渲染工具。

## 🚀 專案特點
- **即時標註**：支援上傳圖片或 3D 模型截圖後，直接在 Canvas 上進行筆刷、色塊、形狀標註。
- **本地算力**：串接本地端 ComfyUI (預設 IP: 192.168.0.242)，實現零成本、無限次的專業渲染。
- **隱私安全**：透過本地 CORS 代理伺服器 (Cloudflare Worker) 解決跨域問題，無須將金鑰暴露於前端。
- **自動化測試**：內建 Playwright E2E 測試，確保上傳與渲染流程穩定。

## 🏗️ 系統架構
- **前端 (Frontend)**: Vanilla JS + HTML5 Canvas (運作於 http://localhost:3000)
- **代理 (Proxy)**: Cloudflare Worker (運作於 http://localhost:8787)，負責將請求轉發至本地 ComfyUI 並解決 CORS 問題。
- **後端 (Backend)**: 本地 ComfyUI (運作於 192.168.0.242:8188)

## 🛠️ 安裝與啟動

### 1. 啟動前端
```bash
npm install
npm start
```
開啟 [http://localhost:3000](http://localhost:3000)

### 2. 啟動代理伺服器
```bash
cd workers-proxy
npx wrangler dev
```

### 3. 配置 ComfyUI
請確保您的 ComfyUI 啟動時包含以下參數：
```bash
python main.py --listen 0.0.0.0 --enable-cors-header
```

## 🧪 自動化測試
本專案使用 Playwright 進行測試：
```bash
npx playwright test
```

## 📝 TODO
- [ ] 支援更多 3D 檔案格式 (.skp, .usdz)
- [ ] 介面 UI/UX 美化與動畫優化
- [ ] 整合更多 ControlNet 模型 (Depth, Canny, Scribble)
