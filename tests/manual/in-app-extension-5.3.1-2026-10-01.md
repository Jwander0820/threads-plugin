# 5.3.1 更新後內建瀏覽器實測 — 2026-10-01

## 使用者回測與判定修正

- 使用者於後續回覆表示，同一英文案例 `DXozwgtCYta` 自行測試正常。這是使用者提供的回測結果，未由代理獨立驗證其瀏覽器設定、影片列或下載檔案。
- 先前將內建瀏覽器的影片漏列稱為「確認問題」過於廣泛。以下 FAIL 保留為當時內建瀏覽器的實際觀察，不代表一般 Chrome／使用者環境有同樣缺陷，也不足以阻擋 5.3.1。
- blob 影片解析失敗的原因、進階擷取設定及直接下載失敗原因仍未確定。暫不依此更動媒體解析或下載行為；「未解析素材提示」屬可選的體驗改善，下載階段錯誤分類屬診斷改善。
- checkbox 缺少可讀名稱則可從程式與 DOM 確認，仍是低風險的小型可及性修正候選。

## 環境與驗證界線

- 使用者明確指定 Codex Browser，於 Codex 內建瀏覽器已登入的 Threads 分頁測試；沒有操作個人 Chrome。
- 時區 Asia/Taipei，約 18:57–19:10。使用者表示已更新；本地 package 版本為 5.3.1。實際載入擴充來源由錯誤紀錄確認為 `chrome-extension://ajnadnkhejagfedljfdhfnblciohhabk/content.js`，但安裝版號未獨立驗證。
- 開啟該擴充的 `options.html` 被 Browser URL 安全政策拒絕（僅允許 HTTP/HTTPS）。未改用其他瀏覽器或繞過限制。因此設定讀取鎖定、語言偏好、進階擷取開關及安裝版號均沒有現場驗證。
- `tab.clipboard.readText()` 在擴充顯示複製成功後仍回傳空白；兩種受支援貼上操作皆回報虛擬剪貼簿沒有資料。這是測試工具觀察界線，無法據此認定系統剪貼簿寫入失敗，也不能宣稱本文與連結內容已核對。
- 多語言實測指中文、英文、日文的公開貼文內容。Threads 與擴充介面維持原本繁體中文，沒有現場切換英文介面。
- 沒有發文、留言、按讚、追蹤或變更持久化設定。日文貼文翻譯顯示已切回原文；最後關閉測試視窗並返回原首頁。

## 真實網站案例

| 案例 | 結果 | 實際證據 |
| --- | --- | --- |
| 首頁工具注入 | PASS | 多則貼文有複製文字與去追蹤碼連結按鈕 |
| 中文本文／連結複製 | PARTIAL | 顯示成功提示、無複製相關錯誤；實際剪貼簿內容無法取得 |
| 中文混合輪播 | PASS | `DddTcKpD9-m` 列出影片 1、相片 2，沒有多列影片封面 |
| 未選取資源 | PASS | 點下載已選取，提示「沒有選取任何資源」，未新增下載結果 |
| 全選／部分取消 | PASS | 全選勾選兩列；取消影片後，全選呈 mixed，僅相片保持選取 |
| 相片下載 | FAIL | 單獨選相片 2，顯示成功 0、失敗 1，該列「下載失敗，可重試」 |
| 只重試失敗項目 | PARTIAL | 按鈕從停用變啟用；重試相片仍失敗，未對未選取影片產生結果。未驗證成功、失敗同批並存時的成功項目保留 |
| 影片下載 | FAIL | 重開清單後單獨選影片 1，顯示成功 0、失敗 1。沒有成功下載檔案或播放驗收證據 |
| SPA 切換到純文字回覆 | PASS | 站內點入 `DddTfnrD5EF`，下載器 ID 正確且清單為空，沒有帶入父貼文素材 |
| Escape／焦點返回 | PASS | 標準 `Escape` 關閉下載器；可見狀態為 false，焦點回到「開啟 Threads 媒體下載器」 |
| 日文長文＋六張照片 | PASS | `Dd36HEMEsVi` 列出相片 1–6、共七個 checkbox（含全選） |
| 日文切換 Threads 翻譯 | PASS | 原文切換為中文翻譯後仍列出六張照片，未新增重複列；之後切回原文 |
| 日文部分選取保留 | PASS | 選取第 1、4 張，跨越週期刷新後選取仍一致，可見下載器只有一個 |
| 日文本文複製 | PARTIAL | 原文、翻譯狀態皆能觸發複製成功提示，實際內容因剪貼簿限制未核對 |
| 英文輪播含 blob 影片 | FAIL | `DXozwgtCYta` 原生畫面有 1 支影片＋4 張照片；下載器只有相片 1–4。重開與重新載入、關閉原生燈箱後再開均可重現 |
| 素材 checkbox 名稱 | ISSUE | 全選有名稱；各素材 checkbox 沒有 label、aria-label 或 aria-labelledby，輔助技術無法依名稱辨認素材 |

