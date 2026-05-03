/**
 * v0.4.2：模組純函式 helpers。
 *
 * 把「建構 / 實例化 / 序列化 / 反序列化」做成不依賴 storage / store 的純函式，
 * 方便：
 *   - 在 Node 端 verify 中直接跑（不用 jsdom / localStorage mock）
 *   - 未來換 storage adapter（Electron fs / IndexedDB）時不用重寫邏輯
 */

import { nanoid } from 'nanoid';
import type { Block } from '@edm/types/blocks';
import type {
  ModuleExportEnvelope,
  SavedModule,
} from '@edm/types/savedModule';
import { MODULE_EXPORT_KIND, MODULE_SCHEMA_VERSION } from '@edm/types/savedModule';

/**
 * 從 block 序列建一個新的 SavedModule（給「儲存當前選中為模組」用）。
 *
 * 重要：
 *   - 會把每個 block 的 `origin.edited` 旗標清掉（模組是「乾淨的版型」，不該帶使用者的編輯狀態）
 *   - 會自動推算 `preview`（取首個 hero.title / headline.text / copy 純文字的前 30 字）
 *   - id 用 nanoid(12)，比 block 的 nanoid(8) 長，降低跨機匯入時的碰撞機率
 */
export function buildModuleFromBlocks(
  blocks: Block[],
  opts: { name: string; description?: string; tags?: string[] },
): SavedModule {
  if (!blocks || blocks.length === 0) {
    throw new Error('buildModuleFromBlocks: blocks 不可為空');
  }
  if (!opts.name?.trim()) {
    throw new Error('buildModuleFromBlocks: name 不可為空');
  }
  const cleaned = blocks.map((b) => stripEditedFlag(b));
  const now = new Date().toISOString();
  return {
    id: nanoid(12),
    name: opts.name.trim(),
    description: opts.description?.trim() || undefined,
    tags: opts.tags?.map((t) => t.trim()).filter((t) => t.length > 0) || undefined,
    blocks: cleaned,
    preview: derivePreview(cleaned),
    createdAt: now,
    updatedAt: now,
    schemaVersion: MODULE_SCHEMA_VERSION,
  };
}

/**
 * 把 SavedModule 實例化成可以插入 EDM 的 blocks。
 *
 * 重要：
 *   - 每個 block 都換成新的 nanoid(8) id，避免跟 EDM 中既有 block 衝突
 *   - origin 一律設為 `{ source: 'user' }`，確保 partial update（applyCopyVersion）不動它們
 */
export function instantiateModule(m: SavedModule): Block[] {
  return m.blocks.map((b) => ({
    ...b,
    id: nanoid(8),
    origin: { source: 'user' as const },
  }));
}

/**
 * 從 block 序列推算純文字 preview（取最有資訊量的那個 block 的標題）。
 *
 * 優先順序：
 *   1. hero 的 title
 *   2. headline 的 text
 *   3. cta 的 label
 *   4. copy 的純文字前 30 字
 *   5. footer 的 text
 *   6. 隨意一個 block 的 type 名稱
 */
export function derivePreview(blocks: Block[]): string {
  for (const b of blocks) {
    if (b.type === 'hero' && b.title) return b.title.slice(0, 30);
    if (b.type === 'headline' && b.text) return b.text.slice(0, 30);
  }
  for (const b of blocks) {
    if (b.type === 'cta' && b.label) return b.label.slice(0, 30);
    if (b.type === 'copy') {
      const txt = b.html.replace(/<[^>]+>/g, '').trim();
      if (txt) return txt.slice(0, 30);
    }
    if (b.type === 'footer' && b.text) return b.text.slice(0, 30);
  }
  if (blocks.length > 0) return `${blocks[0].type} block`;
  return '';
}

/** 把指定模組序列化為可分享的 JSON 字串（envelope + pretty-printed） */
export function serializeModules(modules: SavedModule[]): string {
  const envelope: ModuleExportEnvelope = {
    kind: MODULE_EXPORT_KIND,
    schemaVersion: MODULE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    modules,
  };
  return JSON.stringify(envelope, null, 2);
}

