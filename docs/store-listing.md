# Chrome Web Store 上架資料草稿

> 本檔提供可貼入 Chrome Web Store Developer Dashboard 的內容與 release gate。公開隱私政策 URL、真實瀏覽器簽核及必需圖片素材仍是明確的外部前置條件；在這些條件完成前不得把本檔視為可送審狀態。

## Release gate metadata

- Privacy policy public URL status: `PENDING_EXTERNAL`
- Manual browser sign-off status: `PENDING_MANUAL_VALIDATION`
- Required store assets status: `PENDING_SCREENSHOT`

## 名稱

Threads Plugin

## 簡短說明（zh-TW）

在 Threads 下載貼文圖片與影片，並複製貼文文字或移除追蹤參數的乾淨連結；所有頁面處理都需明確同意。

## 詳細說明（zh-TW）

Threads Plugin 在 Threads 貼文旁加入一組由使用者主動操作的匯出工具：

- 下載單張圖片或影片；
- 從一篇貼文選擇媒體，批次下載勾選項目；
- 複製貼文文字；
- 複製移除已知追蹤參數的乾淨貼文連結；
- 在 Threads 原生複製連結動作旁加入乾淨連結選項。

隱私處理採 opt-in。擴充功能在使用者同意頁面揭露前保持休眠，不掃描貼文 DOM，也不啟動網路回應擷取。啟用後，才會在本機處理目前 Threads 頁面的貼文文字、貼文 URL、公開作者名稱／識別碼、貼文代碼、媒體 URL／類型、必要 DOM 資訊，以及完成使用者操作所需的 click、pointer、scroll 與 keyboard 事件。

進階網路回應擷取是另一個預設關閉的選項，必須再次確認；只檢查 allowlist 內的 feed/post GraphQL 回應，原始 response body 不會傳到 service worker、開發者或外部伺服器。使用者可獨立關閉進階擷取或撤銷全部同意；這會權威地終止並永久鎖定目前 document 的 MAIN controller，頁面程式或再次注入都無法重啟。若在同一既開分頁重新啟用進階擷取，必須 reload 或開啟新 document。

Threads Plugin 沒有開發者後端、analytics、廣告或追蹤，不出售資料。使用者要求下載時，Chrome 會向所選媒體原有且已核准的 Threads／Instagram／CDN host 發出必要 HTTPS 請求；複製時，所選文字或連結會寫入作業系統剪貼簿。完整說明見公開隱私政策。

本擴充功能與 Meta、Instagram 或 Threads 無隸屬、背書或贊助關係。

## 類別

Productivity

## 語言

主要：繁體中文（`zh-TW`）

次要文件：英文

### English localization copy

Short description: Download Threads media and copy post text or clean links with explicit privacy controls.

Detailed description: Threads Plugin provides user-invoked tools to download images or videos from Threads posts, batch-download selected post media, copy post text, and copy clean post links. Page-content processing requires explicit consent. Optional allowlisted network-response capture is separately disclosed and disabled by default. Disabling or revoking it authoritatively stops and permanently locks the MAIN controller for the current document, so page code or reinjection cannot restart capture; re-enabling it in the same open tab requires a reload or new document. There is no developer backend, analytics, advertising, tracking, or sale of user data. The extension is not affiliated with Meta, Instagram, or Threads.

## Support URL

https://github.com/Jwander0820/threads-plugin/issues

## Homepage URL

https://github.com/Jwander0820/threads-plugin

## Privacy policy URL

Status: `PENDING_EXTERNAL` — `PRIVACY.md` 尚未存在於目前公開的 `main`，因此下列目標 URL 現在不可當成已完成的 Dashboard 值。必須在另獲 commit/push 或其他公開託管授權後，確認瀏覽器未登入也能透過 HTTPS 開啟，再把 Release gate metadata 改為 `READY`。

https://github.com/Jwander0820/threads-plugin/blob/main/PRIVACY.md

## Dashboard Privacy：Single purpose

