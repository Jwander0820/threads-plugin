# 5.3.1 音樂附件與正文複製回歸

測試日期：2026-10-04（Asia/Taipei）。本次驗證只涉及正文複製；沒有播放音樂、下載媒體或操作社交功能。

## 案例與修正前重現

| 案例 | 網址 | 修正前結果 |
| --- | --- | --- |
| CASE-016：9Lana 歌單與音樂歌詞附件 | <https://www.threads.com/@k.r.itoku/post/DeB4zvUHxdI> | 使用 Chrome 中既有的複製按鈕，Windows 剪貼簿得到 22 行，混入附件歌詞；作者正文只有 13 行。 |
| CASE-006：舊音樂附件案例 | <https://www.threads.com/@cupcake.o_u/post/Db7LybFmTJA> | 本次既有版本複製正文正常，沒有歌曲 metadata、歌詞或 `1/2`。仍保留作為舊布局回歸案例。 |

舊修正 a037a06 使用音樂播放控制的畫面高度作為文字邊界；5.3.0 抽成 shared module 時仍保留這個規則。新案例中，歌詞是播放控制的 sibling，位於同一個裁切音樂卡內；歌詞區會內部捲動及變形，部分文字的 bounding rectangle 跑到播放控制上方，繞過高度排除。

先前只有音樂高度邊界的 Node assertion，沒有直接驗證音樂附件的最終本文或真實剪貼簿，因此無法捕捉這種布局。

## 修正行為

- 以本貼文的播放／暫停控制及裁切容器辨識完整音樂附件，排除卡片內的歌名、演出者及歌詞；其他貼文的音樂控制不能截斷本貼文。
- 保留畫面高度邊界作為沒有辨識出完整卡片時的相容判斷。
- 若正文與附件共用文字容器，只讀取附件之外的分支；保留正文直接文字節點、行內連結及換行，避免整個外層被刪掉或在候選合併時重新加入歌詞。
- 真實音樂卡內的隱藏 `<video>` 不會讓共同外層候選先被排除；附件之外的時間、影片與貼文圖片排除規則仍生效。
- 作者自己寫的歌名、歌單、類似歌詞的文字、`Play music`、`翻譯`及 `3/4` 均保留。沒有用歌詞內容或特定貼文 ID 作為刪除條件。

共同行為實作於 [post-text.js](../../src/shared/post-text.js)，並重建 Tampermonkey userscript 與 Chrome Extension。

## 驗證證據

### 真實 Chrome：修正前重現與 DOM 擷取

使用獨立測試分頁開啟上述兩篇貼文，以原生點擊擴充功能複製按鈕讀取 Windows 剪貼簿。保存正文、音樂附件結構、計算樣式與座標；未把新程式注入使用者的 Threads 頁面。

### 真實 DOM 快照：修正後擷取重播

在隔離 Chromium 中重建實際 DOM 的元素樹，套用擷取時的 innerText、rect 及 computed style，再執行真實 shared extractor。比較版本只還原舊音樂處理規則，保留本輪之前的翻譯與長文頁碼修正。

| 案例 | 舊音樂規則 | 修正後 | 驗收 |
| --- | --- | --- | --- |
| CASE-016 | 248 字元／22 行 | 174 字元／13 行 | 與獨立擷取的完整正文逐字相同 |
| CASE-006 | 62 字元／4 行 | 62 字元／4 行 | 與原作者正文逐字相同 |

字元與行數使用 LF 正規化；Windows 剪貼簿的 CRLF 會增加原始字元數。這是來源擷取重播證據，不等同於使用者 Chrome 已重新載入新擴充功能。

本機原始 DOM、剪貼簿比較副本、畫面及重播結果保存於 Git-ignored `artifacts/lyrics-regression-2026-10-04/`；歌詞原文沒有放入公開測試 fixture。

### 自動化回歸

- [18 項音樂附件 Node 行為測試](../shared/post-text-attachments.test.mjs)：中／英／日的播放與暫停、歌詞座標移到正文區、共同 wrapper、fallback、雙軸／單軸裁切、root clipping、舊布局、作者文字及巢狀回覆。
- [已安裝擴充功能測試](../browser/installed-extension.spec.mjs)：使用 disposable Chromium profile，載入實際 build 的擴充功能，透過可信點擊及真實 clipboard API 比對正文。音樂測例涵蓋六種播放／暫停 label、共同 `dir=auto` wrapper、直接文字與行內作者連結，以及卡片內的隱藏影片。
- 修正前先確認新增測例失敗，再確認修正後通過。既有長文 `N/M`、翻譯與日文工具列測例仍納入完整 suite。
- `npm.cmd run verify`：286 tests passed；兩平台生成檔 freshness 通過。
- `npm.cmd run test:browser`：15 tests passed。
- 本機 live case catalog 已加入 CASE-016，原 CASE-006 保留；catalog validate 與 5 項 catalog tests 通過。
- `npm.cmd run package:extension` 與 `npm.cmd run verify:package`：更新並驗證 `artifacts/threads-plugin-chrome-5.3.1.zip`。

## 仍須真實安裝驗收

使用者 Chrome 的現有安裝不會因本機 source/build 更新而自動更換。重新載入擴充功能並重新整理 Threads 後，需再次以新舊 URL 確認最終複製結果。本次未操作 `chrome://extensions`，也未把快照重播或隔離 Chromium 結果列作使用者 Chrome 新版本的 live PASS。

Tampermonkey 共用同一個修正並已重新 build，但本輪未執行實際 Tampermonkey 安裝驗收。
