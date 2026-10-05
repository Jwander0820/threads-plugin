# Chrome 實站測試 — 2026-10-02

## 第二輪：使用者停用 Tampermonkey 並重新更新後

本輪重新開啟 Chrome 測試分頁，繁中 Gboard 同一原生操作列確認只有 1 個正文複製按鈕，沒有前輪重複注入。使用者確認更新 5.3.1；本輪 console 沒有版本載入訊息，未獨立核對安裝建置雜湊。

- PASS：繁中、英文 Gboard 複製，正規化 CRLF 後精確符合兩行預期正文；英文原生 Translate 存在，複製結果沒有翻譯標籤與 1/3。英文工具按鈕為 Copy Post Text。
- PASS：Jellycat 第 1、15、31 篇分別為 498、498、307 字元，皆無 UI 頁碼；後兩篇有各自正文關鍵字且沒有主文標題。本輪索引為 0、14、30，確認已無雙重工具列。
- PASS：英文單圖媒體視窗為 Threads Media Downloader／Download Selected 等英文標籤，只列出 1 張圖。
- PASS：繁中 Gboard 影片媒體視窗只列出 1 個影片；關閉重開仍為 1 項。
- FAIL：日文 Gboard 的原生シェアする按鈕存在，但正文複製按鈕與乾淨連結按鈕仍均為 0。這次沒有雙重注入，前輪日文問題仍可重現。日文正文清理因缺少按鈕仍不能測。

本輪先以 Windows Get-Clipboard 備份真正系統剪貼簿，結束後已還原並移除備份。已關閉新增測試分頁，未變更原有分頁或擴充設定、未下載、未修改產品原始碼。

新證據：`artifacts/manual-chrome-5.3.1-2026-10-02/japanese-single-extension.jpg`。以下第一輪紀錄保留作比較。

使用使用者本機 Chrome、Chrome MCP 與已登入的 Threads。未下載檔案、未變更擴充設定、未提交 Git。測試使用新增分頁，沒有操作原有分頁。

## 環境限制

- 同一則貼文的原生操作列有兩個 `.tm-post-copy-tool-button`，連結／媒體按鈕也重複。
- 載入紀錄確認 Tampermonkey 的 userscript 為 v5.3.1。另一組按鈕的版本與建置未獨立確認；以下是目前混合安裝環境的實際行為，不能當成 Chrome 擴充單獨執行的通過證據。
- MCP 的 `tab.clipboard` 與 Windows 系統剪貼簿不一致：MCP 仍讀到測試標記，但可信任點擊後 Windows 剪貼簿已更新。正式斷言改用 `Get-Clipboard -Raw`，不輸出正文。
- 首次複製前只備份 MCP 剪貼簿，沒有備份原 Windows 剪貼簿，故原內容無法復原。後續備份 Gboard 複製結果，測試結束還原這份結果，移除暫存備份。

## 結果

| 案例 | 檢查 | 結果 |
| --- | --- | --- |
| CASE-015 Gboard，繁中 | 同一主文兩組按鈕分別複製；正文精確符合兩行預期；沒有翻譯或 1/3 | PASS：43 字元、2 行 |
| CASE-015 Gboard，英文 `locale=en_US` | 原生 Translate 與 Copy Post Text 出現；實際複製後沒有 UI 翻譯與頁碼 | PASS：44 字元含 CRLF，換行正規化後精確符合正文 |
| CASE-014 Jellycat | 實站可看到 1/31 至 31/31；抽查第 1、15、31 篇複製 | PASS：498／498／307 字元，皆無 UI 頁碼；第 15、31 篇符合各自正文關鍵字且沒有主文標題 |
| CASE-002 單圖 | 正文不混入回覆、無追蹤碼連結、主文媒體清單與重開 | PASS：134 字元、5 行，四個正文關鍵字均存在；精確乾淨連結；清單重開皆為 1 張圖，未混入有圖片的回覆 |
| Gboard 主文影片 | 媒體清單關閉重開 | PASS：每次只列出 1 個影片，沒有重複列入相片封面 |
| CASE-012 烏龜影片 | 開啟既有案例 URL | BLOCKED：Threads 顯示連結失效／頁面不存在，不能測原案例 |
| 日文 `locale=ja_JP` | Gboard 原生分享存在，但貼文複製／連結工具列 | FAIL：重載後仍為 copy=0、link=0、media=2；恢復繁中後複製按鈕重新出現 |
| 每則貼文工具列唯一性 | 主文原生操作列 | FAIL：同列有兩組工具，與雙重注入相符；未停用任何擴充或 userscript |

第 15 篇與第 31 篇是在主文詳情頁的各自操作列測試，未把它們另開為回覆詳情頁。本轮没有驗證真實下載、檔名、Chrome 設定讀取競態、Tampermonkey 多分頁設定競態或 hover 一秒內出現。

日文頁沒有複製按鈕，故日文剪貼簿清理為 BLOCKED，不能把前一頁留下的英文複製結果計為日文通過。Gboard 日文主文也未顯示原生翻訳按鈕；其他回覆有翻訳。

## 證據與後續

- `artifacts/manual-chrome-5.3.1-2026-10-02/japanese-missing-tools.jpg`：日文頁面缺少工具列。
- `artifacts/manual-chrome-5.3.1-2026-10-02/gboard-copy-ui.jpg`：恢復繁中後 Gboard 工具列。
- catalog 驗證：11 個案例、5/5 catalog 測試通過。
- 日文缺失需先區分本機 Chrome 擴充與 userscript 的實際建置，再比對分享操作列識別。現有 shared source 有結構判斷與中文／英文標籤 fallback；不能僅因日文失敗便判定某個語言字串是唯一根因。
- 本次僅測試與記錄，沒有更動產品原始碼或發行包。