公開案例：

- 中文混合輪播：https://www.threads.com/@sharon_n825/post/DddTcKpD9-m
- 純文字回覆：https://www.threads.com/@sharon_n825/post/DddTfnrD5EF
- 日文長文六圖：https://www.threads.com/@hrhyyum/post/Dd36HEMEsVi
- 英文圖影輪播：https://www.threads.com/@smol_silly_cat/post/DXozwgtCYta

## 可重現發現與建議

### 尚未解析的影片被靜默排除

英文案例的主貼文存在 `VIDEO`，`src` 為 `blob:https://www.threads.com/...`，實際尺寸 210×280；下載器重開及重新載入後仍只顯示四張相片。這不代表「英文內容」造成解析失敗，而是該媒體形式在目前工作階段未取得可下載網址。

程式端 `src/shared/media-resolver.js:98` 在去重時直接排除 `resolvedUrl` 空值；同檔第 128 行的結構化媒體合併也只保留已有網址的 fallback 項目。這可解釋影片尚未解析時的靜默漏列，但進階擷取是否開啟、為何此片未取得網址仍未確認。

建議保留已確認屬於主貼文的影片位置，顯示「影片網址尚未取得」，或明確提示有未解析素材；避免「下載所有資源」讓使用者誤認清單完整。不能將 blob 本身直接當成可下載的 MP4，也不應用不明來源影片補位。

### 真實下載失敗，原因目前不足以判定

相片下載、相片重試、影片下載三次均記錄：

```text
[Threads Target Downloader] Direct download failed, trying anonymous blob fallback Error: download_failed
[Threads Target Downloader] fallback download failed Error: media_request_unsupported
```

Chrome adapter 未提供媒體請求 fallback，所以第二個錯誤是既有能力限制；它不能解釋第一個直接下載為何失敗。`src/chrome/download-handler.js:159` 的 catch 將 API、下載 ownership 儲存等不同失敗統一回傳 `download_failed`，現有紀錄無法區分瀏覽器支援差異、儲存失敗或下載請求問題。

建議在各階段保留有限、無媒體 URL 與敏感資料的原因代碼，供診斷使用；先取得原因再決定修法。本次沒有宣稱已確認是內建瀏覽器缺少 downloads API，也沒有把之前個人 Chrome 5.3.0 的成功視為這次成功。

### 素材 checkbox 的小型可及性修正

`src/shared/media-dialog.js` 各素材列已有可讀的「相片／影片 N」文字，可將同一文字設為 checkbox 的 aria-label 或建立 label 關聯。這是從真實 DOM 確認的缺項，本次僅記錄，沒有改動功能程式碼。

## 補充程式驗證

目前本地 5.3.1 執行：

```powershell
node --test tests/shared/post-text.test.mjs tests/shared/i18n.test.mjs tests/chrome/i18n.test.mjs tests/chrome/package-i18n.test.mjs tests/chrome/download-handler.test.mjs
```

51/51 通過。涵蓋正文中的翻譯字樣／分數保留、具實際介面證據的清理、繁體中文與英文介面、日文語系回退英文，以及下載 ownership／取消處理。這是程式層證據，不能代替本次受限制的設定頁、剪貼簿與下載完成驗收。

## 圖片證據

圖片放在 Git ignored 的 `artifacts/manual-5.3.1/`：

- `mixed-download.jpg`：混合輪播影片下載失敗結果。
- `japanese-six-photos.jpg`：日文六圖下載器。
- `english-native-video.jpg`：英文貼文原生影片與照片。
- `english-mixed.jpg`：英文下載器漏列影片，重開前。
- `english-missing-video.jpg`：重新載入後仍只列四張照片。

此次新增本紀錄與本地圖片證據，沒有修改功能程式碼、提交或發布。
