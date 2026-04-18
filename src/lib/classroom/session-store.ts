/**
 * 【教室模組：TIS Session 暫存】
 * 記憶體 Map 保存使用者貼上的 TIS Cookie 與本系統發的 token（開發／展示用，重啟即清空）。
 * 比喻：櫃台暫存貴重物品的號碼牌——有時效、不永久存檔。
 */
import { randomUUID } from "crypto";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export interface ClassroomSessionRecord {
  token: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastValidatedAt?: Date;
}

const store = new Map<string, ClassroomSessionRecord>();

function now() {
  return new Date();
}

export function createClassroomSession(sessionId: string): ClassroomSessionRecord {
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + EIGHT_HOURS_MS);
  const token = randomUUID();
  const record: ClassroomSessionRecord = { token, sessionId, createdAt, expiresAt };
  store.set(token, record);
  return record;
}

export function getClassroomSession(token: string): ClassroomSessionRecord | null {
  const record = store.get(token);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return record;
}

export function touchClassroomSessionValidated(token: string) {
  const record = store.get(token);
  if (!record) return;
  record.lastValidatedAt = now();
}

export function revokeClassroomSession(token: string): boolean {
  const record = store.get(token);
  if (!record) return false;
  record.revokedAt = now();
  return true;
}

export function getSessionTtlSeconds(record: ClassroomSessionRecord): number {
  const ttlMs = record.expiresAt.getTime() - Date.now();
  return Math.max(0, Math.floor(ttlMs / 1000));
}

