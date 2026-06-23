"use client";

import { useState, useEffect, useCallback } from "react";
import { Database, Search, Plus, Trash2, Edit3, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2, X, HardDrive, Image, FolderOpen, RefreshCw, Eye } from "lucide-react";

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  label: string;
  isPhoto: boolean;
}

interface TableInfo {
  name: string;
  label: string;
  columns: ColumnInfo[];
}

interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  fileCount: number;
  totalSize: number;
}

interface StorageFile {
  name: string;
  id: string;
  size: number;
  created_at: string;
  updated_at: string;
  isFolder: boolean;
}

type ActivePanel = "database" | "storage";

export function DbAdminPanel() {
  // ===== 数据库管理状态 =====
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState("");
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  const [sortCol, setSortCol] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterText, setFilterText] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 图片预览放大
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // ===== Storage 管理状态 =====
  const [activePanel, setActivePanel] = useState<ActivePanel>("database");
  const [buckets, setBuckets] = useState<StorageBucket[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [selectedBucket, setSelectedBucket] = useState<string>("");
  const [currentPath, setCurrentPath] = useState("");
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [storageTotal, setStorageTotal] = useState(0);
  const [storageTotalSize, setStorageTotalSize] = useState(0);
  const [storagePage, setStoragePage] = useState(1);
  const [storagePageSize] = useState(100);
  const [storageTotalPages, setStorageTotalPages] = useState(1);

  // ===== 数据库操作 =====
  const fetchTables = useCallback(async () => {
    setTableLoading(true);
    setTableError("");
    try {
      const res = await fetch("/api/db-admin/tables");
      const json = await res.json();
      if (json.error) { setTableError(json.error); } else { setTables(json.tables || []); }
    } catch { setTableError("获取表列表失败"); } finally { setTableLoading(false); }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const fetchData = useCallback(async () => {
    if (!selectedTable) return;
    setDataLoading(true);
    setDataError("");
    try {
      const params = new URLSearchParams({
        table: selectedTable.name, page: String(page), pageSize: String(pageSize),
        sort: sortCol, order: sortOrder,
      });
      if (filterText) params.set("filter", filterText);
      const res = await fetch(`/api/db-admin?${params}`);
      const json = await res.json();
      if (json.error) { setDataError(json.error); } else { setData(json.data || []); setTotal(json.total || 0); }
    } catch { setDataError("获取数据失败"); } finally { setDataLoading(false); }
  }, [selectedTable, page, pageSize, sortCol, sortOrder, filterText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelectTable = (table: TableInfo) => {
    setSelectedTable(table);
    setActivePanel("database");
    setPage(1); setFilterText(""); setSortCol("created_at"); setSortOrder("desc");
  };

  const handleSort = (col: string) => {
    if (sortCol === col) { setSortOrder((prev) => (prev === "asc" ? "desc" : "asc")); }
    else { setSortCol(col); setSortOrder("asc"); }
    setPage(1);
  };

  const handleFilter = (value: string) => { setFilterText(value); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleAdd = () => {
    if (!selectedTable) return;
    setEditingRow(null);
    const init: Record<string, string> = {};
    selectedTable.columns.forEach((col) => { if (col.name !== "id") init[col.name] = ""; });
    setFormData(init);
    setShowModal(true);
  };

  const handleEdit = (row: Record<string, unknown>) => {
    setEditingRow(row);
    const init: Record<string, string> = {};
    if (selectedTable) {
      selectedTable.columns.forEach((col) => {
        const val = row[col.name];
        init[col.name] = val === null || val === undefined ? "" : String(val);
      });
    }
    setFormData(init);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedTable) return;
    setSubmitting(true);
    try {
      if (editingRow) {
        const res = await fetch("/api/db-admin", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: selectedTable.name, id: editingRow.id as string, data: formData }),
        });
        const json = await res.json();
        if (json.error) { alert("更新失败: " + json.error); } else { setShowModal(false); fetchData(); }
      } else {
        const res = await fetch("/api/db-admin", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: selectedTable.name, data: formData }),
        });
        const json = await res.json();
        if (json.error) { alert("新增失败: " + json.error); } else { setShowModal(false); fetchData(); }
      }
    } catch { alert("操作失败"); } finally { setSubmitting(false); }
  };

  const handleDelete = async (row: Record<string, unknown>) => {
    if (!selectedTable || !confirm("确定要删除该行吗？此操作不可撤销。")) return;
    try {
      const res = await fetch(`/api/db-admin?table=${encodeURIComponent(selectedTable.name)}&id=${encodeURIComponent(row.id as string)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) { alert("删除失败: " + json.error); } else { fetchData(); }
    } catch { alert("删除失败"); }
  };

  const formatCell = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "boolean") return val ? "是" : "否";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  const isImageUrl = (val: unknown): boolean => {
    if (typeof val !== "string") return false;
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(val) || (val.startsWith("http") && /image|photo|img/i.test(val));
  };

  const filteredTables = tableSearch
    ? tables.filter((t) => t.label.toLowerCase().includes(tableSearch.toLowerCase()) || t.name.toLowerCase().includes(tableSearch.toLowerCase()))
    : tables;

  const getDisplayColumns = (): ColumnInfo[] => {
    if (!selectedTable) return [];
    const priority = ["id", "name", "sale_id", "phone", "role", "quantity", "sell_price", "cost_price", "photo", "photo_url"];
    const sorted = [...selectedTable.columns].sort((a, b) => {
      const ai = priority.indexOf(a.name); const bi = priority.indexOf(b.name);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    });
    return sorted;
  };

  // ===== Storage 操作 =====
  const fetchBuckets = useCallback(async () => {
    setStorageLoading(true);
    setStorageError("");
    try {
      const res = await fetch("/api/db-admin/storage");
      const json = await res.json();
      if (json.error) { setStorageError(json.error); } else { setBuckets(json.buckets || []); }
    } catch { setStorageError("获取存储列表失败"); } finally { setStorageLoading(false); }
  }, []);

  const fetchStorageFiles = useCallback(async (bucket: string, path: string, p: number = 1) => {
    setStorageLoading(true);
    setStorageError("");
    try {
      const params = new URLSearchParams({ bucket, path, page: String(p), pageSize: String(storagePageSize) });
      const res = await fetch(`/api/db-admin/storage?${params}`);
      const json = await res.json();
      if (json.error) { setStorageError(json.error); } else {
        setStorageFiles(json.files || []);
        setStorageTotal(json.total || 0);
        setStorageTotalSize(json.totalSize || 0);
        setStorageTotalPages(json.totalPages || 1);
        setStoragePage(json.page || 1);
      }
    } catch { setStorageError("获取文件列表失败"); } finally { setStorageLoading(false); }
  }, [storagePageSize]);

  const handleSelectBucket = (bucketName: string) => {
    setSelectedBucket(bucketName);
    setCurrentPath("");
    setStoragePage(1);
    fetchStorageFiles(bucketName, "", 1);
  };

  const handleOpenFolder = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
    setStoragePage(1);
    fetchStorageFiles(selectedBucket, newPath, 1);
  };

  const handleGoBack = () => {
    const parts = currentPath.split("/");
    parts.pop();
    const newPath = parts.join("/");
    setCurrentPath(newPath);
    setStoragePage(1);
    fetchStorageFiles(selectedBucket, newPath, 1);
  };

  const handleStoragePageChange = (p: number) => {
    setStoragePage(p);
    fetchStorageFiles(selectedBucket, currentPath, p);
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`确定要删除 ${fileName} 吗？`)) return;
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    try {
      const res = await fetch(`/api/db-admin/storage?bucket=${encodeURIComponent(selectedBucket)}&path=${encodeURIComponent(filePath)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) { alert("删除失败: " + json.error); } else { fetchStorageFiles(selectedBucket, currentPath, storagePage); }
    } catch { alert("删除失败"); }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleInitStorage = () => { setActivePanel("storage"); fetchBuckets(); };

  // 从文件名提取商品编号 (如 H001_1.jpg → H001, IMG_1234.jpg → IMG_1234)
  const extractSaleId = (fileName: string): string => {
    // 去掉扩展名
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
    // 尝试 H001 风格
    let match = nameWithoutExt.match(/^([A-Za-z]+\d+)/);
    if (match) return match[1];
    // 尝试下划线前缀
    match = nameWithoutExt.match(/^([^_]+)/);
    if (match && match[1].length >= 2) return match[1];
    return nameWithoutExt.length <= 20 ? nameWithoutExt : "";
  };

  // 获取 Storage 文件的公开 URL
  const getStorageFileUrl = (fileName: string): string => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    return `${supabaseUrl}/storage/v1/object/public/${selectedBucket}/${filePath}`;
  };

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6 lg:-mx-10 xl:-mx-14 h-[calc(100vh-260px)] min-h-[500px]">
      {/* ===== 左侧导航 ===== */}
      <div className="w-48 lg:w-56 shrink-0 border-r-[3px] border-gray-900 bg-white flex flex-col rounded-l-2xl border-[3px] border-r-[3px]">
        {/* 功能切换 */}
        <div className="p-3 border-b-[3px] border-gray-900">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-gray-900" />
            <span className="text-xs font-extrabold text-gray-900">数据管理</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setActivePanel("database")}
              className={`flex-1 py-1.5 text-[10px] font-extrabold rounded-lg border-[2px] transition-colors ${
                activePanel === "database" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-900"
              }`}
            >数据库</button>
            <button
              onClick={handleInitStorage}
              className={`flex-1 py-1.5 text-[10px] font-extrabold rounded-lg border-[2px] transition-colors ${
                activePanel === "storage" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-900"
              }`}
            ><HardDrive className="h-3 w-3 inline mr-1" />存储</button>
          </div>
        </div>

        {/* 数据库模式：表列表 */}
        {activePanel === "database" && (
          <>
            <div className="p-3 border-b-[3px] border-gray-900">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input type="text" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="搜索表名..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border-[2px] border-gray-200 focus:border-gray-900 focus:outline-none bg-white" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {tableLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
              ) : tableError ? (
                <div className="p-3 text-xs text-red-500 font-bold">{tableError}</div>
              ) : (
                filteredTables.map((table) => (
                  <button key={table.name} onClick={() => handleSelectTable(table)}
                    className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors ${
                      selectedTable?.name === table.name ? "bg-[#4A90E2] text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >{table.label}<span className="block text-[10px] opacity-60">{table.name}</span></button>
                ))
              )}
            </div>
          </>
        )}

        {/* Storage 模式：Bucket 列表 */}
        {activePanel === "storage" && (
          <>
            <div className="p-3 border-b-[3px] border-gray-900">
              <button onClick={fetchBuckets} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-900">
                <RefreshCw className="h-3 w-3" /> 刷新
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {storageLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
              ) : storageError ? (
                <div className="p-3 text-xs text-red-500 font-bold">{storageError}</div>
              ) : (
                buckets.map((bucket) => (
                  <button key={bucket.id} onClick={() => handleSelectBucket(bucket.name)}
                    className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors ${
                      selectedBucket === bucket.name ? "bg-[#4A90E2] text-white" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5"><FolderOpen className="h-3 w-3" />{bucket.name}</div>
                    <span className="block text-[10px] opacity-60">{bucket.fileCount} 文件 · {formatSize(bucket.totalSize)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ===== 右侧内容区 ===== */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-r-2xl border-[3px] border-gray-900 border-l-0">
        {/* ===== 数据库模式 ===== */}
        {activePanel === "database" && (
          !selectedTable ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">请从左侧选择一个数据表</p>
              </div>
            </div>
          ) : (
            <>
              {/* 工具栏 */}
              <div className="flex items-center gap-3 p-3 border-b-[3px] border-gray-900 shrink-0 flex-wrap bg-gray-50">
                <span className="text-sm font-extrabold text-gray-900">{selectedTable.label}</span>
                <span className="text-[10px] text-gray-400">({selectedTable.name})</span>
                <div className="flex-1" />
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input type="text" value={filterText} onChange={(e) => handleFilter(e.target.value)} placeholder="筛选..."
                    className="pl-7 pr-3 py-1.5 text-xs rounded-lg border-[2px] border-gray-200 focus:border-gray-900 focus:outline-none w-40" />
                </div>
                <button onClick={handleAdd} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border-[3px] border-gray-900 bg-white hover:bg-gray-100 transition-colors">
                  <Plus className="h-3 w-3" />新增
                </button>
                <span className="text-[10px] text-gray-400">共 {total} 条 · 第 {page}/{totalPages} 页</span>
              </div>

              {/* 表格 */}
              <div className="flex-1 overflow-auto">
                {dataLoading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : dataError ? (
                  <div className="p-4 text-sm text-red-500 font-bold">{dataError}</div>
                ) : data.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400 text-sm font-bold">暂无数据</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100 border-b-[3px] border-gray-900">
                        {getDisplayColumns().map((col) => (
                          <th key={col.name} onClick={() => handleSort(col.name)}
                            className="text-left py-1.5 px-2 cursor-pointer hover:text-gray-900 whitespace-nowrap select-none"
                          >
                            <div className="text-[10px] font-extrabold text-gray-500 leading-tight">{col.label}</div>
                            <div className="flex items-center gap-0.5 text-[9px] text-gray-400 font-normal">
                              {col.name}
                              {sortCol === col.name && (sortOrder === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)}
                            </div>
                          </th>
                        ))}
                        <th className="text-right py-1.5 px-2 w-20">
                          <div className="text-[10px] font-extrabold text-gray-500">操作</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => (
                        <tr key={row.id as string || idx} className="border-b border-gray-100 hover:bg-gray-50">
                          {getDisplayColumns().map((col) => {
                            const val = row[col.name];
                            const isPhoto = col.isPhoto || (col.name === "photo" || col.name === "photo_url");
                            const imgUrl = isPhoto && isImageUrl(val) ? String(val) : null;

                            return (
                              <td key={col.name} className="py-1 px-2 text-gray-700 max-w-[180px] whitespace-nowrap">
                                {imgUrl ? (
                                  <div className="group relative inline-flex items-center">
                                    <img
                                      src={imgUrl} alt=""
                                      className="w-12 h-12 object-cover rounded-lg border-[2px] border-gray-200 group-hover:scale-[5] group-hover:z-50 group-hover:shadow-xl transition-transform duration-300 cursor-pointer origin-top-left shrink-0"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                      onClick={() => setPreviewImg(imgUrl)}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[11px] truncate block" title={formatCell(val)}>{formatCell(val)}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-1 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleEdit(row)} className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-900" title="编辑">
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button onClick={() => handleDelete(row)} className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600" title="删除">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 分页 */}
              <div className="flex items-center justify-between p-3 border-t-[3px] border-gray-900 shrink-0 bg-gray-50">
                <span className="text-[10px] text-gray-400">显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} 条，共 {total} 条</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                    className="p-1 rounded-lg border-[2px] border-gray-200 hover:border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="text-xs font-bold text-gray-700">{page}/{totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="p-1 rounded-lg border-[2px] border-gray-200 hover:border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </>
          )
        )}

        {/* ===== Storage 模式 ===== */}
        {activePanel === "storage" && (
          !selectedBucket ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <HardDrive className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">请从左侧选择一个存储桶</p>
              </div>
            </div>
          ) : (
            <>
              {/* 工具栏 */}
              <div className="flex items-center gap-3 p-3 border-b-[3px] border-gray-900 shrink-0 flex-wrap bg-gray-50">
                <span className="text-sm font-extrabold text-gray-900">{selectedBucket}</span>
                {currentPath && <span className="text-[10px] text-gray-400">/{currentPath}</span>}
                <div className="flex-1" />
                <span className="text-[10px] text-gray-500 font-bold">{storageTotal} 个文件 · {formatSize(storageTotalSize)}</span>
                <button onClick={() => fetchStorageFiles(selectedBucket, currentPath, storagePage)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg border-[2px] border-gray-200 hover:border-gray-900 hover:bg-gray-50">
                  <RefreshCw className="h-3 w-3" />刷新
                </button>
              </div>

              {/* 文件列表 */}
              <div className="flex-1 overflow-auto">
                {storageLoading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : storageError ? (
                  <div className="p-4 text-sm text-red-500 font-bold">{storageError}</div>
                ) : storageFiles.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400 text-sm font-bold">暂无文件</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100 border-b-[3px] border-gray-900">
                        <th className="text-left py-2 px-3 font-extrabold text-gray-500">文件名</th>
                        <th className="text-left py-2 px-3 font-extrabold text-gray-500 w-24">商品编号</th>
                        <th className="text-right py-2 px-3 font-extrabold text-gray-500 w-24">大小</th>
                        <th className="text-right py-2 px-3 font-extrabold text-gray-500 w-36">创建时间</th>
                        <th className="text-right py-2 px-3 font-extrabold text-gray-500 w-20">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPath && (
                        <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={handleGoBack}>
                          <td className="py-2 px-3 font-bold text-gray-500" colSpan={5}>
                            <FolderOpen className="h-3 w-3 inline mr-1" />..
                          </td>
                        </tr>
                      )}
                      {storageFiles.map((file) => {
                        const saleId = extractSaleId(file.name);
                        const isImageFile = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);
                        const imageUrl = isImageFile ? getStorageFileUrl(file.name) : "";

                        return (
                          <tr key={file.name} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-1.5 px-3 text-gray-700">
                              {file.isFolder ? (
                                <button onClick={() => handleOpenFolder(file.name)} className="flex items-center gap-1.5 font-bold text-[#4A90E2] hover:underline">
                                  <FolderOpen className="h-3 w-3" />{file.name}
                                </button>
                              ) : (
                                <div className="flex items-start gap-2">
                                  {isImageFile ? (
                                    <div className="group relative shrink-0">
                                      <img src={imageUrl} alt={file.name}
                                        className="w-12 h-12 object-cover rounded-lg border-[2px] border-gray-200 group-hover:scale-[5] group-hover:z-50 group-hover:shadow-xl transition-transform duration-300 cursor-pointer origin-top-left"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        onClick={() => setPreviewImg(imageUrl)} />
                                    </div>
                                  ) : (
                                    <div className="w-12 h-12 rounded-lg border-[2px] border-gray-200 flex items-center justify-center bg-gray-50 shrink-0">
                                      <Image className="h-4 w-4 text-gray-300" />
                                    </div>
                                  )}
                                  <span className="text-[11px] break-all leading-tight">{file.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-3 text-gray-500">
                              {saleId && <span className="text-[10px] font-bold bg-gray-100 px-1.5 py-0.5 rounded">{saleId}</span>}
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-500">{formatSize(file.size)}</td>
                            <td className="py-1.5 px-3 text-right text-gray-400 text-[10px]">
                              {file.created_at ? new Date(file.created_at).toLocaleString("zh-CN") : "-"}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              {isImageFile && (
                                <button onClick={() => setPreviewImg(imageUrl)} className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-900 mr-1" title="预览">
                                  <Eye className="h-3 w-3" />
                                </button>
                              )}
                              <button onClick={() => handleDeleteFile(file.name)} className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600" title="删除">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Storage 分页 */}
              {storageTotalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t-[3px] border-gray-900 shrink-0 bg-gray-50">
                  <span className="text-[10px] text-gray-400">显示 {(storagePage - 1) * storagePageSize + 1}-{Math.min(storagePage * storagePageSize, storageTotal)} 个，共 {storageTotal} 个</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleStoragePageChange(Math.max(1, storagePage - 1))} disabled={storagePage <= 1}
                      className="p-1 rounded-lg border-[2px] border-gray-200 hover:border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span className="text-xs font-bold text-gray-700">{storagePage}/{storageTotalPages}</span>
                    <button onClick={() => handleStoragePageChange(Math.min(storageTotalPages, storagePage + 1))} disabled={storagePage >= storageTotalPages}
                      className="p-1 rounded-lg border-[2px] border-gray-200 hover:border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {showModal && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-[3px] border-gray-900">
              <h3 className="text-sm font-extrabold text-gray-900">{editingRow ? "编辑行" : "新增行"} - {selectedTable.label}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedTable.columns.filter((col) => col.name !== "id").map((col) => (
                <div key={col.name}>
                  <label className="block text-[10px] font-extrabold text-gray-500 mb-1">
                    {col.label || col.name}
                    <span className="text-gray-300 ml-1">({col.type})</span>
                    {!col.nullable && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <input type="text" value={formData[col.name] || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, [col.name]: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border-[2px] border-gray-200 focus:border-gray-900 focus:outline-none"
                    placeholder={col.nullable ? "可选" : "必填"} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t-[3px] border-gray-900">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-xs font-bold rounded-xl border-[3px] border-gray-200 hover:bg-gray-50">取消</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="px-4 py-2 text-xs font-bold rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] text-white hover:bg-[#3A7BC8] disabled:opacity-50 flex items-center gap-1">
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                {editingRow ? "保存" : "新增"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览大图 */}
      {previewImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewImg(null)}>
          <img src={previewImg} alt="预览" className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl border-[3px] border-gray-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" />
        </div>
      )}
    </div>
  );
}