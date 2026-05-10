/**
 * 【TIS Bookmarklet 載入端點】GET
 *
 * 重要變更（v2）：
 *   原本依賴 receive 端用 next-auth cookie 認證 → 跨站 form POST 時 SameSite=Lax 不會帶 cookie，
 *   結果使用者收到「未授權」。改為「個人 token 認證」：
 *     1. 此 endpoint 必須登入；未登入時回傳一段 alert 用的 JS（防呆，但不會打斷 dev 流程）
 *     2. 從 DB 取出（或新建）當前使用者的 user.bookmarkletToken
 *     3. 把 token 嵌進回傳 JS 的 form payload；receive 用 token 認證
 *
 * 安全：
 *   - 此 JS 為「個人化」內容（含個人 token），所以 cache-control 改為 private + 0 秒
 *   - 第三方雖可能誘導使用者把書籤拖出去，但 hostname check 仍會擋住非 TIS 頁面執行
 *
 * 流程（client 端）：
 *   - 檢查 hostname；非 tis.cht.com.tw 則 alert 並退出
 *   - 在頁面右上角彈出懸浮面板（年份、月份、department 選擇 + 開始按鈕）
 *   - 同源 fetch 多個月份的 OpenClass_ClassList2.jsp（瀏覽器自動帶 TIS session cookie）
 *   - 進度條顯示
 *   - 完成後動態建 form auto-submit 到 /api/sync/tis/bookmarklet-receive
 *     （form submit + target=_blank 是 navigation，不受 CORS 擋；
 *      因為改用 token，所以也不再需要 cookie）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureBookmarkletToken } from "@/lib/tis/bookmarklet-token";

export const dynamic = "force-dynamic";

function getAppOrigin(req: NextRequest): string {
  // 優先用 env 設定（Render 部署版需要設 NEXTAUTH_URL=https://trainer-swissknife.onrender.com）
  const fromEnv = process.env.NEXTAUTH_URL || process.env.APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // 退路：從 request headers 推
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function loginRequiredScript(appOrigin: string): string {
  return (
    "(function(){\n" +
    "  alert('⚠️ 請先在 trainer-swissknife 登入後，再到「系統設定」頁面重新拖書籤到書籤列。\\n\\n登入頁：' + " +
    JSON.stringify(`${appOrigin}/signin`) +
    ");\n" +
    "  try { window.open(" +
    JSON.stringify(`${appOrigin}/signin`) +
    ", '_blank'); } catch(e) {}\n" +
    "})();\n"
  );
}

export async function GET(req: NextRequest) {
  const appOrigin = getAppOrigin(req);
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let js: string;
  if (!userId) {
    js = loginRequiredScript(appOrigin);
  } else {
    const token = await ensureBookmarkletToken(userId);
    const receiveUrl = `${appOrigin}/api/sync/tis/bookmarklet-receive`;
    js = buildBookmarkletScript({ receiveUrl, appOrigin, token });
  }

  return new NextResponse(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // 個人 token 內容不可被 CDN / proxy 共用
      "cache-control": "private, no-store, max-age=0",
      "access-control-allow-origin": "*",
    },
  });
}

function buildBookmarkletScript(opts: { receiveUrl: string; appOrigin: string; token: string }): string {
  // 為了避免 TS 模板字串和 client JS 模板字串混亂，這段全部用普通字串拼接。
  return (
    "/* trainer-swissknife TIS bookmarklet loader: " +
    new Date().toISOString() +
    " */\n" +
    "(function(){\n" +
    "  var APP_ORIGIN = " + JSON.stringify(opts.appOrigin) + ";\n" +
    "  var RECEIVE_URL = " + JSON.stringify(opts.receiveUrl) + ";\n" +
    "  var BOOKMARKLET_TOKEN = " + JSON.stringify(opts.token) + ";\n" +
    "  var EXISTING = document.getElementById('trainer-swissknife-tis-grabber');\n" +
    "  if (EXISTING) { EXISTING.remove(); }\n" +
    "  if (!/(^|\\.)tis\\.cht\\.com\\.tw$/.test(location.hostname)) {\n" +
    "    alert('⚠️ 請先在 TIS（tis.cht.com.tw）登入並開啟任一頁面，再點此書籤。\\n\\n目前頁面是：' + location.hostname);\n" +
    "    return;\n" +
    "  }\n" +
    "  var panel = document.createElement('div');\n" +
    "  panel.id = 'trainer-swissknife-tis-grabber';\n" +
    "  panel.style.cssText = 'position:fixed;top:20px;right:20px;width:380px;background:#fff;border:2px solid #2563eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.25);padding:16px;z-index:2147483647;font-family:system-ui,sans-serif;font-size:13px;color:#0f172a;line-height:1.5';\n" +
    "  var thisYearROC = (new Date().getFullYear() - 1911);\n" +
    "  var defaultYear = new Date().getFullYear();\n" +
    "  panel.innerHTML = ''+\n" +
    "    '<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px\">' +\n" +
    "    '  <h3 style=\"margin:0;font-size:15px;font-weight:600;color:#1e40af\">📚 培訓師瑞士刀 — TIS 同步</h3>' +\n" +
    "    '  <button id=tswk-close style=\"background:none;border:none;font-size:18px;cursor:pointer;color:#64748b;padding:0 4px\">×</button>' +\n" +
    "    '</div>' +\n" +
    "    '<p style=\"margin:0 0 12px;font-size:12px;color:#475569\">將從 TIS 抓取「開班計畫表」全年 12 月份，回傳到 trainer-swissknife。</p>' +\n" +
    "    '<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px\">' +\n" +
    "    '  <label style=\"font-size:12px\">年份（西元）<input id=tswk-year type=number value=' + defaultYear + ' min=2020 max=2099 style=\"width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;margin-top:2px\"></label>' +\n" +
    "    '  <label style=\"font-size:12px\">院所代碼<select id=tswk-dept style=\"width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;margin-top:2px\">' +\n" +
    "    '    <option value=P selected>P 院本部（板橋）</option>' +\n" +
    "    '    <option value=T>T 台中所</option>' +\n" +
    "    '    <option value=K>K 高雄所</option>' +\n" +
    "    '    <option value=E>E 全 e 課程</option>' +\n" +
    "    '  </select></label>' +\n" +
    "    '</div>' +\n" +
    "    '<label style=\"display:block;font-size:12px;margin-bottom:8px\">月份範圍：' +\n" +
    "    '  <span style=\"display:inline-flex;align-items:center;gap:4px;margin-left:6px\">' +\n" +
    "    '    <input id=tswk-mfrom type=number value=1 min=1 max=12 style=\"width:50px;padding:4px;border:1px solid #cbd5e1;border-radius:4px\"> ~' +\n" +
    "    '    <input id=tswk-mto type=number value=12 min=1 max=12 style=\"width:50px;padding:4px;border:1px solid #cbd5e1;border-radius:4px\">' +\n" +
    "    '  </span>' +\n" +
    "    '</label>' +\n" +
    "    '<button id=tswk-go style=\"width:100%;padding:8px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px\">開始抓取</button>' +\n" +
    "    '<div id=tswk-progress style=\"margin-top:10px;font-size:12px;color:#475569;max-height:160px;overflow:auto\"></div>' +\n" +
    "    '<p style=\"margin:10px 0 0;font-size:11px;color:#94a3b8\">登入帳號：' + (document.body.innerText.match(/使用者[:：]\\s*[^\\s\\)（]+/) || ['(未顯示)'])[0] + '<br>抓取後將開啟新分頁送回 ' + APP_ORIGIN + '</p>';\n" +
    "  document.body.appendChild(panel);\n" +
    "  document.getElementById('tswk-close').onclick = function(){ panel.remove(); };\n" +
    "  document.getElementById('tswk-go').onclick = function(){ runFetch(); };\n" +
    "\n" +
    "  function log(html, color) {\n" +
    "    var d = document.createElement('div');\n" +
    "    d.innerHTML = html;\n" +
    "    if (color) d.style.color = color;\n" +
    "    document.getElementById('tswk-progress').appendChild(d);\n" +
    "    document.getElementById('tswk-progress').scrollTop = 99999;\n" +
    "  }\n" +
    "\n" +
    "  function runFetch() {\n" +
    "    var btn = document.getElementById('tswk-go');\n" +
    "    btn.disabled = true; btn.style.background = '#94a3b8'; btn.textContent = '抓取中…';\n" +
    "    var year = parseInt(document.getElementById('tswk-year').value, 10);\n" +
    "    var dept = document.getElementById('tswk-dept').value;\n" +
    "    var mFrom = Math.max(1, Math.min(12, parseInt(document.getElementById('tswk-mfrom').value, 10)));\n" +
    "    var mTo   = Math.max(mFrom, Math.min(12, parseInt(document.getElementById('tswk-mto').value, 10)));\n" +
    "    var months = []; for (var m = mFrom; m <= mTo; m++) months.push(m);\n" +
    "    log('將抓 ' + months.length + ' 個月份（' + year + '/' + mFrom + '~' + mTo + '，dept=' + dept + '）…');\n" +
    "    var results = []; var doneCount = 0;\n" +
    "    var promises = months.map(function(mm){\n" +
    "      var url = 'https://tis.cht.com.tw/jap/OpenClass/OpenClass_ClassList2.jsp?yy=' + year + '&mm=' + mm + '&department=' + dept;\n" +
    // 改用 arrayBuffer：保留原始 byte，不做 UTF-8 解碼。
    // 原因：TIS 多頁面為 Big5 / windows-950 編碼，r.text() 會用 UTF-8 解碼，
    // 一旦遇到非 UTF-8 序列就會插入 U+FFFD 或破壞 backslash 結構，導致後續 JSON.stringify 產出
    // 不合法的 escape（用戶實測：「Bad escaped character at position 2665」）。
    // 改成 ArrayBuffer + Blob 可完整把 raw bytes 送回 server，由 cheerio 解析時自行偵測 charset。
    "      return fetch(url, { credentials: 'include' })\n" +
    "        .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })\n" +
    "        .then(function(buf){\n" +
    "          var sizeKb = Math.round(buf.byteLength / 1024);\n" +
    "          results.push({ name: year + '_' + mm + '_dept' + dept + '.html', buf: buf, sizeKb: sizeKb });\n" +
    "          doneCount++;\n" +
    "          log('✔ ' + year + '/' + mm + ' 抓回 ' + sizeKb + ' KB（' + doneCount + '/' + months.length + '）', '#059669');\n" +
    "        })\n" +
    "        .catch(function(err){\n" +
    "          doneCount++;\n" +
    "          log('✖ ' + year + '/' + mm + ' 失敗：' + err.message + '（' + doneCount + '/' + months.length + '）', '#dc2626');\n" +
    "        });\n" +
    "    });\n" +
    "    Promise.allSettled(promises).then(function(){\n" +
    "      if (results.length === 0) { btn.textContent = '全失敗'; btn.style.background = '#dc2626'; return; }\n" +
    "      log('───────', '#94a3b8');\n" +
    "      log('共抓回 ' + results.length + ' 份 HTML，正在送往 ' + APP_ORIGIN + ' …');\n" +
    "      submitToReceive(results);\n" +
    "    });\n" +
    "  }\n" +
    "\n" +
    // 改成 fetch + FormData + Blob：每個 HTML 一個 multipart part，binary safe，完全跳過 JSON 字串化。
    // 用 fetch 而不是 form auto-submit，是為了能拿到 server 回應 stagingId 並 window.open 帶過去。
    // 跨站 fetch POST + multipart/form-data 是 simple request（不需 preflight）；
    // 但要讀 response 必須 server 回 Access-Control-Allow-Origin。
    "  function submitToReceive(results) {\n" +
    "    var btn = document.getElementById('tswk-go');\n" +
    "    btn.textContent = '送出中…';\n" +
    "    var fd = new FormData();\n" +
    "    fd.append('token', BOOKMARKLET_TOKEN);\n" +
    "    fd.append('ua', navigator.userAgent);\n" +
    "    fd.append('sourceUrl', location.href);\n" +
    "    for (var i = 0; i < results.length; i++) {\n" +
    "      var r = results[i];\n" +
    "      var blob = new Blob([r.buf], { type: 'text/html' });\n" +
    "      fd.append('html', blob, r.name);\n" +
    "    }\n" +
    "    fetch(RECEIVE_URL, {\n" +
    "      method: 'POST',\n" +
    "      body: fd,\n" +
    "      mode: 'cors',\n" +
    // 不要帶 cookie：跨站帶 cookie 在 SameSite=Lax 下會被擋；token 已在 form 內
    "      credentials: 'omit'\n" +
    "    })\n" +
    "      .then(function(res){\n" +
    "        return res.text().then(function(text){\n" +
    "          return { ok: res.ok, status: res.status, body: text };\n" +
    "        });\n" +
    "      })\n" +
    "      .then(function(out){\n" +
    "        if (!out.ok) {\n" +
    "          log('✖ 送出失敗 HTTP ' + out.status, '#dc2626');\n" +
    "          log(out.body.slice(0, 400), '#94a3b8');\n" +
    "          btn.textContent = '送出失敗'; btn.style.background = '#dc2626';\n" +
    "          return;\n" +
    "        }\n" +
    "        var data = null; try { data = JSON.parse(out.body); } catch(e) {}\n" +
    "        var stagingId = data && data.stagingId;\n" +
    "        if (!stagingId) {\n" +
    "          log('✖ server 回應缺少 stagingId：' + out.body.slice(0, 200), '#dc2626');\n" +
    "          btn.textContent = '送出失敗'; btn.style.background = '#dc2626';\n" +
    "          return;\n" +
    "        }\n" +
    "        log('✅ 已送出，正在開新分頁進入 /sync …', '#059669');\n" +
    "        window.open(APP_ORIGIN + '/sync?tisStagingId=' + encodeURIComponent(stagingId), '_blank');\n" +
    "        btn.textContent = '已送出（可關閉本面板）';\n" +
    "        btn.style.background = '#059669';\n" +
    "      })\n" +
    "      .catch(function(err){\n" +
    "        log('✖ 送出時錯誤：' + err.message, '#dc2626');\n" +
    "        btn.textContent = '送出失敗'; btn.style.background = '#dc2626';\n" +
    "      });\n" +
    "  }\n" +
    "})();\n"
  );
}
