"use client";

/**
 * 【離線偵測橫幅】偵測到網路斷線時在頁面頂部顯示警示
 */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    if (typeof window !== "undefined" && !navigator.onLine) {
      setOffline(true);
    }

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[500] bg-destructive text-destructive-foreground text-center text-sm py-1.5 px-4 flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-300">
      <WifiOff className="w-4 h-4" />
      <span>網路連線已中斷，部分功能可能無法使用</span>
    </div>
  );
}
