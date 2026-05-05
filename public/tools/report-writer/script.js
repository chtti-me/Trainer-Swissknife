/* ==============================================
   業務會報撰寫器 v2.0 — 主要腳本
   
   模組結構：
   1. 全域狀態與工具函式
   2. 側邊欄導覽
   3. 畫布編輯器（投影片管理 + 元件拖曳）
   4. 圖片處理
   5. 內嵌表格編輯器
   6. 簡報預覽
   7. 合併管理
   8. AI 輔助
   9. 設定
   10. 匯出 / 匯入
   ============================================== */

/* =============================================
   1. 全域狀態與工具函式
   ============================================= */

// 預設主辦人名單
const DEFAULT_HOSTS = [
  '黃振生','李誠偉','林志榮','游進泓','黃敏純',
  '莊國志','賴瓊惠','李效寬','黃鴻儒','黃建豪',
  '夏少強','史明德','郭雅菁','鄭宗建','余東諺'
];

const DEFAULT_EXPORT_NAME_TEMPLATE = '資訊學系{rocYear}年{month}月份業務會報';

// 草稿自動儲存用的 localStorage 鍵名（只保留最近一版）
const DRAFT_STORAGE_KEY = '業務會報草稿';

// 預設模板定義
const PRESETS = {
  // 高度統一：標題一行 + 預留 3 行空白
  // 寬度統一：約為簡報寬度的一半
  reason:      { label: '案由：',         defaultH: 220, defaultW: 600, x: 48,  y: 10  },
  target:      { label: '培訓對象：',     defaultH: 220, defaultW: 600, x: 48,  y: 250 },
  situation:   { label: '辦理情形：',     defaultH: 220, defaultW: 600, x: 48,  y: 490 },
  performance: { label: '績效與貢獻：',   defaultH: 220, defaultW: 600, x: 660, y: 10  },
  followup:    { label: '後續推廣作為：', defaultH: 220, defaultW: 600, x: 660, y: 250 }
};

// 全域狀態
const state = {
  slides: [],         // 所有投影片資料
  currentSlide: 0,    // 目前投影片索引
  selectedElement: null, // 目前選取的畫布元件 DOM
  clipboardElement: null, // 元件複製 / 貼上的暫存資料
  isDragging: false,
  isResizing: false,
  dragOffset: { x: 0, y: 0 },
  resizeDir: '',
  resizeStart: { x: 0, y: 0, w: 0, h: 0, ex: 0, ey: 0 },
  canvasScale: 1,     // 畫布縮放倍率
  // 預覽
  previewSlides: [],
  previewCursor: 0,
  previewTheme: 'light',
  // 合併
  combineFiles: [],
  combMergedSlides: [],
  combGrouped: [],
  // AI 最近一次生成（供插入時判斷模板與參考資料）
  aiLastGeneration: null,
  // 投影片縮圖（html2canvas）：編輯中不擷取，改在滑鼠離開畫布區後點擊外部或切換頁時更新
  thumbnailDirty: false,
  /** 滑鼠曾離開 #canvasWrapper（畫布容器），配合「點擊外部」才更新目前頁縮圖 */
  mouseLeftCanvasWrapper: false,
};

// 快捷 DOM 選取
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// 產生唯一 ID
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ----- Toast 短暫提示（取代 alert，不擋畫面）；至少顯示 10 秒或由使用者點關閉 ----- */
function showToast(message, type = 'info') {
  // 若 AI 對話框正在開啟，優先使用對話框內的 Toast 容器，避免被 backdrop 蓋住
  const aiDialog = $('#aiDialog');
  let container = (aiDialog && aiDialog.open && $('#toastContainerDialog')) || $('#toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + (type === 'success' || type === 'error' || type === 'warning' ? type : 'info');
  const text = (message ?? '').toString().trim() || '已處理';
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = text;
  el.appendChild(msgSpan);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', '關閉');
  closeBtn.textContent = '✕';
  el.appendChild(closeBtn);
  container.appendChild(el);

  const duration = 10000; // 至少顯示 10 秒
  const dismiss = () => {
    clearTimeout(t);
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 220);
  };
  const t = setTimeout(dismiss, duration);
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  el.addEventListener('click', (e) => { if (e.target === el || e.target === msgSpan) dismiss(); });
}

/* ----- 確認框 Modal（取代 confirm，回傳 Promise<boolean>，可選「不再顯示」） ----- */
function showConfirm(options) {
  const dialog = $('#confirmDialog');
  const titleEl = $('#confirmDialogTitle');
  const messageEl = $('#confirmDialogMessage');
  const dontShowWrap = $('#confirmDialogDontShowWrap');
  const dontShowCheck = $('#confirmDialogDontShow');
  const btnCancel = $('#confirmDialogCancel');
  const btnOk = $('#confirmDialogOk');
  if (!dialog || !titleEl || !messageEl) return Promise.resolve(false);

  const {
    title = '確認',
    message = '',
    confirmText = '確定',
    cancelText = '取消',
    dontShowAgainKey = null
  } = options || {};

  titleEl.textContent = title;
  messageEl.textContent = message;
  btnOk.textContent = confirmText;
  btnCancel.textContent = cancelText;

  if (dontShowAgainKey) {
    dontShowWrap.style.display = 'flex';
    dontShowCheck.checked = false;
  } else {
    dontShowWrap.style.display = 'none';
  }

  return new Promise((resolve) => {
    const finish = (ok) => {
      dialog.close();
      if (dontShowAgainKey && dontShowCheck.checked) {
        try { localStorage.setItem(dontShowAgainKey, ok ? 'always' : 'never'); } catch (_) {}
      }
      resolve(ok);
    };
    btnCancel.onclick = () => finish(false);
    btnOk.onclick = () => finish(true);
    dialog.oncancel = (e) => { e.preventDefault(); finish(false); };
    dialog.showModal();
  });
}

/** 若先前選過「不再顯示」，回傳儲存的選擇：'always' | 'never' | null */
function getConfirmSkippedChoice(key) {
  try {
    const v = localStorage.getItem(key);
    return v === 'always' || v === 'never' ? v : null;
  } catch (_) { return null; }
}

// 下載檔案
function downloadFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// 安全清洗文字（保留換行與 Tab）
function cleanText(str) {
  return String(str ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001F\u007F]/g, '')
    .trim();
}

// HTML 跳脫
function escHTML(s) {
  return (s ?? '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 允許保留的標示 class（其他 HTML 會被清掉）
const HIGHLIGHT_CLASSES = [
  'highlight-green', 'highlight-blue', 'highlight-yellow', 'highlight-orange', 'highlight-red',
  'mark-yellow-red', 'mark-blue-white'
];

function findHighlightClass(el) {
  if (!el || !el.classList) return '';
  for (const c of HIGHLIGHT_CLASSES) {
    if (el.classList.contains(c)) return c;
  }
  return '';
}

function plainTextToSafeHtml(text) {
  const s = (text ?? '').toString().replace(/\r\n/g, '\n').replace(/\r/g, '');
  return escHTML(s).replace(/\n/g, '<br>');
}

// 將任意 HTML 正規化為「純文字 + <br> + 螢光筆 span」的安全 HTML
function normalizeTextHtml(rawHtml) {
  const root = document.createElement('div');
  root.innerHTML = (rawHtml ?? '').toString();

  function isBlockTag(tag) {
    return tag === 'div' || tag === 'p' || tag === 'li';
  }

  function walk(node, activeHighlight = '') {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = escHTML(node.nodeValue || '').replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
      return text;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '<br>';

    let nextHighlight = activeHighlight;
    const ownHighlight = findHighlightClass(node);
    if (ownHighlight) nextHighlight = ownHighlight;

    let inner = '';
    node.childNodes.forEach(child => { inner += walk(child, nextHighlight); });

    if (isBlockTag(tag)) inner += '<br>';

    if (ownHighlight && inner) return `<span class="${ownHighlight}">${inner}</span>`;
    return inner;
  }

  let out = '';
  root.childNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (isBlockTag(tag) && out && !out.endsWith('<br>')) {
        // contentEditable 常見格式：第一行是純文字節點，第二行開始是 <div>。
        // 這裡要在 block 前補一個換行，避免第二行黏到第一行後面。
        out += '<br>';
      }
    }
    out += walk(node, '');
  });
  out = out.replace(/^(?:<br>\s*)+/, '');
  out = out.replace(/(?:<br>\s*)+$/, '');
  return out;
}

function htmlToPlainTextPreserveBreaks(html) {
  if (!html) return '';
  const withBreakMark = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n');
  const div = document.createElement('div');
  div.innerHTML = withBreakMark;
  return (div.textContent || div.innerText || '').replace(/\r\n/g, '\n');
}

function getElementContentHtml(elData) {
  if (elData?.contentHtml) return normalizeTextHtml(elData.contentHtml);
  const content = (elData?.content ?? '').toString();
  // 向後相容：舊資料若把 HTML 塞在 content，先清洗後再顯示
  if (content.includes('<') && content.includes('>')) return normalizeTextHtml(content);
  return plainTextToSafeHtml(content);
}

function getElementPlainText(elData) {
  if (typeof elData?.content === 'string' && elData.content.length) {
    const c = elData.content;
    if (c.includes('<') && c.includes('>')) return htmlToPlainTextPreserveBreaks(c);
    return c;
  }
  if (typeof elData?.contentHtml === 'string') return htmlToPlainTextPreserveBreaks(elData.contentHtml);
  return '';
}

function getElementDisplayHtml(elData) {
  let presetHtml = '';
  if (elData?.preset && PRESETS[elData.preset]) {
    const safeLabel = escHTML(PRESETS[elData.preset].label);
    // 在預覽／匯出時，讓模板標籤呈現藍色標題行，其後內容維持一般文字顏色
    presetHtml = `<span class="pv-preset-label">${safeLabel}</span><br>`;
  }
  return presetHtml + getElementContentHtml(elData);
}

// 預覽時依「目前主題」決定文字顏色，避免淺色主題存的深字在深色預覽時看不見
function getPreviewTextColor(storedColor) {
  const isDarkTheme = state.previewTheme === 'dark';
  const darkText = '#22263a';
  const lightText = '#eaeefc';
  if (!storedColor || !String(storedColor).trim()) return isDarkTheme ? lightText : darkText;
  const c = String(storedColor).trim().toLowerCase();
  let luminance = 0.5;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(c);
  if (hex) {
    const r = parseInt(hex[1], 16) / 255, g = parseInt(hex[2], 16) / 255, b = parseInt(hex[3], 16) / 255;
    luminance = r * 0.299 + g * 0.587 + b * 0.114;
  } else {
    const rgb = /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(c);
    if (rgb) {
      const r = parseInt(rgb[1], 10) / 255, g = parseInt(rgb[2], 10) / 255, b = parseInt(rgb[3], 10) / 255;
      luminance = r * 0.299 + g * 0.587 + b * 0.114;
    } else if (c === '#22263a' || c === '#1a1f36') luminance = 0.15;
    else if (c === '#eaeefc' || c === '#fff' || c === '#ffffff') luminance = 0.95;
  }
  const isDarkColor = luminance < 0.5;
  const isLightColor = luminance >= 0.6;
  if (isDarkTheme) return isLightColor ? c : lightText;
  if (!isDarkTheme) return isDarkColor ? c : darkText;
  return c;
}

function buildExportBaseNameFromTemplate(templateRaw) {
  const now = new Date();
  const vars = {
    year: String(now.getFullYear()),
    rocYear: String(now.getFullYear() - 1911),
    month: String(now.getMonth() + 1)
  };
  const template = (templateRaw || DEFAULT_EXPORT_NAME_TEMPLATE).trim() || DEFAULT_EXPORT_NAME_TEMPLATE;
  const name = template
    .replace(/\{year\}/g, vars.year)
    .replace(/\{rocYear\}/g, vars.rocYear)
    .replace(/\{month\}/g, vars.month);
  return name.replace(/[\\\/:*?"<>|]/g, '_');
}

function buildExportBaseName() {
  const stored = localStorage.getItem('export.filename.template');
  return buildExportBaseNameFromTemplate(stored);
}

function toPptxHexColor(cssColor, fallback = '22263A') {
  if (!cssColor) return fallback;
  const c = cssColor.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(c);
  if (short) return short[1].split('').map(ch => ch + ch).join('').toUpperCase();
  const full = /^#([0-9a-f]{6})$/i.exec(c);
  if (full) return full[1].toUpperCase();
  const rgb = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i.exec(c);
  if (rgb) {
    const n = (v) => ('0' + Math.max(0, Math.min(255, parseInt(v, 10))).toString(16)).slice(-2);
    return `${n(rgb[1])}${n(rgb[2])}${n(rgb[3])}`.toUpperCase();
  }
  return fallback;
}

/* =============================================
   2. 側邊欄導覽
   ============================================= */

function initSidebar() {
  const sidebar = $('#sidebar');
  const toggle = $('#sidebarToggle');
  const navBtns = $$('.nav-btn');

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      const tab = $('#tab-' + btn.dataset.tab);
      if (tab) tab.classList.add('active');

      // 切換到預覽時自動載入編輯器內容並調整大小
      if (btn.dataset.tab === 'preview') {
        loadPreviewFromEditor();
        fitPreview();
      }
    });
  });
}

/* =============================================
   3. 畫布編輯器 — 投影片管理
   ============================================= */

// 建立空白投影片資料
function createSlideData() {
  return {
    id: uid(),
    title: '',
    host: '',
    elements: []
  };
}

// 建立空白元件資料
function createElementData(type, overrides = {}) {
  const base = {
    id: uid(),
    type,
    x: 48,
    y: 140,
    width: 400,
    height: 200,
    content: '',
    style: {}
  };

  if (type === 'text') {
    base.width = 580;
    base.height = 180;
    base.style = { fontSize: 24, color: '#22263a' };
  } else if (type === 'image') {
    base.width = 500;
    base.height = 350;
    base.imageData = '';
  } else if (type === 'table') {
    base.width = 600;
    base.height = 250;
    base.tableData = {
      headers: ['標題A', '標題B', '標題C'],
      colWidths: [200, 200, 200],
      rowHeights: [42, 42, 42],
      rows: [
        ['', '', ''],
        ['', '', '']
      ],
      theme: 'blue'
    };
  }

  return { ...base, ...overrides };
}

// 取得目前投影片資料
function currentSlideData() {
  return state.slides[state.currentSlide] || null;
}

// 初始化投影片
function initSlides() {
  if (state.slides.length === 0) {
    state.slides.push(createSlideData());
  }
  state.currentSlide = 0;
  renderSlideList();
  loadSlideToCanvas(0);
}

/** 標記目前頁需重產縮圖（不立即擷取） */
function markThumbnailDirty() {
  state.thumbnailDirty = true;
}

/** 擷取單一 DOM（畫布）為 JPEG 縮圖資料網址 */
async function runHtml2CanvasThumb(domEl) {
  const h2c = window.html2canvas;
  if (typeof h2c !== 'function') throw new Error('html2canvas 未載入');
  const c = await h2c(domEl, {
    backgroundColor: null,
    scale: 0.22,
    useCORS: true,
    logging: false,
    width: 1280,
    height: 720
  });
  return c.toDataURL('image/jpeg', 0.82);
}

function hideResizeHandlesForThumb(canvasEl, hide) {
  $$('.resize-handle', canvasEl).forEach(h => {
    h.style.visibility = hide ? 'hidden' : '';
  });
}

/**
 * 從「目前可見」主畫布擷取第 idx 頁縮圖（畫布必須正在顯示該頁）。
 * 會暫時還原 transform，避免 fitCanvas 的縮放影響 html2canvas。
 */
async function captureVisibleSlideThumbnailForIndex(idx) {
  const slide = state.slides[idx];
  if (!slide || state.currentSlide !== idx) return;
  const canvas = $('#canvas');
  if (!canvas) return;
  const prevTransform = canvas.style.transform;
  canvas.style.transform = 'none';
  hideResizeHandlesForThumb(canvas, true);
  try {
    slide.thumbnailDataUrl = await runHtml2CanvasThumb(canvas);
  } finally {
    canvas.style.transform = prevTransform;
    hideResizeHandlesForThumb(canvas, false);
    fitCanvas();
  }
}

/**
 * 離屏建立與編輯器相同結構的畫布，供鄰近頁縮圖擷取（不依賴目前顯示哪一頁）。
 */
function mountOffscreenEditorCanvas(slide) {
  const wrap = document.createElement('div');
  wrap.setAttribute('data-offscreen-thumb', '1');
  // 勿用 visibility:hidden，否則 html2canvas 可能擷不到內容
  wrap.style.cssText = 'position:fixed;left:-99999px;top:0;width:1280px;height:720px;overflow:hidden;z-index:-1;pointer-events:none;opacity:1;';
  const canvas = document.createElement('div');
  canvas.className = 'canvas';
  canvas.style.width = '1280px';
  canvas.style.height = '720px';
  canvas.style.transform = 'none';
  canvas.innerHTML = `
    <div class="canvas-header-overlay" aria-hidden="true">
      <h2 class="canvas-header-title">未命名</h2>
      <div class="canvas-header-host"></div>
    </div>
    <div class="canvas-empty-hint" style="display:none">請點擊上方工具列的「插入」按鈕，新增文字方塊、圖片或表格</div>
  `;
  const t = canvas.querySelector('.canvas-header-title');
  const h = canvas.querySelector('.canvas-header-host');
  if (t) t.textContent = (slide.title || '').trim() || '未命名';
  if (h) h.textContent = (slide.host || '').trim() ? `主辦人：${(slide.host || '').trim()}` : '';
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);
  renderCanvasElements(slide, canvas);
  return { wrap, canvas };
}

/** 離屏擷取指定索引投影片縮圖 */
async function captureSlideThumbnailOffscreen(slideIndex) {
  const slide = state.slides[slideIndex];
  if (!slide) return;
  const { wrap, canvas } = mountOffscreenEditorCanvas(slide);
  try {
    hideResizeHandlesForThumb(canvas, true);
    slide.thumbnailDataUrl = await runHtml2CanvasThumb(canvas);
  } finally {
    wrap.remove();
  }
}

/** 若目前頁有編輯未擷取，先補一張縮圖（切換頁／拖曳排序前呼叫，不受「滑鼠是否曾離開畫布」限制） */
async function captureCurrentSlideThumbnailIfDirty() {
  if (!state.thumbnailDirty) return;
  await ensureHtml2Canvas();
  saveCurrentSlide();
  await captureVisibleSlideThumbnailForIndex(state.currentSlide);
  state.thumbnailDirty = false;
}

/**
 * 切換頁後：更新目前頁（可見畫布）與鄰近頁（離屏）縮圖，降低一次全體重算負載。
 */
async function scheduleNeighborThumbnails(centerIdx) {
  await ensureHtml2Canvas();
  if (state.currentSlide !== centerIdx) return;
  saveCurrentSlide();
  await captureVisibleSlideThumbnailForIndex(centerIdx);
  const neighbors = [centerIdx - 1, centerIdx + 1].filter(j => j >= 0 && j < state.slides.length);
  for (const j of neighbors) {
    await captureSlideThumbnailOffscreen(j);
  }
  renderSlideList();
  saveDraftToStorage();
}

