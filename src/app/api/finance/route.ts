import { NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getMonthlyRevenue, getTransactions, getCategoryData, getPlatformRevenue } from "@/lib/queries";

export async function GET() {
  await initDatabase();
  const monthlyData = getMonthlyRevenue();
  const transactions = getTransactions();
  const categoryData = getCategoryData();
  const platformData = getPlatformRevenue();

  const totalRevenue = monthlyData.reduce((s, d) => s + d.revenue, 0);
  const totalCost = monthlyData.reduce((s, d) => s + d.cost, 0);
  const totalProfit = totalRevenue - totalCost;

  return NextResponse.json({
    monthlyData,
    transactions,
    categoryData,
    platformData,
    summary: { totalRevenue, totalCost, totalProfit },
  });
}