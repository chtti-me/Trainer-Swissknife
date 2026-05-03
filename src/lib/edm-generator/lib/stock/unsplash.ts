import { useSettingsStore } from '@edm/store/settingsStore';

export interface StockPhoto {
  id: string;
  thumb: string;
  full: string;
  author: string;
  authorUrl?: string;
  source: 'unsplash' | 'pexels';
}

/**
 * 組合最終的搜尋 query：使用者輸入的 query + 可選的模板覺察 keywords
 * 例如 query="ai studio" + extraKeywords="editorial magazine cover beige"
 *      → "ai studio editorial magazine cover beige"
 */
export function buildStockQuery(query: string, extraKeywords?: string): string {
  return [query, extraKeywords].filter((s) => s && s.trim()).join(' ').trim();
}

/**
 * v0.7.0.1 hotfix：強化 Unsplash 錯誤訊息。
 *
 * 之前所有非 2xx 都統一拋 `Unsplash API ${status}`，使用者看到 410、401、429 也分不出差別。
 * 實務上常見的 fail 模式：
 *   - 401 Unauthorized：Access Key 錯誤 / 過期 / 已撤銷
 *   - 403 Forbidden：domain 限制或產品條款違規（罕見）
 *   - 410 Gone：Demo App 被 Unsplash 自動下架（demo 模式註冊後若長期未升級 production，
 *     或長期未使用，會被「retired」；端點對該 client_id 永久回 410）
 *   - 429 Too Many Requests：超過 rate limit（demo 50/hr、production 5000/hr）
 * 也加上 key trim()，避免 SettingsDialog 貼 key 時不小心多了前後空白被 server 拒收。
 */
function explainUnsplashStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Unsplash 401：Access Key 錯誤或已被撤銷，請至設定重新貼一次。';
    case 403:
      return 'Unsplash 403：請求被拒（可能是 domain 限制或條款違規）。';
    case 410:
      return 'Unsplash 410：你的 Demo App 已被 Unsplash 下架（demo 模式註冊後長期未升級 production 或未使用會被 retire）。請到 https://unsplash.com/oauth/applications 重新建立 / 升級為 production，或先改用 Pexels。';
    case 429:
      return 'Unsplash 429：請求太頻繁。Demo 模式每小時 50 次、Production 每小時 5000 次，請稍後再試。';
    default:
      return `Unsplash API ${status}：請稍後再試或改用 Pexels。`;
  }
}

export async function searchUnsplash(query: string, perPage = 12, extraKeywords?: string): Promise<StockPhoto[]> {
  // v0.7.0.1：trim 防呆，避免複製 key 時夾帶空白 / 換行造成 Authorization header 非法
  const key = useSettingsStore.getState().unsplashApiKey?.trim();
  if (!key) throw new Error('尚未設定 Unsplash Access Key');

  const finalQuery = buildStockQuery(query, extraKeywords);
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(finalQuery)}&per_page=${perPage}&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!res.ok) throw new Error(explainUnsplashStatus(res.status));
  const data = await res.json();
  return (data.results ?? []).map((p: any) => ({
    id: p.id,
    thumb: p.urls.small,
    full: p.urls.regular,
    author: p.user.name,
    authorUrl: p.user.links.html,
    source: 'unsplash' as const,
  }));
}
