import { useSettingsStore } from '@edm/store/settingsStore';
import { buildStockQuery, type StockPhoto } from './unsplash';

function explainPexelsStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Pexels 401：API Key 錯誤或已被撤銷。';
    case 429:
      return 'Pexels 429：請求太頻繁，請稍後再試（免費方案每月 20,000 次、每小時 200 次）。';
    default:
      return `Pexels API ${status}：請稍後再試或改用 Unsplash。`;
  }
}

export async function searchPexels(query: string, perPage = 12, extraKeywords?: string): Promise<StockPhoto[]> {
  // v0.7.0.1：與 Unsplash 同樣對 key 做 trim 防呆
  const key = useSettingsStore.getState().pexelsApiKey?.trim();
  if (!key) throw new Error('尚未設定 Pexels API Key');
  const finalQuery = buildStockQuery(query, extraKeywords);
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(finalQuery)}&per_page=${perPage}&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: key },
  });
  if (!res.ok) throw new Error(explainPexelsStatus(res.status));
  const data = await res.json();
  return (data.photos ?? []).map((p: any) => ({
    id: String(p.id),
    thumb: p.src.medium,
    full: p.src.large2x,
    author: p.photographer,
    authorUrl: p.photographer_url,
    source: 'pexels' as const,
  }));
}
