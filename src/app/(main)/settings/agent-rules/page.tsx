"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Globe,
  User,
  Loader2,
} from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

interface AgentRuleRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  scope: string;
  isActive: boolean;
  priority: number;
  createdBy: string | null;
  canEdit: boolean;
}

interface RuleFormData {
  slug: string;
  title: string;
  content: string;
  scope: string;
  priority: number;
}

const emptyForm = (): RuleFormData => ({
  slug: "",
  title: "",
  content: "",
  scope: "user",
  priority: 0,
});

export default function AgentRulesPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [rules, setRules] = useState<AgentRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/rules");
      if (res.ok) setRules(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), scope: isAdmin ? "global" : "user" });
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (rule: AgentRuleRow) => {
    setEditingId(rule.id);
    setForm({
      slug: rule.slug,
      title: rule.title,
      content: rule.content,
      scope: rule.scope,
      priority: rule.priority,
    });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = editingId
        ? `/api/agent/rules/${editingId}`
        : "/api/agent/rules";
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { title: form.title, content: form.content, scope: form.scope, priority: form.priority }
        : form;

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
      fetchRules();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要刪除此規則？")) return;
    await fetch(`/api/agent/rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  const handleToggle = async (rule: AgentRuleRow) => {
    await fetch(`/api/agent/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    fetchRules();
  };

  const globalRules = rules.filter((r) => r.scope === "global");
  const userRules = rules.filter((r) => r.scope === "user");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <PageHeading
          title="Agent 規則管理"
          description="定義 AI 助理「小瑞」必須遵守的行為約束。全院規則由管理員維護，個人規則可自行設定。"
        />
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增規則
        </Button>
      </div>

      {loading ? (
        <SkeletonCard lines={3} />
      ) : (
        <>
          <RuleSection
            title="全院規則"
            icon={<Globe className="h-4 w-4" />}
            rules={globalRules}
            badgeClass="bg-blue-50 text-blue-700 border-blue-200"
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />

          <Separator />

          <RuleSection
            title="個人規則"
            icon={<User className="h-4 w-4" />}
            rules={userRules}
            badgeClass="bg-emerald-50 text-emerald-700 border-emerald-200"
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />

          {rules.length === 0 && (
            <Card>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <ShieldCheck className="w-10 h-10 opacity-30" />
                  <p className="text-sm">尚無規則</p>
                  <p className="text-xs opacity-60">點擊「新增規則」建立第一條 Agent 行為約束</p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯規則" : "新增規則"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <div className="space-y-1.5">
                <Label>Slug（代號）</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="例如：my_custom_rule"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  小寫英文數字底線，建立後不可修改
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="規則名稱"
              />
            </div>

            <div className="space-y-1.5">
              <Label>規則內容</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="描述 AI 助理必須遵守的行為準則…"
                rows={4}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="space-y-1.5">
                <Label>範圍</Label>
                <div className="flex gap-2">
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant={form.scope === "global" ? "default" : "outline"}
                      onClick={() => setForm({ ...form, scope: "global" })}
                    >
                      <Globe className="h-3.5 w-3.5 mr-1" /> 全院
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={form.scope === "user" ? "default" : "outline"}
                    onClick={() => setForm({ ...form, scope: "user" })}
                  >
                    <User className="h-3.5 w-3.5 mr-1" /> 個人
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>優先序</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: Number(e.target.value) || 0 })
                  }
                  className="w-24"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
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

function RuleSection({
  title,
  icon,
  rules,
  badgeClass,
  onEdit,
  onDelete,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  rules: AgentRuleRow[];
  badgeClass: string;
  onEdit: (r: AgentRuleRow) => void;
  onDelete: (id: string) => void;
  onToggle: (r: AgentRuleRow) => void;
}) {
  if (rules.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
        {icon} {title}（{rules.length}）
      </h2>
      <div className="space-y-2">
        {rules.map((rule) => (
          <Card key={rule.id} className={!rule.isActive ? "opacity-50" : ""}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                    <CardTitle className="text-sm">{rule.title}</CardTitle>
                    <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>
                      {rule.scope === "global" ? "全院" : "個人"}
                    </Badge>
                    {!rule.isActive && (
                      <Badge variant="outline" className="text-[10px]">
                        已停用
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 ml-6">
                    {rule.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 ml-6 font-mono">
                    {rule.slug} · 優先序 {rule.priority}
                  </p>
                </div>

                {rule.canEdit && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => onToggle(rule)}
                      className="scale-75"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit(rule)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