export interface DeserializeResult {
  /** 解析成功的 modules */
  modules: SavedModule[];
  /** 任何解析過程中發現的錯誤（不會整批失敗，會盡力解析） */
  errors: string[];
}

/**
 * 把 JSON 字串解析回 modules（容錯模式 —— 部分壞掉的不會拖累整批）。
 *
 * 容錯規則：
 *   - 整體 JSON parse 失敗 → 回傳 { modules: [], errors: ['JSON parse error: ...'] }
 *   - kind 不對（不是 export envelope）→ 仍嘗試把根當成 module array 解析（向前相容）
 *   - 個別 module 缺必填欄位 → 跳過該筆，記入 errors
 */
export function deserializeModules(json: string): DeserializeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    return { modules: [], errors: [`JSON parse error: ${(err as Error).message}`] };
  }

  // 兩種接受的格式：
  //   1) { kind: 'edm-generator-modules-export', modules: [...] }
  //   2) [...] 直接是 modules array
  let candidates: unknown[] = [];
  const errors: string[] = [];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (raw && typeof raw === 'object' && 'modules' in raw) {
    const env = raw as Partial<ModuleExportEnvelope>;
    if (env.kind && env.kind !== MODULE_EXPORT_KIND) {
      errors.push(`未知的 kind：${env.kind}（仍嘗試解析）`);
    }
    candidates = Array.isArray(env.modules) ? env.modules : [];
  } else {
    return { modules: [], errors: ['JSON 結構不認得：必須是 export envelope 或 modules array'] };
  }

  const modules: SavedModule[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const validated = validateModule(c, i);
    if ('error' in validated) {
      errors.push(validated.error);
    } else {
      modules.push(validated.module);
    }
  }
  return { modules, errors };
}

/** 把 module 序列化成單一 JSON 字串並回傳，給「複製此模組 JSON」按鈕用 */
export function serializeSingleModule(m: SavedModule): string {
  return serializeModules([m]);
}

/* ──────────────────── 私有 helpers ──────────────────── */

function stripEditedFlag(b: Block): Block {
  if (!b.origin) return b;
  if (b.origin.edited === undefined) return b;
  const { edited: _edited, ...rest } = b.origin;
  return { ...b, origin: rest } as Block;
}

interface ValidatedOk {
  module: SavedModule;
}
interface ValidatedErr {
  error: string;
}

function validateModule(c: unknown, idx: number): ValidatedOk | ValidatedErr {
  if (!c || typeof c !== 'object') {
    return { error: `module[${idx}]: 必須是物件` };
  }
  const m = c as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id) return { error: `module[${idx}]: 缺 id` };
  if (typeof m.name !== 'string' || !m.name) return { error: `module[${idx}]: 缺 name` };
  if (!Array.isArray(m.blocks) || m.blocks.length === 0) {
    return { error: `module[${idx}] (${m.name}): blocks 必須是非空陣列` };
  }
  // 不深入驗證每個 block 的型別，因為 BlockType 會持續演化；
  // 後續 instantiateModule 仍會以新 id 重建，極端壞掉的也最多只是 render 崩
  const now = new Date().toISOString();
  const validated: SavedModule = {
    id: m.id,
    name: m.name,
    description: typeof m.description === 'string' ? m.description : undefined,
    tags: Array.isArray(m.tags) ? (m.tags as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
    blocks: m.blocks as Block[],
    tokens: (m.tokens as SavedModule['tokens']) ?? undefined,
    typography: (m.typography as SavedModule['typography']) ?? undefined,
    thumbnail: typeof m.thumbnail === 'string' ? m.thumbnail : undefined,
    preview: typeof m.preview === 'string' ? m.preview : derivePreview(m.blocks as Block[]),
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : now,
    updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : now,
    schemaVersion: typeof m.schemaVersion === 'number' ? m.schemaVersion : MODULE_SCHEMA_VERSION,
  };
  return { module: validated };
}
