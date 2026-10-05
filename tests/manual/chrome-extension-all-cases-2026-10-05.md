# Chrome 5.3.1 全案例回歸 — 2026-10-05

使用者更新 Chrome 擴充功能後，透過 Chrome MCP 操作本機已登入的真實 Threads 網站。使用者另明確授權「包含實際下載，完成完整驗收」。本輪沒有修改功能程式、重新建置擴充功能、提交或發布。

## 結果

12 個既有目錄案例均已處理：9 個可存取案例的已執行檢查通過；3 個案例受公開貼文或 Feed 情境限制，列為 BLOCKED。另外補測 7 個舊報告貼文，以及底線帳號、Feed 原貼文的詳情下載。沒有重現歌詞附件、翻譯、長文頁碼或日文按鈕的回歸。

「通過」指下表列出的實際檢查；懸浮按鈕的 1 秒上限未做精確計時，不包含在通過宣稱內。不能把本輪稱為所有實站條件完整通過：失效貼文、指定深層 Feed 情境，以及現場成功／失敗混合批次仍有驗證限制。

## 既有案例

| 案例 | 結果 | 本輪證據 |
| --- | --- | --- |
| CASE-001 HEIC 三圖 | PASS | 首次開啟、重開皆 3 張且無重複；實際下載 3 張 JPEG，皆 1440×1920、完整解碼通過；摘要成功 3、失敗 0 |
| CASE-002 單圖／正文／懸浮 | PASS | 中文、英文、日文正文皆 130 字元、5 行、相同雜湊；三種介面乾淨連結皆符合原貼文；清單只含主文 1 張；真實懸浮與移入按鈕後仍可見；懸浮下載 JPEG 成功 |
| CASE-003 混合輪播 | PASS | 順序為圖片、影片、影片、影片、影片、圖片；6 項實際下載成功，序號 01–06 正確；4 支 MP4 全片解碼通過 |
| CASE-004 輪播去重 A | PASS | 10 張，與原生主文圖片數量、順序逐一一致；沒有過去多出的第 11 張；父文與目標回覆分開定位 |
| CASE-005 輪播去重 B | PASS | 2 張，與原生主文數量及順序一致 |
| CASE-006 舊歌詞附件 | PASS | 實際複製 62 字元、4 行，與先前獨立保存的預期正文逐字相同；沒有附件歌名、歌手、歌詞或翻譯 |
| CASE-007 深層 Feed | BLOCKED | 首頁 Feed 未出現指定貼文，不能用詳情頁替代 Feed 的通過證據；另補測原貼文詳情懸浮下載，檔名正確、JPEG 解碼成功 |
| CASE-008 底線帳號 | BLOCKED | 原貼文連結轉至作者頁，無法定位原貼文；另用同作者可存取貼文補測連結與下載檔名，均正確，詳見下表 |
| CASE-012 IG 烏龜影片 | BLOCKED | 原連結轉至帳號頁並顯示「連結失效或頁面不存在」；無法驗證此特定影片的重開、離開視窗與實際檔案 |
| CASE-014 31 段長文 | PASS | 日文第一段 488 字元、11 行；第 16 段 468 字元、13 行；第 31 段 303 字元、5 行；皆沒有靜態 N/31 頁碼或翻譯。英文第一段與日文逐字相同。頁面可定位全部 31 個段落工具，本輪實際複製抽驗第一、中間、最後段，未逐一複製全部 31 段 |
| CASE-015 Gboard | PASS | 日文、英文各實際複製 43 字元、2 行，雜湊相同；保留日文正文，排除翻譯及 1/3 頁碼 |
| CASE-016 新歌詞附件 | PASS | 中文、英文、日文各 174 字元、13 行，與獨立保存的預期正文逐字相同；沒有歌詞、附件歌名／歌手或翻譯 |

CASE-009、010、011 已併入上述對應案例；CASE-013 是目錄保留的歷史 ID，沒有新增或重用。

## 舊報告與補充案例

