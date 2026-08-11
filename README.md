# Threads Plugin

Threads Plugin 是一支用於 Threads 網頁版的 userscript，提供圖片與影片下載、批次資源選擇、貼文文字複製，以及去除追蹤碼的連結複製功能。

## 功能

- 下載單張圖片。
- 下載單支影片。
- 在貼文詳情頁批次選擇並下載圖片與影片；預設不勾選資源，可手動挑選或直接下載全部。
- 複製每個貼文 block 的本文內容。
- 複製去除追蹤碼後的貼文連結。
- 在 Threads 原生分享選單中加入「複製連結（去追蹤碼）」。
- 支援引用貼文辨識，避免外層與內層貼文互相抓錯。
- 清理長文、多節點、翻譯文字、tag 與輪播計數等非本文內容。

## 安裝

1. 安裝 userscript 管理器，例如 Tampermonkey、Violentmonkey 或 FireMonkey。
2. 開啟 GitHub Raw URL：

   ```text
   https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js
   ```

3. 依照 userscript 管理器提示安裝或更新腳本。
4. 重新整理 Threads 網頁版。

從上述 GitHub Raw URL 安裝時，Tampermonkey 等 userscript 管理器會依照腳本內的 `@updateURL` 與 `@downloadURL` 定期檢查更新。發布新版時必須同步提高 `@version`，管理器才會辨識為新版本。從 Greasy Fork 安裝的版本則由 Greasy Fork 提供更新來源。

## 支援網站

- `https://www.threads.com/*`
- `https://threads.com/*`
- `https://www.threads.net/*`
- `https://threads.net/*`

## 權限說明

本腳本需要以下 userscript 權限：

- `GM_addStyle`：插入下載、複製按鈕與 modal 需要的樣式。
- `GM_download`：下載圖片與影片。
- `GM_xmlhttpRequest`：通過媒體 URL 安全檢查後，讀取允許網域上的 Threads、Instagram、CDN Instagram 與 FBCDN 媒體資源。
- `GM_getValue` / `GM_setValue`：儲存本機腳本設定。
- `GM_registerMenuCommand` / `GM_unregisterMenuCommand`：提供 userscript 管理器選單設定。
- `GM_setClipboard`：在使用者主動點擊時複製文字或連結。
- `unsafeWindow`：掛載必要的網頁環境監聽，以辨識媒體與分享選單。

`@connect` 已限制於 Threads、Instagram、CDN Instagram 與 FBCDN 相關網域，不使用萬用 `@connect *`。

## 隱私

- 不會使用 `sendBeacon`。
- 不會讀取 `document.cookie`。
- 不會使用 `localStorage` 或 `sessionStorage`。
- 不含 analytics 或 tracking。
- 不使用 `eval` 或 `new Function`。
- 不會遠端載入外部 JavaScript。
- 只有在使用者主動點擊複製功能時，才會把貼文文字或連結寫入剪貼簿。
- `GM_getValue` / `GM_setValue` 僅用於儲存腳本設定。
- 在非敏感頁面上，腳本會讀取畫面中既有的媒體元素，以及含明確媒體欄位、大小不超過 2 MiB 的內嵌 JSON hydration script；只解析結構化的貼文／媒體欄位，不以全文字串距離猜測貼文歸屬，也不會把內容傳送出去。
- 為了從 Threads 回應中辨識貼文媒體，腳本會觀察頁面既有的 `fetch` / XHR；只處理已知 Threads endpoint／operation、明確的 JSON 或文字 MIME 與有限大小的回應，不掃描私訊、登入、帳號或設定頁面的敏感回應，也不會把回應另行傳送到外部服務。
- 公開 CDN 媒體的 blob 下載使用 `anonymous: true`，不附帶 Threads／Instagram cookies；下載失敗時不會悄悄改成帶登入憑證的請求。
- 開啟媒體下載視窗時，若 Threads 沒有提供影片 poster，腳本會以已通過安全檢查的影片 URL 載入少量 metadata／首幀作為縮圖，並依原始尺寸呈現直向、橫向或方形比例；不會自動播放影片。

## 已知限制

- Threads 介面與 DOM 結構更新時，按鈕定位、貼文辨識或媒體抓取可能需要跟進調整。
- 若圖片或影片下載失敗，可能是 Threads 新增了 CDN 網域，需要更新 `@connect`。
- 受瀏覽器、userscript 管理器與來源站台限制影響，部分媒體可能無法直接下載。
- 公開 CDN 的 `anonymous: true` 行為仍需在真實 Tampermonkey 與 Threads CDN 上驗證；自動化測試會驗證請求設定、final URL／MIME、進度感知 watchdog 與永不 callback 的收斂行為，但不能取代實際管理器與 CDN 傳輸測試。
- `GM_download` 路徑會在呼叫前驗證原始 URL，但重新導向後的最終 URL 與憑證政策由實際 userscript 管理器控制；anonymous blob fallback 會另行驗證 final URL 與 MIME。這項差異需列入真實 Tampermonkey 驗證，不能假設所有管理器行為相同。
- 私人或存取受限媒體可能確實需要登入 cookies，這是待實機確認的例外需求。確認前腳本不自動發送帶 cookies 的跨網域下載；若日後必須支援，應將例外限縮到明確 endpoint／網域，另加測試並在此揭露。

## 開發驗證

使用 Node.js 檢查 userscript 語法：

```powershell
node --check .\threads-plugin.user.js
```

執行靜態核心功能與 metadata 檢查；verifier 會從 `package.json` 讀取版本，核對 `@version` 與 loaded log，並精確比對 `@grant`、`@connect`、`@match` allowlist：

```powershell
node .\scripts\verify-threads-plugin.mjs
```

執行媒體 URL、可信使用者操作、貼文／引用媒體隔離、SPA route、下載 watchdog／MIME、批次鎖與 metadata allowlist 回歸測試：

```powershell
node --test
```

也可以一次執行全部驗證：

```powershell
npm.cmd run verify
```

上架前建議手動確認：

- Threads 主文單張圖片下載。
- Threads 主文影片下載。
- 批次下載 modal。
- 複製本文。
- 複製無追蹤碼連結。
- 分享選單複製後是否自動關閉。
- 引用貼文內層文章是否可正常複製與下載。

## 發布維護建議

- 版本異動與安全／相容性說明請見 [CHANGELOG.md](CHANGELOG.md)。
- 建議發布前同步核對 `package.json`、userscript `@version`、loaded log、Git tag、GitHub Release 與 Greasy Fork 版本及內容。
- 驗證與修復流程不應自動 commit、push、建立 tag／Release 或更新 Greasy Fork；發布動作應由維護者另行人工確認。
