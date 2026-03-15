import { test, expect } from '@playwright/test';

test.describe('AI 渲染助手 App End-to-End', () => {

  test.beforeEach(async ({ page }) => {
    // Mock model list endpoint
    await page.route('**/object_info/CheckpointLoaderSimple', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          CheckpointLoaderSimple: {
            input: {
              required: {
                ckpt_name: [["mock_model.safetensors"]]
              }
            }
          }
        })
      });
    });

    // Mock ControlNet model list endpoint
    await page.route('**/object_info/ControlNetLoader', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ControlNetLoader: {
            input: {
              required: {
                control_net_name: [["mock_controlnet.safetensors"]]
              }
            }
          }
        })
      });
    });

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
      const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: transparentPng
      });
    });
  });

  test('點選渲染按鈕應該經歷完整上傳門檻及顯示結果', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('dialog', async dialog => {
      logs.push(`[dialog] ${dialog.message()}`);
      await dialog.accept();
    });

    // Override WS endpoint to a fast-failing address in test env
    await page.addInitScript(() => {
      // @ts-ignore - Make WebSocket fail immediately in tests
      const OrigWS = window.WebSocket;
      window.WebSocket = function(url: string, protocols?: string | string[]) {
        // Redirect to a definitely-closed port so it fails fast
        return new OrigWS('ws://localhost:1/ws', protocols);
      } as any;
      window.WebSocket.prototype = OrigWS.prototype;
    });

    await page.goto('/');
    await expect(page.locator('#model-select')).not.toHaveText('載入中...');

    // 1. 上傳測試圖片
    await page.setInputFiles('#file-input', 'dummy.png');
    await expect(page.locator('#canvas-wrapper')).toBeVisible();

    // 2. 輸入提示詞
    await page.fill('#prompt-input', 'Modern luxury living room');

    // 3. 點選渲染
    await page.locator('#render-btn').click();

    // 4. 等待結果出現
    try {
      await expect(page.locator('#result-image')).toBeVisible({ timeout: 30000 });
    } catch (e) {
      console.log('=== Browser Console Logs ===');
      logs.forEach(l => console.log(l));
      console.log('=== End Logs ===');
      throw e;
    }

    // 5. 驗證結果區域已顯示
    await expect(page.locator('#result-section')).not.toHaveClass(/hidden/);
  });
});
