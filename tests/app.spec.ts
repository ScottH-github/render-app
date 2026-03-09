import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('AI 渲染助手 App', () => {

  test('首頁應該正常載入，並顯示所有必要元素', async ({ page }) => {
    await page.goto('/');

    // 測試標題是否正確
    await expect(page).toHaveTitle(/AI 渲染助手/);

    // 測試標題文字
    const title = page.locator('h1.title');
    await expect(title).toHaveText('AI 渲染助手');

    // 測試「上傳」區塊是否存在且可見
    const uploadLabel = page.locator('#upload-label');
    await expect(uploadLabel).toBeVisible();

    // 測試畫布初始為隱藏狀態
    const canvasWrapper = page.locator('#canvas-wrapper');
    await expect(canvasWrapper).toHaveClass(/hidden/);
  });

  test('點選渲染但不提供圖片應顯示錯誤', async ({ page }) => {
    await page.goto('/');
    
    let dialogAppeared = false;
    page.once('dialog', async dialog => {
      dialogAppeared = true;
      expect(dialog.message()).toContain('請輸入渲染提示文字');
      await dialog.accept();
    });
    await page.locator('#render-btn').click();
    expect(dialogAppeared).toBe(true);
  });

  test('可以模擬載入圖片與畫布顯示', async ({ page }) => {
    await page.goto('/');
    // 使用 Playwright 推薦的 setInputFiles 直接設置隱藏的 input 欄位，使用專案根目錄的 dummy.png
    await page.setInputFiles('#file-input', 'dummy.png');

    // 測試上傳後：
    // 1. 上傳 label 隱藏
    await expect(page.locator('#upload-label')).toHaveClass(/hidden/);

    // 2. 顯示預覽區域
    await expect(page.locator('#file-preview')).not.toHaveClass(/hidden/);

    // 3. 檔名是否正確
    await expect(page.locator('#thumb-name')).toHaveText('dummy.png');

    // 4. canvas wrapper 應顯示
    await expect(page.locator('#canvas-wrapper')).not.toHaveClass(/hidden/);

    // 5. 點擊移除按鈕
    await page.locator('#remove-file-btn').click();

    // 移除後 canvas 應該隱藏
    await expect(page.locator('#canvas-wrapper')).toHaveClass(/hidden/);
  });

  test('有提示詞但沒有上傳圖片應顯示上傳錯誤', async ({ page }) => {
    await page.goto('/');

    // 先填入提示詞
    await page.fill('#prompt-input', '現代豪華客廳');

    let dialogMessage = '';
    page.once('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.locator('#render-btn').click();
    expect(dialogMessage).toContain('請先上傳圖片或模型');
  });

  test('工具列按鈕應有啟用狀態指示', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#file-input', 'dummy.png');

    // 預設畫筆工具應該是 active
    await expect(page.locator('[data-tool="brush"]')).toHaveClass(/active/);

    // 點選形狀工具
    await page.locator('[data-tool="shape"]').click();
    await expect(page.locator('[data-tool="shape"]')).toHaveClass(/active/);
    await expect(page.locator('[data-tool="brush"]')).not.toHaveClass(/active/);
  });

  test('渲染進度指示器初始應為隱藏', async ({ page }) => {
    await page.goto('/');
    const progress = page.locator('#render-progress');
    await expect(progress).toHaveClass(/hidden/);
  });
});
