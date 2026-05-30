import { NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getDashboardData } from "@/lib/queries";

export async function GET() {
  try {
    await initDatabase();
    const data = getDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Dashboard data error:", error);
    return NextResponse.json(
      { error: "获取数据失败" },
      { status: 500 }
    );
  }
}