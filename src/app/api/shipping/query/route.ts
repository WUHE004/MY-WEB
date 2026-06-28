import { NextRequest, NextResponse } from "next/server";
import { queryTracking } from "@/lib/kuaidi100";

// GET /api/shipping/query?tracking_number=xxx - 查询物流信息
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get("tracking_number");

    if (!trackingNumber) {
      return NextResponse.json({ error: "请提供快递单号" }, { status: 400 });
    }

    const result = await queryTracking(trackingNumber);

    if (!result.success) {
      return NextResponse.json({ error: result.error || "物流查询失败" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Query shipping error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}