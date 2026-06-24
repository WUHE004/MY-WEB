import { chromium, Browser, Page, BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || "";
const USER_DATA_DIR = process.env.PLAYWRIGHT_USER_DATA_DIR
  || path.join(os.homedir(), ".playwright-douyin-data");

export interface ProductToUpload {
  sale_id: string;
  name: string;
  photo: string;
  sell_price: number;
  remaining: number;
  sizes?: Record<string, number>;
  manufacturer?: string;
}

export interface UploadResult {
  sale_id: string;
  success: boolean;
  product_id?: string;
  product_url?: string;
  error?: string;
}

export interface ComboResult {
  success: boolean;
  combo_id?: string;
  combo_url?: string;
  product_count: number;
  error?: string;
}

// 下载远程图片到本地临时目录
async function downloadImage(url: string, saleId: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片下载失败: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = (url.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)?.[1] || "jpg").toLowerCase();
  const tmpPath = path.join(os.tmpdir(), `douyin_${saleId}_${Date.now()}.${ext}`);
  await fs.promises.writeFile(tmpPath, buffer);
  return tmpPath;
}

// 等待并点击元素
async function clickByText(page: Page, selector: string, text: string, timeout = 10000) {
  await page.locator(selector).filter({ hasText: text }).first().click({ timeout });
}

// 等待并填写输入框
async function fillByLabel(page: Page, label: string, value: string, timeout = 10000) {
  const input = page.getByLabel(label, { exact: false }).first();
  await input.fill(value, { timeout });
}