/** 在「滑鼠曾離開畫布區」且「點擊畫布外」時，更新目前頁縮圖 */
function initSlideThumbnailCapture() {
  const cw = $('#canvasWrapper');
  if (cw) {
    cw.addEventListener('mouseleave', () => { state.mouseLeftCanvasWrapper = true; });
    cw.addEventListener('mouseenter', () => { state.mouseLeftCanvasWrapper = false; });
  }

  document.addEventListener('click', (e) => {
    if (!$('#tab-editor')?.classList.contains('active')) return;
    if (e.target.closest('#canvasWrapper')) return;
    if (e.target.closest('.slide-thumb')) return;
    if (!state.thumbnailDirty || !state.mouseLeftCanvasWrapper) return;
    void (async () => {
      try {
        await ensureHtml2Canvas();
        saveCurrentSlide();
        await captureVisibleSlideThumbnailForIndex(state.currentSlide);
        state.thumbnailDirty = false;
        state.mouseLeftCanvasWrapper = false;
        renderSlideList();
        saveDraftToStorage();
      } catch (err) {
        showToast('更新縮圖失敗：' + err.message, 'error');
      }
    })();
  });

  document.addEventListener('mouseup', (e) => {
    if (!$('#tab-editor')?.classList.contains('active')) return;
    if (e.target.closest('#canvasWrapper')) markThumbnailDirty();
  }, true);

  const canvas = $('#canvas');
  if (canvas) {
    canvas.addEventListener('blur', (e) => {
      if (e.target.classList?.contains('el-content')) markThumbnailDirty();
    }, true);
  }

  const st = $('#slideTitle');
  const sh = $('#slideHostText');
  if (st) st.addEventListener('input', () => markThumbnailDirty());
  if (sh) sh.addEventListener('input', () => markThumbnailDirty());
}

// 渲染左側投影片列表
function renderSlideList() {
  const container = $('#slideListItems');
  container.innerHTML = '';
  state.slides.forEach((slide, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'slide-thumb' + (i === state.currentSlide ? ' active' : '');
    const label = document.createElement('div');
    label.className = 'slide-thumb-label';
    const num = document.createElement('span');
    num.textContent = '#' + (i + 1);
    label.appendChild(num);
    const preview = document.createElement('div');
    preview.className = 'slide-thumb-preview';
    const shot = document.createElement('img');
    shot.className = 'slide-thumb-shot';
    shot.alt = '';
    if (slide.thumbnailDataUrl) {
      shot.src = slide.thumbnailDataUrl;
      shot.style.display = 'block';
    } else {
      shot.style.display = 'none';
    }
    preview.append(shot);
    thumb.append(label, preview);
    thumb.addEventListener('click', () => {
      void (async () => {
        if (i === state.currentSlide) return;
        try {
          await captureCurrentSlideThumbnailIfDirty();
          state.currentSlide = i;
          renderSlideList();
          loadSlideToCanvas(i);
          saveDraftToStorage();
          await scheduleNeighborThumbnails(i);
        } catch (err) {
          showToast('切換投影片時縮圖更新失敗：' + err.message, 'error');
        }
      })();
    });

    // 投影片列表拖曳排序
    thumb.draggable = true;
    thumb.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/slide-index', String(i));
      thumb.style.opacity = '0.5';
    });
    thumb.addEventListener('dragend', () => { thumb.style.opacity = '1'; });
    thumb.addEventListener('dragover', (e) => e.preventDefault());
    thumb.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/slide-index'), 10);
      if (isNaN(fromIdx) || fromIdx === i) return;
      void (async () => {
        try {
          await captureCurrentSlideThumbnailIfDirty();
          const moved = state.slides.splice(fromIdx, 1)[0];
          state.slides.splice(i, 0, moved);
          state.currentSlide = i;
          renderSlideList();
          loadSlideToCanvas(i);
          saveDraftToStorage();
          await scheduleNeighborThumbnails(i);
        } catch (err) {
          showToast('排序後縮圖更新失敗：' + err.message, 'error');
        }
      })();
    });

    container.appendChild(thumb);
  });
}

// 將投影片資料載入畫布
function loadSlideToCanvas(idx) {
  const slide = state.slides[idx];
  if (!slide) return;

  $('#slideTitle').value = slide.title || '';
  $('#slideHostText').value = slide.host || '';
  updateEditorHeaderOverlay(slide.title, slide.host);

  // 嘗試設定下拉選單
  const sel = $('#slideHostSelect');
  const hostName = (slide.host || '').split('/')[0].trim();
  let found = false;
  for (const opt of sel.options) {
    if (opt.value === hostName) { sel.value = hostName; found = true; break; }
  }
  if (!found) sel.value = '';

  renderCanvasElements(slide);
  deselectElement();
  fitCanvas();
}

// 同步畫布上的標題列疊層（與簡報預覽一致）
function updateEditorHeaderOverlay(titleText, hostText) {
  const titleEl = $('#canvasHeaderTitle');
  const hostEl = $('#canvasHeaderHost');
  if (!titleEl || !hostEl) return;
  const t = (titleText || '').toString().trim();
  const h = (hostText || '').toString().trim();
  titleEl.textContent = t || '未命名';
  hostEl.textContent = h ? `主辦人：${h}` : '';
}

// 儲存目前畫布狀態回資料
function saveCurrentSlide() {
  const slide = currentSlideData();
  if (!slide) return;
  slide.title = ($('#slideTitle').value || '').trim();
  slide.host = ($('#slideHostText').value || '').trim();

  // 從 DOM 同步元件位置/大小/內容
  const canvas = $('#canvas');
  const elDoms = $$('.canvas-element', canvas);
  slide.elements = elDoms.map(dom => {
    const data = {
      id: dom.dataset.elId,
      type: dom.dataset.elType,
      x: parseFloat(dom.style.left) || 0,
      y: parseFloat(dom.style.top) || 0,
      width: parseFloat(dom.style.width) || 200,
      height: parseFloat(dom.style.height) || 100,
      style: {}
    };

    if (data.type === 'text') {
      const contentEl = $('.el-content', dom);
      const rawHtml = contentEl ? contentEl.innerHTML : '';
      data.contentHtml = normalizeTextHtml(rawHtml);
      data.content = contentEl ? contentEl.innerText : '';
      data.preset = dom.dataset.preset || '';
      const fs = dom.style.fontSize;
      if (fs) data.style.fontSize = parseInt(fs, 10);
      data.style.color = dom.style.color || '#22263a';
      if (dom.style.backgroundColor) data.style.backgroundColor = dom.style.backgroundColor;
      const bw = parseInt(dom.style.borderWidth, 10);
      if (!Number.isNaN(bw) && bw > 0) {
        data.style.borderWidth = bw;
        data.style.borderColor = dom.style.borderColor || '#cccccc';
      } else {
        delete data.style.borderWidth;
        delete data.style.borderColor;
      }
    } else if (data.type === 'image') {
      const img = $('img', dom);
      data.imageData = img ? img.src : '';
      const bw = parseInt(dom.style.borderWidth, 10);
      if (!Number.isNaN(bw) && bw > 0) {
        data.style.borderWidth = bw;
        data.style.borderColor = dom.style.borderColor || '#cccccc';
      } else {
        delete data.style.borderWidth;
        delete data.style.borderColor;
      }
    } else if (data.type === 'table') {
      data.tableData = extractTableData(dom);
    }

    return data;
  });
}

/* =============================================
   3b. 畫布編輯器 — 元件渲染
   ============================================= */

// 渲染畫布上的所有元件（可指定根節點，供離屏縮圖用）
function renderCanvasElements(slide, canvasRoot = null) {
  const canvas = canvasRoot || $('#canvas');
  if (!canvas) return;
  // 移除所有舊元件，保留提示文字
  $$('.canvas-element', canvas).forEach(el => el.remove());

  const hint = $('.canvas-empty-hint', canvas);
  if (hint) hint.style.display = (slide.elements.length === 0) ? '' : 'none';

  slide.elements.forEach(elData => {
    const dom = createCanvasElementDOM(elData);
    canvas.appendChild(dom);
  });
}

// 建立畫布元件 DOM
function createCanvasElementDOM(data) {
  const el = document.createElement('div');
  el.className = `canvas-element el-${data.type}`;
  el.dataset.elId = data.id;
  el.dataset.elType = data.type;
  el.style.left = data.x + 'px';
  el.style.top = data.y + 'px';
  el.style.width = data.width + 'px';
  el.style.height = data.height + 'px';

  // 調整大小控制點
  ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].forEach(dir => {
    const h = document.createElement('div');
    h.className = `resize-handle ${dir}`;
    h.dataset.dir = dir;
    el.appendChild(h);
  });

  if (data.type === 'text') {
    buildTextElement(el, data);
  } else if (data.type === 'image') {
    buildImageElement(el, data);
  } else if (data.type === 'table') {
    buildTableElement(el, data);
  }

  // 點選選取
  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    // 如果正在編輯文字，不要攔截
    if (el.classList.contains('editing')) return;
    selectElement(el);
  });

  // 雙擊編輯
  el.addEventListener('dblclick', (e) => {
    if (data.type === 'text') {
      el.classList.add('editing');
      const content = $('.el-content', el);
      if (content) {
        content.contentEditable = 'true';
        content.focus();
      }
    }
  });

  // 文字方塊右鍵選單：AI 補寫 / AI 改寫（無選取文字時顯示，有選取時留給重點字選單）
  if (data.type === 'text') {
    el.addEventListener('contextmenu', (e) => showTextBlockContextMenu(e, el));
  }

  return el;
}

// 套用框線樣式（僅文字與圖片使用）
function applyElementBorderStyle(el, style) {
  const w = style?.borderWidth;
  const c = (style?.borderColor || '').toString().trim();
  if (typeof w === 'number' && w > 0 && c) {
    el.style.border = `${w}px solid ${c}`;
  } else {
    el.style.border = 'none';
  }
}

// 建構文字方塊內容
function buildTextElement(el, data) {
  if (data.style?.fontSize) el.style.fontSize = data.style.fontSize + 'px';
  // 畫布為淺色，舊的深色主題淺字 #eaeefc 改為深字 #22263a 以利辨識
  let textColor = data.style?.color || '#22263a';
  if (textColor.toLowerCase() === '#eaeefc') textColor = '#22263a';
  el.style.color = textColor;
  if (data.style?.backgroundColor) el.style.backgroundColor = data.style.backgroundColor;
  if (data.preset) el.dataset.preset = data.preset;
   applyElementBorderStyle(el, data.style || {});

  const contentSafe = getElementContentHtml(data);
  let html = '';
  if (data.preset && PRESETS[data.preset]) {
    html += `<div class="el-preset-label">${escHTML(PRESETS[data.preset].label)}</div>`;
  }
  html += `<div class="el-content">${contentSafe}</div>`;
  // 在 resize-handle 前面插入
  const firstHandle = $('.resize-handle', el);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  while (wrapper.firstChild) {
    el.insertBefore(wrapper.firstChild, firstHandle);
  }

  const content = $('.el-content', el);
  if (content) {
    content.addEventListener('blur', () => {
      el.classList.remove('editing');
      content.contentEditable = 'false';
    });
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        content.blur();
        e.preventDefault();
      }
    });
    // 重點字標示：選取文字後右鍵，可套用色塊標示
    content.addEventListener('contextmenu', (e) => showKeywordContextMenu(e, content));
  }
}

// 重點字右鍵選單（黃底紅字 / 藍底白字 / 移除標示）
function showKeywordContextMenu(e, contentEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0).cloneRange();
  if (!contentEl.contains(range.commonAncestorContainer)) return;
  e.preventDefault();

  const old = document.getElementById('keywordContextMenu');
  if (old) old.remove();

  const menu = document.createElement('div');
  menu.id = 'keywordContextMenu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;background:#fff;border:1px solid #ddd;border-radius:8px;padding:4px 0;box-shadow:0 4px 16px rgba(0,0,0,0.15);min-width:140px;`;

  const items = [
    { text: '加上黃底紅字', mode: 'yellow' },
    { text: '加上藍底白字', mode: 'blue' },
    { text: '移除重點標示效果', mode: 'clear' }
  ];
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.text;
    let extraStyle = '';
    if (item.mode === 'yellow') extraStyle = 'background:#fff8a0;color:#c00000;';
    if (item.mode === 'blue') extraStyle = 'background:#102a6b;color:#ffffff;';
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 14px;border:none;background:transparent;cursor:pointer;font-size:13px;' + extraStyle;
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f4ff'; });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = item.mode === 'yellow'
        ? '#fff8a0'
        : item.mode === 'blue'
          ? '#102a6b'
          : 'transparent';
    });
    btn.addEventListener('click', () => {
      if (item.mode === 'yellow' || item.mode === 'blue') {
        applyKeywordMark(contentEl, range, item.mode);
      } else {
        removeKeywordMark(contentEl);
      }
      menu.remove();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const close = () => { menu.remove(); document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function applyKeywordMark(contentEl, savedRange, mode) {
  if (!savedRange || savedRange.collapsed) return;
  if (!contentEl.contains(savedRange.commonAncestorContainer)) return;
  const className = mode === 'blue' ? 'mark-blue-white' : 'mark-yellow-red';
  try {
    const range = savedRange;
    const contents = range.extractContents();
    const span = document.createElement('span');
    span.className = className;
    span.appendChild(contents);
    range.insertNode(span);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  } catch (err) {
    console.warn('重點標示套用失敗', err);
  }
}

function removeKeywordMark(contentEl) {
  try {
    const spans = contentEl.querySelectorAll('.mark-yellow-red, .mark-blue-white');
    spans.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      span.remove();
    });
  } catch (err) {
    console.warn('重點標示移除失敗', err);
  }
}

// 文字方塊右鍵選單：AI 補寫 / AI 改寫（與重點字選單分流：有選取文字時不顯示，讓重點字選單處理）
function showTextBlockContextMenu(e, el) {
  const contentEl = $('.el-content', el);
  const sel = window.getSelection();
  if (contentEl && sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.anchorNode)) return;
  e.preventDefault();
  e.stopPropagation();

  const old = document.getElementById('textBlockContextMenu');
  if (old) old.remove();

  const menu = document.createElement('div');
  menu.id = 'textBlockContextMenu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;background:#fff;border:1px solid var(--border);border-radius:8px;padding:4px 0;box-shadow:var(--shadow-md);min-width:160px;`;

  const items = [
    { text: 'AI 補寫', mode: 'expand' },
    { text: 'AI 改寫', mode: 'rewrite' },
    { text: '依此內容生圖', mode: 'genimage' }
  ];
  const close = () => { menu.remove(); document.removeEventListener('click', close); };
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.text;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:transparent;cursor:pointer;font-size:13px;';
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f4ff'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    btn.addEventListener('click', () => {
      close();
      if (item.mode === 'genimage') {
        startGenImageFromTextElement(el);
      } else {
        startAiRewriteForElement(el, item.mode);
      }
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', close), 0);
}

// 針對單一文字方塊呼叫 AI 補寫或改寫，完成後回寫該方塊
async function startAiRewriteForElement(el, mode) {
  const contentEl = $('.el-content', el);
  const currentText = (contentEl ? contentEl.innerText : '').trim();
  if (!currentText) {
    showToast('此方塊無內容，請先輸入文字。', 'warning');
    return;
  }

  const provider = localStorage.getItem('ai.provider') || 'openai';
  const openaiKey = (localStorage.getItem('ai.openai.key') || '').trim();
  const openrouterKey = (localStorage.getItem('ai.openrouter.key') || '').trim();
  const geminiKey = (localStorage.getItem('ai.gemini.key') || '').trim();
  const openaiModel = localStorage.getItem('ai.openai.model') || 'gpt-3.5-turbo';
  const openrouterModel = localStorage.getItem('ai.openrouter.model') || 'openrouter/free';
  const geminiModel = localStorage.getItem('ai.gemini.model') || 'gemini-2.5-flash';
  const keyForProvider = provider === 'openai' ? openaiKey : (provider === 'openrouter' ? openrouterKey : geminiKey);
  if (!keyForProvider) {
    showToast('請先到設定頁面填寫 AI API Key。', 'warning');
    switchToSettingsAndScrollToAi();
    return;
  }

  const promptExpand = `你是一位專業的公務報告撰寫助手。請補寫以下內容，讓其更完整、條理分明，使用繁體中文，用語正式。不要刪改原有內容，在其基礎上補充延伸。\n\n【現有內容】\n${currentText}`;
  const promptRewrite = `你是一位專業的公務報告撰寫助手。請改寫以下內容，保持簡潔正式，使用繁體中文，條列式為佳。\n\n【現有內容】\n${currentText}`;
  const prompt = mode === 'expand' ? promptExpand : promptRewrite;

  showToast('AI 處理中…', 'info');
  try {
    let result = '';
    if (provider === 'openai' && openaiKey) {
      result = await callOpenAI(openaiKey, openaiModel, prompt, '');
    } else if (provider === 'openrouter' && openrouterKey) {
      result = await callOpenRouter(openrouterKey, openrouterModel, prompt, '');
    } else if (provider === 'gemini' && geminiKey) {
      result = await callGemini(geminiKey, geminiModel, prompt, '');
    } else {
      if (openaiKey) result = await callOpenAI(openaiKey, openaiModel, prompt, '');
      else if (openrouterKey) result = await callOpenRouter(openrouterKey, openrouterModel, prompt, '');
      else if (geminiKey) result = await callGemini(geminiKey, geminiModel, prompt, '');
    }
    const text = (result || '').trim();
    if (!text) { showToast('AI 未回傳內容。', 'warning'); return; }
    updateElementContentFromAi(el, text);
  } catch (err) {
    showToast('AI 處理失敗：' + err.message, 'error');
  }
}

// 將 AI 回傳文字寫回該文字方塊的 DOM，並同步 state 與草稿
function updateElementContentFromAi(el, newText) {
  const contentEl = $('.el-content', el);
  if (!contentEl) return;
  contentEl.innerHTML = plainTextToSafeHtml(newText);
  saveCurrentSlide();
  saveDraftToStorage();
  showToast('已更新', 'success');
}

/** 依選取之文字方塊內容呼叫文生圖 API，並將生成的圖片插入畫布 */
async function startGenImageFromTextElement(el) {
  const contentEl = $('.el-content', el);
  const prompt = (contentEl ? contentEl.innerText : '').trim();
  if (!prompt) {
    showToast('此方塊無內容，請先輸入描述文字再依此內容生圖。', 'warning');
    return;
  }
  showToast('正在生成插圖…', 'info');
  try {
    const dataUrl = await generateImageFromPrompt(prompt);
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      showToast('未取得有效圖片。', 'warning');
      return;
    }
    addElementToCanvas('image', { imageData: dataUrl });
    saveCurrentSlide();
    saveDraftToStorage();
    showToast('已插入插圖', 'success');
  } catch (err) {
    showToast('文生圖失敗：' + err.message, 'error');
  }
}

// 建構圖片元件
function buildImageElement(el, data) {
  const firstHandle = $('.resize-handle', el);
  if (data.imageData) {
    const img = document.createElement('img');
    img.src = data.imageData;
    img.alt = '圖片';
    el.insertBefore(img, firstHandle);
  } else {
    const ph = document.createElement('div');
    ph.className = 'image-placeholder';
    ph.textContent = '點擊兩下選擇圖片';
    el.insertBefore(ph, firstHandle);
  }

  applyElementBorderStyle(el, data.style || {});

  // 雙擊選圖
  el.addEventListener('dblclick', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      const dataUrl = await readAndCompressImage(f);
      // 更新 DOM
      const existing = $('img', el) || $('.image-placeholder', el);
      if (existing) existing.remove();
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '圖片';
      const fh = $('.resize-handle', el);
      el.insertBefore(img, fh);
    });
    input.click();
  });

  // 拖放圖片
  el.addEventListener('dragover', (e) => { e.preventDefault(); });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) {
      const dataUrl = await readAndCompressImage(f);
      const existing = $('img', el) || $('.image-placeholder', el);
      if (existing) existing.remove();
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '圖片';
      const fh = $('.resize-handle', el);
      el.insertBefore(img, fh);
    }
  });
}

