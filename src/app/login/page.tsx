"use client";

/**
 * 【登入頁】
 * 使用者輸入 email／密碼後呼叫 NextAuth 驗證；成功則導向儀表板。
 * 比喻：公司大門的門禁刷卡畫面。
 */

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wrench, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: `${window.location.origin}/dashboard`,
    });

    setLoading(false);

    if (result?.error || result?.ok === false) {
      setError("帳號或密碼錯誤，請重試。");
    } else {
      router.refresh();
      router.push("/dashboard");
    }
  };

  const quickLogin = async (email: string, password: string) => {
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: `${window.location.origin}/dashboard`,
      });
      if (result?.error || result?.ok === false) {
        setError("快速登入失敗。請重啟開發伺服器（dev server）後再試；若使用非 3000 埠，請確認 .env 已設定 AUTH_TRUST_HOST=true。");
        return;
      }
      router.refresh();
      router.push("/dashboard");
    } catch {
      setError("登入請求發生錯誤，請重新整理頁面後再試。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <Wrench className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">培訓師瑞士刀</h1>
          <p className="text-muted-foreground text-sm mt-1">中華電信學院培訓師工作平台</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">登入系統</CardTitle>
            <CardDescription>請輸入您的帳號與密碼</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">電子郵件</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="yourname@cht.com.tw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密碼</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                登入
              </Button>
            </form>

            {error && <p className="text-sm text-destructive mt-4" role="alert" aria-live="polite">{error}</p>}

            <div className="mt-6 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-3">快速登入（測試用）：</p>
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() => quickLogin("admin@cht.com.tw", "admin123")}
                  disabled={loading}
                >
                  系統管理員（admin@cht.com.tw）
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() => quickLogin("trainer@cht.com.tw", "password123")}
                  disabled={loading}
                >
                  黃建豪（培訓師，資訊學系，院本部）
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          培訓師瑞士刀 v4.0 &copy; 中華電信學院
        </p>
      </div>
    </div>
  );
}
