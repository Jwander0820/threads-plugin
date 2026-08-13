# Threads Plugin

Threads Plugin 是一套由同一份 shared source 產生的雙平台工具：

- Tampermonkey userscript：`threads-plugin.user.js`
- Manifest V3 Chrome Extension：`dist/chrome-extension/`

它在 Threads 貼文旁提供單張圖片／影片下載、整篇媒體選擇與批次下載、複製貼文文字、複製去追蹤參數連結，以及 Threads 原生分享選單內的乾淨連結功能。

## 功能

- 在 feed、profile、detail、reply 與引用貼文中下載圖片、影片或選定的輪播媒體。
- 複製清理 UI 雜訊後的貼文文字，以及移除已知追蹤參數的直接連結。
- 在 Threads 原生分享選單旁提供乾淨連結動作，並以 route/post identity 防止跨貼文借用資料。
- Chrome 版另提供首次揭露、即時撤銷與獨立 opt-in 的 allowlisted network capture。

## 安裝

### Chrome Web Store

尚未上架；目前沒有 Chrome Web Store 安裝連結。production candidate 僅供本機驗收，送審與發布需另行授權。

### Tampermonkey

請依下方 Userscript 本機安裝步驟匯入 generated root script。正式 Raw URL 維持不變。

### Manual Chrome installation

請依下方 Chrome Extension 本機安裝步驟，從同一 source 產生 unpacked directory 或 production ZIP。

## 隱私預設

Chrome Extension 第一次進入 Threads 時保持休眠，只顯示內容處理揭露。使用者同意前，不啟動 shared runtime、不掃描貼文 DOM，也不攔截網路回應。拒絕後持續休眠且不重複打擾；可在設定頁重新同意或撤銷。

進階網路回應擷取是第二層、預設關閉的 opt-in。只有使用者另行確認後，service worker 才動態註冊 packaged `world: "MAIN"` script。關閉或撤銷時，service worker 會在 unregister 未來注入的同時，權威地撤銷每個已開啟分頁目前 document 內的 MAIN controller，立即還原 fetch/XHR wrapper 並清除 bridge listener。該 controller 在這個 document 內會永久鎖定，頁面程式或再次注入都無法重新啟動。

若在同一個仍開啟的分頁重新啟用進階擷取，必須重新載入分頁（建立新 document）後才會生效；頁面內容處理與 DOM 工具仍依一般 consent 狀態運作。

完整資料處理說明見 [PRIVACY.md](PRIVACY.md)，Chrome Web Store 權限理由見 [docs/permissions-justification.md](docs/permissions-justification.md)。

## Chrome Extension 本機安裝

1. 安裝 Node.js 24（專案目前驗證版本為 24.18.0）。
2. 在 repo 執行：

   ```powershell
   npm.cmd ci
   npm.cmd run build
   ```

3. 開啟 `chrome://extensions`，開啟「開發人員模式」。
4. 選擇「載入未封裝項目」，指定 `dist/chrome-extension`。
5. 開啟任一支援的 Threads origin，完成首次揭露。

正式上架 ZIP 由 `npm.cmd run package:extension` 產生；ZIP 根目錄直接是 `manifest.json`，不是多包一層資料夾。

## Userscript 本機安裝

1. 安裝 Tampermonkey。
2. 執行 `npm.cmd run build:userscript`。
3. 將 repo 根目錄的 `threads-plugin.user.js` 匯入 Tampermonkey。

目前 userscript 的公開更新 URL 仍指向：

```text
https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js
```

Git commit／push、GitHub Release 與 Greasy Fork 更新是彼此獨立的發布動作，需分別確認後執行。

## 支援的網站

- `https://www.threads.com/*`
- `https://threads.com/*`
- `https://www.threads.net/*`
- `https://threads.net/*`

登入、帳號、驗證、私訊、安全、隱私及設定等敏感路徑不啟動 Chrome 頁面 runtime，也不進行網路回應擷取。

## 開發與驗證

```powershell
npm.cmd ci
npm.cmd run verify
npm.cmd run test:e2e
npm.cmd audit --audit-level=high
npm.cmd run package:extension
npm.cmd run verify:package
```

`npm.cmd run verify` 會：

- 從 `src/shared`、`src/userscript`、`src/chrome` 重新建置雙平台產物。
- 驗證 userscript metadata allowlist、版本同步、無 `@require`。
- 驗證 MV3 manifest、權限／host allowlist、ISOLATED disclosure gate、opt-in MAIN registration、service worker message policy、無遠端程式碼。
- 執行單元、契約、回歸與安全對抗測試。
- 確認生成的 userscript 與 extension manifest 沒有 stale。

若 Windows 的受限沙箱禁止 Node test runner／esbuild 建立子程序，可用 `node --test --test-isolation=none` 驗證同一套測試；正式 release checkpoint 仍應在一般本機 shell 執行原始 `npm.cmd run verify`。

`npm.cmd run test:e2e` 是 built-extension 契約／lifecycle suite；它驗證 fixture 指向目前 packaged content bundle，並涵蓋 disclosure、content lifecycle、MAIN STOP 與 service-worker download boundary。真實 MV3 安裝、worker termination/restart 與 live Threads 仍依人工清單驗收，不以此命令取代。