在 Threads 貼文上提供由使用者主動操作的媒體下載，以及貼文文字／乾淨連結複製工具。

下載、批次選擇、文字複製與連結清理都屬於同一個「匯出目前 Threads 貼文內容」目的；擴充功能不提供廣告、搜尋替換、新分頁、帳號自動化或其他無關功能。

## Dashboard Privacy：Permission justification

逐項貼入 Dashboard 的內容見 [`permissions-justification.md`](permissions-justification.md)：

- `downloads`：只在使用者選擇媒體後，由 service worker 再驗證 sender、consent、URL、host、類型與檔名，才交由 Chrome 儲存。
- `storage`：只保存正規化功能／時間選項與 consent state。
- `scripting`：只用於第二層 opt-in 的 packaged MAIN-world capture 動態註冊、在目前分頁執行權威終止，以及取消未來註冊；被終止的目前 document 必須 reload 或開啟新 document 才能再次擷取。
- Host permissions：只限四個精確 Threads origin，用來顯示控制項並限制可選的進階 capture 範圍。

## Dashboard Privacy：Remote code

回答：**No, this extension does not use remote code.**

所有可執行 JavaScript 都在 ZIP 內；不使用遠端 `<script>`、遠端 `importScripts`、`eval`、`new Function` 或從網路取得後執行的邏輯。Threads GraphQL JSON 與媒體檔案都只當成資料，不當成程式碼。

## Dashboard Privacy：Data usage mapping

以下採保守揭露；送審當日仍須依 Dashboard 實際欄位名稱逐項核對，且不得選擇「完全不處理使用者資料」。官方政策把純本機處理也視為需要揭露的 data handling。

- **Personally identifiable information — Yes:** 目前貼文中公開的作者 username／identifier；只在分頁記憶體中用於貼文辨識與下載檔名。
- **Website content — Yes:** 貼文文字、使用者產生內容、貼文／媒體 URL、貼文代碼、媒體類型與必要 DOM；用於下載、複製、排序及 UI。
- **Web history — Yes（保守選擇）:** 只處理目前支援的 Threads route／post URL，用於敏感路徑休眠、SPA 路由隔離與正確貼文連結；不建立或持久化瀏覽紀錄。
- **User activity — Yes（保守選擇）:** 只即時處理完成 UI 定位與使用者要求所需的 trusted click、pointer、scroll 與 keyboard events；不建立行為分析或活動紀錄。
- **Personal communications — No:** 私訊／inbox 路徑不啟動 runtime；不讀取私訊內容。
- **Authentication information — No:** 不讀取密碼、登入 token 或 authentication cookies。
- **Financial and payment information — No.**
- **Health information — No.**
- **Location — No.**

Dashboard certifications 全部應與程式碼及公開政策一致：

- 資料只用於或改善已揭露的單一目的；
- 不出售資料，也不移轉給無關的 analytics、廣告或追蹤服務；
- 不用於個人化廣告、profiling、信用或貸款判定；
- 不讓開發者或其他人員讀取使用者資料；
- 使用者要求下載時，只有既有媒體 host 收到傳回檔案所需的 HTTPS 請求；複製內容只寫入使用者的作業系統剪貼簿；
- 遵守 Chrome Web Store User Data Policy，包括 Limited Use requirements。

## Store disclosure summary

- Website content／公開作者識別碼／目前 Threads URL／必要 UI events：只在明確同意後於本機處理，以完成使用者要求。
- 進階 allowlisted GraphQL response inspection：第二層 opt-in、預設關閉。
- 開發者收集、analytics、profiling、廣告、追蹤、資料出售：無。
- Remote code：無。
- Single purpose：Threads 貼文媒體下載與貼文文字／乾淨連結複製。

## Asset checklist

