# 5.3.0 更新後重新驗證 — 2026-09-20

## 環境與版本

- 使用者確認已更新後，使用本機 Chrome 的新分頁重新測試；不是 Codex 內建瀏覽器。
- 本地 `dist/chrome-extension/manifest.json` 已核對為 5.3.0；個人 Chrome 安裝版本由使用者更新回覆提供，未直接核對管理頁版號或安裝檔案雜湊。
- 實際頁面已不再顯示 `{not_found}`，確認本次工作階段具備先前缺少的插值修正。
- 時區 Asia/Taipei；實際下載完成時間 03:04:09–03:04:10。

## 本機 Chrome 真實網站結果

| 案例 | 結果與證據 |
| --- | --- |
| 混合輪播 | 公開母貼文 `DddTcKpD9-m` 正確列出影片 1、相片 2，沒有多出影片封面 |
| 下載所有資源 | 兩列皆顯示下載完成；摘要為「成功 2 項・失敗 0 項・找不到媒體 0 項・已取消 0 項」 |
| 重試狀態 | 全數成功後「只重試失敗項目」停用 |
| SPA 留言詳情 | 從母文點入 `DddTfnrD5EF`，媒體下載器 post ID 正確，沒有繼承母文媒體 |
| 無媒體下載 | 空選擇器點擊下載所有資源，保持空內容、無結果列、重試停用，提示沒有選取任何資源 |
| Escape 與焦點 | 關閉後焦點回到媒體入口；後續 DOM 檢查既存 role=dialog 節點為不可見，沒有可見下載器 |
| 重開下載器 | 再次開啟仍為正確留言的空選擇器，可見 dialog 恰為 1 |
| 淺色主題 | 複製文字與媒體入口顏色均為 rgb(0, 0, 0) |
| 深色還原 | 顏色恢復 rgb(243, 245, 247)，深色模式 pressed；測試結束已還原原設定並關閉下載器 |

來源：

- https://www.threads.com/@sharon_n825/post/DddTcKpD9-m
- https://www.threads.com/@sharon_n825/post/DddTfnrD5EF

本次下載檔案位於 `C:/Users/Jwander/Downloads`：

| 檔名 | Bytes | SHA-256 |
| --- | ---: | --- |
| sharon_n825_20260919-055258Z_DddTcKpD9-m_photo_02.jpg | 81266 | 7C3DAD34E34DBDAFA8D0A5F38FD1E56A56BFE836F86AAC3AD08C160B8FB61383 |
| sharon_n825_20260919-055258Z_DddTcKpD9-m_video_01.mp4 | 4526751 | 92A3D2EA41E9CEF7FD5A3F295121A9DEAC3B43BCB732D8089AD4B12FD0E2B799 |

檔案時間更新且大小及雜湊與先前成功樣本一致；未進行完整 MP4 播放驗收。

## 可重複自動化

使用目前已建置的 5.3.0 執行，沒有重建或改動個人 Chrome 的載入檔案：

```powershell
npx.cmd playwright test --config tests/browser/playwright.config.mjs
node --test tests/shared/download-tasks.test.mjs tests/shared/batch-runtime.test.mjs
```

- 實際安裝擴充功能的隔離 Chromium：9/9 通過，32.9 秒，0 skipped、0 flaky。
- 涵蓋混合媒體、留言精確複製、SPA、語言／主題、撤銷同意、16 種功能組合、持久化、空媒體與重複對話框。
- JSON 報告保留於 `artifacts/browser/report-5.3.0-2026-09-20.json`（Git ignored）。
- 下載任務／runtime 測試：17/17 通過；涵蓋逐筆失敗／找不到媒體、僅重試失敗且不重下載成功項目、媒體重排、切頁及撤銷時的取消。

## 驗證界線

- 隔離 Chromium 的網頁為 fixture；不等同個人 Chrome 的真實 Threads 設定驗證。
- 本機真實網站這次全部下載成功，未製造同一批次成功與失敗並存，因此現場「只重試失敗」仍待實測；17 項程式測試僅提供邏輯層證據。
- 個人 Chrome 的語言設定、撤銷同意與剪貼簿實際內容本次未操作驗收；相關項目由隔離 Chromium 自動化覆蓋。
- 沒有修改功能程式碼、提交、上傳或發布。

重跑實機操作可沿用 [本機測試步驟](local-chrome-2026-09-20.md)；先前舊工作階段的 `{not_found}` 觀察保留作歷史紀錄，由本次重新驗證補上修復結果。
