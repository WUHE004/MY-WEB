import { NextRequest, NextResponse } from "next/server";
import { batchUploadProducts, ProductToUpload, UploadResult } from "@/lib/playwright-douyin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5分钟超时

// POST /api/douyin/upload - 批量上架商品到抖店
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products, action = "upload" } = body as {
      products: ProductToUpload[];
      action?: "upload" | "test_login";
    };

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "请提供要上架的商品列表" }, { status: 400 });
    }

    // 测试登录模式
    if (action === "test_login") {
      const { launchBrowser, checkLogin } = await import("@/lib/playwright-douyin");
      const { context, page } = await launchBrowser(false);
      const loggedIn = await checkLogin(page);
      await context.close();
      return NextResponse.json({
        success: true,
        logged_in: loggedIn,
        message: loggedIn ? "抖店已登录" : "抖店未登录，请在浏览器中完成登录",
      });
    }

    // 验证商品数据
    for (const p of products) {
      if (!p.sale_id || !p.name || !p.photo) {
        return NextResponse.json(
          { error: `商品 ${p.sale_id || "(未知)"} 缺少必要字段 (sale_id/name/photo)` },
          { status: 400 }
        );
      }
    }

    console.log(`[douyin/upload] 开始批量上架 ${products.length} 个商品`);

    // 调用 Playwright 批量上架
    const results: UploadResult[] = await batchUploadProducts(products, (msg, current, total) => {
      console.log(`[douyin/upload] [${current}/${total}] ${msg}`);
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: failCount === 0,
      total: products.length,
      success_count: successCount,
      fail_count: failCount,
      results,
      message:
        failCount === 0
          ? `全部 ${successCount} 个商品已成功上架`
          : `${successCount} 个成功，${failCount} 个失败`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[douyin/upload] 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/douyin/upload - 检查抖店登录状态
export async function GET() {
  try {
    const { launchBrowser, checkLogin } = await import("@/lib/playwright-douyin");
    const { context, page } = await launchBrowser(false);
    const loggedIn = await checkLogin(page);
    await context.close();
    return NextResponse.json({ logged_in: loggedIn });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
