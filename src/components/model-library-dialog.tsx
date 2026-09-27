"use client";

import { useState, useRef, useEffect } from "react";
import { showToast } from "@/components/page-wrapper";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NeoModal } from "@/components/neo-modal";
import { NeoImage } from "@/components/neo-image";
import { Upload, Trash2, Loader2, ArrowUp, ArrowDown, GripVertical, Check, XCircle } from "lucide-react";

interface Model {
  id: string;
  name: string;
  photo_url: string;
  sort_order?: number | null;
}

interface Props {
  models: Model[];
  onClose: () => void;
  onRefresh: () => void;
}

export function ModelLibraryDialog({ models, onClose, onRefresh }: Props) {
  const [uploading, setUploading] = useState(false);
  // 删除模特二次确认
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [newModelName, setNewModelName] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [orderItems, setOrderItems] = useState<Model[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editMode) {
      setOrderItems([...models]);
    }
  }, [editMode, models]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = newModelName.trim() || file.name.replace(/\.[^/.]+$/, "");
    setUploading(true);

    // 注意: 异步回调内的错误必须在回调内部捕获, 否则 setUploading(false) 永远不会执行, 按钮永久卡在"上传中"
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;

        const fileName = `model-${Date.now()}-${file.name}`;
        const uploadRes = await fetch("/api/upload/model-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: fileName,
            file_data: base64,
          }),
        });
        const uploadData = await uploadRes.json();

        if (uploadData.url) {
          await fetch("/api/photo-gen/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              photo_url: uploadData.url,
            }),
          });
          setNewModelName("");
          onRefresh();
        } else {
          showToast("上传失败: " + (uploadData.error || "未知错误"), "error");
        }
      } catch (err) {
        showToast("上传失败: " + (err instanceof Error ? err.message : "未知错误"), "error");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      showToast("读取文件失败, 请重试", "error");
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  const performDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await fetch(`/api/photo-gen/models?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      onRefresh();
    } catch (err) {
      console.error("Delete model error:", err);
      showToast("删除失败，请重试", "error");
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...orderItems];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrderItems(next);
  };

  const moveDown = (index: number) => {
    if (index === orderItems.length - 1) return;
    const next = [...orderItems];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrderItems(next);
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      await fetch("/api/photo-gen/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: orderItems.map((m, i) => ({ id: m.id, sort_order: i })),
        }),
      });
      onRefresh();
      setEditMode(false);
    } catch (err) {
      console.error("Save order error:", err);
      showToast("保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEnterEditMode = () => {
    setOrderItems([...models]);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
  };

  return (
    <>
      <NeoModal open onClose={onClose} maxWidthClass="max-w-lg" title={editMode ? "编辑排序" : "模特库"}>
        {/* 上传区域 (非编辑模式显示) */}
        {!editMode && (
          <div className="mb-4 p-3 rounded-xl border-[2px] border-dashed border-gray-300 bg-gray-50">
            <input
              type="text"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              placeholder="输入模特名称（可选）"
              className="w-full mb-2 px-3 py-2 rounded-lg border-[2px] border-gray-200 text-sm focus:outline-none focus:border-[#9B59B6]"
            />
            <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-[2px] border-[#9B59B6] bg-[#9B59B6]/5 text-[#9B59B6] font-extrabold text-sm cursor-pointer hover:bg-[#9B59B6]/10 transition-all">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />上传中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />上传新模特
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        )}

        {/* 编辑排序模式的操作按钮 */}
        {editMode ? (
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleSaveOrder}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border-[2px] border-[#9B59B6] bg-[#9B59B6] text-white font-extrabold text-sm hover:bg-[#8A4AA5] transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              保存排序
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border-[2px] border-gray-300 bg-white text-gray-700 font-extrabold text-sm hover:bg-gray-100 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              取消
            </button>
          </div>
        ) : models.length > 0 ? (
          <button
            onClick={handleEnterEditMode}
            className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-xl border-[2px] border-[#9B59B6] bg-[#9B59B6] text-white font-extrabold text-sm hover:bg-[#8A4AA5] transition-colors"
          >
            <GripVertical className="h-4 w-4" />
            编辑顺序
          </button>
        ) : null}

        {/* 模特列表 */}
        {models.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm font-medium">
            还没有模特，请上传
          </div>
        ) : editMode ? (
          <div className="flex flex-col gap-2">
            {orderItems.map((model, index) => (
              <div
                key={model.id}
                className="flex items-center gap-2 p-2 rounded-xl border-[2px] border-gray-200 bg-gray-50"
              >
                <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <NeoImage
                  src={model.photo_url}
                  alt={model.name}
                  wrapperClassName="h-12 w-12 rounded-lg border-[2px] border-gray-200 shrink-0"
                  className="h-12 w-12 object-cover"
                />
                <span className="flex-1 text-sm font-extrabold text-gray-700 truncate">
                  {model.name}
                </span>
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border-[2px] border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === orderItems.length - 1}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border-[2px] border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(model.id, model.name)}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border-[2px] border-red-400 bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {models.map((model) => (
              <div
                key={model.id}
                className="relative group rounded-xl border-[2px] border-gray-200 overflow-hidden"
              >
                <NeoImage
                  src={model.photo_url}
                  alt={model.name}
                  wrapperClassName="w-full"
                  className="w-full aspect-square object-cover"
                />
                <div className="text-center py-1 text-xs font-extrabold bg-gray-100 text-gray-700 truncate px-1">
                  {model.name}
                </div>
                <button
                  onClick={() => handleDelete(model.id, model.name)}
                  aria-label={`删除 ${model.name}`}
                  className="absolute top-1 right-1 flex items-center justify-center h-7 w-7 rounded-full bg-red-500 text-white opacity-90 transition-opacity hover:opacity-100 hover:bg-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </NeoModal>

      {/* 删除模特二次确认 */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`确认删除模特「${pendingDelete?.name || ""}」？`}
        description="删除后不可恢复。"
        confirmText="确认删除"
        onConfirm={performDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}