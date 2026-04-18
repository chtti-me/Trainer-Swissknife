"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Plug,
  Trash2,
  Wrench,
} from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

interface CustomToolRow {
  id: string;
  name: string;
  description: string;
  endpointUrl: string;
  inputSchema: string;
  isActive: boolean;
  createdAt: string;
}

interface ToolFormData {
  name: string;
  description: string;
  endpointUrl: string;
  inputSchema: string;
  headers: string;
}

const emptyForm = (): ToolFormData => ({
  name: "",
  description: "",
  endpointUrl: "",
  inputSchema: '{\n  "type": "object",\n  "properties": {\n    "input": { "type": "string", "description": "輸入文字" }\n  },\n  "required": ["input"]\n}',
  headers: "",
});

export default function CustomToolsPage() {
  const [tools, setTools] = useState<CustomToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ToolFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/custom-tools");
      if (res.ok) setTools(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (tool: CustomToolRow) => {
    setEditingId(tool.id);
    setForm({
      name: tool.name,
      description: tool.description,
      endpointUrl: tool.endpointUrl,
      inputSchema: tool.inputSchema,
      headers: "",
    });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = editingId
        ? `/api/agent/custom-tools/${editingId}`
        : "/api/agent/custom-tools";
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? {
            description: form.description,
            endpointUrl: form.endpointUrl,
            inputSchema: form.inputSchema,
            headers: form.headers.trim() || null,
          }
        : {
            ...form,
            headers: form.headers.trim() || undefined,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "儲存失敗");
        return;
      }

      setDialogOpen(false);
      fetchTools();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此自定義工具？")) return;
    await fetch(`/api/agent/custom-tools/${id}`, { method: "DELETE" });
    fetchTools();
  };

  const handleToggle = async (tool: CustomToolRow) => {
    await fetch(`/api/agent/custom-tools/${tool.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !tool.isActive }),
    });
    fetchTools();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            返回系統設定
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <PageHeading
          title="自定義工具"
          description="新增外部 HTTP 端點作為 AI 助理可呼叫的工具。Agent 會以 POST 方式傳入參數並取得回應。"
        />
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增工具
        </Button>
      </div>

      {loading ? (
        <SkeletonCard lines={3} />
      ) : tools.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Wrench className="w-10 h-10 opacity-30" />
              <p className="text-sm">尚無自定義工具</p>
              <p className="text-xs opacity-60">點擊「新增工具」開始建立</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <Card key={tool.id} className={!tool.isActive ? "opacity-50" : ""}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
                      <CardTitle className="text-sm">
                        custom_{tool.name}
                      </CardTitle>
                      {!tool.isActive && (
                        <Badge variant="outline" className="text-[10px]">
                          已停用
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground ml-6 mb-1">
                      {tool.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground ml-6 font-mono truncate">
                      {tool.endpointUrl}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      checked={tool.isActive}
                      onCheckedChange={() => handleToggle(tool)}
                      className="scale-75"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(tool)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(tool.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯自定義工具" : "新增自定義工具"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <div className="space-y-1.5">
                <Label>工具名稱（代號）</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：my_api_tool"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  小寫英文數字底線，建立後不可修改。Agent 中顯示為 custom_你的名稱。
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>描述</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="描述此工具的功能（會顯示給 AI 看）"
              />
            </div>

            <div className="space-y-1.5">
              <Label>端點 URL</Label>
              <Input
                value={form.endpointUrl}
                onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })}
                placeholder="https://example.com/api/my-tool"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Agent 會以 POST 方式傳送 JSON 參數至此 URL，並期望取得 JSON 回應。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>輸入參數 Schema（JSON Schema）</Label>
              <Textarea
                value={form.inputSchema}
                onChange={(e) => setForm({ ...form, inputSchema: e.target.value })}
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>請求標頭（選填，JSON 格式）</Label>
              <Textarea
                value={form.headers}
                onChange={(e) => setForm({ ...form, headers: e.target.value })}
                rows={2}
                placeholder='例如：{"Authorization": "Bearer xxx"}'
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                可用來傳遞 API Key 等驗證資訊。
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingId ? "儲存" : "建立"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
