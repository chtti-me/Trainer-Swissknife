/**
 * 【TIS Bookmarklet 載入端點】GET
 *
 * 回傳一段「在 tis.cht.com.tw 上執行」的 JavaScript：
 *   - 檢查 hostname；非 tis.cht.com.tw 則 alert 並退出
 *   - 在頁面右上角彈出懸浮面板（年份、月份、department 選擇 + 開始按鈕）
 *   - 同源 fetch 多個月份的 OpenClass_ClassList2.jsp（瀏覽器自動帶 TIS session cookie）
 *   - 進度條顯示
 *   - 完成後動態建 form auto-submit 到 /api/sync/tis/bookmarklet-receive
 *     （form submit + target=_blank 不受 CORS 限制，且瀏覽器會帶我們 domain 的 next-auth cookie）
 *
 * 為什麼不用 fetch 跨域 POST？
 *   1. 跨域要設 Allow-Credentials + Allow-Origin（不能是 *），且 next-auth cookie 是 SameSite=Lax，
 *      跨站 fetch 帶 cookie 在 Lax 下會被瀏覽器擋
 *   2. Form submit + target=_blank 是 navigation，瀏覽器一定會帶該 domain 的 cookie（Lax 允許），
 *      不需要任何 server 端 CORS 設定
 *
 * 安全：
 *   - 此檔不需要登入即可取得（純靜態 JS）；真正的權限檢查在 receive endpoint
 *   - 雖然第三方理論上可以從別的 domain 載這份 JS，但執行時 hostname check 會擋
 */
import { NextRequest, NextResponse } from "next/server";

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

export async function GET(req: NextRequest) {
  const appOrigin = getAppOrigin(req);
  const receiveUrl = `${appOrigin}/api/sync/tis/bookmarklet-receive`;
  // 注意：以下 JS 字串以模板字面值寫成；任何含有 `${}` 的子表達式都會被 TS 內插，
  // 真正要在 client JS 內保留的字串請用 `\${}` 或字串拼接。
  const js = buildBookmarkletScript({ receiveUrl, appOrigin });

  return new NextResponse(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // 短 TTL：方便我們改完後使用者下次點馬上拿新版
      "cache-control": "public, max-age=60",
      // 允許從 tis.cht.com.tw 用 <script> 載入（其實 script 本來就不受 CORS 限制，加上保險）
      "access-control-allow-origin": "*",
    },
  });
}

function buildBookmarkletScript(opts: { receiveUrl: string; appOrigin: string }): string {
  // 為了避免 TS 模板字串和 client JS 模板字串混亂，這段全部用普通字串拼接。
  return (
    "/* trainer-swissknife TIS bookmarklet loader: " +
    new Date().toISOString() +
    " */\n" +
    "(function(){\n" +
    "  var APP_ORIGIN = " + JSON.stringify(opts.appOrigin) + ";\n" +
    "  var RECEIVE_URL = " + JSON.stringify(opts.receiveUrl) + ";\n" +
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
    "      return fetch(url, { credentials: 'include' })\n" +
    "        .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })\n" +
    "        .then(function(text){\n" +
    "          var sizeKb = Math.round(text.length / 1024);\n" +
    "          results.push({ name: year + '_' + mm + '_dept' + dept + '.html', content: text, sizeKb: sizeKb });\n" +
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
    "  function submitToReceive(results) {\n" +
    "    var form = document.createElement('form');\n" +
    "    form.method = 'POST';\n" +
    "    form.action = RECEIVE_URL;\n" +
    "    form.target = '_blank';\n" +
    "    form.enctype = 'application/x-www-form-urlencoded';\n" +
    "    form.style.display = 'none';\n" +
    "    var payload = JSON.stringify({\n" +
    "      items: results,\n" +
    "      ua: navigator.userAgent,\n" +
    "      sourceUrl: location.href\n" +
    "    });\n" +
    "    var input = document.createElement('input');\n" +
    "    input.type = 'hidden';\n" +
    "    input.name = 'payload';\n" +
    "    input.value = payload;\n" +
    "    form.appendChild(input);\n" +
    "    document.body.appendChild(form);\n" +
    "    form.submit();\n" +
    "    form.remove();\n" +
    "    log('✅ 已開新分頁送出，請切到該分頁確認匯入。', '#059669');\n" +
    "    var btn = document.getElementById('tswk-go');\n" +
    "    btn.textContent = '已送出（可關閉本面板）';\n" +
    "    btn.style.background = '#059669';\n" +
    "  }\n" +
    "})();\n"
  );
}
