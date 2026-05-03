/**
 * v0.7.5.0：snapshot ↔ store helper —— 把 EdmStore state 與 DraftPayload.snapshot
 * 之間的轉換集中，避免 useAutosave hook 直接依賴 store internals。
 *
 * # 為什麼不直接 set(snapshot)
 *
 *   Zustand store 還有 selectedBlockId / editingBlockId / past / future 等暫態欄位，
 *   不能無腦 spread 進 set 否則會丟掉 history（雖然 autosave 不還原 history，但暫態
 *   欄位重置應該明確）。
 */

import type { EdmSnapshot } from '@edm/store/edmStore';
import { useEdmStore } from '@edm/store/edmStore';

/** 從 store 抽出 9 個可序列化欄位（與 EdmSnapshot 一致） */
export function extractSnapshot(): EdmSnapshot {
  const s = useEdmStore.getState();
  return {
    plan: s.plan,
    blocks: s.blocks,
    templateId: s.templateId,
    paletteId: s.paletteId,
    tokens: s.tokens,
    typography: s.typography,
    copy: s.copy,
    heroImage: s.heroImage,
    heroMeta: s.heroMeta,
  };
}

/**
 * 比對兩份 snapshot 是否「實質相同」—— 只比較 reference equality 不夠（Zustand
 * action 多數會建新 array / object），淺比每個欄位 + blocks reference 即可。
 *
 * 不做 deep equal —— 太貴而且使用者每次編輯都會建新 array，淺比已足夠捕捉「沒在
 * 編輯」（all refs unchanged）的狀態。
 */
export function snapshotsEqual(a: EdmSnapshot, b: EdmSnapshot): boolean {
  return (
    a.plan === b.plan &&
    a.blocks === b.blocks &&
    a.templateId === b.templateId &&
    a.paletteId === b.paletteId &&
    a.tokens === b.tokens &&
    a.typography === b.typography &&
    a.copy === b.copy &&
    a.heroImage === b.heroImage &&
    a.heroMeta === b.heroMeta
  );
}

/**
 * 估算 payload 序列化後大小（粗略，給 dev 觀察用，不參與寫入決策）。
 * Hero / image block Base64 主導體積；不必精確，只給「快速大小直覺」。
 */
export function estimateSnapshotBytes(snapshot: EdmSnapshot): number {
  try {
    return JSON.stringify(snapshot).length;
  } catch {
    return 0;
  }
}
