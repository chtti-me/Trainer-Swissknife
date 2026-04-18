import mammoth from "mammoth";
import * as xlsx from "xlsx";

export type SupportedPlanningUploadExt = "txt" | "docx" | "pdf" | "xlsx" | "csv";

export function detectUploadExt(filename: string): SupportedPlanningUploadExt | null {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1];
  if (!ext) return null;
  if (ext === "txt" || ext === "docx" || ext === "pdf" || ext === "xlsx" || ext === "csv") return ext;
  return null;
}

function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function fromCsv(buffer: Buffer): string {
  const wb = xlsx.read(buffer, { type: "buffer" });
  const lines: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) continue;
    lines.push(`## 工作表：${name}`);
    for (const row of rows.slice(0, 500)) {
      const parts = Object.entries(row)
        .map(([k, v]) => `${k}：${String(v ?? "").trim()}`)
        .filter((x) => !x.endsWith("："));
      if (parts.length) lines.push(`- ${parts.join("；")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function fromPdf(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const result = await mod.default(buffer);
  return result.text || "";
}

export async function parsePlanningUploadToText(params: {
  filename: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<{ text: string; ext: SupportedPlanningUploadExt }> {
  const ext = detectUploadExt(params.filename);
  if (!ext) {
    throw new Error("不支援的檔案格式，請上傳 txt/docx/pdf/xlsx/csv");
  }

  let text = "";
  if (ext === "txt") {
    text = params.buffer.toString("utf8");
  } else if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: params.buffer });
    text = result.value || "";
  } else if (ext === "pdf") {
    text = await fromPdf(params.buffer);
  } else if (ext === "xlsx" || ext === "csv") {
    text = fromCsv(params.buffer);
  }

  text = normalizeText(text);
  if (!text) {
    throw new Error("檔案內容為空，請確認檔案是否含可解析文字");
  }

  return { text, ext };
}
