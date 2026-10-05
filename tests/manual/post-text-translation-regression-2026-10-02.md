# 翻譯控制與串文頁碼順序 — 2026-10-02

使用者案例：[Gboard 貼文](https://www.threads.com/@jwander87/post/Dd8UsZyjzd9)，已加入本機實站測試集 CASE-015。

## 根因與修正

- 實站排列為正文 → NBSP → inline-block wrapper → `div[role=button]` 翻譯控制 → NBSP → 靜態 `1/3` 徽章。實際文字拆成多行，控制底部187px、正文底部約189.8px，符合既有幾何判斷。
- 原清理先辨識字尾控制，再清頁碼，控制被頁碼遮在字尾判斷之外；頁碼清掉後留下翻譯。5.3.0 的 `0c6f81e` 也是先做翻譯尾端處理，再呼叫 `stripTrailingCarouselCounter()`，所以相同DOM排列已有此缺口；不是所有貼文都一定發生。
- 現在由實際已確認的最末UI決定順序。若頁碼在末尾，先刪頁碼再辨識控制；否則清控制後再辨識頁碼。每種UI最多清一次，避免同一控制的文字再誤刪普通正文同名尾字。
- 純正文「翻譯」、Translate、翻訳、Traduire、普通或分行分數均保留，沒有依作者、貼文ID、網址或語言做特例。

## 驗證與界線

- 新增兩個Node回歸測試先重現失敗，再驗證混合UI的兩種順序、NBSP及尾空白、同名正文尾行、同值正文分數與分行分數均符合預期。
- 從實站唯讀保存主文及無頁碼回覆的DOM、computed style、尺寸與rendered text，使用新函式重播後，兩段正文完全一致（原有尾端空白整理除外）。證據在 `artifacts/post-text-regression/translation-live-fragments.json`、`replay-translation-dom.mjs`、`translation-dom-result.json`、`translation-page.jpg`。
- 同步重播之前offtimemusictw主文與續篇，以及Jellycat全部31篇；徽章排除與正文保留均通過。
- `npm.cmd run verify` 全部266個Node測試通過，權限與生成同步檢查通過。安裝擴充Chromium全部12個案例通過，長篇案例內含11組頁碼及中英日控制的兩種順序，實際剪貼簿核對與控制幾何斷言皆通過；案例集驗證5/5通過。
- 已重新生成兩平台5.3.1產物並封裝Chrome ZIP，`verify:package`通過，SHA256為 `9d17ef2ccc83a107ef1a38d74c688b399ae4d05bd41c727b3309d984d2f6ceb6`。未提交或發布。
- 安裝擴充的合成頁面驗證會覆蓋同樣的role控制巢狀結構、兩種排列、中英日文字與實際剪貼簿。這與使用者瀏覽器上的新建置實站剪貼簿回測是不同證據；本輪未在個人Chrome操作或發布新版本。
- 獨立審查另有非本案例的合成風險：祖先額外padding導致控制底部差超過6px、含SVG的控制、更多連續控制。未取得相應實站失敗證據，沒有擴大本輪修法或將其宣稱已解決。