// 启动浏览器（持久化上下文，保持登录状态）
export async function launchBrowser(headless = false): Promise<{ browser: Browser | null; context: BrowserContext; page: Page }> {
  // 确保用户数据目录存在
  await fs.promises.mkdir(USER_DATA_DIR, { recursive: true });

  const launchOptions: any = {
    headless,
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  if (CHROMIUM_PATH) {
    launchOptions.executablePath = CHROMIUM_PATH;
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOptions);
  const page = context.pages()[0] || await context.newPage();

  return { browser: null, context, page };
}

// 检查是否已登录
export async function checkLogin(page: Page): Promise<boolean> {
  try {
    await page.goto("https://fxg.jinritemai.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    // 如果URL中包含login或页面包含登录相关元素，则未登录
    const url = page.url();
    if (url.includes("login") || url.includes("sso")) return false;
    // 检查页面是否包含商品管理入口
    const hasShopEntry = await page.locator("text=商品管理").count() > 0
      || await page.locator("text=发布商品").count() > 0
      || page.url().includes("fxg.jinritemai.com/");
    return hasShopEntry;
  } catch (err) {
    console.error("检查登录状态失败:", err);
    return false;
  }
}

// 创建单个商品（抖店后台发布商品）
export async function createProduct(
  page: Page,
  product: ProductToUpload,
  onProgress?: (msg: string) => void
): Promise<UploadResult> {
  try {
    onProgress?.(`开始上架 ${product.sale_id}...`);

    // 1. 导航到商品发布页面
    await page.goto("https://fxg.jinritemai.com/shop/ware/add", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    onProgress?.(`填写商品信息 ${product.sale_id}...`);

    // 2. 填写商品名称（标题）
    const titleInput = page.locator("input[placeholder*='商品名称'], input[placeholder*='标题'], textarea[placeholder*='商品名称']").first();
    await titleInput.fill(product.name || product.sale_id, { timeout: 10000 });
    await page.waitForTimeout(500);

    // 3. 上传主图
    onProgress?.(`上传主图 ${product.sale_id}...`);
    const photoPath = await downloadImage(product.photo, product.sale_id);
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(photoPath);
    await page.waitForTimeout(3000); // 等待图片上传完成

    // 4. 设置售价
    onProgress?.(`设置售价 ${product.sale_id}...`);
    const priceInput = page.locator("input[placeholder*='价格'], input[placeholder*='售价']").first();
    await priceInput.fill(String(product.sell_price), { timeout: 10000 });
    await page.waitForTimeout(500);

    // 5. 设置库存（总库存）
    onProgress?.(`设置库存 ${product.sale_id}...`);
    const stockInput = page.locator("input[placeholder*='库存'], input[placeholder*='总库存']").first();
    await stockInput.fill(String(product.remaining), { timeout: 10000 });
    await page.waitForTimeout(500);

    // 6. 设置规格（商品编码作为规格名）
    onProgress?.(`设置规格 ${product.sale_id}...`);
    // 查找"添加规格"按钮
    const addSpecBtn = page.locator("button:has-text('添加规格'), a:has-text('添加规格'), span:has-text('添加规格')").first();
    if (await addSpecBtn.count() > 0) {
      await addSpecBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // 填写规格名（使用商品编码）
      const specNameInput = page.locator("input[placeholder*='规格名'], input[placeholder*='规格名称']").last();
      if (await specNameInput.count() > 0) {
        await specNameInput.fill(product.sale_id, { timeout: 5000 });
      }
    }

    // 7. 截图保存（调试用）
    const screenshotPath = path.join(os.tmpdir(), `douyin_${product.sale_id}_filled.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    onProgress?.(`等待确认发布 ${product.sale_id}...`);

    // 8. 注意：不要自动点击"发布商品"，留给用户确认
    // 弹出成功提示，告知用户商品信息已填好，请手动点击发布

    return {
      sale_id: product.sale_id,
      success: true,
      product_url: page.url(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`商品 ${product.sale_id} 上架失败:`, errorMsg);

    // 错误截图
    try {
      const errorShotPath = path.join(os.tmpdir(), `douyin_${product.sale_id}_error.png`);
      await page.screenshot({ path: errorShotPath, fullPage: true });
    } catch { /* ignore */ }

    return {
      sale_id: product.sale_id,
      success: false,
      error: errorMsg,
    };
  }
}

// 批量上架商品
export async function batchUploadProducts(
  products: ProductToUpload[],
  onProgress?: (msg: string, current: number, total: number) => void
): Promise<UploadResult[]> {
  const { context, page } = await launchBrowser(false);

  try {
    // 检查登录
    let loggedIn = await checkLogin(page);
    if (!loggedIn) {
      onProgress?.("检测到未登录，正在跳转到抖店登录页...", 0, products.length);
      // 跳转到抖店登录页，让用户手动登录
      await page.goto("https://fxg.jinritemai.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
      // 等待用户登录（最多等120秒，每3秒检测一次）
      onProgress?.("请在弹出的浏览器中登录抖店，登录成功后将自动继续...", 0, products.length);
      const maxWait = 120; // 最多等120秒
      const interval = 3; // 每3秒检测一次
      let waited = 0;
      while (waited < maxWait) {
        await page.waitForTimeout(interval * 1000);
        waited += interval;
        loggedIn = await checkLogin(page);
        if (loggedIn) {
          onProgress?.("登录成功！开始上架商品...", 0, products.length);
          break;
        }
      }
      if (!loggedIn) {
        return products.map((p) => ({
          sale_id: p.sale_id,
          success: false,
          error: "登录超时，请在浏览器中完成抖店登录后重试",
        }));
      }
    }

    const results: UploadResult[] = [];
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      onProgress?.(`上架 ${product.sale_id} (${i + 1}/${products.length})`, i + 1, products.length);

      const result = await createProduct(page, product, (msg) => {
        onProgress?.(msg, i + 1, products.length);
      });
      results.push(result);

      // 等待用户查看后继续下一个
      if (i < products.length - 1) {
        await page.waitForTimeout(2000);
      }
    }

    return results;
  } finally {
    // 不关闭浏览器，让用户继续操作
    // await context.close();
  }
}

// 创建商品集合页（用于复合链接）
export async function createComboPage(
  page: Page,
  productIds: string[],
  comboName: string = "直播选品套餐"
): Promise<ComboResult> {
  try {
    // 抖店没有原生的"复合链接"概念，通常通过以下方式实现：
    // 1. 创建商品套餐（combo）
    // 2. 创建商品集合页
    // 3. 分享商品列表

    // 这里我们采用：创建商品集合页的方式
    await page.goto("https://fxg.jinritemai.com/shop/collection/add", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // 填写集合页名称
    const nameInput = page.locator("input[placeholder*='集合页名称'], input[placeholder*='页面名称']").first();
    await nameInput.fill(comboName, { timeout: 10000 });
    await page.waitForTimeout(500);

    // 添加商品到集合
    for (const productId of productIds) {
      try {
        const addBtn = page.locator("button:has-text('添加商品')").first();
        if (await addBtn.count() > 0) {
          await addBtn.click({ timeout: 5000 });
          await page.waitForTimeout(1000);

          // 搜索商品ID
          const searchInput = page.locator("input[placeholder*='搜索商品']").first();
          if (await searchInput.count() > 0) {
            await searchInput.fill(productId, { timeout: 5000 });
            await page.waitForTimeout(2000);

            // 选择第一个结果
            const firstResult = page.locator(".product-item, .goods-item, [class*='item']").first();
            if (await firstResult.count() > 0) {
              await firstResult.click({ timeout: 5000 });
            }
          }

          // 确认添加
          const confirmBtn = page.locator("button:has-text('确定'), button:has-text('确认')").first();
          if (await confirmBtn.count() > 0) {
            await confirmBtn.click({ timeout: 5000 });
            await page.waitForTimeout(1000);
          }
        }
      } catch (err) {
        console.error(`添加商品 ${productId} 到集合页失败:`, err);
      }
    }

    return {
      success: true,
      product_count: productIds.length,
      combo_url: page.url(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      product_count: productIds.length,
      error: errorMsg,
    };
  }
}