// 建構表格元件
function buildTableElement(el, data) {
  const td = normalizeTableData(data.tableData || { headers: ['A', 'B', 'C'], rows: [['', '', '']], theme: 'blue' });
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  trh.style.height = (td.rowHeights[0] || 42) + 'px';
  td.headers.forEach((h, colIndex) => {
    const th = document.createElement('th');
    th.contentEditable = 'true';
    th.textContent = h;
    th.style.width = (td.colWidths[colIndex] || 200) + 'px';
    bindTableCellEvents(th, el);
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  const tbody = document.createElement('tbody');
  td.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.style.height = (td.rowHeights[rowIndex + 1] || 42) + 'px';
    row.forEach((cell, colIndex) => {
      const tdEl = document.createElement('td');
      tdEl.contentEditable = 'true';
      tdEl.textContent = cell;
      tdEl.style.width = (td.colWidths[colIndex] || 200) + 'px';
      bindTableCellEvents(tdEl, el);
      tr.appendChild(tdEl);
    });
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  applyTableLayout(table, td);
  const firstHandle = $('.resize-handle', el);
  el.insertBefore(table, firstHandle);

  // 在表格元件上的右鍵選單
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showTableContextMenu(e, el, table, e.target.closest('th, td'));
  });
}

function normalizeTableData(tableData) {
  const data = tableData || {};
  const headers = Array.isArray(data.headers) && data.headers.length ? data.headers : ['A', 'B', 'C'];
  const rows = Array.isArray(data.rows) && data.rows.length ? data.rows : [['', '', '']];
  const colCount = headers.length;
  const rowCount = rows.length + 1;
  const colWidths = Array.isArray(data.colWidths) ? data.colWidths.slice(0, colCount) : [];
  const rowHeights = Array.isArray(data.rowHeights) ? data.rowHeights.slice(0, rowCount) : [];

  while (colWidths.length < colCount) colWidths.push(200);
  while (rowHeights.length < rowCount) rowHeights.push(42);

  return {
    headers,
    rows,
    colWidths,
    rowHeights,
    theme: data.theme || 'blue'
  };
}

function bindTableCellEvents(cell, el) {
  cell.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    selectElement(el);
  });
  cell.addEventListener('click', (e) => {
    e.stopPropagation();
    cell.focus();
  });
}

function applyTableLayout(table, tableData) {
  const data = normalizeTableData(tableData);
  const headerCells = $$('thead th', table);
  const bodyRows = $$('tbody tr', table);

  table.style.tableLayout = 'fixed';
  table.style.minWidth = data.colWidths.reduce((sum, w) => sum + w, 0) + 'px';

  headerCells.forEach((th, colIndex) => {
    th.style.width = (data.colWidths[colIndex] || 200) + 'px';
  });
  bodyRows.forEach((tr, rowIndex) => {
    tr.style.height = (data.rowHeights[rowIndex + 1] || 42) + 'px';
    $$('td', tr).forEach((td, colIndex) => {
      td.style.width = (data.colWidths[colIndex] || 200) + 'px';
    });
  });

  const headerRow = $('thead tr', table);
  if (headerRow) headerRow.style.height = (data.rowHeights[0] || 42) + 'px';
}

function createReadonlyTableDOM(tableData) {
  const data = normalizeTableData(tableData);
  const tbl = document.createElement('table');
  tbl.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;background:#fff;color:#222;border-radius:6px;overflow:hidden;';

  const thd = document.createElement('thead');
  const trh = document.createElement('tr');
  trh.style.height = (data.rowHeights[0] || 42) + 'px';
  data.headers.forEach((h, colIndex) => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.cssText = `background:#0078d7;color:#fff;padding:6px 10px;border:1px solid #d0d7de;width:${data.colWidths[colIndex] || 200}px;`;
    trh.appendChild(th);
  });
  thd.appendChild(trh);

  const tbd = document.createElement('tbody');
  data.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.style.height = (data.rowHeights[rowIndex + 1] || 42) + 'px';
    row.forEach((cell, colIndex) => {
      const td = document.createElement('td');
      td.textContent = cell;
      td.style.cssText = `padding:4px 8px;border:1px solid #d0d7de;width:${data.colWidths[colIndex] || 200}px;`;
      tr.appendChild(td);
    });
    tbd.appendChild(tr);
  });

  tbl.append(thd, tbd);
  return tbl;
}

// 從 DOM 擷取表格資料
function extractTableData(el) {
  const table = $('table', el);
  if (!table) return { headers: [], rows: [], theme: 'blue' };
  const headers = $$('thead th', table).map(th => th.textContent || '');
  const colWidths = $$('thead th', table).map(th => parseInt(th.style.width, 10) || Math.round(th.getBoundingClientRect().width));
  const rowHeights = [
    ...$$('thead tr, tbody tr', table).map(tr => parseInt(tr.style.height, 10) || Math.round(tr.getBoundingClientRect().height))
  ];
  const rows = $$('tbody tr', table).map(tr =>
    $$('td', tr).map(td => td.textContent || '')
  );
  return { headers, colWidths, rowHeights, rows, theme: 'blue' };
}

// 表格右鍵選單
function showTableContextMenu(e, el, table, targetCell) {
  // 移除舊選單
  const old = $('#tableContextMenu');
  if (old) old.remove();

  const ths = $$('thead th', table);
  const targetRow = targetCell ? targetCell.closest('tr') : null;
  const colIndex = targetCell ? Math.max(0, targetCell.cellIndex) : 0;
  let rowIndex = 0;
  if (targetCell && targetRow && targetCell.tagName === 'TD') {
    rowIndex = $$('tbody tr', table).indexOf(targetRow) + 1;
  }

  const menu = document.createElement('div');
  menu.id = 'tableContextMenu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;
    background:#fff;border:1px solid #ddd;border-radius:8px;padding:4px 0;box-shadow:0 4px 16px rgba(0,0,0,0.15);`;

  const items = [
    { text: '在上方插入一列', action: () => addTableRow(table, 'above', rowIndex) },
    { text: `目前欄寬 +10`, action: () => resizeTableCol(table, Math.min(colIndex, ths.length - 1), 10) },
    { text: `目前欄寬 -10`, action: () => resizeTableCol(table, Math.min(colIndex, ths.length - 1), -10) },
    { text: `目前列高 +10`, action: () => resizeTableRow(table, rowIndex, 10) },
    { text: `目前列高 -10`, action: () => resizeTableRow(table, rowIndex, -10) },
    { text: '在下方新增一列', action: () => addTableRow(table, 'below', rowIndex) },
    { text: '在左側插入一欄', action: () => addTableCol(table, 'left', colIndex) },
    { text: '在右側新增一欄', action: () => addTableCol(table, 'right', colIndex) },
    { text: '刪除目前列', action: () => delTableRow(table, rowIndex) },
    { text: '刪除目前欄', action: () => delTableCol(table, colIndex) },
  ];

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.textContent = item.text;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;';
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f4ff'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
    btn.addEventListener('click', () => { item.action(); menu.remove(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function addTableRow(table, where = 'below', baseRowIndex = 0) {
  const cols = $$('thead th', table).length || 1;
  const tr = document.createElement('tr');
  tr.style.height = '42px';
  const tableEl = table.closest('.canvas-element');
  for (let i = 0; i < cols; i++) {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    td.style.width = ((parseInt($$('thead th', table)[i]?.style.width, 10) || 200)) + 'px';
    if (tableEl) bindTableCellEvents(td, tableEl);
    tr.appendChild(td);
  }
  const tbody = $('tbody', table);
  const rows = $$('tbody tr', table);
  const bodyCount = rows.length;
  const idx = Math.max(0, Math.min(baseRowIndex - 1, bodyCount)); // baseRowIndex: 1 起算為第一列資料
  if (where === 'above' && idx >= 0 && idx < bodyCount) {
    tbody.insertBefore(tr, rows[idx]);
  } else if (where === 'below' && idx >= 0 && idx < bodyCount) {
    const ref = rows[idx].nextSibling;
    if (ref) tbody.insertBefore(tr, ref);
    else tbody.appendChild(tr);
  } else {
    tbody.appendChild(tr);
  }
}

function addTableCol(table, where = 'right', baseColIndex = 0) {
  const tableEl = table.closest('.canvas-element');
  const th = document.createElement('th');
  th.contentEditable = 'true';
  th.textContent = '新欄';
  th.style.width = '200px';
  if (tableEl) bindTableCellEvents(th, tableEl);
  const headerRow = $('thead tr', table);
  const ths = $$('thead th', table);
  const colCount = ths.length;
  let insertIndex = Math.max(0, Math.min(baseColIndex, colCount)); // 0..colCount

  const insertCellAt = (row, cell) => {
    const cells = $$('th,td', row);
    if (insertIndex >= cells.length) row.appendChild(cell);
    else row.insertBefore(cell, cells[insertIndex]);
  };

  insertCellAt(headerRow, th);

  $$('tbody tr', table).forEach(tr => {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    td.style.width = '200px';
    if (tableEl) bindTableCellEvents(td, tableEl);
    insertCellAt(tr, td);
  });
  const tableData = extractTableData(table.closest('.canvas-element'));
  applyTableLayout(table, tableData);
}

function delTableRow(table, rowIndex) {
  const tbody = $('tbody', table);
  const rows = $$('tbody tr', table);
  if (rows.length <= 1) return;
  // rowIndex: 0 為標題列，1 起算為資料列
  if (typeof rowIndex === 'number' && rowIndex > 0) {
    const idx = rowIndex - 1;
    if (idx >= 0 && idx < rows.length) {
      tbody.deleteRow(idx);
      return;
    }
  }
  // 未指定或超出範圍時，刪除最後一列
  tbody.deleteRow(tbody.rows.length - 1);
}

function delTableCol(table, colIndex) {
  const ths = $$('thead th', table);
  if (ths.length <= 1) return;
  let idx = typeof colIndex === 'number' ? colIndex : ths.length - 1;
  idx = Math.max(0, Math.min(idx, ths.length - 1));
  $('thead tr', table).removeChild(ths[idx]);
  $$('tbody tr', table).forEach(tr => {
    const tds = $$('td', tr);
    if (tds.length <= 1) return;
    if (idx >= 0 && idx < tds.length) tr.removeChild(tds[idx]);
  });
}

function resizeTableCol(table, colIndex, delta) {
  const ths = $$('thead th', table);
  if (!ths.length || colIndex < 0 || colIndex >= ths.length) return;
  const currentWidth = parseInt(ths[colIndex].style.width, 10) || Math.round(ths[colIndex].getBoundingClientRect().width) || 200;
  const newWidth = Math.max(80, currentWidth + delta);

  ths[colIndex].style.width = newWidth + 'px';
  $$('tbody tr', table).forEach(tr => {
    const cell = $$('td', tr)[colIndex];
    if (cell) cell.style.width = newWidth + 'px';
  });

  const tableData = extractTableData(table.closest('.canvas-element'));
  applyTableLayout(table, tableData);
}

function resizeTableRow(table, rowIndex, delta) {
  const rows = [$('thead tr', table), ...$$('tbody tr', table)];
  const row = rows[rowIndex];
  if (!row) return;
  const currentHeight = parseInt(row.style.height, 10) || Math.round(row.getBoundingClientRect().height) || 42;
  const newHeight = Math.max(28, currentHeight + delta);
  row.style.height = newHeight + 'px';
}

/* =============================================
   3c. 畫布編輯器 — 拖曳 & 縮放
   ============================================= */

function selectElement(el) {
  deselectElement();
  state.selectedElement = el;
  el.classList.add('selected');
  syncToolbarTextStyle();
}

function deselectElement() {
  if (state.selectedElement) {
    state.selectedElement.classList.remove('selected');
    const content = $('.el-content', state.selectedElement);
    if (content) { content.contentEditable = 'false'; state.selectedElement.classList.remove('editing'); }
  }
  state.selectedElement = null;
  syncToolbarTextStyle();
}

// 工具列「文字顏色／背景色」與選取之文字元件同步
function syncToolbarTextStyle() {
  const el = state.selectedElement;
  const textGroup = $('#toolbarTextStyle');
  const colorInput = $('#toolbarTextColor');
  const bgInput = $('#toolbarBgColor');
  if (!textGroup || !colorInput || !bgInput) return;
  if (el && el.classList.contains('el-text')) {
    textGroup.style.display = 'flex';
    const c = (el.style.color || '#22263a').trim();
    const b = (el.style.backgroundColor || '#ffffff').trim();
    colorInput.value = rgbToHex(c) || c || '#22263a';
    bgInput.value = rgbToHex(b) || b || '#ffffff';
  } else {
    textGroup.style.display = 'none';
  }
}
function rgbToHex(css) {
  if (!css || css[0] === '#') return css;
  const m = css.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return css;
  const hex = (n) => ('0' + Math.max(0, Math.min(255, parseInt(n, 10))).toString(16)).slice(-2);
  return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
}

function initCanvasDragDrop() {
  const canvas = $('#canvas');

  // 點擊畫布空白處取消選取
  canvas.addEventListener('mousedown', (e) => {
    if (e.target === canvas || e.target.classList.contains('canvas-empty-hint')) {
      deselectElement();
    }
  });

  // 滑鼠按下：開始拖曳或縮放
  canvas.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.resize-handle');
    const el = e.target.closest('.canvas-element');
    const editingTableCell = e.target.closest('.canvas-element.el-table td, .canvas-element.el-table th');

    if (handle && el) {
      // 縮放
      e.preventDefault();
      selectElement(el);
      state.isResizing = true;
      state.resizeDir = handle.dataset.dir;
      const rect = el.getBoundingClientRect();
      state.resizeStart = {
        x: e.clientX,
        y: e.clientY,
        w: parseFloat(el.style.width),
        h: parseFloat(el.style.height),
        ex: parseFloat(el.style.left),
        ey: parseFloat(el.style.top)
      };
      return;
    }

    if (editingTableCell && el) {
      // 表格儲存格要能直接輸入，不可在此啟動拖曳
      selectElement(el);
      return;
    }

    if (el && !el.classList.contains('editing')) {
      // 拖曳
      e.preventDefault();
      selectElement(el);
      state.isDragging = true;
      const canvasRect = canvas.getBoundingClientRect();
      const elLeft = parseFloat(el.style.left) || 0;
      const elTop = parseFloat(el.style.top) || 0;
      state.dragOffset = {
        x: (e.clientX - canvasRect.left) / state.canvasScale - elLeft,
        y: (e.clientY - canvasRect.top) / state.canvasScale - elTop
      };
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (state.isDragging && state.selectedElement) {
      const canvasRect = canvas.getBoundingClientRect();
      let newX = (e.clientX - canvasRect.left) / state.canvasScale - state.dragOffset.x;
      let newY = (e.clientY - canvasRect.top) / state.canvasScale - state.dragOffset.y;
      // 限制在畫布內
      newX = Math.max(-20, Math.min(newX, 1280 - 20));
      newY = Math.max(-20, Math.min(newY, 720 - 20));
      state.selectedElement.style.left = Math.round(newX) + 'px';
      state.selectedElement.style.top = Math.round(newY) + 'px';
    }

    if (state.isResizing && state.selectedElement) {
      const dx = (e.clientX - state.resizeStart.x) / state.canvasScale;
      const dy = (e.clientY - state.resizeStart.y) / state.canvasScale;
      const dir = state.resizeDir;
      const s = state.resizeStart;
      let newW = s.w, newH = s.h, newX = s.ex, newY = s.ey;

      if (dir.includes('e')) newW = Math.max(40, s.w + dx);
      if (dir.includes('w')) { newW = Math.max(40, s.w - dx); newX = s.ex + (s.w - newW); }
      if (dir.includes('s')) newH = Math.max(24, s.h + dy);
      if (dir.includes('n')) { newH = Math.max(24, s.h - dy); newY = s.ey + (s.h - newH); }

      state.selectedElement.style.width = Math.round(newW) + 'px';
      state.selectedElement.style.height = Math.round(newH) + 'px';
      state.selectedElement.style.left = Math.round(newX) + 'px';
      state.selectedElement.style.top = Math.round(newY) + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    state.isDragging = false;
    state.isResizing = false;
  });

  // 貼上圖片 / 表格（從外部複製後直接貼到畫布）
  document.addEventListener('paste', (e) => {
    if (!$('#tab-editor').classList.contains('active')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.contentEditable === 'true')) return;
    const cd = e.clipboardData;
    if (!cd) return;

    // 1) 圖片貼上（優先處理）
    const items = cd.items || [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          (async () => {
            try {
              const dataUrl = await readAndCompressImage(file, 1600, 0.9);
              addElementToCanvas('image', { imageData: dataUrl });
              saveCurrentSlide();
              saveDraftToStorage();
              showToast('已貼上圖片。', 'success');
            } catch (err) {
              showToast('貼上圖片失敗：' + err.message, 'error');
            }
          })();
          return;
        }
      }
    }

    // 2) HTML 表格貼上
    const html = cd.getData('text/html');
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table');
      if (!table) return;
      e.preventDefault();
      try {
        const headers = [];
        const rows = [];

        const theadRow = table.tHead && table.tHead.rows.length ? table.tHead.rows[0] : null;
        const bodyRows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];

        if (theadRow) {
          Array.from(theadRow.cells).forEach(cell => {
            headers.push((cell.textContent || '').trim());
          });
        } else if (bodyRows.length) {
          Array.from(bodyRows[0].cells).forEach(cell => {
            headers.push((cell.textContent || '').trim());
          });
          bodyRows.shift();
        }

        if (!headers.length && bodyRows.length) {
          const maxCols = Math.max(...bodyRows.map(r => r.cells.length));
          for (let i = 0; i < maxCols; i++) headers.push('欄位' + (i + 1));
        }

        bodyRows.forEach(tr => {
          const row = [];
          const cells = Array.from(tr.cells);
          for (let i = 0; i < headers.length; i++) {
            row.push((cells[i]?.textContent || '').trim());
          }
          rows.push(row);
        });

        if (!headers.length) return;

        const colCount = headers.length;
        const colWidths = Array.from({ length: colCount }, () => 200);
        const rowHeights = [42, ...Array.from({ length: rows.length }, () => 42)];

        const tableData = { headers, rows, colWidths, rowHeights, theme: 'blue' };
        addElementToCanvas('table', { tableData });
        saveCurrentSlide();
        saveDraftToStorage();
        showToast('已貼上表格。', 'success');
      } catch (err) {
        showToast('貼上表格失敗：' + err.message, 'error');
      }
    }
  });

  // Delete / 複製 / 貼上 選取元件（僅在畫布編輯頁，且未在輸入框或編輯文字時啟用）
  document.addEventListener('keydown', (e) => {
    // 只在畫布編輯分頁作用
    if (!$('#tab-editor').classList.contains('active')) return;

    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.contentEditable === 'true')) return;

    // Delete 刪除
    if (e.key === 'Delete' && state.selectedElement && !state.selectedElement.classList.contains('editing')) {
      state.selectedElement.remove();
      state.selectedElement = null;
      syncToolbarTextStyle();
      const hint = $('.canvas-empty-hint', canvas);
      if (hint && $$('.canvas-element', canvas).length === 0) hint.style.display = '';
      saveCurrentSlide();
      markThumbnailDirty();
      saveDraftToStorage();
      return;
    }

    const isMac = navigator.platform && /Mac/i.test(navigator.platform);
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    if (!ctrlOrCmd) return;

    // Ctrl/Cmd + C 複製元件資料到暫存
    if (e.key.toLowerCase() === 'c') {
      if (!state.selectedElement || state.selectedElement.classList.contains('editing')) return;
      e.preventDefault();
      saveCurrentSlide();
      const slide = currentSlideData();
      if (!slide || !Array.isArray(slide.elements)) return;
      const elId = state.selectedElement.dataset.elId;
      const src = slide.elements.find(el => el.id === elId);
      if (!src) return;
      try {
        state.clipboardElement = JSON.parse(JSON.stringify(src));
        showToast('已複製元件，可在此頁或其他投影片貼上。', 'success');
      } catch (_) {
        showToast('複製元件失敗。', 'error');
      }
      return;
    }

    // Ctrl/Cmd + V 貼上暫存元件到目前投影片（略為位移避免完全重疊）
    if (e.key.toLowerCase() === 'v') {
      if (!state.clipboardElement) return;
      e.preventDefault();
      const slide = currentSlideData();
      if (!slide) return;
      const base = state.clipboardElement;
      const offset = 20;
      const x = (base.x || 48) + offset;
      const y = (base.y || 140) + offset;
      const data = createElementData(base.type, {
        ...base,
        id: uid(),
        x,
        y
      });
      // 寫回 slide 資料
      if (!Array.isArray(slide.elements)) slide.elements = [];
      slide.elements.push(data);
      // 建立 DOM 並加入畫布
      const dom = createCanvasElementDOM(data);
      canvas.appendChild(dom);
      const hint = $('.canvas-empty-hint', canvas);
      if (hint) hint.style.display = 'none';
      selectElement(dom);
      saveCurrentSlide();
      markThumbnailDirty();
      saveDraftToStorage();
    }
  });
}

