"use client";

/**
 * 【使用者管理（僅管理員）】
 * CRUD 系統帳號；API 在 /api/admin/users。
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TRAINER_UNITS, USER_ROLES, campusFromTrainerUnit } from "@/lib/user-organization";
import { Loader2, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { TableSkeleton } from "@/components/ui/skeleton";

type UserRow = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  role: string;
  campus: string | null;
  createdAt: string;
  updatedAt: string;
  linkedTrainer: { id: string; name: string } | null;
};

const roleLabel = (r: string) => USER_ROLES.find((x) => x.value === r)?.label ?? r;

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formDepartment, setFormDepartment] = useState<string>("");
  const [formRole, setFormRole] = useState("trainer");
  const [formLinkedTrainerId, setFormLinkedTrainerId] = useState<string>("__none__");
  const [trainerOptions, setTrainerOptions] = useState<{ id: string; name: string }[]>([]);

  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403 || res.status === 401) {
        router.replace("/dashboard");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "載入失敗");
      }
      const data = await res.json();
      setUsers(
        (Array.isArray(data) ? data : []).map((u: UserRow & { linkedTrainer?: UserRow["linkedTrainer"] }) => ({
          ...u,
          linkedTrainer: u.linkedTrainer ?? null,
        }))
      );

      const trRes = await fetch("/api/trainers");
      if (trRes.ok) {
        const tr = await trRes.json();
        if (Array.isArray(tr)) {
          setTrainerOptions(tr.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) {
      router.replace("/dashboard");
      return;
    }
    load();
  }, [session, status, isAdmin, load, router]);

  const openCreate = () => {
    setError(null);
    setEditing(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormDepartment("");
    setFormRole("trainer");
    setFormLinkedTrainerId("__none__");
    setDialogOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setError(null);
    setEditing(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword("");
    setFormDepartment(u.department || "");
    setFormRole(u.role);
    setFormLinkedTrainerId(u.linkedTrainer?.id ?? "__none__");
    setDialogOpen(true);
  };

  const submitForm = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!editing && !formDepartment) {
        setError("請選擇單位");
        setSaving(false);
        return;
      }
      if (!editing && !formPassword.trim()) {
        setError("請設定密碼");
        setSaving(false);
        return;
      }

      const url = editing ? `/api/admin/users/${editing.id}` : "/api/admin/users";
      const linkPayload =
        formRole === "trainer"
          ? {
              linkedTrainerId:
                formLinkedTrainerId === "__none__" ? null : formLinkedTrainerId,
            }
          : {};

      const body = editing
        ? {
            name: formName.trim(),
            email: formEmail.trim(),
            department: formDepartment || null,
            role: formRole,
            ...(formPassword.trim() ? { password: formPassword.trim() } : {}),
            ...linkPayload,
          }
        : {
            name: formName.trim(),
            email: formEmail.trim(),
            password: formPassword.trim(),
            department: formDepartment,
            role: formRole,
            ...(formRole === "trainer" && formLinkedTrainerId !== "__none__"
              ? { linkedTrainerId: formLinkedTrainerId }
              : {}),
          };

      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || "儲存失敗");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`確定要刪除使用者「${u.name}」？此動作無法還原，且會一併刪除該使用者建立的規劃需求與相似度紀錄。`)) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error || "刪除失敗");
      return;
    }
    await load();
  };

  if (status === "loading" || (loading && users.length === 0)) {
    return <TableSkeleton rows={6} cols={4} />;
  }

  if (!isAdmin) {
    return null;
  }

  const previewCampus = campusFromTrainerUnit(formDepartment || null);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeading
        title="使用者管理"
        description="新增、編輯或刪除系統帳號（僅系統管理員）"
      />

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCog className="h-4 w-4 text-primary" />
              帳號清單
            </CardTitle>
            <CardDescription>
              登入帳號為電子郵件地址。單位為學院培訓師所屬：資訊學系、企管學系、網路學系（院本部）、台中所、高雄所；院所別會依單位自動帶入。
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新增使用者
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-3 font-medium">姓名</th>
                  <th className="p-3 font-medium">電子郵件（帳號）</th>
                  <th className="p-3 font-medium">單位</th>
                  <th className="p-3 font-medium">院所別</th>
                  <th className="p-3 font-medium">角色</th>
                  <th className="p-3 font-medium min-w-[7rem]">名冊綁定</th>
                  <th className="p-3 font-medium w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{u.name}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">{u.department || "—"}</td>
                    <td className="p-3">{u.campus || "—"}</td>
                    <td className="p-3">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {roleLabel(u.role)}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs max-w-[10rem] truncate" title={u.linkedTrainer?.name}>
                      {u.linkedTrainer ? u.linkedTrainer.name : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[min(90vh,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="shrink-0 border-b px-6 pb-4 pt-6">
            <DialogHeader className="text-left">
              <DialogTitle>{editing ? "編輯使用者" : "新增使用者"}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="u-name">姓名</Label>
                <Input
                  id="u-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="u-email">電子郵件（登入帳號）</Label>
                  <Input
                    id="u-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="u-pw">
                    密碼{editing ? "（留空則不變更）" : ""}
                  </Label>
                  <Input
                    id="u-pw"
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    autoComplete={editing ? "new-password" : "new-password"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 min-w-0">
                  <Label>單位</Label>
                  <Select value={formDepartment || "__none__"} onValueChange={(v) => setFormDepartment(v === "__none__" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="請選擇單位" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">（未指定）</SelectItem>
                      {editing &&
                        formDepartment &&
                        !(TRAINER_UNITS as readonly string[]).includes(formDepartment) && (
                          <SelectItem value={formDepartment}>{formDepartment}（舊資料，請改選）</SelectItem>
                        )}
                      {TRAINER_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-0">
                  <Label>角色</Label>
                  <Select
                    value={formRole}
                    onValueChange={(v) => {
                      setFormRole(v);
                      if (v !== "trainer") setFormLinkedTrainerId("__none__");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {previewCampus && (
                <p className="text-xs text-muted-foreground -mt-2">院所別將儲存為：{previewCampus}</p>
              )}
              {formRole === "trainer" ? (
                <div className="space-y-2">
                  <Label>對應培訓師名冊</Label>
                  <Select value={formLinkedTrainerId} onValueChange={setFormLinkedTrainerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇名冊列" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">（不綁定）</SelectItem>
                      {trainerOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    若該帳號已綁定其他名冊列，儲存時會改綁至所選列並自動解除舊綁定。
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  系統管理員角色不綁定培訓師名冊；若由培訓師改為管理員，儲存後會自動解除名冊綁定。
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitForm} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
