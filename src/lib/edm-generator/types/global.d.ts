export interface OpenedFile {
  path: string;
  name: string;
  data: string;
}

export interface TisResult {
  ok: boolean;
  html?: string;
  error?: string;
}

export interface SecretResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export interface SaveFileOpts {
  defaultName?: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface ElectronAPI {
  openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<OpenedFile | null>;
  saveFile: (opts: SaveFileOpts) => Promise<string | null>;
  copyText: (text: string) => Promise<boolean>;
  copyHTML: (html: string) => Promise<boolean>;
  fetchTisHtml: (url: string) => Promise<TisResult>;
  setSecret: (key: string, value: string) => Promise<SecretResult>;
  getSecret: (key: string) => Promise<SecretResult>;
  deleteSecret: (key: string) => Promise<SecretResult>;
  isElectron: true;
}

declare global {
  interface Window {
    edm: ElectronAPI;
  }
  /** 由 vite.config.ts define 注入；對應 package.json 的 version 欄位 */
  const __APP_VERSION__: string;
}

export {};
