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
- `GM_xmlhttpRequest`：讀取 Threads、Instagram、CDN、FBCDN 相關媒體資源。
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

## 已知限制

- Threads 介面與 DOM 結構更新時，按鈕定位、貼文辨識或媒體抓取可能需要跟進調整。
- 若圖片或影片下載失敗，可能是 Threads 新增了 CDN 網域，需要更新 `@connect`。
- 受瀏覽器、userscript 管理器與來源站台限制影響，部分媒體可能無法直接下載。

## 開發驗證

使用 Node.js 檢查 userscript 語法：

```powershell
node --check .\threads-plugin.user.js
```

執行靜態核心功能與 metadata 檢查：

```powershell
node .\scripts\verify-threads-plugin.mjs
```

執行混合媒體、SPA 換頁 cache 隔離、下載逾時與剪貼簿回歸測試：

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

## 更新紀錄

請見 [CHANGELOG.md](CHANGELOG.md)。