// 畫布自適應縮放
function fitCanvas() {
  const wrapper = $('#canvasWrapper');
  const canvas = $('#canvas');
  if (!wrapper || !canvas) return;
  const ww = wrapper.clientWidth - 32;
  const wh = wrapper.clientHeight - 32;
  const scale = Math.min(ww / 1280, wh / 720, 1);
  state.canvasScale = scale;
  canvas.style.transform = `scale(${scale})`;
}

/* =============================================
   3d. 畫布編輯器 — 工具列事件
   ============================================= */

function initEditorToolbar() {
  // 新增投影片
  $('#btnAddSlide').addEventListener('click', () => {
    saveCurrentSlide();
    state.slides.push(createSlideData());
    state.currentSlide = state.slides.length - 1;
    renderSlideList();
    loadSlideToCanvas(state.currentSlide);
    saveDraftToStorage();
    void scheduleNeighborThumbnails(state.currentSlide);
  });

  // 複製投影片
  $('#btnDupSlide').addEventListener('click', () => {
    saveCurrentSlide();
    const src = currentSlideData();
    if (!src) return;
    const dup = JSON.parse(JSON.stringify(src));
    dup.id = uid();
    dup.elements.forEach(el => { el.id = uid(); });
    state.slides.splice(state.currentSlide + 1, 0, dup);
    state.currentSlide++;
    renderSlideList();
    loadSlideToCanvas(state.currentSlide);
    saveDraftToStorage();
    void scheduleNeighborThumbnails(state.currentSlide);
  });

  // 刪除投影片
  $('#btnDelSlide').addEventListener('click', async () => {
    if (state.slides.length <= 1) {
      showToast('至少需要保留一張投影片。', 'warning');
      return;
    }
    const ok = await showConfirm({ title: '刪除投影片', message: '確定刪除目前投影片？' });
    if (!ok) return;
    state.slides.splice(state.currentSlide, 1);
    if (state.currentSlide >= state.slides.length) state.currentSlide = state.slides.length - 1;
    renderSlideList();
    loadSlideToCanvas(state.currentSlide);
    saveDraftToStorage();
    void scheduleNeighborThumbnails(state.currentSlide);
  });

  // 插入文字方塊
  $('#btnAddText').addEventListener('click', () => {
    addElementToCanvas('text');
  });

  // 插入圖片
  $('#btnAddImage').addEventListener('click', () => {
    addElementToCanvas('image');
  });

  // 插入表格
  $('#btnAddTable').addEventListener('click', () => {
    addElementToCanvas('table');
  });

  // 文字樣式：顏色、背景色（僅作用於選取中的文字方塊）
  const toolbarTextColor = $('#toolbarTextColor');
  const toolbarBgColor = $('#toolbarBgColor');
  if (toolbarTextColor) {
    toolbarTextColor.addEventListener('input', () => {
      if (state.selectedElement && state.selectedElement.classList.contains('el-text')) {
        state.selectedElement.style.color = toolbarTextColor.value;
        markThumbnailDirty();
      }
    });
  }
  if (toolbarBgColor) {
    toolbarBgColor.addEventListener('input', () => {
      if (state.selectedElement && state.selectedElement.classList.contains('el-text')) {
        state.selectedElement.style.backgroundColor = toolbarBgColor.value;
        markThumbnailDirty();
      }
    });
  }
  syncToolbarTextStyle();

  // 快速模板按鈕
  $$('.tb-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const p = PRESETS[preset];
      if (!p) return;
      addElementToCanvas('text', {
        preset,
        x: p.x,
        y: p.y,
        width: p.defaultW,
        height: p.defaultH,
        // 預設內容：預留 3 行空白，讓使用者直接輸入
        content: '\n\n\n',
        style: { fontSize: 24, color: '#22263a' }
      });
    });
  });

  // 主辦人下拉
  $('#slideHostSelect').addEventListener('change', (e) => {
    if (e.target.value) {
      $('#slideHostText').value = e.target.value;
      updateEditorHeaderOverlay($('#slideTitle').value, $('#slideHostText').value);
    }
    markThumbnailDirty();
  });

  // 批次套用標題 / 主辦人
  function applyMetaToSlides(fromIndex, toEnd) {
    const title = ($('#slideTitle').value || '').trim();
    const host = ($('#slideHostText').value || '').trim();
    if (!title && !host) {
      showToast('請先輸入標題或主辦人，再進行批次套用。', 'warning');
      return;
    }
    const start = Math.max(0, fromIndex);
    const end = toEnd ? state.slides.length - 1 : start;
    for (let i = start; i <= end; i++) {
      const s = state.slides[i];
      if (!s) continue;
      if (title) s.title = title;
      if (host) s.host = host;
    }
    for (let j = start; j <= end; j++) {
      if (state.slides[j]) state.slides[j].thumbnailDataUrl = '';
    }
    renderSlideList();
    loadSlideToCanvas(state.currentSlide);
    saveDraftToStorage();
    showToast(toEnd ? '已套用到此頁及之後所有投影片。' : '已套用到全部投影片。', 'success');
    void scheduleNeighborThumbnails(state.currentSlide);
  }

  $('#applyMetaAll').addEventListener('click', () => {
    if (!state.slides.length) return;
    applyMetaToSlides(0, true);
  });

  $('#applyMetaFromCurrent').addEventListener('click', () => {
    if (!state.slides.length) return;
    applyMetaToSlides(state.currentSlide, true);
  });

  // 框線工具列：同步目前選取之文字／圖片元件
  const borderWidthSel = $('#toolbarBorderWidth');
  const borderColorInput = $('#toolbarBorderColor');

  const syncToolbarBorderStyle = () => {
    const el = state.selectedElement;
    if (!borderWidthSel || !borderColorInput) return;
    if (!el || (!el.classList.contains('el-text') && !el.classList.contains('el-image'))) {
      borderWidthSel.value = '0';
      return;
    }
    const bw = parseInt(el.style.borderWidth, 10) || 0;
    borderWidthSel.value = String(Math.min(Math.max(bw, 0), 3));
    borderColorInput.value = (el.style.borderColor && el.style.borderColor.startsWith('#'))
      ? el.style.borderColor
      : '#cccccc';
  };

  // 在 selectedElement 變更時也要更新（selectElement / deselectElement 內已有 syncToolbarTextStyle，可在那裡呼叫）
  const _oldSyncToolbarTextStyle = syncToolbarTextStyle;
  syncToolbarTextStyle = function patchedSyncToolbarTextStyle() {
    _oldSyncToolbarTextStyle();
    syncToolbarBorderStyle();
  };

  if (borderWidthSel) {
    borderWidthSel.addEventListener('change', () => {
      const el = state.selectedElement;
      if (!el || (!el.classList.contains('el-text') && !el.classList.contains('el-image'))) return;
      const w = parseInt(borderWidthSel.value, 10) || 0;
      const color = borderColorInput.value || '#cccccc';
      if (w > 0) {
        el.style.borderWidth = w + 'px';
        el.style.borderStyle = 'solid';
        el.style.borderColor = color;
      } else {
        el.style.border = 'none';
      }
      saveCurrentSlide();
      markThumbnailDirty();
      saveDraftToStorage();
    });
  }

  if (borderColorInput) {
    borderColorInput.addEventListener('input', () => {
      const el = state.selectedElement;
      if (!el || (!el.classList.contains('el-text') && !el.classList.contains('el-image'))) return;
      const w = parseInt(borderWidthSel.value, 10) || 0;
      const color = borderColorInput.value || '#cccccc';
      if (w > 0) {
        el.style.borderWidth = w + 'px';
        el.style.borderStyle = 'solid';
        el.style.borderColor = color;
      }
      saveCurrentSlide();
      markThumbnailDirty();
      saveDraftToStorage();
    });
  }

  // 即時同步畫布標題列
  $('#slideTitle').addEventListener('input', () => {
    updateEditorHeaderOverlay($('#slideTitle').value, $('#slideHostText').value);
  });
  $('#slideHostText').addEventListener('input', () => {
    updateEditorHeaderOverlay($('#slideTitle').value, $('#slideHostText').value);
  });

  // 畫布視窗調整
  window.addEventListener('resize', fitCanvas);
}

// 新增元件到畫布
function addElementToCanvas(type, overrides = {}) {
  const canvas = $('#canvas');
  const data = createElementData(type, overrides);
  const dom = createCanvasElementDOM(data);
  canvas.appendChild(dom);

  // 隱藏空白提示
  const hint = $('.canvas-empty-hint', canvas);
  if (hint) hint.style.display = 'none';

  selectElement(dom);
  markThumbnailDirty();
}

/* =============================================
   4. 圖片處理
   ============================================= */

async function readAndCompressImage(file, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width > maxWidth ? (maxWidth / img.width) : 1;
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* =============================================
   5. 簡報預覽
   ============================================= */

/** 從畫布編輯器載入目前內容到預覽（切換到預覽分頁時會自動呼叫，也可手動按「從編輯器載入」重新整理） */
function loadPreviewFromEditor() {
  saveCurrentSlide();
  state.previewSlides = JSON.parse(JSON.stringify(state.slides));
  const maxIndex = Math.max(0, state.previewSlides.length - 1);
  const target = Math.max(0, Math.min(state.currentSlide, maxIndex));
  state.previewCursor = target;
  showPreviewSlide(target);
}

function initPreview() {
  const frame = $('#previewFrame');

  // 左右導覽按鈕：最前頁、上一頁、下一頁、最後頁
  $('#previewBtnFirst').addEventListener('click', () => showPreviewSlide(0));
  $('#previewBtnPrev').addEventListener('click', () => showPreviewSlide(state.previewCursor - 1));
  $('#previewBtnNext').addEventListener('click', () => showPreviewSlide(state.previewCursor + 1));
  $('#previewBtnLast').addEventListener('click', () => showPreviewSlide(state.previewSlides.length - 1));

  // 從檔案載入
  $('#previewLoadJson').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.slides)) throw new Error('JSON 格式錯誤');
      state.previewSlides = obj.slides.map(normalizeSlideForPreview);
      state.previewCursor = 0;
      showPreviewSlide(0);
    } catch (err) { showToast('載入失敗：' + err.message, 'error'); }
  });

  // 切換主題
  $('#btnPreviewTheme').addEventListener('click', () => {
    state.previewTheme = state.previewTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-preview-theme', state.previewTheme);
    showPreviewSlide(state.previewCursor);
  });

  // 全螢幕
  $('#btnPreviewFs').addEventListener('click', () => {
    document.documentElement.classList.add('fs-active');
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    fitPreview();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      document.documentElement.classList.remove('fs-active');
      fitPreview();
    }
  });

  // 鍵盤導覽
  document.addEventListener('keydown', (e) => {
    // 只在預覽面板時啟用
    if (!$('#tab-preview').classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;

    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      showPreviewSlide(state.previewCursor + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      showPreviewSlide(state.previewCursor - 1);
    } else if (e.key === 'Home') {
      showPreviewSlide(0);
    } else if (e.key === 'End') {
      showPreviewSlide(state.previewSlides.length - 1);
    } else if (e.key.toLowerCase() === 'f') {
      $('#btnPreviewFs').click();
    } else if (e.key.toLowerCase() === 't') {
      $('#btnPreviewTheme').click();
    }
  });

  // 匯出 PDF
  $('#btnPreviewPdf').addEventListener('click', exportPreviewPdf);
  // 匯出 PPTX（所見即所得，文字轉圖片）
  $('#btnPreviewPptx').addEventListener('click', exportPreviewPptx);
  // 匯出可編輯 PPTX（文字可編輯）
  $('#btnPreviewPptxEditable').addEventListener('click', exportPreviewPptxEditable);
}

// 將舊格式 slide 轉為新格式（含 elements）
function normalizeSlideForPreview(s) {
  // 如果已經有 elements 陣列，直接使用
  if (Array.isArray(s.elements) && s.elements.length > 0) {
    return { ...s };
  }

  // 舊格式轉換
  const elements = [];
  let yPos = 10;

  if (s.line1) {
    elements.push({ id: uid(), type: 'text', x: 48, y: yPos, width: 580, height: 80,
      content: '案由：\n' + cleanText(s.line1), preset: 'reason', style: { fontSize: 24, color: '#eaeefc' } });
    yPos += 90;
  }
  if (s.line2) {
    elements.push({ id: uid(), type: 'text', x: 48, y: yPos, width: 580, height: 60,
      content: '培訓對象：\n' + cleanText(s.line2), preset: 'target', style: { fontSize: 24, color: '#eaeefc' } });
    yPos += 70;
  }

  // 辦理情形（支援清單 l3Items 或純文字 line3）
  const l3 = formatListContent('辦理情形', s.l3Items, s.line3);
  if (l3) {
    elements.push({ id: uid(), type: 'text', x: 48, y: yPos, width: 580, height: 180,
      content: l3, preset: 'situation', style: { fontSize: 24, color: '#eaeefc' } });
    yPos += 190;
  }

  const l4 = formatListContent('績效與貢獻', s.l4Items, s.line4);
  if (l4) {
    elements.push({ id: uid(), type: 'text', x: 48, y: yPos, width: 580, height: 140,
      content: l4, preset: 'performance', style: { fontSize: 24, color: '#eaeefc' } });
    yPos += 150;
  }

  const l5 = formatListContent('後續推廣作為', s.l5Items, s.line5);
  if (l5) {
    elements.push({ id: uid(), type: 'text', x: 660, y: 10, width: 560, height: 180,
      content: l5, preset: 'followup', style: { fontSize: 24, color: '#eaeefc' } });
  }

  // 圖片
  if (s.imageData) {
    elements.push({ id: uid(), type: 'image', x: 660, y: 200, width: 560, height: 380,
      imageData: s.imageData });
  }

  return {
    id: s.id || uid(),
    title: cleanText(s.title || ''),
    host: cleanText(s.host || ''),
    elements
  };
}

// 格式化清單內容
function formatListContent(label, items, lineText) {
  if (Array.isArray(items) && items.length > 0) {
    return label + '：\n' + items.map((item, i) => `${i + 1}. ${cleanText(item)}`).join('\n');
  }
  if (lineText && typeof lineText === 'string' && lineText.trim()) {
    return cleanText(lineText);
  }
  return '';
}

// 顯示預覽投影片
function showPreviewSlide(idx) {
  if (state.previewSlides.length === 0) return;
  idx = Math.max(0, Math.min(idx, state.previewSlides.length - 1));
  state.previewCursor = idx;

  const frame = $('#previewFrame');
  frame.innerHTML = '';

  const slide = state.previewSlides[idx];
  const node = document.createElement('div');
  node.className = 'preview-slide';

  // 標題與主辦人
  const header = document.createElement('div');
  header.className = 'pv-header';
  const title = document.createElement('h2');
  title.className = 'pv-title';
  title.textContent = slide.title || '未命名';
  const host = document.createElement('div');
  host.className = 'pv-host';
  host.textContent = slide.host ? `主辦人：${slide.host}` : '';
  header.append(title, host);

  // 內容區域
  const body = document.createElement('div');
  body.className = 'pv-body';

  if (Array.isArray(slide.elements)) {
    slide.elements.forEach(elData => {
      const elDom = document.createElement('div');
      elDom.className = `pv-element pv-${elData.type}`;
      elDom.style.left = elData.x + 'px';
      elDom.style.top = elData.y + 'px';
      elDom.style.width = elData.width + 'px';
      elDom.style.height = elData.height + 'px';

      if (elData.type === 'text') {
        if (elData.style?.fontSize) elDom.style.fontSize = elData.style.fontSize + 'px';
        const textColor = getPreviewTextColor(elData.style?.color);
        elDom.style.setProperty('color', textColor, 'important');
        if (elData.style?.backgroundColor) elDom.style.backgroundColor = elData.style.backgroundColor;
        // 與畫布編輯器文字方塊一致：同樣的內距與盒模型，避免換行數不一致
        elDom.style.padding = '8px 12px';
        elDom.style.boxSizing = 'border-box';
        elDom.style.overflow = 'hidden';
        elDom.style.lineHeight = '1.5';
        elDom.style.whiteSpace = 'pre-wrap';
        elDom.style.wordBreak = 'break-word';
        elDom.innerHTML = getElementDisplayHtml(elData);
      } else if (elData.type === 'image' && elData.imageData) {
        const img = document.createElement('img');
        img.src = elData.imageData;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        elDom.appendChild(img);
      } else if (elData.type === 'table' && elData.tableData) {
        elDom.appendChild(createReadonlyTableDOM(elData.tableData));
      }

      if (elData.type === 'text' || elData.type === 'image') {
        applyElementBorderStyle(elDom, elData.style || {});
      }

      body.appendChild(elDom);
    });
  }

  // 頁碼
  const pageno = document.createElement('div');
  pageno.className = 'pv-pageno';
  pageno.textContent = `第 ${idx + 1} 頁 / 共 ${state.previewSlides.length} 頁`;

  // 先放 body（底層），再放 header 與 pageno（疊加在上），與畫布編輯器座標一致
  node.append(body, header, pageno);
  frame.appendChild(node);
  updatePreviewNavButtons();
  fitPreview();
}

/** 依目前頁更新預覽導覽按鈕的 disabled 狀態 */
function updatePreviewNavButtons() {
  const total = state.previewSlides.length;
  const cur = state.previewCursor;
  const first = $('#previewBtnFirst');
  const prev = $('#previewBtnPrev');
  const next = $('#previewBtnNext');
  const last = $('#previewBtnLast');
  if (first) first.disabled = total === 0 || cur <= 0;
  if (prev) prev.disabled = total === 0 || cur <= 0;
  if (next) next.disabled = total === 0 || cur >= total - 1;
  if (last) last.disabled = total === 0 || cur >= total - 1;
}

