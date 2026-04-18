"use client";

/**
 * 【個人師資人脈】
 * 培訓師自行維護之講師聯絡線索（非 TIS 正式主檔）；未來可併入課程規劃幫手之建議師資來源。
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton";
import { readResponseJson } from "@/lib/read-response-json";
import { useToast } from "@/components/ui/toaster";

type ContactRow = {
  id: string;
  displayName: string;
  title: string | null;
  organization: string | null;
  expertiseDomains: string | null;
  email: string | null;
  lineId: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  displayName: "",
  title: "",
  organization: "",
  expertiseDomains: "",
  email: "",
  lineId: "",
  address: "",
  phone: "",
  notes: "",
};

export default function PersonalInstructorNetworkPage() {
  const { status } = useSession();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/personal-instructor-contacts");
      const data = await readResponseJson<{ contacts?: ContactRow[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "載入失敗");
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } catch (e) {
      console.error(e);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: ContactRow) => {
    setEditing(c);
    setForm({
      displayName: c.displayName,
      title: c.title ?? "",
      organization: c.organization ?? "",
      expertiseDomains: c.expertiseDomains ?? "",
      email: c.email ?? "",
      lineId: c.lineId ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const displayName = form.displayName.trim();
    if (!displayName) {
      toast("請填寫姓名", "error");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/personal-instructor-contacts/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName,
            title: form.title.trim() || null,
            organization: form.organization.trim() || null,
            expertiseDomains: form.expertiseDomains.trim() || null,
            email: form.email.trim() || null,
            lineId: form.lineId.trim() || null,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            notes: form.notes.trim() || null,
          }),
        });
        const data = await readResponseJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "更新失敗");
      } else {
        const res = await fetch("/api/personal-instructor-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName,
            title: form.title.trim() || undefined,
            organization: form.organization.trim() || undefined,
            expertiseDomains: form.expertiseDomains.trim() || undefined,
            email: form.email.trim() || undefined,
            lineId: form.lineId.trim() || undefined,
            address: form.address.trim() || undefined,
            phone: form.phone.trim() || undefined,
            notes: form.notes.trim() || undefined,
          }),
        });
        const data = await readResponseJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "建立失敗");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "儲存失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ContactRow) => {
    if (!confirm(`確定刪除「${c.displayName}」？`)) return;
    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/personal-instructor-contacts/${c.id}`, { method: "DELETE" });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "刪除失敗");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "刪除失敗", "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading") {
    return <TableSkeleton rows={5} cols={3} />;
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeading
        title="個人師資人脈"
        description="記錄您認識的講師聯絡與專長線索（僅本人可見與編輯）。此資料非 TIS 正式師資主檔；課程規劃幫手產生建議師資時，會與歷史班次講師姓名等一併納入參考。"
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ContactRound className="h-4 w-4 text-primary" />
              聯絡人列表
            </CardTitle>
            <CardDescription>
              請遵循個人資料與資訊安全規範；敏感欄位僅供您自行工作參考。
            </CardDescription>
          </div>
          <Button type="button" size="sm" className="gap-1" onClick={openNew}>
            <Plus className="h-4 w-4" />
            新增
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無資料，請按「新增」建立第一筆聯絡人。</p>
          ) : (
            <ul className="space-y-3">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border bg-card px-4 py-3 shadow-sm flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{c.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {[c.title, c.organization].filter(Boolean).join(" · ") || "（未填頭銜／單位）"}
                    </p>
                    {c.expertiseDomains ? (
                      <p className="text-sm line-clamp-2">領域／專長：{c.expertiseDomains}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">更新：{formatDateTime(c.updatedAt)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                      編輯
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      disabled={deletingId === c.id}
                      onClick={() => remove(c)}
                    >
                      {deletingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      刪除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯聯絡人" : "新增聯絡人"}</DialogTitle>
            <DialogDescription>標示 * 為必填</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="pin-name">姓名 *</Label>
              <Input
                id="pin-name"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="講師姓名"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pin-title">頭銜／職稱</Label>
                <Input
                  id="pin-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin-org">單位／機構</Label>
                <Input
                  id="pin-org"
                  value={form.organization}
                  onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-exp">教學領域與專長</Label>
              <Textarea
                id="pin-exp"
                rows={3}
                value={form.expertiseDomains}
                onChange={(e) => setForm((f) => ({ ...f, expertiseDomains: e.target.value }))}
                placeholder="可條列擅長主題、認證、授課經驗等"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-email">電子郵件（Email，電子郵件）</Label>
              <Input
                id="pin-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pin-line">Line ID</Label>
                <Input
                  id="pin-line"
                  value={form.lineId}
                  onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin-phone">電話</Label>
                <Input
                  id="pin-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-addr">住址</Label>
              <Input
                id="pin-addr"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-notes">備註</Label>
              <Textarea
                id="pin-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">儲存</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
