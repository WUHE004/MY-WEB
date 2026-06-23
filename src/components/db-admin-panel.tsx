"use client";

import { useState, useEffect, useCallback } from "react";
import { Database, Search, Plus, Trash2, Edit3, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

interface TableInfo {
  name: string;
  label: string;
  columns: ColumnInfo[];
}

interface TableDataResponse {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export function DbAdminPanel() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState("");

  // 当前选中的表
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  // 表数据
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  // 排序和筛选
  const [sortCol, setSortCol] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterText, setFilterText] = useState("");

  // 编辑弹窗
  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 获取表列表
  const fetchTables = useCallback(async () => {
    setTableLoading(true);
    setTableError("");
    try {
      const res = await fetch("/api/db-admin/tables");
      const json = await res.json();
      if (json.error) {
        setTableError(json.error);
      } else {
        setTables(json.tables || []);
      }
    } catch (err) {
      setTableError("获取表列表失败");
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // 获取表数据
  const fetchData = useCallback(async () => {
    if (!selectedTable) return;
    setDataLoading(true);
    setDataError("");
    try {
      const params = new URLSearchParams({
        table: selectedTable.name,
        page: String(page),
        pageSize: String(pageSize),
        sort: sortCol,
        order: sortOrder,
      });
      if (filterText) params.set("filter", filterText);

      const res = await fetch(`/api/db-admin?${params}`);
      const json: TableDataResponse & { error?: string } = await res.json();
      if (json.error) {
        setDataError(json.error);
      } else {
        setData(json.data || []);
        setTotal(json.total || 0);
      }
    } catch (err) {
      setDataError("获取数据失败");
    } finally {
      setDataLoading(false);
    }
  }, [selectedTable, page, pageSize, sortCol, sortOrder, filterText]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 切换表
  const handleSelectTable = (table: TableInfo) => {
    setSelectedTable(table);
    setPage(1);
    setFilterText("");
    setSortCol("created_at");
    setSortOrder("desc");
  };

  // 排序
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortOrder("asc");
    }
    setPage(1);
  };

  // 筛选
  const handleFilter = (value: string) => {
    setFilterText(value);
    setPage(1);
  };

  // 分页
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 打开新增弹窗
  const handleAdd = () => {
    if (!selectedTable) return;
    setEditingRow(null);
    const init: Record<string, string> = {};
    selectedTable.columns.forEach((col) => {
      if (col.name !== "id") init[col.name] = "";
    });
    setFormData(init);
    setShowModal(true);
  };

  // 打开编辑弹窗
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

  // 提交表单
  const handleSubmit = async () => {
    if (!selectedTable) return;
    setSubmitting(true);
    try {
      if (editingRow) {
        // 更新
        const res = await fetch("/api/db-admin", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: selectedTable.name,
            id: editingRow.id as string,
            data: formData,
          }),
        });
        const json = await res.json();
        if (json.error) {
          alert("更新失败: " + json.error);
        } else {
          setShowModal(false);
          fetchData();
        }
      } else {
        // 新增
        const res = await fetch("/api/db-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: selectedTable.name,
            data: formData,
          }),
        });
        const json = await res.json();
        if (json.error) {
          alert("新增失败: " + json.error);
        } else {
          setShowModal(false);
          fetchData();
        }
      }
    } catch (err) {
      alert("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 删除行
  const handleDelete = async (row: Record<string, unknown>) => {
    if (!selectedTable || !confirm("确定要删除该行吗？此操作不可撤销。")) return;
    try {
      const res = await fetch(
        `/api/db-admin?table=${encodeURIComponent(selectedTable.name)}&id=${encodeURIComponent(row.id as string)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.error) {
        alert("删除失败: " + json.error);
      } else {
        fetchData();
      }
    } catch (err) {
      alert("删除失败");
    }
  };

  // 格式化单元格值
  const formatCell = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "boolean") return val ? "是" : "否";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  };

  // 过滤表列表
  const filteredTables = tableSearch
    ? tables.filter(
        (t) =>
          t.label.toLowerCase().includes(tableSearch.toLowerCase()) ||
          t.name.toLowerCase().includes(tableSearch.toLowerCase())
      )
    : tables;

  // 要显示的列（排除部分内部列，优先显示常用列）
  const getDisplayColumns = (): ColumnInfo[] => {
    if (!selectedTable) return [];
    const cols = selectedTable.columns;
    // 优先排序：id 在前，created_at 在后
    const priority = ["id", "name", "sale_id", "phone", "role", "quantity", "sell_price", "cost_price"];
    const sorted = [...cols].sort((a, b) => {
      const ai = priority.indexOf(a.name);
      const bi = priority.indexOf(b.name);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    });
    return sorted;
  };

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6 lg:-mx-10 xl:-mx-14 h-[calc(100vh-260px)] min-h-[500px]">
      {/* 左侧表列表 */}
      <div className="w-48 lg:w-56 shrink-0 border-r-[3px] border-gray-200 bg-gray-50 flex flex-col">
        <div className="p-3 border-b-2 border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-extrabold text-gray-500">数据表</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="搜索表名..."
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border-[2px] border-gray-200 focus:border-gray-900 focus:outline-none bg-white"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tableLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : tableError ? (
            <div className="p-3 text-xs text-red-500 font-bold">{tableError}</div>
          ) : (
            filteredTables.map((table) => (
              <button
                key={table.name}
                onClick={() => handleSelectTable(table)}
                className={`w-full text-left px-3 py-2 text-xs font-bold transition-colors border-b border-gray-100 ${
                  selectedTable?.name === table.name
                    ? "bg-[#4A90E2] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {table.label}
                <span className="block text-[10px] opacity-60">{table.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右侧表格区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">请从左侧选择一个数据表</p>
            </div>
          </div>
        ) : (
          <>
            {/* 工具栏 */}
            <div className="flex items-center gap-3 p-3 border-b-2 border-gray-200 bg-white shrink-0 flex-wrap">
              <span className="text-sm font-extrabold text-gray-900">
                {selectedTable.label}
              </span>
              <span className="text-[10px] text-gray-400">({selectedTable.name})</span>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => handleFilter(e.target.value)}
                  placeholder="筛选..."
                  className="pl-7 pr-3 py-1.5 text-xs rounded-lg border-[2px] border-gray-200 focus:border-gray-900 focus:outline-none w-40"
                />
              </div>
              <button
                onClick={handleAdd}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border-[2px] border-gray-900 bg-white hover:bg-gray-50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                新增
              </button>
              <span className="text-[10px] text-gray-400">
                共 {total} 条 · 第 {page}/{totalPages} 页
              </span>
            </div>

            {/* 表格内容 */}
            <div className="flex-1 overflow-auto">
              {dataLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : dataError ? (
                <div className="p-4 text-sm text-red-500 font-bold">{dataError}</div>
              ) : data.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm font-bold">
                  暂无数据
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100 border-b-2 border-gray-200">
                      {getDisplayColumns().map((col) => (
                        <th
                          key={col.name}
                          onClick={() => handleSort(col.name)}
                          className="text-left py-2 px-2 font-extrabold text-gray-500 cursor-pointer hover:text-gray-900 whitespace-nowrap select-none"
                        >
                          <div className="flex items-center gap-1">
                            {col.name}
                            {sortCol === col.name && (
                              sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="text-right py-2 px-2 font-extrabold text-gray-500 w-20">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, idx) => (
                      <tr
                        key={row.id as string || idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        {getDisplayColumns().map((col) => (
                          <td
                            key={col.name}
                            className="py-1.5 px-2 text-gray-700 max-w-[200px] truncate"
                            title={formatCell(row[col.name])}
                          >
                            {formatCell(row[col.name])}
                          </td>
                        ))}
                        <td className="py-1.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(row)}
                              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-900"
                              title="编辑"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="p-1 rounded hover:bg-red-100 text-gray-500 hover:text-red-600"
                              title="删除"
                            >
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
            <div className="flex items-center justify-between p-3 border-t-2 border-gray-200 bg-white shrink-0">
              <span className="text-[10px] text-gray-400">
                显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} 条，共 {total} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded border-[2px] border-gray-200 hover:border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="text-xs font-bold text-gray-700">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded border-[2px] border-gray-200 hover:border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {showModal && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl border-[3px] border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-2 border-gray-200">
              <h3 className="text-sm font-extrabold text-gray-900">
                {editingRow ? "编辑行" : "新增行"} - {selectedTable.label}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedTable.columns
                .filter((col) => col.name !== "id")
                .map((col) => (
                  <div key={col.name}>
                    <label className="block text-[10px] font-extrabold text-gray-500 mb-1">
                      {col.name}
                      <span className="text-gray-300 ml-1">({col.type})</span>
                      {!col.nullable && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={formData[col.name] || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, [col.name]: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg border-[2px] border-gray-200 focus:border-gray-900 focus:outline-none"
                      placeholder={col.nullable ? "可选" : "必填"}
                    />
                  </div>
                ))}
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t-2 border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg border-[2px] border-gray-200 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold rounded-lg border-[2px] border-gray-900 bg-[#4A90E2] text-white hover:bg-[#3A7BC8] disabled:opacity-50 flex items-center gap-1"
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                {editingRow ? "保存" : "新增"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}