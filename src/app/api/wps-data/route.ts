import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const [
      { data: products, error: pErr },
      { data: monthly, error: mErr },
      { data: links, error: lErr },
      { data: accounts, error: aErr },
    ] = await Promise.all([
      supabase.from("inbound_records").select("sale_id, name, total_stock").order("inbound_date", { ascending: false }),
      supabase.from("monthly_revenue").select("*").order("id"),
      supabase.from("links").select("*").eq("status", "active"),
      supabase.from("accounts").select("*").eq("status", "active"),
    ]);

    if (pErr || mErr) {
      return NextResponse.json({ error: "获取数据失败" }, { status: 500 });
    }

    const totalRevenue = (monthly || []).reduce((s: number, d: { revenue: number }) => s + d.revenue, 0);
    const totalProducts = new Set((products || []).map((r: { sale_id: string }) => r.sale_id?.toUpperCase()).filter(Boolean)).size;
    const activeLinks = (links || []).length;
    const operatingAccounts = (accounts || []).length;

    const salesData = (monthly || []).map((r: { month: string; revenue: number; cost: number }) => ({
      name: r.month,
      revenue: r.revenue,
      cost: r.cost,
      profit: r.revenue - r.cost,
    }));

    const topProducts = (products || []).map((p: { name: string; total_stock: number }) => ({
      name: p.name,
      sales: p.total_stock || 0,
      trend: "up" as const,
    }));

    return NextResponse.json({
      stats: {
        totalProducts,
        activeLinks,
        monthlyRevenue: totalRevenue,
        operatingAccounts,
        todayRevenue: totalRevenue,
      },
      salesData,
      topProducts,
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    return NextResponse.json({ error: "获取数据失败" }, { status: 500 });
  }
}