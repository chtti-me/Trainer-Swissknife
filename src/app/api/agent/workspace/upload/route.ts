/**
 * 【工作區檔案上傳】POST /api/agent/workspace/upload
 * 接收使用者上傳的檔案，存入 agent-workspace 目錄。
 * 支援多檔上傳，單檔上限 3MB。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "agent-workspace");
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

const BLOCKED_PATTERNS = [
  ".env", "node_modules", ".git", ".prisma",
  ".next", ".github", ".cursor", "credentials", "secret",
];

function isSafeName(name: string): boolean {
  if (name.includes("..") || name.startsWith("/")) return false;
  for (const p of BLOCKED_PATTERNS) {
    if (name.includes(p)) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "未選擇任何檔案" }, { status: 400 });
    }

    const results: Array<{ name: string; size: number; path: string; ok: boolean; error?: string }> = [];

    for (const file of files) {
      const name = file.name;

      if (!isSafeName(name)) {
        results.push({ name, size: 0, path: "", ok: false, error: "檔名不合法" });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        results.push({ name, size: file.size, path: "", ok: false, error: `超過上限 ${MAX_FILE_SIZE / 1024 / 1024}MB` });
        continue;
      }

      const destPath = path.resolve(WORKSPACE_ROOT, name);
      if (!destPath.startsWith(WORKSPACE_ROOT)) {
        results.push({ name, size: 0, path: "", ok: false, error: "路徑不合法" });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(destPath, buffer);
      results.push({ name, size: file.size, path: name, ok: true });
    }

    return NextResponse.json({ uploaded: results }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: `上傳失敗：${(e as Error).message}` }, { status: 500 });
  }
}
