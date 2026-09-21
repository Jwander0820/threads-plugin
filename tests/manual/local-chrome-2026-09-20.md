# 本機 Chrome 實機驗證紀錄 — 2026-09-20

本紀錄只收錄使用者本機 Chrome 的實際操作與下載檔案證據。Codex 內建瀏覽器的觀察另見 [live-regression.md](live-regression.md)；兩個環境的結果不可互相替代。

## 環境與版本界線

- 日期／時區：2026-09-20，Asia/Taipei（UTC+08:00）。
- 平台：使用者本機 Chrome，測試當時可見新增的「只重試失敗項目」按鈕。
- 未核對已載入擴充功能的精確檔案雜湊，也未將本次安裝與某一個 ZIP checksum 綁定，因此不視為完整發布版本簽核。
- 本次下載摘要仍顯示 `{not_found}`。共用 formatter 的底線插值修正尚未載入此瀏覽器工作階段；已請使用者重新載入，重載後結果待補。

## 已驗證：混合圖片／影片貼文批次下載

來源：[公開母貼文 DddTcKpD9-m](https://www.threads.com/@sharon_n825/post/DddTcKpD9-m)。

1. 開啟母貼文的媒體選擇器，可見一部影片與一張圖片，以及新增的重試按鈕。
2. 點選「下載全部」。
3. 最終摘要顯示成功 2 項、失敗 0 項、已取消 0 項；兩列皆顯示下載完成，重試按鈕停用。
4. 「找不到媒體」的數字位置仍保留 `{not_found}`，不可將這個欄位記為數字顯示驗證通過。
5. 此次操作未觀察到 warn／error 訊息。

下載檔案位於 `C:/Users/Jwander/Downloads`，時間為 2026-09-20 02:07:30–02:07:31（UTC+08:00）：

| 檔名 | 大小 | 檔案證據 | 驗證範圍 |
| --- | ---: | --- | --- |
| `sharon_n825_20260919-055258Z_DddTcKpD9-m_photo_02.jpg` | 81,266 bytes | JPEG 標頭 `FF D8 FF` | 已實際解碼並目視檢查，貓咪圖片與來源相符 |
| `sharon_n825_20260919-055258Z_DddTcKpD9-m_video_01.mp4` | 4,526,751 bytes | MP4 標頭包含 `ftypisom` | 已確認下載檔案及容器標頭；尚未播放驗證音畫內容 |

SHA-256：

```text
photo_02.jpg  7C3DAD34E34DBDAFA8D0A5F38FD1E56A56BFE836F86AAC3AD08C160B8FB61383
video_01.mp4  92A3D2EA41E9CEF7FD5A3F295121A9DEAC3B43BCB732D8089AD4B12FD0E2B799
```

這組結果同時具有工具顯示與磁碟檔案證據；影片標頭檢查不等同完整影片播放驗收。

## 已驗證：單張圖片懸停下載

2026-09-20 02:13:23（UTC+08:00），在同一母文第二個媒體的圖片上移入滑鼠，出現「下載這個 Threads 媒體」。點擊後顯示下載完成，產生 `sharon_n825_20260919-055258Z_DddTcKpD9-m_photo_01.jpg`（81,266 bytes）。SHA-256 與批次下載的 `photo_02.jpg` 相同，確認取得同一張圖片。單張下載的序號與輪播批次序號不同，此次只驗證內容一致與下載完成。

## 已驗證：母貼文切換至純文字留言

從上述母貼文透過 Threads 的 SPA 導覽切換至純文字留言 `DddTfnrD5EF`：

- 留言詳情中母文與留言各有一個複製文字按鈕，整頁有一個媒體下載器入口。
- 開啟選擇器後顯示正確的留言 post ID，內容為空，沒有帶入母貼文的圖片或影片。
- 按 `Escape` 後，可見對話框數量為 0，焦點回到媒體按鈕。

此案例驗證留言範圍隔離、SPA 切換與關閉後焦點；未因此認定剪貼簿內容已驗證。

## 已驗證：明暗主題切換及還原

由 Threads「更多 → 外觀」確認原設定是深色模式，切換淺色後，複製文字與媒體入口圖示均為 `rgb(0, 0, 0)`。還原深色後兩者均為 `rgb(243, 245, 247)`，且深色按鈕 `aria-pressed=true`。此項是 Threads 原生主題切換，沒有變更擴充功能語言或同意設定。

## 與內建瀏覽器失敗結果的關係

Codex 內建瀏覽器先前對同一母貼文出現下載失敗。本機 Chrome 此次成功，只能確認兩個實測結果不同，尚不能證明先前失敗是由內建瀏覽器 API、政策、CDN 或其他單一原因造成。

原始碼檢查顯示：

- [`src/chrome/download-handler.js`](../../src/chrome/download-handler.js) 的下載共用 `catch` 沒有保留原始例外，將 storage 存取、下載啟動、ownership 儲存、啟動後重查／清理等例外統一回傳 `download_failed`。
- [`src/shared/threads-runtime.js`](../../src/shared/threads-runtime.js) 將 `download_failed` 視為可嘗試 blob fallback 的錯誤，但 Chrome adapter 沒有 `requestMedia`，所以接續出現 `media_request_unsupported`。這是第二階段的失敗，不能單憑它判定原生下載 API 不受支援。
- 已啟動後的原生下載中斷走 `download_interrupted`，adapter 另保留 `interruptReason`；只有原生狀態 `complete` 才回報完成。

本次紀錄沒有修改這些錯誤處理邏輯，也未對內建瀏覽器的根因作推定。

## 可重複步驟與待補驗證

1. 重新載入待測擴充功能及 Threads 分頁，記錄實際載入的產品、來源路徑與精確版本／產物識別。
2. 重複上述母貼文批次下載，確認摘要所有計數均為數字，不再出現 `{not_found}`；核對兩筆列狀態、重試按鈕與實際下載檔案。
3. 重複母貼文至 `DddTfnrD5EF` 的 SPA 導覽、空選擇器與 `Escape` 焦點測試。
4. 在能明確辨識每筆結果的案例中，驗證同一批次混合成功與失敗後的「只重試失敗項目」；確認成功項目沒有產生第二份下載，找不到媒體的項目也只在使用者重試時重新解析。此本機 Chrome 案例尚未完成，不可用全數成功案例替代。
5. 實際剪貼簿文字／乾淨連結、語言切換、設定持久化與撤銷同意，須分別記錄本機 Chrome 的操作結果。剪貼簿依 [README.md](README.md) 用原生貼上核對，不只看成功提示。
6. 完成 MP4 播放檢查；Tampermonkey 的實際安裝與相同功能回歸須另行測試，不能由 Chrome 結果推定。

本紀錄建立時，重載後摘要修正、上述混合結果重試、剪貼簿、語言及其餘設定案例均待補。後續新增證據應明列操作時間與載入版本，不覆寫本次仍見舊插值文字的觀察。

## 原生下載自動化的範圍

獨立 Chromium 探測確認 `context.route()` 可回覆 `.invalid` 控制頁，卻未攔截由真實 `chrome.downloads.download()` 送出的請求；下載回報 `NETWORK_FAILED`、0 bytes。這是測試攔截範圍的證據，並非產品批次功能失敗。已保留 [診斷腳本](../../scripts/diagnostics/native-download-route-probe.mjs) 與 [重跑說明](../browser/README.md)，不以 mock API 製造「真實下載成功」的測試結論。