| 貼文 | 結果 |
| --- | --- |
| [英文貓咪混合媒體](https://www.threads.com/@smol_silly_cat/post/DXozwgtCYta) | 1 支影片＋4 張圖片，順序正確；5 項下載成功；VP9 MP4 全片解碼成功。未重現舊內建瀏覽器報告的影片遺漏 |
| [日文六圖長文](https://www.threads.com/@hrhyyum/post/Dd36HEMEsVi) | 日文介面有複製／媒體工具，正文 224 字元、10 行；沒有獨立翻譯行；清單 6 張圖片。未下載此六圖案例 |
| [中文混合母文](https://www.threads.com/@sharon_n825/post/DddTcKpD9-m) | 影片 1、圖片 2，實際下載 2 項成功，皆可解碼 |
| [純文字留言](https://www.threads.com/@sharon_n825/post/DddTfnrD5EF) | 從母文原生連結經 SPA 進入；下載器 post ID 對應留言、媒體 0 項；點下載所有後仍為 0 項、重試停用，沒有繼承母文媒體 |
| [原始頁碼回報第一段](https://www.threads.com/@offtimemusictw/post/Dd-kPvGEjRJ) | 324 字元、16 行，沒有 1/2 或翻譯 |
| [原始頁碼回報第二段](https://www.threads.com/@offtimemusictw/post/Dd-kq0AEl1o) | 精確定位第二段按鈕，96 字元、2 行，沒有 2/2 或翻譯 |
| [Gboard 作者回覆](https://www.threads.com/@jwander87/post/Dd9P263gTn6) | 日文介面精確定位回覆按鈕，48 字元、2 行；沒有母文的 Google Japan 或翻譯。與舊報告字元數不同，僅對本次可見內容與排除條件作驗證 |
| [底線帳號補測](https://www.threads.com/@_yunaaa_.07/post/Dd7NkMek9x_) | 工具各 1 個；乾淨連結逐字符合；圖片下載的帳號、貼文 ID 正確，JPEG 完整解碼成功。這是補充證據，不取代 CASE-008 原連結 |
| [Feed 原貼文詳情補測](https://www.threads.com/@jwander87/post/Db3BFmnAVmL) | 詳情頁懸浮下載成功；檔名包含 jwander87、Db3BFmnAVmL，無 unknown 前綴，JPEG 完整解碼成功。不是 Feed 通過證據 |

## 真實下載檔案

本輪共 19 個檔案：13 張圖片、6 支 MP4。原檔保留於 `C:/Users/Jwander/Downloads`，未刪除。檔名、大小、SHA-256、圖片格式／尺寸與影片 codec／尺寸／時長，保存於本地忽略目錄 `artifacts/chrome-live-all-2026-10-05/download-files.json`。

圖片使用 Sharp 讀取實際格式並解碼完整像素；影片使用本機既有 ffprobe 檢查串流，再以 ffmpeg 將全片解碼至空輸出，6 支均 exit 0。這確認檔案能完整解碼；沒有逐支在 Chrome 播放並以人眼／人耳驗收整段影音。

| 帳號／貼文 ID | 實際檔案 |
| --- | --- |
| kitaro_cos / DcAdX-hEV_T | `kitaro_cos_20260814-043025Z_DcAdX-hEV_T_photo_01.jpg`、`photo_02.jpg`、`photo_03.jpg`（後兩個同前綴） |
| lacaille_pikmin / Db-aDXJkhwc | `lacaille_pikmin_20260813-092254Z_Db-aDXJkhwc_photo_01.jpg` |
| jwander87 / DbzSmhCAX4B | `jwander87_20260809-014609Z_DbzSmhCAX4B_photo_01.webp`、`video_02.mp4`、`video_03.mp4`、`video_04.mp4`、`video_05.mp4`、`photo_06.webp`（同前綴） |
| smol_silly_cat / DXozwgtCYta | `smol_silly_cat_20260427-135839Z_DXozwgtCYta_video_01.mp4`、`photo_02.webp` 至 `photo_05.webp`（同前綴） |
| sharon_n825 / DddTcKpD9-m | `sharon_n825_20260919-055258Z_DddTcKpD9-m_video_01.mp4`、`photo_02.jpg`（同前綴） |
| _yunaaa_.07 / Dd7NkMek9x_ | `_yunaaa_.07_20260930-203851Z_Dd7NkMek9x__photo_01.jpg` |
| jwander87 / Db3BFmnAVmL | `jwander87_20260810-123004Z_Db3BFmnAVmL_photo_01.jpg` |

## 程式與隔離瀏覽器

以目前工作目錄直接執行，沒有重新建置或更新個人 Chrome 的擴充功能：

```powershell
npm.cmd test
npx.cmd playwright test --config tests/browser/playwright.config.mjs
```

- Node：286/286 通過，0 skipped。
- 安裝擴充功能的隔離 Chromium：15/15 通過，0 skipped。
- 包含正文保留「翻譯」字詞／正文分數、排除真實翻譯控制、靜態多位數頁碼、日文分享圖示、歌詞附件／混合祖先容器、延遲真實 storage 讀取時停用表單、SPA、16 種功能組合、選取／重開／鍵盤焦點與空媒體。
- Tampermonkey 多分頁設定各自保存與同步，由 Node 測試覆蓋；本輪沒有在個人 Chrome 啟用 Tampermonkey 做雙平台同時注入。
- 設定／同意／主題等隔離 Chromium 結果，不冒充個人 Chrome 的同一項實站驗證。

## 證據與界線

- 版本 5.3.1 由使用者更新回覆確認；沒有讀取 Chrome 擴充管理頁的安裝 manifest。新歌詞修正已由實際複製正文驗證。
- 英文、日文使用網站 `?locale=en_US`、`?locale=ja_JP`，觀察到原生介面與工具出現；未變更 Chrome 個人語言偏好。
- 實站操作使用可信任點擊與實際 Windows 剪貼簿，正文只保存於忽略的本地 artifacts，報告不轉載正文。
- 初次 CASE-002 曾因測試持有舊分頁而讀到前一案例正文，之後重新定位目標並覆寫正確證據；不列為產品失敗。
- 部分 Chrome MCP 點擊／讀取遇到暫時 timeout，依實際頁面狀態重新定位後成功；貓咪案例也曾因頁面重排進入原生媒體檢視，重新導覽後正確測試下載器。沒有將操作失敗當成產品 bug。
- 全部實際批次成功，未在真實網站製造「同批成功＋失敗」；重試失敗／取消流程的證據來自既有程式與隔離瀏覽器測試。
- 測試結束已關閉本輪建立的分頁，保留原有使用者分頁；已還原原 Windows 剪貼簿並確認一致。

原案例與機器預期維持不變。CASE-007、008、012 的 BLOCKED 不應被舊版或其他貼文的通過結果覆蓋。

## 案例移除更新 — 2026-10-05

依使用者要求，失效連結 CASE-008、CASE-012 已從現行 cases.json 與案例表移除，不再排入後續回歸；舊編號不重用。本報告上方保留本次原始測試結果。現行目錄剩 10 個案例，其中 9 個已執行檢查通過，CASE-007 的指定 Feed 情境仍待驗證。
