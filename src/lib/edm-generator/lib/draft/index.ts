/**
 * v0.7.5.0：autosave 模組 barrel —— 整合層只需要 import 這個入口。
 */

export type { DraftStorageAdapter } from './adapter';
export { NoopDraftStorageAdapter } from './adapter';
export {
  getDraftStorageAdapter,
  setDraftStorageAdapter,
  _resetDraftStorageAdapter,
} from './registry';
export { IndexedDbDraftStorage } from './adapters/indexedDb';
export { ElectronFsDraftStorage } from './adapters/electronFs';
export type { DraftPayload, DraftReadResult } from './types';
export { CURRENT_DRAFT_VERSION } from './types';
export { extractSnapshot, snapshotsEqual, estimateSnapshotBytes } from './snapshot';