function fitPreview() {
  const frame = $('#previewFrame');
  const stage = frame?.parentElement;
  if (!stage || !frame) return;
  const w = stage.clientWidth - 32;
  const h = stage.clientHeight - 32;
  const scale = Math.min(w / 1280, h / 720, 1);
  frame.style.transform = `scale(${scale}) translateZ(0)`;
  // 確保不會有殘留的水平捲動，視覺上維持置中
  stage.scrollLeft = 0;
}

// 確保載入 html2canvas
async function ensureHtml2Canvas() {
  if (window.html2canvas) return;
  await new Promise((r, j) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = r;
    s.onerror = () => j(new Error('html2canvas 載入失敗'));
    document.head.appendChild(s);
  });
}

// 確保載入 jsPDF
async function ensureJsPdf() {
  if (window.jspdf?.jsPDF) return;
  await new Promise((r, j) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = r;
    s.onerror = () => j(new Error('jsPDF 載入失敗'));
    document.head.appendChild(s);
  });
}

// 確保載入 PptxGenJS
async function ensurePptx() {
  let P = window.PptxGenJS || window.pptxgen;
  if (P && typeof P === 'object' && 'default' in P) P = P.default;
  if (typeof P === 'function') return P;
  await new Promise((r, j) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs/dist/pptxgen.bundle.js';
    s.crossOrigin = 'anonymous';
    s.onload = r;
    s.onerror = () => j(new Error('PptxGenJS 載入失敗'));
    document.head.appendChild(s);
  });
  P = window.PptxGenJS || window.pptxgen;
  if (P && typeof P === 'object' && 'default' in P) P = P.default;
  if (typeof P !== 'function') throw new Error('PptxGenJS 載入失敗');
  return P;
}

// PDF 匯出
async function exportPreviewPdf() {
  if (!state.previewSlides.length) { showToast('請先載入投影片。', 'warning'); return; }
  try {
    await ensureHtml2Canvas();
    await ensureJsPdf();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [1280, 720] });

    const offscreen = document.createElement('div');
    offscreen.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1280px;height:720px;';
    document.body.appendChild(offscreen);

    for (let i = 0; i < state.previewSlides.length; i++) {
      offscreen.innerHTML = '';
      // 暫時渲染到 offscreen
      const savedCursor = state.previewCursor;
      state.previewCursor = i;
      const frame = document.createElement('div');
      frame.style.cssText = 'width:1280px;height:720px;';

      // 建立預覽 DOM（與簡報預覽一致）；依目前預覽主題決定深色／淺色
      const slide = state.previewSlides[i];
      const isLight = state.previewTheme === 'light';
      const node = document.createElement('div');
      node.className = 'preview-slide';
      const bgStyle = isLight
        ? 'width:100%;height:100%;background:radial-gradient(1000px 600px at 85% 20%,#eef1ff 0%,#e6eaff 50%,#ffffff 100%);border-radius:18px;position:relative;overflow:hidden;font-family:Iansui,"Microsoft JhengHei","Noto Sans TC",system-ui,sans-serif;'
        : 'width:100%;height:100%;background:radial-gradient(1000px 600px at 85% 20%,#162044 0%,#0f1428 50%,#0b1022 100%);border-radius:18px;position:relative;overflow:hidden;font-family:Iansui,"Microsoft JhengHei","Noto Sans TC",system-ui,sans-serif;';
      node.style.cssText = bgStyle;

      const body = document.createElement('div');
      body.style.cssText = 'position:absolute;inset:0;padding:0;overflow:visible;z-index:1;';

      const textColor = isLight ? '#22263a' : '#eaeefc';
      const textColorStored = (c) => (c && c.toLowerCase() !== '#eaeefc' ? c : textColor);

      (slide.elements || []).forEach(elData => {
        const elDom = document.createElement('div');
        elDom.className = elData.type === 'text' ? 'pv-element pv-text' : 'pv-element';
        elDom.style.cssText = `position:absolute;left:${elData.x}px;top:${elData.y}px;width:${elData.width}px;height:${elData.height}px;`;
        if (elData.type === 'text') {
          elDom.style.color = textColorStored(elData.style?.color);
          if (elData.style?.backgroundColor) elDom.style.backgroundColor = elData.style.backgroundColor;
          // PDF 的離屏渲染也比照編輯器，維持換行一致
          elDom.style.padding = '8px 12px';
          elDom.style.boxSizing = 'border-box';
          elDom.style.overflow = 'hidden';
          elDom.style.fontSize = (elData.style?.fontSize || 24) + 'px';
          elDom.style.lineHeight = '1.5';
          elDom.style.whiteSpace = 'pre-wrap';
          elDom.style.wordBreak = 'break-word';
          elDom.innerHTML = getElementDisplayHtml(elData);
        } else if (elData.type === 'image' && elData.imageData) {
          const img = document.createElement('img');
          img.src = elData.imageData;
          img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
          elDom.appendChild(img);
        } else if (elData.type === 'table' && elData.tableData) {
          elDom.appendChild(createReadonlyTableDOM(elData.tableData));
        }
        body.appendChild(elDom);
      });

      const header = document.createElement('div');
      header.style.cssText = 'position:absolute;top:0;left:0;right:0;height:120px;display:flex;align-items:flex-end;justify-content:space-between;padding:28px 44px 0 48px;z-index:2;pointer-events:none;';
      const titleEl = document.createElement('h2');
      titleEl.style.cssText = `font-size:48px;font-weight:800;color:${isLight ? '#1a1f36' : '#fff'};margin:0;`;
      titleEl.textContent = slide.title || '未命名';
      const hostEl = document.createElement('div');
      hostEl.style.cssText = `color:${isLight ? '#5a6585' : '#9aa4c9'};font-size:26px;white-space:nowrap;`;
      hostEl.textContent = slide.host ? `主辦人：${slide.host}` : '';
      header.append(titleEl, hostEl);

      const pageno = document.createElement('div');
      pageno.style.cssText = `position:absolute;right:44px;bottom:12px;font-size:14px;color:${isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)'};z-index:3;`;
      pageno.textContent = `第 ${i + 1} 頁 / 共 ${state.previewSlides.length} 頁`;

      node.append(body, header, pageno);
      frame.appendChild(node);
      offscreen.appendChild(frame);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const pdfBg = isLight ? '#ffffff' : '#0f1221';
      const canvas = await html2canvas(offscreen, { backgroundColor: pdfBg, scale: 1.25 });
      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      if (i > 0) pdf.addPage([1280, 720]);
      const ps = pdf.internal.pageSize;
      pdf.addImage(imgData, 'JPEG', 0, 0, ps.getWidth(), ps.getHeight());

      state.previewCursor = savedCursor;
    }

    document.body.removeChild(offscreen);
    pdf.save(`${buildExportBaseName()}.pdf`);
  } catch (e) {
    showToast('匯出 PDF 失敗：' + e.message, 'error');
    console.error(e);
  }
}

// PPTX 匯出
async function exportPreviewPptx() {
  if (!state.previewSlides.length) { showToast('請先載入投影片。', 'warning'); return; }
  try {
    await ensureHtml2Canvas();
    const PptxCtor = await ensurePptx();
    const pptx = new PptxCtor();
    pptx.layout = 'LAYOUT_16x9';

    // 依目前預覽主題決定投影片背景與文字顏色（淺色預覽 → 淺色匯出，深色預覽 → 深色匯出）
    const isLight = state.previewTheme === 'light';
    const BG = isLight ? 'FFFFFF' : '0F1428';
    const INK = isLight ? '22263A' : 'FFFFFF';
    const MUTED = isLight ? '5A6585' : '9AA4C9';

    for (let i = 0; i < state.previewSlides.length; i++) {
      const d = state.previewSlides[i];
      const s = pptx.addSlide();
      s.background = { color: BG };

      // 標題
      s.addText(d.title || '未命名', {
        x: 0.5, y: 0.32, w: 7.6, h: 0.9, fontSize: 34, bold: true, color: INK
      });
      if (d.host) {
        s.addText('主辦人：' + d.host, {
          x: 7.9, y: 0.92, w: 1.6, h: 0.4, fontSize: 14, color: MUTED, align: 'right'
        });
      }

      // 元件（與畫布／預覽同座標系：整頁 1280×720，不壓縮內容區）
      for (const elData of (d.elements || [])) {
        const xIn = (elData.x / 1280) * 10;
        const yIn = (elData.y / 720) * 5.625;
        const wIn = (elData.width / 1280) * 10;
        const hIn = (elData.height / 720) * 5.625;

        if (elData.type === 'text') {
          const textDom = document.createElement('div');
          const baseColor = (elData.style?.color && elData.style.color.toLowerCase() !== '#eaeefc')
            ? elData.style.color
            : (isLight ? '#22263a' : '#eaeefc');
          textDom.style.cssText = `position:fixed;left:-99999px;top:-99999px;width:${Math.max(1, elData.width)}px;height:${Math.max(1, elData.height)}px;padding:8px 12px;box-sizing:border-box;overflow:hidden;white-space:pre-wrap;word-break:break-word;line-height:1.5;font-size:${elData.style?.fontSize || 24}px;color:${baseColor};background:${elData.style?.backgroundColor || 'transparent'};font-family:Iansui,"Microsoft JhengHei","Noto Sans TC",system-ui,sans-serif;`;
          textDom.innerHTML = getElementDisplayHtml(elData);
          document.body.appendChild(textDom);
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          const textCanvas = await html2canvas(textDom, { backgroundColor: null, scale: 2 });
          document.body.removeChild(textDom);
          s.addImage({
            data: textCanvas.toDataURL('image/png'),
            x: xIn, y: yIn, w: wIn, h: hIn
          });
        } else if (elData.type === 'image' && elData.imageData) {
          if (/^data:image\//i.test(elData.imageData)) {
            // 依圖片實際長寬比調整，避免在 PPTX 內被拉伸
            let imgW = wIn;
            let imgH = hIn;
            try {
              const img = new Image();
              img.src = elData.imageData;
              // 同步估算：若能取得寬高，就按比例縮到框內
              if (img.width && img.height) {
                const ratio = img.width / img.height;
                const boxRatio = wIn / hIn;
                if (ratio > boxRatio) {
                  imgW = wIn;
                  imgH = wIn / ratio;
                } else {
                  imgH = hIn;
                  imgW = hIn * ratio;
                }
              }
            } catch (e) {}
            s.addImage({
              data: elData.imageData,
              x: xIn, y: yIn, w: imgW, h: imgH
            });
          }
        } else if (elData.type === 'table' && elData.tableData) {
          const tableData = normalizeTableData(elData.tableData);
          const rows = [elData.tableData.headers, ...elData.tableData.rows];
          s.addTable(rows, {
            x: xIn, y: yIn, w: wIn,
            colW: tableData.colWidths.map(w => (w / 1280) * 10),
            rowH: tableData.rowHeights.map(h => (h / 720) * 5.625),
            fontSize: 12, border: { type: 'solid', color: isLight ? '333333' : 'D0D7F0', pt: 1 }
          });
        }
      }

      // 頁碼
      s.addText(`第 ${i + 1} 頁 / 共 ${state.previewSlides.length} 頁`, {
        x: 7.6, y: 5.2, w: 2.0, h: 0.3, fontSize: 10, color: MUTED, align: 'right'
      });
    }

    await pptx.writeFile({ fileName: `${buildExportBaseName()}.pptx` });
  } catch (e) {
    showToast('匯出 PPTX 失敗：' + e.message, 'error');
    console.error(e);
  }
}

// 可編輯文字版 PPTX 匯出（文字可在 PowerPoint 內直接編輯）
async function exportPreviewPptxEditable() {
  if (!state.previewSlides.length) { showToast('請先載入投影片。', 'warning'); return; }
  try {
    const PptxCtor = await ensurePptx();
    const pptx = new PptxCtor();
    pptx.layout = 'LAYOUT_16x9';

    const isLight = state.previewTheme === 'light';
    const BG = isLight ? 'FFFFFF' : '0F1428';
    const INK = isLight ? '22263A' : 'FFFFFF';
    const MUTED = isLight ? '5A6585' : '9AA4C9';

    for (let i = 0; i < state.previewSlides.length; i++) {
      const d = state.previewSlides[i];
      const s = pptx.addSlide();
      s.background = { color: BG };

      s.addText(d.title || '未命名', {
        x: 0.5, y: 0.32, w: 7.6, h: 0.9, fontSize: 34, bold: true, color: INK
      });
      if (d.host) {
        s.addText('主辦人：' + d.host, {
          x: 7.9, y: 0.92, w: 1.6, h: 0.4, fontSize: 14, color: MUTED, align: 'right'
        });
      }

      for (const elData of (d.elements || [])) {
        const xIn = (elData.x / 1280) * 10;
        const yIn = (elData.y / 720) * 5.625;
        const wIn = (elData.width / 1280) * 10;
        const hIn = (elData.height / 720) * 5.625;

        if (elData.type === 'text') {
          let content = getElementPlainText(elData);
          if (elData.preset && PRESETS[elData.preset]) content = PRESETS[elData.preset].label + '\n' + content;
          s.addText(content, {
            x: xIn, y: yIn, w: wIn, h: hIn,
            fontSize: Math.round((elData.style?.fontSize || 24) * 0.6),
            color: toPptxHexColor(elData.style?.color, INK),
            lineSpacingMultiple: 1.2,
            breakLine: true,
            valign: 'top'
          });
        } else if (elData.type === 'image' && elData.imageData) {
          if (/^data:image\//i.test(elData.imageData)) {
            let imgW = wIn;
            let imgH = hIn;
            try {
              const img = new Image();
              img.src = elData.imageData;
              if (img.width && img.height) {
                const ratio = img.width / img.height;
                const boxRatio = wIn / hIn;
                if (ratio > boxRatio) {
                  imgW = wIn;
                  imgH = wIn / ratio;
                } else {
                  imgH = hIn;
                  imgW = hIn * ratio;
                }
              }
            } catch (e) {}
            s.addImage({ data: elData.imageData, x: xIn, y: yIn, w: imgW, h: imgH });
          }
        } else if (elData.type === 'table' && elData.tableData) {
          const tableData = normalizeTableData(elData.tableData);
          const rows = [tableData.headers, ...tableData.rows];
          s.addTable(rows, {
            x: xIn, y: yIn, w: wIn,
            colW: tableData.colWidths.map(w => (w / 1280) * 10),
            rowH: tableData.rowHeights.map(h => (h / 720) * 5.625),
            fontSize: 12,
            border: { type: 'solid', color: isLight ? '333333' : 'D0D7F0', pt: 1 }
          });
        }
      }

      s.addText(`第 ${i + 1} 頁 / 共 ${state.previewSlides.length} 頁`, {
        x: 7.6, y: 5.2, w: 2.0, h: 0.3, fontSize: 10, color: MUTED, align: 'right'
      });
    }

    await pptx.writeFile({ fileName: `${buildExportBaseName()}_可編輯.pptx` });
  } catch (e) {
    showToast('匯出可編輯 PPTX 失敗：' + e.message, 'error');
    console.error(e);
  }
}

/* =============================================
   6. 合併管理
   ============================================= */

