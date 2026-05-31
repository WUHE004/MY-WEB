import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const [
    { data: monthlyData, error: mErr },
    { data: transactions, error: tErr },
    { data: categoryData, error: cErr },
    { data: platformData, error: pErr },
  ] = await Promise.all([
    supabase.from("monthly_revenue").select("*").order("id"),
    supabase.from("transactions").select("*").order("date", { ascending: false }),
    supabase.from("category_data").select("*").order("id"),
    supabase.from("platform_revenue").select("*").order("id"),
  ]);

  if (mErr || tErr || cErr || pErr) {
    return NextResponse.json(
      { error: (mErr || tErr || cErr || pErr)?.message },
      { status: 500 }
    );
  }

  const totalRevenue = (monthlyData || []).reduce((s: number, d: { revenue: number }) => s + d.revenue, 0);
  const totalCost = (monthlyData || []).reduce((s: number, d: { cost: number }) => s + d.cost, 0);
  const totalProfit = totalRevenue - totalCost;

  return NextResponse.json({
    monthlyData: (monthlyData || []).map((r: { month: string; revenue: number; cost: number }) => ({
      ...r,
      profit: r.revenue - r.cost,
    })),
    transactions: transactions || [],
    categoryData: categoryData || [],
    platformData: platformData || [],
    summary: { totalRevenue, totalCost, totalProfit },
  });
}