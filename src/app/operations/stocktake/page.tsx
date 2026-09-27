"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Loader2,
  ChevronRight,
  Warehouse,
  Rows4,
  Package,
  Truck,
  Crosshair,
  X,
  Folder,
  FolderOpen,
  ChevronUp,
  ChevronDown,
  QrCode,
  Download,
  Lock,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { PageWrapper, showToast } from "@/components/page-wrapper";
import { authFetch } from "@/lib/auth-fetch";

const DEFAULT_LAYERS = [1, 2, 3, 4, 5];
const DEFAULT_SHELF_DATA: Record<string, number[]> = { A: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], B: [1, 2], C: [1, 2, 3, 4, 5] };
const NO_ZONE = "未分区";

interface StockItem {
  sale_id: string;
  name: string;
  photo: string;
  shelf_no: string;
  manufacturer: string;
  cost_price: number;
  inbound_date: string;
  sizes: { size: number; qty: number }[];
}

interface Calibration {
  id: string;
  sale_id: string;
  name: string;
  photo: string;
  shelf_no: string;
  calibrations: { size: number; old_qty: number; new_qty: number }[];
  created_by: string;
  created_at: string;
}

// 货架号解析（兼容 双横线/单横线/缺排横线 三种历史格式）
function parseShelfNo(s: string): { l1: string; l2: string; l3: string } | null {
  const t = (s || "").trim();
  if (!t) return null;
  let m = t.match(/^([^-]+)-(\d+)--(\d+)$/);
  if (m) return { l1: m[1].toUpperCase(), l2: m[2], l3: m[3] };
  m = t.match(/^([^-]+)-(\d+)-(\d+)$/);
  if (m) return { l1: m[1].toUpperCase(), l2: m[2], l3: m[3] };
  m = t.match(/^([A-Za-z一-鿿]+)(\d+)-(\d+)$/);
  if (m) return { l1: m[1].toUpperCase(), l2: m[2], l3: m[3] };
  return null;
}