`npm.cmd run verify:docs` 會驗證政策內容、icon 尺寸與 Store release gate 狀態；尚需登入、人工簽核或外部發布授權的項目會明確顯示為 `PENDING`，不會讓日常程式驗證失敗。只有準備送審時才執行：

```powershell
npm.cmd run verify:docs:release
```

Release 模式會因未公開的隱私政策 URL、未完成的人工驗收／sign-off 或缺少 Store screenshot 而失敗；已產出的 440×280 small promotional tile 仍會被尺寸與 freshness gate 驗證。

`npm.cmd run build:store-assets` 可重建暫定的 `docs/store-assets/small-promo-440x280.png`。正式 icon、宣傳圖與 Store screenshot 可於送審前替換；最終 screenshot 必須取自真實已安裝、已登入 Threads 的驗收畫面，不以 mock fixture 代替。

整體元件邊界與 lifecycle 見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，自動化／人工證據總表見 [docs/TEST_MATRIX.md](docs/TEST_MATRIX.md)，實際瀏覽器逐項驗收表見 [docs/manual-test-checklist.md](docs/manual-test-checklist.md)，高階主管級安全與上架 Go/No-Go 判定見 [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)。

## 跨電腦移交

Git 中已提交的版本可直接 clone。若需要傳遞尚未提交的完整工作目錄，或建立可離線驗證的 source snapshot，可產生經逐檔校驗的專案移交包：

```powershell
npm.cmd run package:handoff
npm.cmd run verify:handoff
```

輸出為 `artifacts/threads-plugin-<version>-project-handoff.zip` 及其 SHA-256 sidecar。移交包含 source、文件、測試、兩平台生成物與 Chrome production ZIP；不含 `.git`、`node_modules`、舊 manual extraction 或帳號資料。


## 專案結構

```text
config/                 權限、網站與 userscript allowlist 單一來源
src/shared/             平台無關的 runtime、policy、models
src/userscript/         userscript adapter 與 bootstrap
src/chrome/             Chrome content、MAIN capture、service worker、options
extension/              manifest template、HTML/CSS、原創圖示
scripts/                build、verify、package 工具
tests/                  shared/userscript/Chrome/security/E2E fixtures
docs/                   架構、驗證、安全與 Store 草稿文件
extension/              Chrome manifest／HTML／CSS／icon source（會提交）
dist/chrome-extension/  生成的 unpacked extension（git ignored）
artifacts/               生成套件、checksum 與本機驗收副本（git ignored）
assets/                  本機規格／移交參考資料（git ignored）
```

## 權限摘要

Chrome Extension 只宣告：

- `downloads`：由 service worker 下載通過 allowlist 驗證的媒體 URL。
- `storage`：儲存使用者選項與 consent state。
- `scripting`：只為使用者另行 opt-in 的 packaged MAIN-world capture 動態註冊／取消註冊。
- 四個精確 Threads host patterns：限制 content script 與動態 MAIN script 的作用範圍。

不使用 `tabs`、`activeTab`、`webRequest`、`webRequestBlocking`、`cookies`、`nativeMessaging`、遠端 JavaScript、`eval` 或 `new Function`。

## 隱私

擴充功能只為使用者要求的 Threads 貼文匯出功能在本機處理目前頁面內容；不設開發者後端，不使用 analytics／廣告／追蹤，也不出售資料。完整 retention、第三方媒體請求、剪貼簿與撤銷說明見 [PRIVACY.md](PRIVACY.md)。

## Build

`npm.cmd run build` 從 `src` 產生 root userscript、unpacked Chrome Extension 與 Store promo；`npm.cmd run package:extension` 另產生固定排序／時間戳的 production ZIP 與 checksum。

## Test

`npm.cmd run verify` 是本機完整自動化 gate；`npm.cmd run test:e2e` 是 built-output 契約與 Chrome lifecycle 子集；[docs/TEST_MATRIX.md](docs/TEST_MATRIX.md) 區分自動證據、fixture 證據與仍待真實瀏覽器完成的項目。

## Release

送審前依序執行 `npm.cmd ci`、`npm.cmd run verify`、`npm.cmd run test:e2e`、`npm.cmd audit --audit-level=high`、`npm.cmd run package:extension`、`npm.cmd run verify:package` 與 `npm.cmd run verify:docs:release`。最後一個 gate 只有在公開 privacy URL、真實 Store screenshot、30 項人工驗收與七個 sign-off 欄位全完成時才會通過。

## Known Limitations

- 停用或撤銷進階擷取會永久鎖定目前 document 的 MAIN controller；在同一既開分頁重新啟用後，必須 reload 或開啟新 document 才能再次擷取網路回應。
- 私密或需額外權限、登入／DRM 繞過才能取得的媒體不在支援範圍。
- 無可辨識媒體副檔名或 MIME 的簽名 endpoint 會保守拒絕。
- Anonymous blob fallback 可能無法取得需要 authenticated cookies 的媒體；userscript manager 對 redirect／credential 的行為仍須於發布候選版本人工驗證。
- Chrome Web Store 審核結果不可保證；本 repo 只產生未發布候選產物。

## License

[MIT](LICENSE)