- **必需 — 128×128 Store／extension icon:** `extension/icon.svg` 是由設計者提供的 `ThreadsPlugin_org.svg` 正式向量原檔副本，`extension/icons/icon-128.png` 是 Store／extension 使用的正式輸出；16、32、48 px 版本由同一原檔產生。
- **必需 — 至少一張 screenshot:** 尚未建立 `docs/store-assets/screenshot-01.png`；必須從真實安裝版本擷取 1280×800（優先）或 640×400 的滿版畫面。
- **必需 — 440×280 small promotional tile:** `store-assets/promo-tile-source.png` 是設計者提供的正式 raster source，建置後輸出為 `docs/store-assets/small-promo-440x280.png`；Dashboard 上傳前仍須人工確認實際預覽沒有裁切。
- **選用 — 1400×560 marquee image:** 只有完成品牌與內容審查後才上傳。
- Manifest／toolbar icons：16×16、32×32、48×48、128×128 均已 packaged。

最終 screenshot 必須呈現送審版本真實體驗（例如首次揭露、貼文控制項、媒體 picker 或 options），不得使用私密貼文、憑證、模糊／拉伸圖片、圓角留白或與現版不一致的 mock。正式 icon、screenshot 與 promotional tile 全部定稿並核對後，才將 Required store assets status 改為 `READY`。

## Distribution draft

以下是建議值，仍須由擁有者在 Dashboard 確認：

- Visibility：Public。
- Regions：Chrome Web Store 支援的全部地區；若擁有者希望限制地區，送審前改為實際選擇。
- Pricing：Free；沒有付費功能或 in-app purchase。
- Mature content：No。

## Reviewer test instructions

公開貼文的基本流程不需要把登入憑證放進 repo。可貼給 reviewer：

1. 安裝 extension 後開啟 `https://www.threads.com/` 或任一公開、含圖片／影片的 Threads 貼文。
2. 首次只會看到頁面內容處理揭露；按「同意並啟用」後才會出現下載與複製控制項。按「暫不啟用」會保持休眠且不重複提示。
3. 在公開貼文測試單張媒體下載、媒體 picker、貼文文字複製與乾淨連結複製。下載會寫入 Chrome Downloads；複製結果會寫入系統剪貼簿。
4. 點 extension action icon 開啟 options。進階網路回應擷取預設關閉；勾選時會先出現第二層揭露，取消不會啟用。確認啟用後，依提示 reload 已開啟的 Threads 分頁（建立新 document）。
5. 從 options 停用進階擷取；目前 document 的 fetch/XHR wrapper 應立即還原並永久鎖定，頁面內容工具仍依第一層同意運作。在不 reload 的同一 document 重新啟用時，capture 應維持停止；reload 或開啟新 document 後才可再次啟動。再撤銷全部同意，控制項應立即移除，重新同意前維持休眠。
6. 瀏覽 `/login/`、`/messages/` 或 `/settings/` 等敏感路徑時，不應出現揭露或功能控制項，也不應啟動 capture。

若 Store reviewer 無法在未登入狀態存取測試貼文，擁有者應只透過 Dashboard 的 Test instructions／credentials 欄位安全提供專用測試帳號；不得把憑證寫入 repo、ZIP、issue、screenshot 或一般 listing 文案。

## External submission preconditions

- 完成 `manual-test-checklist.md` 全部項目與 sign-off，並把 Manual browser sign-off status 改為 `READY`。
- 真實已安裝版本的 1280×800 screenshot 與 440×280 small promo tile 已完成並通過本機尺寸／內容檢視；Dashboard 上傳前仍應確認實際預覽沒有裁切。
- 將 `PRIVACY.md` 發佈到穩定、無需登入的 HTTPS URL，逐字核對公開內容後，把 Privacy policy public URL status 改為 `READY`。
- 在 Dashboard 核對 developer account 的聯絡信箱、身分／付款註冊狀態、single purpose、permissions、remote code、data usage certifications、distribution 與 reviewer instructions。
- 重新確認 production ZIP checksum 與真實驗收所用 build 完全相同。
- 未獲使用者另外明確授權前，不得 upload、submit for review 或 publish。
