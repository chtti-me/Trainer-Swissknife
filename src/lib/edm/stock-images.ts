/**
 * 【EDM 主題圖】依課程文字挑選 Unsplash 靜態圖（HTTPS），無上傳圖片時仍可有視覺焦點。
 * 多數信箱需使用者允許顯示外部圖片後才會載入。
 */

type StockEntry = { keywords: string[]; url: string; alt: string };

const DEFAULT_STOCK: StockEntry = {
  keywords: [],
  url: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1200&q=80&auto=format&fit=crop",
  alt: "專業學習與培訓主題示意",
};

const SANITIZED: StockEntry[] = [
  {
    keywords: ["ai", "人工智慧", "機器學習", "深度學習", "chatgpt", "生成式"],
    url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&q=80&auto=format&fit=crop",
    alt: "科技與人工智慧主題示意",
  },
  {
    keywords: ["雲端", "cloud", "aws", "azure", "容器", "k8s", "kubernetes"],
    url: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&q=80&auto=format&fit=crop",
    alt: "雲端與網路連結主題示意",
  },
  {
    keywords: ["資安", "安全", "security", "駭客", "防護", "iso"],
    url: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&q=80&auto=format&fit=crop",
    alt: "資訊安全主題示意",
  },
  {
    keywords: ["資料", "data", "大數據", "分析", "bi", "統計"],
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80&auto=format&fit=crop",
    alt: "資料分析與儀表板主題示意",
  },
  {
    keywords: ["領導", "管理", "主管", "溝通", "簡報", "表達"],
    url: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&q=80&auto=format&fit=crop",
    alt: "團隊與商務討論主題示意",
  },
  {
    keywords: ["創新", "設計", "思考", "工作坊", "敏捷", "scrum"],
    url: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=1200&q=80&auto=format&fit=crop",
    alt: "創新與協作工作坊主題示意",
  },
  {
    keywords: ["網路", "5g", "電信", "通訊", "無線", "iot"],
    url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80&auto=format&fit=crop",
    alt: "通訊與連網主題示意",
  },
  {
    keywords: ["程式", "開發", "coding", "java", "python", "軟體"],
    url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200&q=80&auto=format&fit=crop",
    alt: "程式開發主題示意",
  },
];

/**
 * 依班名、目標與原始文字挑一張情境圖。
 */
export function pickStockImage(textSources: string[]): { url: string; alt: string } {
  const blob = textSources.join(" ").toLowerCase();
  for (const entry of SANITIZED) {
    if (entry.keywords.some((k) => blob.includes(k.toLowerCase()))) {
      return { url: entry.url, alt: entry.alt };
    }
  }
  return { url: DEFAULT_STOCK.url, alt: DEFAULT_STOCK.alt };
}