function initCombine() {
  const dropZone = $('#combineDropZone');
  const fileInput = $('#combineFileInput');
  const logEl = $('#combLog');

  function combLog(msg) { logEl.textContent += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; }
  function inferHostFromFilename(filename) {
    const base = (filename || '').replace(/\.[^.]+$/, '').trim();
    return base || '';
  }
  function parseHosts(hostStr) {
    const s = (hostStr || '').toString().trim();
    if (!s) return [];
    return s
      .split(/[\/／、,，_＿]/g)
      .map(x => x.trim())
      .filter(Boolean);
  }
  function stripCombineMeta(slide) {
    const clone = { ...slide };
    delete clone.__combineSourceName;
    delete clone.__combineSourceKey;
    return clone;
  }
  function getCombineGroupTitle(slides, sourceName) {
    const first = slides?.[0];
    const fromSlide = (first?.title || '').toString().trim();
    if (fromSlide) return fromSlide;
    const fromFile = inferHostFromFilename(sourceName || '');
    return fromFile || '未命名';
  }

  function combReset() {
    state.combineFiles = [];
    state.combMergedSlides = [];
    state.combGrouped = [];
    logEl.textContent = '';
    $('#combTasksTable tbody').innerHTML = '';
    $('#combTasksPanel').style.display = 'none';
  }

  // 拖放與選檔
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const arr = Array.from(e.target.files || []);
    if (arr.length) {
      state.combineFiles.push(...arr);
      combLog(`已加入 ${arr.length} 個檔案：${arr.map(f => f.name).join(', ')}`);
    }
  });
  ['dragenter', 'dragover'].forEach(ev =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); })
  );
  dropZone.addEventListener('drop', (e) => {
    const arr = Array.from(e.dataTransfer?.files || []);
    if (arr.length) {
      state.combineFiles.push(...arr);
      combLog(`已加入 ${arr.length} 個檔案：${arr.map(f => f.name).join(', ')}`);
    }
  });

  // 讀取所有檔案
  async function readAllSlides() {
    if (!state.combineFiles.length) { combLog('尚未選擇任何檔案。'); return []; }
    combLog('開始讀取檔案…');
    const keepImage = $('#combKeepImage').checked;
    const out = [];
    for (let fileIndex = 0; fileIndex < state.combineFiles.length; fileIndex++) {
      const f = state.combineFiles[fileIndex];
      try {
        const text = await f.text();
        const obj = JSON.parse(text);
        if (!obj?.slides || !Array.isArray(obj.slides)) throw new Error('JSON 格式不含 slides 陣列');
        const fallbackHost = inferHostFromFilename(f.name);
        const sourceKey = `${fileIndex}::${f.name}`;
        let added = 0;
        for (const s of obj.slides) {
          const clone = { ...s };
          if (!keepImage) delete clone.imageData;
          // 若投影片沒有主辦人，使用檔名推測（常見情境：檔名就是同仁姓名）
          if (!clone.host || !String(clone.host).trim()) clone.host = fallbackHost;
          clone.__combineSourceName = f.name;
          clone.__combineSourceKey = sourceKey;
          out.push(clone);
          added++;
        }
        combLog(`✓ ${f.name}（${added} 張）`);
      } catch (err) {
        combLog(`✗ ${f.name}：${err.message}`);
      }
    }
    return out;
  }

  function applyDedupe(slides) {
    if (!$('#combDedupe').checked) return slides;
    const seen = new Set();
    return slides.filter(s => {
      const k = [s.host, s.title, s.line1, s.line2, s.line3, s.line4, s.line5].map(v => (v ?? '').toString().trim()).join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function applySort(slides) {
    if (!$('#combSortByHost').checked) return slides;
    return [...slides].sort((a, b) => {
      const ah = (a.host || '').trim(), bh = (b.host || '').trim();
      if (ah !== bh) return ah.localeCompare(bh, 'zh-Hant');
      return (a.title || '').trim().localeCompare((b.title || '').trim(), 'zh-Hant');
    });
  }

  function buildGroups(slides) {
    const map = new Map();
    for (const s of slides) {
      const key = s.__combineSourceKey || s.__combineSourceName || uid();
      if (!map.has(key)) {
        map.set(key, {
          key,
          sourceName: s.__combineSourceName || '',
          title: '',
          slides: [],
          hosts: new Set()
        });
      }
      const g = map.get(key);
      g.slides.push(s);
      parseHosts(s.host).forEach(h => g.hosts.add(h));
    }
    const arr = [...map.values()];
    arr.forEach(g => {
      g.title = getCombineGroupTitle(g.slides, g.sourceName);
      if (!g.hosts.size) {
        parseHosts(inferHostFromFilename(g.sourceName)).forEach(h => g.hosts.add(h));
      }
      g.hosts = Array.from(g.hosts);
    });
    if ($('#combSortByHost').checked) {
      arr.sort((a, b) => {
        const ah = (a.hosts[0] || '').trim();
        const bh = (b.hosts[0] || '').trim();
        if (ah !== bh) return ah.localeCompare(bh, 'zh-Hant');
        return (a.title || '').trim().localeCompare((b.title || '').trim(), 'zh-Hant');
      });
    }
    return arr;
  }

  let combDragSrc = null; // 拖曳來源列，必須在迴圈外共用
  function renderCombTable(groups) {
    const tbody = $('#combTasksTable tbody');
    tbody.innerHTML = '';
    groups.forEach((g, idx) => {
      const tr = document.createElement('tr');
      tr.draggable = true;
      tr.dataset.index = String(idx);
      tr.dataset.groupKey = g.key || '';
      tr.innerHTML = `
        <td><span class="combine-handle" title="拖曳排序">≡</span></td>
        <td><strong>${escHTML(g.title)}</strong></td>
        <td>${g.slides.length} 張</td>
        <td>${g.hosts.length ? g.hosts.map(escHTML).join('、') : '—'}</td>
      `;
      tr.addEventListener('dragstart', (e) => {
        combDragSrc = tr;
        tr.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ''); // 部分瀏覽器需設定 data 才允許拖曳
      });
      tr.addEventListener('dragend', () => {
        tr.classList.remove('dragging');
        combDragSrc = null;
        syncCombGroups();
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        if (combDragSrc && combDragSrc !== tr) {
          const rows = [...tbody.children];
          const from = rows.indexOf(combDragSrc);
          const to = rows.indexOf(tr);
          if (from !== -1 && to !== -1) {
            if (from < to) tbody.insertBefore(combDragSrc, tr.nextSibling);
            else tbody.insertBefore(combDragSrc, tr);
          }
        }
      });
      tbody.appendChild(tr);
    });
    $('#combTasksPanel').style.display = 'block';
  }

  function syncCombGroups() {
    const keys = [...$$('#combTasksTable tbody tr')].map(tr => tr.dataset.groupKey || '');
    const map = new Map(state.combGrouped.map(g => [g.key, g]));
    state.combGrouped = keys.map(k => map.get(k)).filter(Boolean);
  }

  // 合併並下載
  $('#combMergeDownload').addEventListener('click', async () => {
    let slides = await readAllSlides();
    if (!slides.length) return;
    slides = applyDedupe(slides);
    state.combMergedSlides = slides;
    state.combGrouped = buildGroups(slides);
    renderCombTable(state.combGrouped);
    combLog(`📌 合併後總計：${slides.length} 張（${state.combGrouped.length} 個工作項目）`);
    const name = `[合併]${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(name, { slides: state.combGrouped.flatMap(g => g.slides).map(stripCombineMeta) });
    combLog(`✅ 已下載：${name}`);
  });

  // 僅合併
  $('#combMergeOnly').addEventListener('click', async () => {
    let slides = await readAllSlides();
    if (!slides.length) return;
    slides = applyDedupe(slides);
    state.combMergedSlides = slides;
    state.combGrouped = buildGroups(slides);
    renderCombTable(state.combGrouped);
    combLog(`📌 合併後總計：${slides.length} 張（${state.combGrouped.length} 個工作項目）`);
    combLog('✅ 合併完成，可在下方拖曳排序。');
  });

  // 清空
  $('#combClear').addEventListener('click', () => { combReset(); fileInput.value = ''; combLog('已清空。'); });

  // 下載（依目前順序）
  $('#combDownloadOrdered').addEventListener('click', () => {
    if (!state.combGrouped.length) { combLog('尚無資料。'); return; }
    const ordered = state.combGrouped.flatMap(g => g.slides).map(stripCombineMeta);
    const name = `[合併_排序]${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(name, { slides: ordered });
    combLog(`✅ 已下載：${name}`);
  });

  // 匯出 CSV
  $('#combExportCsv').addEventListener('click', () => {
    if (!state.combGrouped.length) { combLog('尚無資料。'); return; }
    const lines = ['標題,頁數,主辦人'];
    state.combGrouped.forEach(g => {
      const t = `"${(g.title || '').replace(/"/g, '""')}"`;
      const h = `"${g.hosts.join('、').replace(/"/g, '""')}"`;
      lines.push(`${t},${g.slides.length},${h}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `工作項目表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    combLog('✅ 已匯出 CSV。');
  });

  // 送入編輯器
  $('#combSendToEditor').addEventListener('click', () => {
    if (!state.combGrouped.length) { combLog('尚無資料。'); return; }
    const ordered = state.combGrouped.flatMap(g => g.slides).map(stripCombineMeta);
    loadSlidesIntoEditor(ordered);
    // 切換到編輯器
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $('[data-tab="editor"]').classList.add('active');
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    $('#tab-editor').classList.add('active');
    combLog('✅ 已送入編輯器。');
  });
}

/* =============================================
   7. AI 輔助
   ============================================= */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 將「對象」轉成允許中間夾空白的樣式，例如 對\s*象
function looseAliasPattern(alias) {
  const raw = String(alias).trim();
  if (!raw) return '';
  // 逐字拆開，在每個字之間允許有任意空白（含全形空白）
  const chars = [...raw].map(ch => escapeRegex(ch));
  return chars.join('[\\s\u3000]*');
}

function stripMarkdownFormatting(text) {
  let s = (text || '').toString();
  // 移除粗體/斜體標記
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  s = s.replace(/__(.+?)__/g, '$1');
  s = s.replace(/\*(.+?)\*/g, '$1');
  s = s.replace(/_(.+?)_/g, '$1');
  // 拿掉每行開頭的清單符號、編號
  s = s
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trimEnd())
    .join('\n');
  return s.trim();
}

function normalizeAiOutputText(text) {
  return (text || '').toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function extractAiSectionByAliases(text, aliases, allAliases) {
  const src = normalizeAiOutputText(text);
  if (!src) return '';
  const escapedAliases = aliases.map(looseAliasPattern);
  const escapedAll = allAliases.map(looseAliasPattern);

  const startRe = new RegExp(
    String.raw`(?:^|\n)\s*(?:[-*#]\s*|\d+[.)]\s*)?(?:\*\*)?(?:【|「)?(?:${escapedAliases.join('|')})(?:】|」)?(?:\*\*)?\s*(?:[：:]\s*|\n)`,
    'i'
  );
  const startMatch = startRe.exec(src);
  if (!startMatch) return '';

  const start = startMatch.index + startMatch[0].length;
  const rest = src.slice(start);
  const nextRe = new RegExp(
    String.raw`(?:\n)\s*(?:[-*#]\s*|\d+[.)]\s*)?(?:\*\*)?(?:【|「)?(?:${escapedAll.join('|')})(?:】|」)?(?:\*\*)?\s*(?:[：:]|\n)`,
    'i'
  );
  const nextMatch = nextRe.exec(rest);
  const raw = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return stripMarkdownFormatting(raw);
}

function extractHintField(text, aliases) {
  const src = normalizeAiOutputText(text);
  if (!src) return '';
  const escapedAliases = aliases.map(looseAliasPattern);

  // 先抓「欄位：內容」格式
  const lineRe = new RegExp(
    String.raw`(?:^|\n)\s*(?:[-*#]\s*|\d+[.)]\s*)?(?:\*\*)?(?:【|「)?(?:${escapedAliases.join('|')})(?:】|」)?(?:\*\*)?\s*[：:]\s*([^\n]+)`,
    'i'
  );
  const lineMatch = lineRe.exec(src);
  if (lineMatch && lineMatch[1]) return stripMarkdownFormatting(lineMatch[1]);

  // 再抓「欄位」下一行內容
  const nextLineRe = new RegExp(
    String.raw`(?:^|\n)\s*(?:[-*#]\s*|\d+[.)]\s*)?(?:\*\*)?(?:【|「)?(?:${escapedAliases.join('|')})(?:】|」)?(?:\*\*)?\s*\n([^\n]+)`,
    'i'
  );
  const nextLineMatch = nextLineRe.exec(src);
  if (nextLineMatch && nextLineMatch[1]) return stripMarkdownFormatting(nextLineMatch[1]);
  return '';
}

function parseAiSections(aiText) {
  const src = normalizeAiOutputText(aiText);
  const allAliases = ['案由說明', '案由', '培訓對象', '對象', '辦理情形', '績效與貢獻', '後續推廣作為'];
  return {
    reason: extractAiSectionByAliases(src, ['案由說明', '案由'], allAliases),
    target: extractAiSectionByAliases(src, ['培訓對象', '對象'], allAliases),
    situation: extractAiSectionByAliases(src, ['辦理情形'], allAliases),
    performance: extractAiSectionByAliases(src, ['績效與貢獻'], allAliases),
    followup: extractAiSectionByAliases(src, ['後續推廣作為'], allAliases)
  };
}

function addPresetTextBox(preset, contentText) {
  const p = PRESETS[preset];
  if (!p) return;
  addElementToCanvas('text', {
    preset,
    x: p.x,
    y: p.y,
    width: p.defaultW,
    height: p.defaultH,
    content: (contentText || '').toString(),
    style: { fontSize: 24, color: '#22263a' }
  });
}

function buildAiInsertPlan(template, aiText, refText) {
  const parsed = parseAiSections(aiText);
  const refParsed = parseAiSections(refText);
  const reasonHint =
    parsed.reason ||
    refParsed.reason ||
    extractHintField(refText, ['案由說明', '案由']) ||
    extractHintField(aiText, ['案由說明', '案由']);
  const targetHint =
    parsed.target ||
    refParsed.target ||
    extractHintField(refText, ['培訓對象', '對象']) ||
    extractHintField(aiText, ['培訓對象', '對象']);

  const plan = [
    { key: 'reason', preset: 'reason', label: '案由', content: reasonHint || '', checked: Boolean(reasonHint) },
    { key: 'target', preset: 'target', label: '培訓對象', content: targetHint || '', checked: Boolean(targetHint) },
    { key: 'situation', preset: 'situation', label: '辦理情形', content: parsed.situation || '', checked: false },
    { key: 'performance', preset: 'performance', label: '績效與貢獻', content: parsed.performance || '', checked: false },
    { key: 'followup', preset: 'followup', label: '後續推廣作為', content: parsed.followup || '', checked: false }
  ];

  if (template === 'situation') {
    const item = plan.find(x => x.key === 'situation');
    if (item) {
      if (!item.content) item.content = normalizeAiOutputText(aiText);
      item.checked = Boolean(item.content);
    }
  } else if (template === 'performance') {
    const item = plan.find(x => x.key === 'performance');
    if (item) {
      if (!item.content) item.content = normalizeAiOutputText(aiText);
      item.checked = Boolean(item.content);
    }
  } else if (template === 'followup') {
    const item = plan.find(x => x.key === 'followup');
    if (item) {
      if (!item.content) item.content = normalizeAiOutputText(aiText);
      item.checked = Boolean(item.content);
    }
  } else {
    // full / custom：主體三欄有內容就預設勾選
    ['situation', 'performance', 'followup'].forEach(k => {
      const item = plan.find(x => x.key === k);
      if (item) item.checked = Boolean(item.content);
    });
  }
  return plan;
}

function renderAiInsertChecklist(plan) {
  const list = $('#aiInsertChecklist');
  if (!list) return;
  list.innerHTML = '';
  plan.forEach(item => {
    const row = document.createElement('label');
    row.className = 'ai-insert-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.insertKey = item.key;
    checkbox.checked = !!item.checked;
    checkbox.disabled = !item.content;
    const main = document.createElement('span');
    main.className = 'ai-insert-item-main';
    const label = document.createElement('span');
    label.className = 'ai-insert-item-label';
    label.textContent = item.label + (item.content ? '' : '（未解析到內容）');
    const preview = document.createElement('span');
    preview.className = 'ai-insert-item-preview';
    preview.textContent = item.content ? item.content.slice(0, 48).replace(/\n/g, ' ') : '—';
    main.append(label, preview);
    row.append(checkbox, main);
    list.appendChild(row);
  });
}

function initAI() {
  const dialog = $('#aiDialog');

  // 開啟 AI 面板
  $('#btnAiPanel').addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  $('#aiDialogClose').addEventListener('click', () => dialog.close());

  // AI 輸入方式 Tab 切換
  $$('.ai-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.ai-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.ai-tab-panel').forEach(p => p.classList.remove('active'));
      $(`[data-aitab="${tab.dataset.aitab}"].ai-tab-panel`).classList.add('active');
    });
  });

  // 自訂提示詞切換
  $('#aiPromptTemplate').addEventListener('change', (e) => {
    $('#aiCustomPrompt').style.display = e.target.value === 'custom' ? '' : 'none';
  });

  // 自訂提示詞：從 localStorage 載入並即時儲存
  const savedCustomPrompt = localStorage.getItem('ai.customPrompt') || '';
  $('#aiCustomPrompt').value = savedCustomPrompt;
  $('#aiCustomPrompt').addEventListener('input', () => {
    localStorage.setItem('ai.customPrompt', $('#aiCustomPrompt').value);
  });

  // 截圖上傳
  const imgDrop = $('#aiImageDrop');
  const imgFile = $('#aiImageFile');
  const imgPreview = $('#aiImagePreview');

  imgDrop.addEventListener('click', () => imgFile.click());
  imgFile.addEventListener('change', async () => {
    const f = imgFile.files?.[0];
    if (!f) return;
    const dataUrl = await readAndCompressImage(f, 1600, 0.9);
    imgPreview.src = dataUrl;
    imgPreview.style.display = 'block';
  });
  imgDrop.addEventListener('dragover', (e) => { e.preventDefault(); imgDrop.classList.add('dragover'); });
  imgDrop.addEventListener('dragleave', () => imgDrop.classList.remove('dragover'));
  imgDrop.addEventListener('drop', async (e) => {
    e.preventDefault();
    imgDrop.classList.remove('dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) {
      const dataUrl = await readAndCompressImage(f, 1600, 0.9);
      imgPreview.src = dataUrl;
      imgPreview.style.display = 'block';
    }
  });

  // HTML 檔案上傳
  $('#aiHtmlFile').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    $('#aiHtmlFileName').textContent = f ? f.name : '';
  });

  // URL 抓取
  $('#aiFetchUrl').addEventListener('click', async () => {
    const url = ($('#aiUrlInput').value || '').trim();
    if (!url) {
      showToast('請先輸入網址。', 'warning');
      return;
    }
    const statusEl = $('#aiUrlStatus');
    statusEl.textContent = '抓取中…';
    const cookie = ($('#aiUrlCookie').value || '').trim();
    try {
      const text = await fetchUrlAsReferenceText(url, cookie ? { cookie } : {});
      $('#aiUrlFetched').value = text;
      statusEl.textContent = `抓取完成（${text.length} 字）`;
    } catch (err) {
      statusEl.textContent = '抓取失敗';
      showToast('網址抓取失敗：' + err.message, 'error');
    }
  });

  // 生成內容
  $('#aiGenerate').addEventListener('click', () => generateAIContent());

  // 載入上一次結果
  const loadLastBtn = $('#aiLoadLast');
  const refreshLoadLastEnabled = () => {
    try {
      const raw = localStorage.getItem('ai.lastGeneration');
      loadLastBtn.disabled = !raw;
    } catch (_) {
      loadLastBtn.disabled = true;
    }
  };
  if (loadLastBtn) {
    refreshLoadLastEnabled();
    loadLastBtn.addEventListener('click', () => {
      try {
        const raw = localStorage.getItem('ai.lastGeneration');
        if (!raw) {
          showToast('目前尚無上一次結果可載入。', 'warning');
          refreshLoadLastEnabled();
          return;
        }
        const last = JSON.parse(raw);
        if (!last || !last.result || !last.template) {
          showToast('無法解析上一次結果。', 'error');
          refreshLoadLastEnabled();
          return;
        }
        const parsedTemplate = last.template || 'full';
        let displayResult = last.result;
        if (parsedTemplate === 'situation' || parsedTemplate === 'performance' || parsedTemplate === 'followup') {
          const sections = parseAiSections(last.result);
          if (parsedTemplate === 'situation' && sections.situation) displayResult = sections.situation;
          else if (parsedTemplate === 'performance' && sections.performance) displayResult = sections.performance;
          else if (parsedTemplate === 'followup' && sections.followup) displayResult = sections.followup;
        }
        $('#aiResult').textContent = displayResult;
        const insertPlan = buildAiInsertPlan(parsedTemplate, last.result, last.refContent || '');
        renderAiInsertChecklist(insertPlan);
        state.aiLastGeneration = {
          template: parsedTemplate,
          refContent: last.refContent || '',
          result: last.result,
          insertPlan
        };
        $('.ai-result-section').style.display = 'block';
      } catch (err) {
        showToast('載入上一次結果失敗：' + err.message, 'error');
      } finally {
        refreshLoadLastEnabled();
      }
    });
  }

  // 插入結果到畫布
  $('#aiInsertResult').addEventListener('click', () => {
    const text = normalizeAiOutputText($('#aiResult').textContent || '');
    if (!text) return;
    const plan = state.aiLastGeneration?.insertPlan || [];
    const checkedMap = new Set(
      [...$$('#aiInsertChecklist input[type="checkbox"]')]
        .filter(el => el.checked && !el.disabled)
        .map(el => el.dataset.insertKey)
    );
    const selected = plan.filter(item => checkedMap.has(item.key) && item.content);
    if (!selected.length) {
      showToast('請至少勾選一個要插入的項目。', 'warning');
      return;
    }
    selected.forEach(item => addPresetTextBox(item.preset, item.content));

    dialog.close();
  });

  // 複製到剪貼簿
  $('#aiCopyResult').addEventListener('click', () => {
    const text = $('#aiResult').textContent || '';
    navigator.clipboard.writeText(text).then(() => showToast('已複製到剪貼簿', 'success'));
  });
}

