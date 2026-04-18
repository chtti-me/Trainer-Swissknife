"use client";

/**
 * 【培訓師名冊】
 * 列表資料來自 /api/trainers；管理員可綁定／解除綁定登入帳號（PATCH /api/admin/trainers/[id]）。
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, UserRound, Loader2, Link2, Users } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { TableSkeleton } from "@/components/ui/skeleton";

interface TrainerRow {
  id: string;
  name: string;
  trainerType: string | null;
  expertiseTags: string | null;
  teachingTopics: string | null;
  email: string | null;
  organization: string | null;
  notes: string | null;
  dataSource: string | null;
  active: boolean;
  linkedUser: { id: string; email: string; name: string } | null;
}

type AdminUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  linkedTrainer: { id: string; name: string } | null;
};

export default function TrainersPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [bindOpen, setBindOpen] = useState(false);
  const [bindTarget, setBindTarget] = useState<TrainerRow | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("__none__");
  const [savingBind, setSavingBind] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);

  const loadTrainers = useCallback(async () => {
    try {
      const res = await fetch("/api/trainers");
      const data = await res.json();
      setTrainers(Array.isArray(data) ? data : []);
    } catch {
      setTrainers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTrainers();
  }, [loadTrainers]);

  const openBindDialog = async (t: TrainerRow) => {
    setBindTarget(t);
    setBindError(null);
    setSelectedUserId(t.linkedUser?.id ?? "__none__");
    setBindOpen(true);
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setAdminUsers(data);
      } else {
        setAdminUsers([]);
      }
    } catch {
      setAdminUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const linkableUsers = adminUsers.filter(
    (u) =>
      u.role === "trainer" &&
      (!u.linkedTrainer || (bindTarget && u.linkedTrainer.id === bindTarget.id))
  );

  const saveBind = async () => {
    if (!bindTarget) return;
    setSavingBind(true);
    setBindError(null);
    try {
      const linkedUserId = selectedUserId === "__none__" ? null : selectedUserId;
      const res = await fetch(`/api/admin/trainers/${bindTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedUserId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || "更新失敗");
      }
      setBindOpen(false);
      setBindTarget(null);
      await loadTrainers();
    } catch (e) {
      setBindError(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setSavingBind(false);
    }
  };

  const filtered = trainers.filter((t) => {
    if (!keyword) return true;
    const kw = keyword.toLowerCase();
    return (
      t.name.toLowerCase().includes(kw) ||
      (t.expertiseTags || "").toLowerCase().includes(kw) ||
      (t.teachingTopics || "").toLowerCase().includes(kw) ||
      (t.organization || "").toLowerCase().includes(kw) ||
      (t.linkedUser?.email || "").toLowerCase().includes(kw)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeading
        title="培訓師名冊"
        description={
          isAdmin
            ? "培訓師／導師（Trainer）為本系統主要角色；系統管理員可於各筆資料「綁定帳號」對應登入 User（僅培訓師角色帳號）。資料可來自 TIS 開班計畫表匯入等。"
            : "培訓師／導師（Trainer）為本系統主要角色；與登入帳號之綁定由系統管理員於本頁維護。資料可來自 TIS 開班計畫表匯入等。"
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜尋姓名、專長、綁定帳號…"
          className="pl-9"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-sm">{trainers.length === 0 ? "目前尚無培訓師名冊資料" : "沒有符合搜尋條件的培訓師"}</p>
              {trainers.length === 0 && <p className="text-xs opacity-60">執行種子或匯入後會顯示於此</p>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserRound className="w-4 h-4 text-primary" />
                  </div>
                  <span className="truncate">{t.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Badge variant={t.trainerType === "內聘" ? "default" : "secondary"}>{t.trainerType || "-"}</Badge>
                  {t.linkedUser && (
                    <Badge variant="outline" className="text-[10px] truncate max-w-[140px]">
                      已綁：{t.linkedUser.email}
                    </Badge>
                  )}
                </div>
                {t.organization && <p className="text-muted-foreground text-xs">{t.organization}</p>}
                {t.expertiseTags && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">專長：</span>
                    {t.expertiseTags}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">來源：{t.dataSource || "-"}</p>
                {isAdmin && (
                  <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 mt-2" onClick={() => openBindDialog(t)}>
                    <Link2 className="h-3.5 w-3.5" />
                    綁定帳號
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={bindOpen} onOpenChange={setBindOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>綁定登入帳號</DialogTitle>
            <DialogDescription>
              名冊列「{bindTarget?.name}」對應的系統帳號。僅能選擇<strong>角色為培訓師</strong>且尚未綁定其他名冊列者（或維持目前綁定）。改綁時會自動解除該帳號在其他名冊列上的舊綁定。
            </DialogDescription>
          </DialogHeader>
          {bindError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {bindError}
            </div>
          )}
          <div className="space-y-2 py-2">
            <Label>培訓師登入帳號</Label>
            {loadingUsers ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇帳號" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（不綁定／解除綁定）</SelectItem>
                  {linkableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindOpen(false)}>
              取消
            </Button>
            <Button onClick={saveBind} disabled={savingBind || loadingUsers}>
              {savingBind && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