export default function StocktakePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [shelfData, setShelfData] = useState<Record<string, number[]>>(DEFAULT_SHELF_DATA);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);

  // 层级导航: zone(分区) → shelf(货架); 层以文件夹折叠形式展开/收回
  const [zone, setZone] = useState<string>("");
  const [shelf, setShelf] = useState<string>(""); // 货架号数字部分, 如 "1"
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set()); // 展开的层, key = "货架-层"

  // 扫码直达货架的权限拦截提示
  const [qrDenied, setQrDenied] = useState<"" | "login" | "role">("");

  // 货架二维码弹窗
  const [qrShelf, setQrShelf] = useState(""); // 货架号数字部分
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);

  // 搬货弹窗
  const [moveItem, setMoveItem] = useState<StockItem | null>(null);
  const [moveL1, setMoveL1] = useState("");
  const [moveL2, setMoveL2] = useState("");
  const [moveL3, setMoveL3] = useState("");
  const [moving, setMoving] = useState(false);

  // 校准弹窗
  const [calItem, setCalItem] = useState<StockItem | null>(null);
  const [calValues, setCalValues] = useState<Record<number, string>>({});
  const [calSubmitting, setCalSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/stocktake");
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "加载失败", "error");
        return;
      }
      setItems(data.items || []);
      if (data.shelf_data && typeof data.shelf_data === "object") {
        setShelfData(data.shelf_data as Record<string, number[]>);
      }
      setCalibrations(data.calibrations || []);
    } catch {
      showToast("网络错误", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 扫码直达货架: /operations/stocktake?zone=A&shelf=1（二维码贴在货架上, 扫码直接打开该货架盘点）
    const params = new URLSearchParams(window.location.search);
    const z = params.get("zone");
    const s = params.get("shelf");
    if (z && s) {
      const token = localStorage.getItem("member_token");
      if (!token) {
        setQrDenied("login");
        setLoading(false);
        return;
      }
      if ((localStorage.getItem("member_role") || "") !== "admin") {
        setQrDenied("role");
        setLoading(false);
        return;
      }
      setZone(z);
      setShelf(s);
    }
    load();
  }, [load]);

  // ---------- 分组计算 ----------
  const itemShelf = useMemo(() => {
    const map = new Map<string, { l1: string; l2: string; l3: string } | null>();
    for (const it of items) {
      if (!map.has(it.sale_id)) map.set(it.sale_id, parseShelfNo(it.shelf_no));
    }
    return map;
  }, [items]);

  // 分区列表: 货架设置中的排 ∪ 商品实际出现的排 + 未分区(排最后)
  const zones = useMemo(() => {
    const set = new Set<string>(Object.keys(shelfData));
    for (const parsed of itemShelf.values()) {
      if (parsed) set.add(parsed.l1);
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
    if (items.some((it) => !itemShelf.get(it.sale_id))) list.push(NO_ZONE);
    return list;
  }, [shelfData, itemShelf, items]);

  // 当前区的货架列表: 设置中的货架号 ∪ 该区商品实际货架号
  const shelves = useMemo(() => {
    if (!zone) return [];
    const set = new Set<number>();
    if (zone !== NO_ZONE) {
      for (const n of shelfData[zone] || []) set.add(n);
    }
    for (const [sid, parsed] of itemShelf) {
      if (parsed && parsed.l1 === zone) set.add(Number(parsed.l2));
    }
    return Array.from(set).filter((n) => n > 0).sort((a, b) => a - b);
  }, [zone, shelfData, itemShelf]);

  // 各货架统计（款数 + 件数）
  const shelfStats = useMemo(() => {
    const map = new Map<string, { count: number; pieces: number }>();
    for (const it of items) {
      const p = itemShelf.get(it.sale_id);
      if (!p || p.l1 !== zone) continue;
      const cur = map.get(p.l2) || { count: 0, pieces: 0 };
      cur.count++;
      cur.pieces += it.sizes.reduce((s, x) => s + x.qty, 0);
      map.set(p.l2, cur);
    }
    return map;
  }, [items, itemShelf, zone]);

  // 当前货架的层统计（款数 + 件数）
  const layerStats = useMemo(() => {
    const map = new Map<string, { count: number; pieces: number }>();
    if (!zone || !shelf) return map;
    for (const it of items) {
      const p = itemShelf.get(it.sale_id);
      if (!p || p.l1 !== zone || p.l2 !== shelf) continue;
      const cur = map.get(p.l3) || { count: 0, pieces: 0 };
      cur.count++;
      cur.pieces += it.sizes.reduce((s, x) => s + x.qty, 0);
      map.set(p.l3, cur);
    }
    return map;
  }, [items, itemShelf, zone, shelf]);

  // 指定层的商品
  const getLayerItems = useCallback(
    (layerNo: string) => {
      if (!zone || !shelf) return [];
      return items.filter((it) => {
        const p = itemShelf.get(it.sale_id);
        return !!p && p.l1 === zone && p.l2 === shelf && p.l3 === layerNo;
      });
    },
    [items, itemShelf, zone, shelf]
  );

  // 切换层文件夹展开/收回
  const toggleLayer = (layerNo: string) => {
    const key = `${shelf}-${layerNo}`;
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 未分区的商品
  const noZoneItems = useMemo(
    () => items.filter((it) => !itemShelf.get(it.sale_id)),
    [items, itemShelf]
  );

  // ---------- 搬货 ----------
  const openMove = async (it: StockItem) => {
    setMoveItem(it);
    setMoveL1("");
    setMoveL2("");
    setMoveL3("");
    // 每次打开重新拉取货架设置, 同步入库登记新增的货架
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.shelf_data && typeof data.shelf_data === "object") {
          setShelfData(data.shelf_data as Record<string, number[]>);
        }
      }
    } catch { /* 拉取失败用当前缓存 */ }
    // 回填现有货架号
    const p = parseShelfNo(it.shelf_no);
    if (p) {
      setMoveL1(p.l1);
      setMoveL2(p.l2);
      setMoveL3(p.l3);
    }
  };

  const saveMove = async () => {
    if (!moveItem || !moveL1 || !moveL2 || !moveL3 || moving) return;
    setMoving(true);
    try {
      const shelfNo = `${moveL1}-${moveL2}-${moveL3}`;
      const res = await authFetch("/api/stocktake", {
        method: "PUT",
        body: JSON.stringify({ sale_id: moveItem.sale_id, shelf_no: shelfNo }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "搬货失败", "error");
        return;
      }
      showToast(`${moveItem.sale_id} 已搬到 ${shelfNo}`, "success");
      setMoveItem(null);
      // 本地更新货架号并重新分组
      setItems((prev) =>
        prev.map((it) => (it.sale_id === moveItem.sale_id ? { ...it, shelf_no: shelfNo } : it))
      );
    } catch {
      showToast("网络错误", "error");
    } finally {
      setMoving(false);
    }
  };

  // ---------- 校准 ----------
  const openCalibrate = (it: StockItem) => {
    setCalItem(it);
    setCalValues({});
  };

  const submitCalibrate = async () => {
    if (!calItem || calSubmitting) return;
    const cals = calItem.sizes
      .map((s) => ({
        size: s.size,
        old_qty: s.qty,
        new_qty: calValues[s.size] === undefined || calValues[s.size] === "" ? s.qty : Math.max(0, Math.floor(Number(calValues[s.size]))),
      }))
      .filter((c) => c.new_qty !== c.old_qty);
    if (cals.length === 0) {
      showToast("没有需要校准的尺码（填入与现有数量不同的数字）", "error");
      return;
    }
    setCalSubmitting(true);
    try {
      const name = localStorage.getItem("member_name") || "";
      const res = await authFetch("/api/stocktake", {
        method: "POST",
        body: JSON.stringify({
          sale_id: calItem.sale_id,
          name: calItem.name,
          photo: calItem.photo,
          shelf_no: calItem.shelf_no,
          calibrations: cals,
          created_by: name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "提交失败", "error");
        return;
      }
      showToast(`已提交 ${calItem.sale_id} 的库存校准（${cals.map((c) => `${c.size}码 ${c.old_qty}→${c.new_qty}`).join("、")}），请到管理栏处理`, "success");
      setCalItem(null);
      // 更新本地待办数
      const cres = await authFetch("/api/stocktake?calibrations=1");
      if (cres.ok) {
        const cdata = await cres.json();
        setCalibrations(cdata.calibrations || []);
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setCalSubmitting(false);
    }
  };

  // ---------- 货架二维码 ----------
  // 生成单个货架的二维码图片（含货架名 + 层数, 可下载后用快递面单纸打印贴在货架上）
  const openQr = async (shelfNo: string) => {
    setQrShelf(shelfNo);
    setQrDataUrl("");
    setQrLoading(true);
    try {
      const url = `${window.location.origin}/operations/stocktake?zone=${encodeURIComponent(zone)}&shelf=${encodeURIComponent(shelfNo)}`;
      const qr = await QRCode.toDataURL(url, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = qr;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 不可用");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 400, 500);
      ctx.fillStyle = "#171717";
      ctx.textAlign = "center";
      // 货架名
      ctx.font = "bold 60px 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.fillText(`${zone}${shelfNo}`, 200, 84);
      // 二维码
      ctx.drawImage(img, 40, 110, 320, 320);
      // 层数
      ctx.font = "bold 38px 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.fillText(`共 ${DEFAULT_LAYERS.length} 层`, 200, 478);
      setQrDataUrl(canvas.toDataURL("image/png"));
    } catch {
      showToast("生成二维码失败", "error");
    } finally {
      setQrLoading(false);
    }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `货架${zone}${qrShelf}二维码.png`;
    a.click();
  };

  // ---------- 渲染 ----------
  // 扫码进入但未登录 / 权限不足的提示页
  if (qrDenied) {
    return (
      <PageWrapper>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <div className="w-full max-w-xs rounded-2xl border-[3px] border-gray-900 bg-white p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div
              className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-gray-900 ${
                qrDenied === "login" ? "bg-[#FFC93C]" : "bg-[#FF6B7A]"
              }`}
            >
              {qrDenied === "login" ? <Lock className="h-6 w-6 text-gray-900" /> : <ShieldAlert className="h-6 w-6 text-white" />}
            </div>
            <p className="text-lg font-extrabold text-gray-900">
              {qrDenied === "login" ? "先登录吧" : "权限不足，请联系管理员"}
            </p>
            <div className="mt-4 flex gap-2">
              {qrDenied === "login" && (
                <Link href="/login" className="neo-btn flex-1 bg-[#9B59B6] px-3 py-2 text-sm text-white">
                  去登录
                </Link>
              )}
              <Link href="/" className="neo-btn flex-1 bg-white px-3 py-2 text-sm text-gray-900">
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          <p className="text-sm font-bold text-gray-400">正在加载库存数据...</p>
        </div>
      </PageWrapper>
    );
  }

  const inZoneView = !shelf;
  const inShelfView = !!shelf;

  return (
    <PageWrapper>
      {/* 标题行（标题带背景, 与返回按钮同高） */}
      <div className="mb-3 flex items-stretch gap-3">
        <Link href="/links" className="neo-btn flex items-center bg-white p-2" aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex items-stretch text-2xl font-extrabold text-gray-900">
          <span className="highlight-purple flex items-center">库存盘点</span>
        </h1>
        {calibrations.length > 0 && (
          <span className="self-center rounded-lg border-2 border-gray-900 bg-[#FF6B7A] px-2 py-0.5 text-xs font-extrabold text-white">
            校准待办 {calibrations.length}
          </span>
        )}
      </div>

      {/* 顶部固定区: 分区按钮条 + 级联路径小字（置于横线上方, 滚动时固定） */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:mx-0 mb-2 bg-white px-4 sm:px-6 lg:px-0 pt-2 pb-2 border-b-2 border-gray-900">
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar pb-[3px]">
          {zones.map((z) => (
            <button
              key={z}
              onClick={() => { setZone(z); setShelf(""); setExpandedLayers(new Set()); }}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border-[3px] px-4 py-2 font-bold text-xs lg:text-sm transition-all ${
                zone === z
                  ? "border-gray-900 bg-gray-900 text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.3)]"
                  : "border-gray-300 bg-white text-gray-600 hover:border-gray-900"
              }`}
            >
              <Rows4 className="h-4 w-4" />
              {z === NO_ZONE ? z : `${z}区`}
            </button>
          ))}
        </div>
        {/* 级联路径: A区 ＞ A1货架 */}
        {zone && (
          <div className="mt-1 flex items-center gap-1 text-sm font-extrabold text-gray-500">
            <button onClick={() => { setShelf(""); setExpandedLayers(new Set()); }} className={`hover:text-gray-900 ${inZoneView ? "text-gray-900" : ""}`}>
              {zone === NO_ZONE ? NO_ZONE : `${zone}区`}
            </button>
            {shelf && (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="text-gray-900">{zone}{shelf} 货架</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 未选中分区（线条标识, 无外框） */}
      {!zone && (
        <div className="flex items-center justify-center gap-3 py-8">
          <span className="h-[3px] w-12 rounded-full bg-gray-300" />
          <p className="text-sm font-bold text-gray-500">点击上方分区按钮开始浏览货架库存</p>
          <span className="h-[3px] w-12 rounded-full bg-gray-300" />
        </div>
      )}

      {/* 视图1: 货架大分区卡片（左大字货架名 + 款数/件数, 右二维码按钮） */}
      {zone && inZoneView && zone !== NO_ZONE && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {shelves.map((n) => {
            const st = shelfStats.get(String(n)) || { count: 0, pieces: 0 };
            return (
              <div key={n} className="flex w-full overflow-hidden rounded-2xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <button
                  onClick={() => { setShelf(String(n)); setExpandedLayers(new Set()); }}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-[#F3E8FF] active:bg-[#F3E8FF]"
                >
                  <div className="min-w-0">
                    <span className="block text-xl font-extrabold leading-tight text-gray-900">{zone}{n}</span>
                    <span className="mt-0.5 block text-sm font-extrabold text-[#9B59B6]">{st.count} 款</span>
                    <span className="mt-0.5 block text-xs font-bold text-gray-400">{st.pieces} 件</span>
                  </div>
                  <Warehouse className="h-8 w-8 shrink-0 text-[#9B59B6]" />
                </button>
                <button
                  onClick={() => openQr(String(n))}
                  title="货架二维码"
                  aria-label={`货架${zone}${n}二维码`}
                  className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 border-l-[3px] border-gray-900 bg-white transition-colors hover:bg-[#F3E8FF]"
                >
                  <QrCode className="h-5 w-5 text-gray-900" />
                  <span className="text-[10px] font-extrabold text-gray-700">码</span>
                </button>
              </div>
            );
          })}
          {shelves.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm font-bold text-gray-400">该分区暂无货架</p>
          )}
        </div>
      )}

      {/* 未分区商品直接列出 */}
      {zone === NO_ZONE && inZoneView && (
        <div>
          <p className="mb-2 text-sm font-bold text-gray-500">共 {noZoneItems.length} 款未分配货架</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {noZoneItems.map((it) => (
              <ItemCard key={it.sale_id} it={it} onMove={openMove} onCalibrate={openCalibrate} />
            ))}
          </div>
        </div>
      )}

      {/* 视图2: 层文件夹列表（点击下拉显示商品, 再点击收回; 桌面端一行3个商品卡片） */}
      {inShelfView && (
        <div className="space-y-2.5">
          {DEFAULT_LAYERS.map((n) => {
            const key = `${shelf}-${n}`;
            const st = layerStats.get(String(n)) || { count: 0, pieces: 0 };
            const open = expandedLayers.has(key);
            const list = open ? getLayerItems(String(n)) : [];
            return (
              <div key={n} className="overflow-hidden rounded-2xl border-[3px] border-gray-900 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <button
                  onClick={() => toggleLayer(String(n))}
                  disabled={st.count === 0}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    open ? "bg-[#F3E8FF]" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {open ? <FolderOpen className="h-5 w-5 shrink-0 text-[#9B59B6]" /> : <Folder className="h-5 w-5 shrink-0 text-[#9B59B6]" />}
                    <span className="text-base font-extrabold text-gray-900">第 {n} 层</span>
                    <span className="rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-1.5 py-0.5 text-xs font-extrabold text-gray-900">
                      {st.count} 款
                    </span>
                    <span className="text-xs font-bold text-gray-400">{st.pieces} 件</span>
                  </span>
                  {open ? <ChevronUp className="h-5 w-5 shrink-0 text-gray-500" /> : <ChevronDown className="h-5 w-5 shrink-0 text-gray-500" />}
                </button>
                {open && (
                  <div className="grid grid-cols-1 gap-2 border-t-[3px] border-gray-900 p-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((it) => (
                      <ItemCard key={it.sale_id} it={it} onMove={openMove} onCalibrate={openCalibrate} />
                    ))}
                    {list.length === 0 && (
                      <p className="col-span-full py-4 text-center text-sm font-bold text-gray-400">该层暂无商品</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 搬货弹窗: 三级级联选择（排/货架号/层, 与入库登记同款） */}
      {moveItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setMoveItem(null)}>
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-[3px] border-gray-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
                <Truck className="h-5 w-5" />
                搬货 - {moveItem.sale_id}
              </h3>
              <button onClick={() => setMoveItem(null)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mb-3 truncate text-xs font-bold text-gray-400">
              {moveItem.name || "未命名"} · 当前货架: {moveItem.shelf_no || "无"}
            </p>
            <div className="flex gap-1.5">
              <select
                value={moveL1}
                onChange={(e) => { setMoveL1(e.target.value); setMoveL2(""); setMoveL3(""); }}
                className="flex-1 min-w-0 h-9 px-1.5 text-xs font-bold bg-white border-[2px] border-gray-900 rounded-lg outline-none"
              >
                <option value="">一排</option>
                {(() => {
                  const keys = Object.keys(shelfData);
                  const opts = moveL1 && !keys.includes(moveL1) ? [...keys, moveL1] : keys;
                  return opts.map((k) => <option key={k} value={k}>{k}</option>);
                })()}
              </select>
              <select
                value={moveL2}
                onChange={(e) => { setMoveL2(e.target.value); setMoveL3(""); }}
                disabled={!moveL1}
                className="flex-1 min-w-0 h-9 px-1.5 text-xs font-bold bg-white border-[2px] border-gray-900 rounded-lg outline-none disabled:opacity-40"
              >
                <option value="">货架号</option>
                {(() => {
                  const nums = (shelfData[moveL1] || []).map(String);
                  const opts = moveL2 && !nums.includes(moveL2) ? [...nums, moveL2] : nums;
                  return opts.map((n) => <option key={n} value={n}>{n}</option>);
                })()}
              </select>
              <select
                value={moveL3}
                onChange={(e) => setMoveL3(e.target.value)}
                disabled={!moveL2}
                className="flex-1 min-w-0 h-9 px-1.5 text-xs font-bold bg-white border-[2px] border-gray-900 rounded-lg outline-none disabled:opacity-40"
              >
                <option value="">层</option>
                {DEFAULT_LAYERS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </div>
            <button
              onClick={saveMove}
              disabled={!moveL1 || !moveL2 || !moveL3 || moving}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-[#4CD964] px-4 py-2.5 text-sm font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              保存新货架位置
            </button>
          </div>
        </div>
      )}

      {/* 校准弹窗: 每尺码现有数量 + 校准数量 */}
      {calItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setCalItem(null)}>
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-[3px] border-gray-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
                <Crosshair className="h-5 w-5" />
                库存校准 - {calItem.sale_id}
              </h3>
              <button onClick={() => setCalItem(null)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mb-3 truncate text-xs font-bold text-gray-400">
              {calItem.name || "未命名"} · {calItem.shelf_no || "无货架"}
            </p>
            <div className="mb-3 space-y-2">
              {calItem.sizes.map((s) => {
                const v = calValues[s.size] ?? "";
                const newQty = v === "" ? s.qty : Math.max(0, Math.floor(Number(v) || 0));
                const diff = newQty - s.qty;
                return (
                  <div key={s.size} className="flex items-center gap-2">
                    <span className="flex w-24 shrink-0 items-center justify-center rounded-lg border-2 border-gray-900 bg-[#FFC93C] px-2 py-1.5 text-xs font-extrabold text-gray-900">
                      {s.size}码 现有{s.qty}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={v}
                      onChange={(e) => setCalValues((prev) => ({ ...prev, [s.size]: e.target.value }))}
                      placeholder="校准数量"
                      className="w-28 rounded-lg border-2 border-gray-900 bg-white px-2 py-1.5 text-center text-base font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none focus:bg-[#FFF9E0]"
                    />
                    {v !== "" && diff !== 0 && (
                      <span className={`text-xs font-extrabold ${diff > 0 ? "text-[#4CD964]" : "text-[#FF6B7A]"}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mb-3 text-[11px] font-bold text-gray-400">
              提交后会作为待办显示在桌面端管理栏，处理完对应记录后待办自动消失。
            </p>
            <button
              onClick={submitCalibrate}
              disabled={calSubmitting}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] px-4 py-2.5 text-sm font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              {calSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              提交校准
            </button>
          </div>
        </div>
      )}

      {/* 货架二维码弹窗: 预览 + 下载（打印贴货架, 扫码直达该货架盘点） */}
      {qrShelf && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setQrShelf("")}>
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border-[3px] border-gray-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
                <QrCode className="h-5 w-5" />
                货架二维码 - {zone}{qrShelf}
              </h3>
              <button onClick={() => setQrShelf("")} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mb-3 text-xs font-bold text-gray-400">
              扫码直达该货架盘点 · 共 {DEFAULT_LAYERS.length} 层 · 下载后可用快递面单纸打印贴在货架上
            </p>
            <div className="flex items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white p-3">
              {qrLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
              ) : qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt={`货架${zone}${qrShelf}二维码`} className="w-full max-w-[260px]" />
              ) : (
                <p className="py-10 text-sm font-bold text-gray-400">二维码生成失败</p>
              )}
            </div>
            <button
              onClick={downloadQr}
              disabled={!qrDataUrl}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-[3px] border-gray-900 bg-[#9B59B6] px-4 py-2.5 text-sm font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              下载二维码
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

// 商品小卡片（尺码数量 150:15 格式, 搬货/校准按钮在卡片右侧）
function ItemCard({
  it,
  onMove,
  onCalibrate,
}: {
  it: StockItem;
  onMove: (it: StockItem) => void;
  onCalibrate: (it: StockItem) => void;
}) {
  const totalPieces = it.sizes.reduce((s, x) => s + x.qty, 0);
  return (
    <div className="relative rounded-2xl border-[3px] border-gray-900 bg-white p-2.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
      {/* 件数角标（卡片右上角） */}
      <span className="absolute right-2 top-2 z-10 rounded-md border-2 border-gray-900 bg-[#9B59B6] px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-white">
        {totalPieces}件
      </span>
      <div className="flex gap-2.5">
        {/* 图片 */}
        <div className="w-24 shrink-0">
          {it.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.photo}
              alt={it.name}
              className="aspect-[4/5] w-full rounded-lg border-2 border-gray-900 object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border-2 border-gray-300 bg-gray-100">
              <Package className="h-7 w-7 text-gray-300" />
            </div>
          )}
        </div>
        {/* 信息区（标题/名称/进价） + 操作按钮（图片右边, 尺码上面） */}
        <div className="min-w-0 flex-1">
          <p className="truncate pr-14 text-lg font-extrabold leading-tight text-gray-900">{it.sale_id}</p>
          <p className="truncate pr-14 text-xs font-bold text-gray-500">{it.name || "未命名"}</p>
          <p className="text-xs font-extrabold text-gray-900">进价 ¥{it.cost_price}</p>
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => onMove(it)}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border-2 border-gray-900 bg-[#4A90E2] text-xs font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Truck className="h-3.5 w-3.5" />
              搬货
            </button>
            <button
              onClick={() => onCalibrate(it)}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border-2 border-gray-900 bg-[#FFC93C] text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <Crosshair className="h-3.5 w-3.5" />
              校准
            </button>
          </div>
        </div>
      </div>
      {/* 尺码数量（卡片最下一排展开）: 150:15 */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {it.sizes.map((s) => (
          <span
            key={s.size}
            className={`rounded-md border-2 border-gray-900 px-1.5 py-0.5 text-xs font-extrabold ${
              s.qty > 0 ? "bg-[#FFC93C] text-gray-900" : s.qty < 0 ? "bg-[#FF6B7A] text-white" : "bg-gray-100 text-gray-400"
            }`}
          >
            {s.size}:{s.qty}
          </span>
        ))}
      </div>
    </div>
  );
}