/** 切換到設定頁並捲動至 AI 區塊（未設 API Key 時導向用） */
function switchToSettingsAndScrollToAi() {
  const settingsBtn = $('.nav-btn[data-tab="settings"]');
  const settingsPanel = $('#tab-settings');
  const aiSection = $('#settingsAiSection');
  if (settingsBtn) {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    settingsBtn.classList.add('active');
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    if (settingsPanel) settingsPanel.classList.add('active');
  }
  if (aiSection) {
    aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function generateAIContent() {
  const provider = localStorage.getItem('ai.provider') || 'openai';
  const openaiKey = (localStorage.getItem('ai.openai.key') || '').trim();
  const openrouterKey = (localStorage.getItem('ai.openrouter.key') || '').trim();
  const geminiKey = (localStorage.getItem('ai.gemini.key') || '').trim();
  const openaiModel = localStorage.getItem('ai.openai.model') || 'gpt-3.5-turbo';
  const openrouterModel = localStorage.getItem('ai.openrouter.model') || 'openrouter/free';
  const geminiModel = localStorage.getItem('ai.gemini.model') || 'gemini-2.5-flash';

  // 未設定目前供應商的 API Key 時，以 Toast 提示並導向設定頁 AI 區塊，不拋錯
  const keyForProvider = provider === 'openai' ? openaiKey : (provider === 'openrouter' ? openrouterKey : geminiKey);
  if (!keyForProvider) {
    showToast('請先到設定頁面填寫 AI API Key。', 'warning');
    switchToSettingsAndScrollToAi();
    return;
  }

  // 收集參考資料
  let refContent = '';
  const activeTab = $('.ai-tab.active')?.dataset.aitab || 'text';

  if (activeTab === 'text') {
    refContent = $('#aiRefText').value || '';
  } else if (activeTab === 'html') {
    const f = $('#aiHtmlFile').files?.[0];
    if (f) refContent = await f.text();
  } else if (activeTab === 'url') {
    const cached = $('#aiUrlFetched').value || '';
    if (cached.trim()) {
      refContent = cached;
    } else {
      const url = ($('#aiUrlInput').value || '').trim();
      if (!url) {
        showToast('請先輸入網址。', 'warning');
        return;
      }
      const cookie = ($('#aiUrlCookie').value || '').trim();
      refContent = await fetchUrlAsReferenceText(url, cookie ? { cookie } : {});
      $('#aiUrlFetched').value = refContent;
      $('#aiUrlStatus').textContent = `抓取完成（${refContent.length} 字）`;
    }
  }

  // 取得圖片（如果有）
  let imageBase64 = '';
  if (activeTab === 'image') {
    imageBase64 = $('#aiImagePreview').src || '';
  }

  if (!refContent && !imageBase64) {
    showToast('請先輸入或上傳參考資料。', 'warning');
    return;
  }

  // 組合提示詞
  const template = $('#aiPromptTemplate').value;
  let prompt = '';
  if (template === 'custom') {
    prompt = $('#aiCustomPrompt').value || '請根據以下參考資料撰寫報告內容。';
  } else {
    const labels = {
      full: '辦理情形、績效與貢獻、後續推廣作為',
      situation: '辦理情形',
      performance: '績效與貢獻',
      followup: '後續推廣作為'
    };
    prompt = `你是一位專業的公務報告撰寫助手。請根據以下參考資料，撰寫業務會報的「${labels[template] || labels.full}」內容。

【欄位定義（請嚴格依此擷取，勿混淆）】
- 案由：請擷取「案由說明」或「專案開班案由」欄位的內容（例如：本課程為…認證的先導課程）。注意：案由 ≠ 班名、≠ 課程名稱；班名／課程名稱是另一個欄位，不要當成案由。
- 培訓對象／對象：請擷取「培訓對象」「對象」或「目標對象」欄位的內容（例如：解決方案架構師、開發人員…）。
- 辦理情形、績效與貢獻、後續推廣作為：依參考資料撰寫或條列，若無則標註需補充。

要求：
1. 使用繁體中文
2. 條列式撰寫，每點簡潔有力
3. 用語正式但不冗長
4. 若資料不足，請合理推測或標註需要補充的地方
5. 輸出時請用以下欄位標題：案由、培訓對象、辦理情形、績效與貢獻、後續推廣作為（案由與培訓對象請依上面定義從參考資料正確擷取，勿把班名當案由）`;
  }

  // 使用者偏好的字數與語氣
  const lengthOpt = ($('#aiLength')?.value || 'medium');
  const toneOpt = ($('#aiTone')?.value || 'balanced');
  let styleHint = '';
  if (lengthOpt === 'short') styleHint += '請盡量簡短撰寫，總字數約 100 字以內。';
  else if (lengthOpt === 'medium') styleHint += '請以適中長度撰寫，總字數約 200 字左右。';
  else if (lengthOpt === 'long') styleHint += '請較為詳細撰寫，總字數約 300 字以上，仍以清楚條理為主。';

  if (toneOpt === 'formal') styleHint += '整體語氣請偏正式、完整敘述，適合對長官簡報。';
  else if (toneOpt === 'concise') styleHint += '請盡量精簡，以條列重點為主，避免過多客套與贅詞。';
  else if (toneOpt === 'balanced') styleHint += '語氣請正式但精簡，兼顧可讀性與專業感。';

  const fullPrompt =
    prompt +
    '\n\n【寫作風格偏好】\n' +
    (styleHint || '語氣請正式且易讀，可自行判斷適當長度。') +
    '\n\n===== 參考資料 =====\n' +
    refContent;

  // 顯示載入中
  $('#aiLoading').style.display = 'flex';
  const resultBox = $('#aiResult');
  if (resultBox) resultBox.textContent = '';
  $('.ai-result-section').style.display = 'none';

  try {
    let result = '';

    if (provider === 'openai' && openaiKey) {
      result = await callOpenAIStream(openaiKey, openaiModel, fullPrompt, imageBase64, chunk => {
        if (resultBox) resultBox.textContent += chunk;
      });
    } else if (provider === 'openrouter' && openrouterKey) {
      result = await callOpenRouterStream(openrouterKey, openrouterModel, fullPrompt, imageBase64, chunk => {
        if (resultBox) resultBox.textContent += chunk;
      });
    } else if (provider === 'gemini' && geminiKey) {
      result = await callGemini(geminiKey, geminiModel, fullPrompt, imageBase64);
    } else {
      if (openaiKey) {
        result = await callOpenAIStream(openaiKey, openaiModel, fullPrompt, imageBase64, chunk => {
          if (resultBox) resultBox.textContent += chunk;
        });
      } else if (openrouterKey) {
        result = await callOpenRouterStream(openrouterKey, openrouterModel, fullPrompt, imageBase64, chunk => {
          if (resultBox) resultBox.textContent += chunk;
        });
      } else if (geminiKey) {
        result = await callGemini(geminiKey, geminiModel, fullPrompt, imageBase64);
      } else {
        throw new Error('尚未設定 API Key，請先到「設定」頁面輸入。');
      }
    }

    const parsedTemplate = template || 'full';

    // 依使用者選擇的生成指令，自動裁切顯示對應段落，讓結果更符合直覺
    let displayResult = result;
    if (parsedTemplate === 'situation' || parsedTemplate === 'performance' || parsedTemplate === 'followup') {
      const sections = parseAiSections(result);
      if (parsedTemplate === 'situation' && sections.situation) displayResult = sections.situation;
      else if (parsedTemplate === 'performance' && sections.performance) displayResult = sections.performance;
      else if (parsedTemplate === 'followup' && sections.followup) displayResult = sections.followup;
    }

    $('#aiResult').textContent = displayResult;
    const insertPlan = buildAiInsertPlan(parsedTemplate, result, refContent);
    renderAiInsertChecklist(insertPlan);
    state.aiLastGeneration = { template: parsedTemplate, refContent, result, insertPlan };
    try {
      localStorage.setItem('ai.lastGeneration', JSON.stringify({ template: parsedTemplate, refContent, result }));
    } catch (_) {}
    const loadLastBtn2 = $('#aiLoadLast');
    if (loadLastBtn2) loadLastBtn2.disabled = false;
    $('.ai-result-section').style.display = 'block';
  } catch (err) {
    showToast('AI 生成失敗：' + err.message, 'error');
  } finally {
    $('#aiLoading').style.display = 'none';
  }
}

async function callOpenAI(key, model, prompt, imageBase64) {
  const messages = [];
  const content = [];
  content.push({ type: 'text', text: prompt });
  if (imageBase64 && imageBase64.startsWith('data:image/')) {
    content.push({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  messages.push({ role: 'user', content });

  const useProxy = localStorage.getItem('ai.openai.proxy.enabled') === 'true';
  const proxyUrl = (localStorage.getItem('ai.openai.proxy.url') || '').trim();
  const url = (useProxy && proxyUrl) ? proxyUrl : 'https://api.openai.com/v1/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (!useProxy) headers['Authorization'] = `Bearer ${key}`;
  const body = useProxy ? { model, messages, temperature: 0.2 } : { model, messages, max_tokens: 2000 };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  // 代理回傳：{ ok, text, raw }；原生回傳：{ choices[0].message.content }
  if (data && data.ok === true) return data.text || '（無回應內容）';
  return data.choices?.[0]?.message?.content || '（無回應內容）';
}

// OpenAI 串流版本：邊接收邊呼叫 onChunk，最後回傳完整文字
async function callOpenAIStream(key, model, prompt, imageBase64, onChunk) {
  const messages = [];
  const content = [];
  content.push({ type: 'text', text: prompt });
  if (imageBase64 && imageBase64.startsWith('data:image/')) {
    content.push({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  messages.push({ role: 'user', content });

  const useProxy = localStorage.getItem('ai.openai.proxy.enabled') === 'true';
  const proxyUrl = (localStorage.getItem('ai.openai.proxy.url') || '').trim();
  const url = (useProxy && proxyUrl) ? proxyUrl : 'https://api.openai.com/v1/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (!useProxy) headers['Authorization'] = `Bearer ${key}`;
  // 重要：要串流，Supabase Edge Function 也必須支援 stream: true 並轉發 SSE
  const body = useProxy ? { model, messages, temperature: 0.2, stream: true } : { model, messages, max_tokens: 2000, stream: true };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let buffer = '';
  let fullText = '';

  while (!done) {
    const chunkObj = await reader.read();
    done = chunkObj.done;
    if (chunkObj.value) {
      buffer += decoder.decode(chunkObj.value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') { done = true; break; }
        try {
          const obj = JSON.parse(dataStr);
          const deltaContent = obj.choices?.[0]?.delta?.content;
          if (typeof deltaContent === 'string' && deltaContent.length) {
            fullText += deltaContent;
            if (typeof onChunk === 'function') onChunk(deltaContent);
          }
        } catch (_) {
          // 忽略單筆解析錯誤，盡量不中斷整體串流
        }
      }
    }
  }

  if (!fullText) return '（無回應內容）';
  return fullText;
}

// OpenRouter：與 OpenAI 相容的 chat completions API，端點改為 openrouter.ai
async function callOpenRouter(key, model, prompt, imageBase64) {
  const messages = [];
  const content = [];
  content.push({ type: 'text', text: prompt });
  if (imageBase64 && imageBase64.startsWith('data:image/')) {
    content.push({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  messages.push({ role: 'user', content });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 2000 })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '（無回應內容）';
}

async function callOpenRouterStream(key, model, prompt, imageBase64, onChunk) {
  const messages = [];
  const content = [];
  content.push({ type: 'text', text: prompt });
  if (imageBase64 && imageBase64.startsWith('data:image/')) {
    content.push({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  messages.push({ role: 'user', content });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 2000, stream: true })
  });
  if (!res.ok || !res.body) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let buffer = '';
  let fullText = '';

  while (!done) {
    const chunkObj = await reader.read();
    done = chunkObj.done;
    if (chunkObj.value) {
      buffer += decoder.decode(chunkObj.value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') { done = true; break; }
        try {
          const obj = JSON.parse(dataStr);
          const deltaContent = obj.choices?.[0]?.delta?.content;
          if (typeof deltaContent === 'string' && deltaContent.length) {
            fullText += deltaContent;
            if (typeof onChunk === 'function') onChunk(deltaContent);
          }
        } catch (_) {}
      }
    }
  }

  if (!fullText) return '（無回應內容）';
  return fullText;
}

async function callGemini(key, model, prompt, imageBase64) {
  const parts = [{ text: prompt }];
  if (imageBase64 && imageBase64.startsWith('data:image/')) {
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
      parts.push({
        inlineData: {
          mimeType: mimeMatch[1],
          data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
        }
      });
    }
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '（無回應內容）';
}

/** OpenRouter 文生圖錯誤訊息加上中文說明（常見：模型 ID 錯誤、不存在的 :free 後綴） */
function formatOpenRouterImageError(apiMessage, modelId) {
  const m = (apiMessage || '').toString();
  let hint = '';
  if (/no endpoints found/i.test(m) || /not found/i.test(m)) {
    hint = ' 請至 openrouter.ai/models 篩選「可輸出 image」的模型，並使用列表上的完整模型 ID；勿自行加上不存在的 :free 後綴（例如 flux.2-pro:free 可能無免費端點）。';
  }
  return m + hint;
}

/**
 * 從 OpenRouter chat/completions 的 assistant message 取出圖片 data URL。
 * 新版 API 使用 message.images[]；舊版可能放在 message.content 陣列。
 */
function extractOpenRouterImageDataUrl(msg) {
  if (!msg) return null;
  const images = msg.images;
  if (Array.isArray(images) && images.length) {
    for (const img of images) {
      const url = img?.image_url?.url || img?.imageUrl?.url;
      if (url && typeof url === 'string' && url.startsWith('data:image/')) return url;
    }
  }
  if (msg.content) {
    const parts = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
    const imagePart = parts.find(p => p.type === 'image_url' && p.image_url?.url);
    const url = imagePart?.image_url?.url;
    if (url && url.startsWith('data:')) return url;
    const imagePart2 = parts.find(p => p.type === 'image' && p.image);
    const b64 = imagePart2?.image?.data ?? imagePart2?.image?.b64;
    if (b64) return (b64.startsWith('data:') ? b64 : 'data:image/png;base64,' + b64);
  }
  return null;
}

/**
 * 文生圖：依設定的供應商與模型，用 prompt 生成一張圖，回傳 data URL。
 * 支援：google（Imagen）、openai、openrouter。
 */
async function generateImageFromPrompt(prompt) {
  const provider = localStorage.getItem('ai.image.provider') || 'google';
  const geminiKey = (localStorage.getItem('ai.gemini.key') || '').trim();
  const openaiKey = (localStorage.getItem('ai.openai.key') || '').trim();
  const openrouterKey = (localStorage.getItem('ai.openrouter.key') || '').trim();
  const googleModel = localStorage.getItem('ai.image.google.model') || 'gemini-2.5-flash-image';
  const openaiModel = localStorage.getItem('ai.image.openai.model') || 'dall-e-2';
  const openrouterModel = (localStorage.getItem('ai.image.openrouter.model') || '').trim() || 'black-forest-labs/flux.2-pro';

  if (provider === 'google') {
    if (!geminiKey) throw new Error('請先在設定中填寫 Gemini API Key');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${googleModel}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt.slice(0, 4000) }] }],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData?.data);
    const b64 = imgPart?.inlineData?.data;
    if (!b64) throw new Error('未取得圖片資料（請確認此 API Key 有啟用生圖，且模型支援文生圖）');
    const mime = imgPart.inlineData?.mimeType || 'image/png';
    return `data:${mime};base64,` + b64;
  }

  if (provider === 'openai') {
    if (!openaiKey) throw new Error('請先在設定中填寫 OpenAI API Key');
    const size = openaiModel.toLowerCase() === 'dall-e-3' ? '1024x1024' : '1024x1024';
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: openaiModel,
        prompt: prompt.slice(0, 4000),
        n: 1,
        size,
        response_format: 'b64_json'
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('未取得圖片資料');
    return 'data:image/png;base64,' + b64;
  }

  if (provider === 'openrouter') {
    if (!openrouterKey) throw new Error('請先在設定中填寫 OpenRouter API Key');
    if (!openrouterModel) throw new Error('請在設定中填寫 OpenRouter 生圖模型 ID');
    const orHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openrouterKey}`,
      // fetch 的標頭值僅能含 ISO-8859-1（不可含中文），否則會拋錯
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://localhost',
      'X-Title': 'Business-Report-Writer'
    };
    const baseBody = {
      model: openrouterModel,
      messages: [{ role: 'user', content: prompt.slice(0, 4000) }]
    };
    // 先試僅輸出圖（FLUX 等），再試圖+文（Gemini 圖像模型等）
    const modalityVariants = [['image'], ['image', 'text']];
    for (let v = 0; v < modalityVariants.length; v++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: orHeaders,
        body: JSON.stringify({ ...baseBody, modalities: modalityVariants[v] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(formatOpenRouterImageError(data.error?.message || `HTTP ${res.status}`, openrouterModel));
      }
      const msg = data.choices?.[0]?.message;
      const dataUrl = extractOpenRouterImageDataUrl(msg);
      if (dataUrl) return dataUrl;
    }
    throw new Error('OpenRouter 有回應但未帶圖片。請至 openrouter.ai/models 篩選 output modalities 含 image 的模型，並確認模型 ID（勿使用不存在的 :free 後綴）。');
  }

  throw new Error('不支援的文生圖供應商，請選擇 Google / OpenAI / OpenRouter');
}

function htmlToPlainReferenceText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // 移除不必要節點，降低雜訊
  doc.querySelectorAll('script,style,noscript,svg,canvas,iframe').forEach(el => el.remove());
  const text = (doc.body?.innerText || '').replace(/\r\n/g, '\n');
  return text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 20000); // 控制長度，避免 prompt 過大
}

/**
 * 抓取網址內容轉成參考文字。
 * @param {string} urlInput - 網址
 * @param {{ cookie?: string }} [options] - 選填；cookie 字串用於需登入的頁面（跨網域時瀏覽器可能不允許帶入）
 */
async function fetchUrlAsReferenceText(urlInput, options = {}) {
  let url = (urlInput || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let normalized;
  try {
    normalized = new URL(url).toString();
  } catch {
    throw new Error('URL 格式不正確');
  }

  const cookieStr = (options.cookie || '').trim();

  const directTry = async () => {
    const headers = {};
    if (cookieStr) headers['Cookie'] = cookieStr;
    const r = await fetch(normalized, { method: 'GET', credentials: 'omit', headers: Object.keys(headers).length ? headers : undefined });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    const raw = await r.text();
    if (ct.includes('text/html')) return htmlToPlainReferenceText(raw);
    return raw.slice(0, 20000);
  };

  const proxyTry = async (proxyUrl) => {
    const r = await fetch(proxyUrl, { method: 'GET' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.text();
    // proxy 回傳通常是純文字，保守處理
    return raw.slice(0, 20000);
  };

  try {
    return await directTry();
  } catch (_) {
    // 多一層備援：無法直接抓跨網域時嘗試公開只讀代理
    try {
      return await proxyTry(`https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, '')}`);
    } catch {
      try {
        return await proxyTry(`https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`);
      } catch {
        throw new Error('無法抓取此網址（可能被網站阻擋跨網域或反爬蟲保護）');
      }
    }
  }
}

/* =============================================
   8. 設定
   ============================================= */

/**
 * 使用 OpenAI API Key 呼叫 GET /v1/models 取得官方模型列表，並填入下拉選單。
 * 僅保留適合 chat completions 的模型（id 為 gpt-*、o1*、o3* 等）。
 */
async function loadOpenAIModelsFromApi() {
  const key = ($('#settOpenaiKey').value || '').trim();
  const statusEl = $('#settOpenaiModelStatus');
  const selectEl = $('#settOpenaiModel');
  if (!key) {
    showToast('請先輸入 OpenAI API Key 再載入模型列表。', 'warning');
    if (statusEl) statusEl.textContent = '';
    return;
  }
  if (statusEl) statusEl.textContent = '';
  showToast('正在載入 OpenAI 模型列表…', 'info');
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const list = (data.data || []).map(m => m.id).filter(Boolean);
    // 只保留常用於 chat 的模型（gpt-*、o1*、o3* 等），排除 embedding、davinci 等
    const chatIds = list.filter(id => /^gpt-|^o\d|^o1-|^o3-/i.test(id));
    chatIds.sort();
    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    chatIds.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      selectEl.appendChild(opt);
    });
    if (statusEl) statusEl.textContent = '';
    if (chatIds.length === 0) {
      selectEl.innerHTML = '<option value="gpt-3.5-turbo">gpt-3.5-turbo（未取得列表時預設）</option>';
      showToast('此帳號無可用 chat 模型，已恢復預設選項。', 'warning');
    } else {
      try { localStorage.setItem('ai.openai.modelList', JSON.stringify(chatIds)); } catch (_) {}
      if (currentVal && chatIds.includes(currentVal)) selectEl.value = currentVal;
      else if (chatIds.length) selectEl.value = chatIds[0];
      showToast(`已載入 ${chatIds.length} 個模型`, 'success');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = '';
    showToast('載入模型列表失敗：' + err.message, 'error');
  }
}

/**
 * 使用 Gemini API Key 呼叫 GET v1beta/models 取得官方模型列表，並填入下拉選單。
 * 僅保留支援 generateContent 的模型。
 * 參考：https://ai.google.dev/api/models
 */
async function loadGeminiModelsFromApi() {
  const key = ($('#settGeminiKey').value || '').trim();
  const statusEl = $('#settGeminiModelStatus');
  const selectEl = $('#settGeminiModel');
  if (!key) {
    showToast('請先輸入 Gemini API Key 再載入模型列表。', 'warning');
    if (statusEl) statusEl.textContent = '';
    return;
  }
  if (statusEl) statusEl.textContent = '';
  showToast('正在載入 Gemini 模型列表…', 'info');
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const models = data.models || [];
    // 只保留支援 generateContent 的模型；name 格式為 "models/gemini-2.0-flash-001"
    const generateModels = models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'));
    const options = generateModels.map(m => ({
      value: (m.name || '').replace(/^models\//, ''),
      label: m.displayName || m.name || m.baseModelId || m.name
    }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    options.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label || value;
      selectEl.appendChild(opt);
    });
    if (statusEl) statusEl.textContent = '';
    if (options.length === 0) {
      selectEl.innerHTML = '<option value="gemini-2.5-flash">Gemini 2.5 Flash（未取得列表時預設）</option>';
      showToast('此帳號無可用 generateContent 模型，已恢復預設選項。', 'warning');
    } else {
      try { localStorage.setItem('ai.gemini.modelList', JSON.stringify(options)); } catch (_) {}
      const values = options.map(o => o.value);
      if (currentVal && values.includes(currentVal)) selectEl.value = currentVal;
      else if (values.length) selectEl.value = values[0];
      showToast(`已載入 ${options.length} 個模型`, 'success');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = '';
    showToast('載入模型列表失敗：' + err.message, 'error');
  }
}

/**
 * 使用 OpenRouter API Key 呼叫 GET /api/v1/models 取得模型列表並填入下拉選單。
 * 若 API 不支援則顯示錯誤，並保留現有選項。
 */
async function loadOpenRouterModelsFromApi() {
  const key = ($('#settOpenRouterKey').value || '').trim();
  const statusEl = $('#settOpenRouterModelStatus');
  const selectEl = $('#settOpenRouterModel');
  if (!key) {
    showToast('請先輸入 OpenRouter API Key 再載入模型列表。', 'warning');
    if (statusEl) statusEl.textContent = '';
    return;
  }
  if (statusEl) statusEl.textContent = '';
  showToast('正在載入 OpenRouter 模型列表…', 'info');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    // OpenRouter 回傳格式可能為 { data: [ { id, name, ... } ] } 或直接陣列
    const list = Array.isArray(data) ? data : (data.data || []);
    const options = list.map(m => ({
      value: m.id || m.name || m.model || '',
      label: m.name || m.id || m.model || ''
    })).filter(o => o.value);
    options.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    const currentVal = selectEl.value;
    selectEl.innerHTML = '';
    // 開頭保留常用免費選項
    const freeOpt = document.createElement('option');
    freeOpt.value = 'openrouter/free';
    freeOpt.textContent = 'openrouter/free（免費路由器）';
    selectEl.appendChild(freeOpt);
    options.forEach(({ value, label }) => {
      if (value === 'openrouter/free') return;
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label || value;
      selectEl.appendChild(opt);
    });
    const openRouterList = [{ value: 'openrouter/free', label: 'openrouter/free（免費路由器）' }, ...options.filter(o => o.value !== 'openrouter/free')];
    try { localStorage.setItem('ai.openrouter.modelList', JSON.stringify(openRouterList)); } catch (_) {}
    const firstVal = selectEl.options[0]?.value || 'openrouter/free';
    if (currentVal && Array.from(selectEl.options).some(o => o.value === currentVal)) selectEl.value = currentVal;
    else selectEl.value = firstVal;
    if (statusEl) statusEl.textContent = '';
    showToast(`已載入 ${options.length + 1} 個模型`, 'success');
  } catch (err) {
    if (statusEl) statusEl.textContent = '';
    showToast('載入模型列表失敗：' + err.message, 'error');
  }
}

/** 從 localStorage 還原模型下拉選單（若有儲存過列表） */
function restoreModelList(selectId, storageKey, defaultOptions, defaultModel) {
  const sel = $(selectId);
  if (!sel) return;
  let list = [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) list = JSON.parse(raw);
  } catch (_) {}
  if (Array.isArray(list) && list.length > 0) {
    sel.innerHTML = '';
    if (typeof list[0] === 'string') {
      list.forEach(id => { const o = document.createElement('option'); o.value = id; o.textContent = id; sel.appendChild(o); });
    } else {
      list.forEach(({ value, label }) => { const o = document.createElement('option'); o.value = value; o.textContent = label || value; sel.appendChild(o); });
    }
  } else if (defaultOptions && defaultOptions.length) {
    sel.innerHTML = '';
    defaultOptions.forEach(({ value, label }) => { const o = document.createElement('option'); o.value = value; o.textContent = label || value; sel.appendChild(o); });
  }
  const saved = storageKey === 'ai.openai.modelList' ? localStorage.getItem('ai.openai.model') : (storageKey === 'ai.gemini.modelList' ? localStorage.getItem('ai.gemini.model') : localStorage.getItem('ai.openrouter.model'));
  const want = (saved || defaultModel || '').trim();
  const has = Array.from(sel.options).some(o => o.value === want);
  if (want && has) sel.value = want;
  else if (sel.options.length) sel.value = sel.options[0].value;
}

function initSettings() {
  // 載入已儲存的設定
  const provider = localStorage.getItem('ai.provider') || 'openai';
  $('#settAiProvider').value = provider;
  $('#settOpenaiKey').value = localStorage.getItem('ai.openai.key') || '';
  $('#settOpenaiUseProxy').checked = localStorage.getItem('ai.openai.proxy.enabled') === 'true';
  $('#settOpenaiProxyUrl').value = localStorage.getItem('ai.openai.proxy.url') || 'https://ethgjxtnvldrzfqdyqvc.supabase.co/functions/v1/openai';
  $('#settOpenRouterKey').value = localStorage.getItem('ai.openrouter.key') || '';
  $('#settGeminiKey').value = localStorage.getItem('ai.gemini.key') || '';
  $('#settExportNameTemplate').value = localStorage.getItem('export.filename.template') || DEFAULT_EXPORT_NAME_TEMPLATE;

  // 還原模型下拉選單：若有先前載入並儲存的列表則用該列表，否則用預設選項；並確保有選中項（OpenRouter 若空白則選第一個）
  const openaiDefaults = [{ value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo（聊天／一般文字）' }, { value: 'gpt-3.5-turbo-instruct', label: 'gpt-3.5-turbo-instruct（指令式補完）' }];
  const openrouterDefaults = [{ value: 'openrouter/free', label: 'openrouter/free（免費路由器，自動選模型）' }, { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B（免費）' }, { value: 'google/gemini-2.0-flash-001:free', label: 'Gemini 2.0 Flash（免費）' }, { value: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1（免費）' }];
  const geminiDefaults = [{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }, { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }];
  restoreModelList('#settOpenaiModel', 'ai.openai.modelList', openaiDefaults, 'gpt-3.5-turbo');
  restoreModelList('#settOpenRouterModel', 'ai.openrouter.modelList', openrouterDefaults, 'openrouter/free');
  restoreModelList('#settGeminiModel', 'ai.gemini.modelList', geminiDefaults, 'gemini-2.5-flash');

  // 文生圖設定：載入並依供應商顯示對應區塊
  const imageProvider = localStorage.getItem('ai.image.provider') || 'google';
  $('#settImageProvider').value = imageProvider;
  $('#settImageGoogleModel').value = localStorage.getItem('ai.image.google.model') || 'gemini-2.5-flash-image';
  $('#settImageOpenaiModel').value = localStorage.getItem('ai.image.openai.model') || 'dall-e-2';
  $('#settImageOpenRouterModel').value = localStorage.getItem('ai.image.openrouter.model') || 'black-forest-labs/flux.2-pro';
  function updateImageProviderVisibility() {
    const p = $('#settImageProvider').value;
    const p2 = $('#settImageProvider').value;
    const map = { google: '#settImageGoogleGroup', openai: '#settImageOpenaiGroup', openrouter: '#settImageOpenRouterGroup' };
    Object.keys(map).forEach(k => {
      const el = $(map[k]);
      if (el) el.style.display = (k === p2 ? '' : 'none');
    });
  }
  updateImageProviderVisibility();
  $('#settImageProvider').addEventListener('change', updateImageProviderVisibility);

  // 依選擇的 AI 供應商顯示對應設定區塊
  function updateAiProviderVisibility() {
    const p = $('#settAiProvider').value;
    const openaiGrp = $('#settOpenaiGroup');
    const openrouterGrp = $('#settOpenRouterGroup');
    const geminiGrp = $('#settGeminiGroup');
    if (openaiGrp) openaiGrp.style.display = p === 'openai' ? '' : 'none';
    if (openrouterGrp) openrouterGrp.style.display = p === 'openrouter' ? '' : 'none';
    if (geminiGrp) geminiGrp.style.display = p === 'gemini' ? '' : 'none';
  }
  updateAiProviderVisibility();
  $('#settAiProvider').addEventListener('change', updateAiProviderVisibility);

  const exportPreviewEl = $('#settExportNamePreview');
  const updateExportPreview = () => {
    if (!exportPreviewEl) return;
    const tpl = ($('#settExportNameTemplate').value || '').trim() || DEFAULT_EXPORT_NAME_TEMPLATE;
    const name = buildExportBaseNameFromTemplate(tpl);
    exportPreviewEl.textContent = `預覽：${name}.pdf`;
  };
  updateExportPreview();
  $('#settExportNameTemplate').addEventListener('input', updateExportPreview);

  // 載入各供應商官方最新模型列表（需先輸入對應 API Key）
  $('#settOpenaiLoadModels').addEventListener('click', () => loadOpenAIModelsFromApi());
  $('#settOpenRouterLoadModels').addEventListener('click', () => loadOpenRouterModelsFromApi());
  $('#settGeminiLoadModels').addEventListener('click', () => loadGeminiModelsFromApi());

  // 儲存 AI 設定（含文生圖）
  $('#settSaveAi').addEventListener('click', () => {
    localStorage.setItem('ai.provider', $('#settAiProvider').value);
    localStorage.setItem('ai.openai.key', $('#settOpenaiKey').value.trim());
    localStorage.setItem('ai.openai.model', $('#settOpenaiModel').value);
    localStorage.setItem('ai.openai.proxy.enabled', $('#settOpenaiUseProxy').checked ? 'true' : 'false');
    localStorage.setItem('ai.openai.proxy.url', ($('#settOpenaiProxyUrl').value || '').trim());
    localStorage.setItem('ai.openrouter.key', $('#settOpenRouterKey').value.trim());
    localStorage.setItem('ai.openrouter.model', $('#settOpenRouterModel').value);
    localStorage.setItem('ai.gemini.key', $('#settGeminiKey').value.trim());
    localStorage.setItem('ai.gemini.model', $('#settGeminiModel').value);
    localStorage.setItem('ai.image.provider', $('#settImageProvider').value);
    localStorage.setItem('ai.image.google.model', $('#settImageGoogleModel').value);
    localStorage.setItem('ai.image.openai.model', $('#settImageOpenaiModel').value);
    localStorage.setItem('ai.image.openrouter.model', ($('#settImageOpenRouterModel').value || '').trim());
    showToast('AI 設定已儲存！', 'success');
  });

  // 主辦人清單
  const savedHosts = localStorage.getItem('hosts.list');
  const hosts = savedHosts ? JSON.parse(savedHosts) : DEFAULT_HOSTS;
  $('#settHostList').value = hosts.join('\n');

  $('#settSaveHosts').addEventListener('click', () => {
    const lines = $('#settHostList').value.split('\n').map(l => l.trim()).filter(Boolean);
    localStorage.setItem('hosts.list', JSON.stringify(lines));
    populateHostSelect(lines);
    showToast('主辦人清單已儲存！', 'success');
  });

  $('#settSaveExportName').addEventListener('click', () => {
    const tpl = ($('#settExportNameTemplate').value || '').trim() || DEFAULT_EXPORT_NAME_TEMPLATE;
    localStorage.setItem('export.filename.template', tpl);
    showToast(`匯出檔名設定已儲存！\n目前範例：${buildExportBaseName()}.pdf`, 'success');
  });

  // 恢復草稿還原提示（讓曾勾選「不再顯示」的使用者可在介面內反悔）
  $('#settRestoreDraftPrompt').addEventListener('click', () => {
    try {
      localStorage.removeItem(DONT_ASK_RESTORE_DRAFT_KEY);
    } catch (_) {}
    showToast('已恢復，下次有草稿時會再詢問。', 'success');
  });

  // 初始填入主辦人下拉
  populateHostSelect(hosts);
}

function populateHostSelect(hosts) {
  const sel = $('#slideHostSelect');
  const current = sel.value;
  sel.innerHTML = '<option value="">— 請選擇 —</option>';
  hosts.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

/* =============================================
   9. 匯出 / 匯入 JSON
   ============================================= */

function initExportImport() {
  // 匯出 JSON
  $('#btnExportJson').addEventListener('click', () => {
    saveCurrentSlide();
    const data = exportToJSON();
    let filename = ($('#slideHostText').value || '').trim();
    filename = filename ? filename.replace(/[\\\/:*?"<>|]/g, '_') : 'slides';
    downloadFile(`${filename}.json`, data);
  });

  // 載入 JSON
  $('#btnLoadJson').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      if (!obj?.slides || !Array.isArray(obj.slides)) throw new Error('JSON 格式錯誤：缺少 slides 陣列');
      loadSlidesIntoEditor(obj.slides);
      saveDraftToStorage();
    } catch (err) {
      showToast('載入失敗：' + err.message, 'error');
    }
    e.target.value = '';
  });
}

// 將 slides 陣列載入編輯器
function loadSlidesIntoEditor(rawSlides) {
  state.slides = rawSlides.map(s => normalizeSlideForPreview(s));
  state.currentSlide = 0;
  renderSlideList();
  loadSlideToCanvas(0);

  // 設定全域主辦人
  const firstHost = state.slides[0]?.host || '';
  if (firstHost) {
    $('#slideHostText').value = firstHost;
    const sel = $('#slideHostSelect');
    for (const opt of sel.options) {
      if (opt.value === firstHost.split('/')[0].trim()) { sel.value = opt.value; break; }
    }
  }
}

// 匯出為 JSON（同時產生新舊格式以向後相容）
function exportToJSON() {
  const slides = state.slides.map(slide => {
    const out = {
      title: slide.title || '',
      host: slide.host || '',
      elements: slide.elements || []
    };

    // 產生舊格式欄位（向後相容）
    const textEls = (slide.elements || []).filter(e => e.type === 'text');
    const byPreset = {};
    textEls.forEach(el => { if (el.preset) byPreset[el.preset] = el.content || ''; });

    out.line1 = byPreset.reason || '';
    out.line2 = byPreset.target || '';
    out.line3 = byPreset.situation || '';
    out.line4 = byPreset.performance || '';
    out.line5 = byPreset.followup || '';

    // 圖片（取第一張）
    const imgEl = (slide.elements || []).find(e => e.type === 'image' && e.imageData);
    if (imgEl) out.imageData = imgEl.imageData;

    return out;
  });

  return { slides };
}

/* =============================================
   草稿自動儲存（localStorage）
   ============================================= */

/**
 * 將目前 state.slides 與 currentSlide 寫入 localStorage（只保留最近一版）。
 * 會先同步畫布到 state，再寫入；若沒有任何投影片則不寫入。
 */
function saveDraftToStorage() {
  saveCurrentSlide();
  if (state.slides.length === 0) return;
  const payload = { slides: state.slides, currentSlide: state.currentSlide };
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // 容量滿或私密模式可能拋錯，忽略
  }
}

/** 不再詢問草稿還原的 localStorage 鍵名 */
const DONT_ASK_RESTORE_DRAFT_KEY = '業務會報.dontAskRestoreDraft';

/**
 * 頁面載入時嘗試還原上次草稿。若有草稿則以 Modal 詢問「是否還原上次草稿？」（可選「不再顯示」），
 * 確認則載入並回傳 true；取消則清除草稿並回傳 false。無草稿或解析失敗回傳 false。
 * 非同步，回傳 Promise<boolean>。
 */
async function tryRestoreDraft() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return false;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return false;
  }
  if (!payload || !Array.isArray(payload.slides) || payload.slides.length === 0) return false;

  const skipped = getConfirmSkippedChoice(DONT_ASK_RESTORE_DRAFT_KEY);
  if (skipped === 'never') {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return false;
  }
  if (skipped === 'always') {
    // 先前選過「不再顯示」且選確定 → 直接還原
    state.slides = payload.slides.map(s => normalizeSlideForPreview(s));
    state.currentSlide = Math.max(0, Math.min(payload.currentSlide || 0, state.slides.length - 1));
    renderSlideList();
    loadSlideToCanvas(state.currentSlide);
    const firstHost = state.slides[0]?.host || '';
    if (firstHost) {
      $('#slideHostText').value = firstHost;
      const sel = $('#slideHostSelect');
      for (const opt of sel.options) {
        if (opt.value === firstHost.split('/')[0].trim()) { sel.value = opt.value; break; }
      }
    }
    return true;
  }

  const ok = await showConfirm({
    title: '還原草稿',
    message: '偵測到上次未儲存的草稿，是否要還原？',
    confirmText: '還原',
    cancelText: '不還原',
    dontShowAgainKey: DONT_ASK_RESTORE_DRAFT_KEY
  });
  if (!ok) {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return false;
  }
  state.slides = payload.slides.map(s => normalizeSlideForPreview(s));
  state.currentSlide = Math.max(0, Math.min(payload.currentSlide || 0, state.slides.length - 1));
  renderSlideList();
  loadSlideToCanvas(state.currentSlide);
  const firstHost = state.slides[0]?.host || '';
  if (firstHost) {
    $('#slideHostText').value = firstHost;
    const sel = $('#slideHostSelect');
    for (const opt of sel.options) {
      if (opt.value === firstHost.split('/')[0].trim()) { sel.value = opt.value; break; }
    }
  }
  return true;
}

/* =============================================
   10. 初始化
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.setAttribute('data-preview-theme', state.previewTheme);
  initSidebar();
  initEditorToolbar();
  initSlideThumbnailCapture();
  initCanvasDragDrop();
  initPreview();
  initCombine();
  initAI();
  initSettings();
  initExportImport();
  fitCanvas();

  // 先嘗試還原上次草稿（非同步 Modal，不擋住頁面繪製）；若無草稿或使用者選擇不還原，且目前沒有投影片，才初始化空白一頁
  const restored = await tryRestoreDraft();
  if (!restored && state.slides.length === 0) initSlides();

  // 定時每 30 秒寫入草稿
  setInterval(saveDraftToStorage, 30000);
  // 關閉分頁／重新整理前寫入草稿
  window.addEventListener('beforeunload', saveDraftToStorage);
});
