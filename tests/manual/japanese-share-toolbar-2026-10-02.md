# 日文操作列修正 — 2026-10-02

## 修正後 Chrome 實站驗收：PASS

使用者重新載入修正版後，以本機 Chrome MCP 與可信任按鈕點擊複測，Windows Get-Clipboard 核對實際結果：

- 日文 Gboard 同一原生操作列正文／連結按鈕各 1 個，已恢復且沒有重複。
- 日文正文複製正規化 CRLF 後精確符合兩行預期；沒有翻訳或 1/3。
- 日文乾淨連結精確為 `https://www.threads.com/@jwander87/post/Dd8UsZyjzd9`，沒有 locale query 或其他參數。
- 日文回覆 `/@jwander87/post/Dd9P263gTn6` 有原生翻訳控制：實際複製 53 字元，含各自正文、不含翻訳與 Google Japan 主文。
- 日文 Jellycat 第 1、15、31 篇均複製各自正文，沒有翻訳、UI 頁碼或主文污染；主文 498 字元並包含四個既定正文關鍵字。
- 英文、繁中 Gboard 再次複製均精確符合兩行正文。

證據：`artifacts/manual-chrome-5.3.1-2026-10-02/japanese-fixed-live.jpg`。已事先備份並還原真正 Windows 剪貼簿，關閉測試分頁；沒有下載、修改設定或操作原有分頁。本輪没有重測全部媒體下載案例。下方原先待重新載入的紀錄保留作歷程，此節為最新驗收結果。

## 原因與修正

Chrome 實站已在停用 Tampermonkey 後重現：Gboard 日文頁面有原生分享按鈕，但正文複製與乾淨連結按鈕均為 0。

分享圖示的 SVG 第一段座標從高精度 `M7.2474 1.49853C4.18324 -0.187039 ...` 改成三位小數與省略分隔符的 `M7.247 1.499C4.183-.187.6 ...`。原本逐字前綴比對失敗；中文、英文因另有分享文字標籤 fallback 而正常。

`src/shared/threads-runtime.js` 改成 SVG command／座標 token 比對，保留原曲線指紋、24×24 viewBox、單一路徑與既有操作列結構、尺寸、貼文歸屬條件，只容許 0.001 的座標差異。共用修正同時生成 Chrome 與 Tampermonkey，沒有增加日文文字 allowlist。

## 自動化證據

- 修正前：`node --test --test-name-pattern="rounded native|rounded glyph" tests/shared/threads-runtime.test.mjs` 以日文案例 `0 !== 1` 失敗。
- 修正後：日文、法文、德文與無文字標籤的相同原生圖示均注入一組正文／連結工具；缺少貼文歸屬、過大操作尺寸、不同曲線仍不匹配。
- `tests/fixtures/threads-native-share-glyph.mjs` 保留實站完整 SVG path，供 Node 與安裝版 Chromium 共用。
- 安裝版 Chromium 的日文四操作列含巢狀 `div[role=button]` 與實站 SVG；檢查唯一正文、連結、媒體工具，以及真正的 clipboard 正文、乾淨 URL 和一張主文媒體。
- `npm.cmd run verify`：268/268 Node 測試、雙平台生成檔與驗證器通過。
- `npm.cmd run test:browser`：13/13 通過，含既有翻譯控制、2／3／14／20／31 篇頁碼、主文／回覆歸屬、SPA、語系與設定案例。

## 實站驗收界線

先前實站 FAIL 保留於 `chrome-extension-5.3.1-2026-10-02.md`，不能改寫成修正後 PASS。此修正已重新 build 並封裝 5.3.1；本機 Chrome 必須重新載入修正版才可驗證。

Chrome MCP 拒絕存取 `chrome://extensions/`，理由為 URL protocol 安全限制，因此沒有自動重新載入本機安裝版，也沒有採用其他方式繞過限制。修正後的本機 Chrome／Threads 實站驗收仍待使用者更新後執行。

建議實站步驟：只啟用 Chrome 版本，開啟 Gboard 的 `?locale=ja_JP`；确认主文有且只有一組正文與連結複製按鈕，複製結果不含 1/3；再開日文回覆含翻訳的案例，確認工具列歸屬與翻譯清理，最後回到繁中／英文確認正常。

未提交 Git、推送或發布。
