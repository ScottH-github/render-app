import { test, expect } from '@playwright/test';

test.describe('AI 渲染助手 App End-to-End', () => {

  test.beforeEach(async ({ page }) => {
    // 預先對所有打向 localhost:8787 的請求進行 Mock，以免依賴真實的本地 ComfyUI 實體
    await page.route('**/upload/image', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: "mock_image.png" })
      });
    });

    await page.route('**/prompt', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompt_id: "mock_prompt_id" })
      });
    });

    await page.route('**/history/mock_prompt_id', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          "mock_prompt_id": {
            "outputs": {
              "11": {
                "images": [
                  { "filename": "mock_result.png", "subfolder": "", "type": "output" }
                ]
              }
            }
          }
        })
      });
    });

    await page.route('**/view?filename=mock_result.png*', async route => {
      // 回報一個迷你的透明 PNG
      const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: transparentPng
      });
    });
  });

  test('點選渲染按鈕應該經歷完整上傳門檻及顯示結果', async ({ page }) => {
    await page.goto('/');

    // 1. 上傳測試圖片
    await page.setInputFiles('#file-input', 'dummy.png');
    await expect(page.locator('#canvas-wrapper')).toBeVisible();

    // 2. 輸入提示詞
    await page.fill('#prompt-input', 'Modern luxury living room');

    // 3. 點選渲染
    const renderBtn = page.locator('#render-btn');
    await renderBtn.click();

    // 4. 驗證按鈕文字變化 (會經歷 上傳 -> 送出 -> 渲染中)
    // 我們直接檢查最終結果是否出現
    const resultImg = page.locator('#result-image');
    await expect(resultImg).toBeVisible({ timeout: 10000 });
    
    // 5. 驗證結果區域已顯示
    await expect(page.locator('#result-section')).not.toHaveClass(/hidden/);
  });
});
