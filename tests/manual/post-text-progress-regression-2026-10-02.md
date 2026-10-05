# 長篇串文頁碼複製回歸 — 2026-10-02

## 案例與原因

- 使用者案例：[offtimemusictw 長篇貼文](https://www.threads.com/@offtimemusictw/post/Dd-kPvGEjRJ)。使用已登入的 Codex 內建 Browser 檢查，沒有操作個人 Chrome、發文或變更設定。
- 主文尾端為 `1/2`，作者續篇尾端為 `2/2`；實際 `innerText` 均拆成「數字、斜線、數字」三行。
- 徽章位於正文的 `span[dir=auto]` 內，透明 inline-block wrapper 包住 static flex 元素；內含 `SPAN` 數字、`DIV → SPAN` 斜線、`SPAN` 總數。實測尺寸約 33.8 × 23.8，置中排列、有背景及 12px 圓角，沒有 absolute positioning 或媒體依賴。
- 舊修正 `0b80167` 在片段清理與合併結果清理頁碼。5.3.0 的 `0c6f81e` 抽離 `post-text.js` 時仍保留這兩處。未提交的 5.3.1 為避免誤刪正文分數移除文字尾端規則，卻只補上媒體 absolute overlay 的 DOM 判斷，遺漏本案例的靜態徽章。

## 修正與防回歸

- 依可見 DOM 結構、尺寸、排列、背景與圓角判斷串文進度徽章，沒有作者、貼文 ID、網址或語言硬編碼。
- 先排除被獨立選中的徽章、wrapper 或子節點，避免合併候選片段時重新加入頁碼。保留原有媒體 overlay 的證據判斷。
- 先清除已確認的尾端翻譯按鈕，再辨識頁碼；涵蓋「正文 → 頁碼 → 翻譯按鈕」的排列。
- Node 回歸包含 `1/2`、`2/2`、`1/12`、`12/12`，普通及分行正文分數、同值正文分數加徽章、翻譯字樣、中文／英文／日文按鈕及不足以判為 UI 的結構。
- 安裝擴充 Chromium 案例使用與實站相同的靜態拆分徽章及巢狀斜線，移除媒體依賴，核對主文與回覆的實際剪貼簿結果；同一段正文在有徽章、帶翻譯按鈕、移除徽章及末尾加入相同普通分數時都需符合預期。

## 證據與界線

- 從實站唯讀擷取主文與續篇片段的 DOM、computed style、尺寸及 `innerText`，以本地新函式重播並核對正文完全相同（既有尾端空白整理除外）；兩個案例均通過。
- 本地證據位於 Git ignored 的 `artifacts/post-text-regression/`：`live-fragments.json`、`replay-live-dom.mjs`、`live-dom-result.json`、`live-page.jpg`、`verify.log`；安裝擴充測試報告位於 `artifacts/browser/report.json`。
- `npm.cmd run verify`：263 個 Node 測試通過，雙平台產物、權限與生成同步檢查通過。安裝擴充 Chromium：12/12 案例通過。
- 實站 DOM 重播與合成頁面的真實擴充剪貼簿驗證是不同層的證據。Browser 本身沒有重新安裝新建置，此紀錄沒有宣稱使用者瀏覽器的新版本實站剪貼簿已完成回測；安裝 Tampermonkey 的實站回測也仍需人工完成。
- 版本維持 5.3.1，重新生成 userscript、Chrome extension 與 ZIP；未提交或發布。先前 5.3.1 ZIP 需以新產物替換。

## 超長文補充驗證

- 使用者補充：[vincentyucw Jellycat 超長串文](https://www.threads.com/@vincentyucw/post/Dcw8W67EwqM)，實際共有 31 篇。現行源碼以 `\d+` 辨識數字並驗證 `1 <= current <= total`，沒有限定總數 2 或列出數字白名單；本輪未再修改產品源碼。
- 已從同一實站取得 `1/31` 至 `31/31` 的全部 31 個徽章與正文 DOM，使用本地 shared 函式逐篇重播，全部排除徽章及其拆分子節點，完整正文核對通過。
- 新增 Node 參數案例涵蓋 14、20、31、100 篇的首篇、中間篇及末篇（100 篇為首末篇），驗證相同數值作為普通正文或分行分數時仍保留。
- 安裝擴充測試涵蓋 10 組頁碼：`1/2`、`2/2`、`1/14`、`14/14`、`1/20`、`10/20`、`20/20`、`1/31`、`15/31`、`31/31`。徽章尺寸隨數字自然延展；每次複製前重設剪貼簿，避免上一筆相同正文造成偽陽性。
- CASE-014 已加入本機 `assets/testing/threads-live-regression/cases.json` 與對應手動驗收表，公開內容可用；使用者瀏覽器新建置的實站剪貼簿仍待人工回測。這個資料夾由 Git ignore；可追蹤的證據摘要保留在本紀錄。
- 額外證據：`artifacts/post-text-regression/ultra-live-fragments.json`、`replay-ultra-dom.mjs`、`ultra-dom-result.json`、`ultra-page.jpg`、`ultra-verify.log`。
- 補充後完整 gate 264/264 個 Node 測試通過，安裝擴充 Chromium 12/12 通過；本機案例集結構與唯一性驗證 5/5 通過。既有 5.3.1 ZIP 重新核對通過，SHA256 維持 `fab83c0792cacb305a9cae643b419fe833ffc38d3af317979250dcd7f5078c8e`。
