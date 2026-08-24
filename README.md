<p align="center">
  <img src="extension/icons/icon-128.png" alt="Threads Plugin icon" width="96" height="96">
</p>

<h1 align="center">Threads Plugin</h1>

<p align="center">Threads 貼文下載、文字複製與乾淨連結工具</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/threads-plugin-clean-link/ebgjgcallolfhondokaipglckandpkhc"><strong>Chrome Web Store</strong></a>
  ·
  <a href="https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js"><strong>Tampermonkey Userscript</strong></a>
</p>

Threads Plugin 是一套 Threads 貼文內容工具，提供 Tampermonkey 腳本與 Chrome 擴充功能兩種版本。

它可以直接在 Threads 貼文旁下載圖片或影片、選擇輪播媒體批次下載、複製貼文文字，以及取得移除追蹤參數的乾淨連結。

## 功能

- 單張或批次下載 Threads 貼文中的圖片與影片。
- 複製整理後的貼文文字。
- 複製移除追蹤參數的乾淨連結，也可從 Threads 分享選單使用。
- 下載、文字與連結工具皆可個別開關。

## 支援平台

### Tampermonkey

正式 userscript 是 repo 根目錄的 [`threads-plugin.user.js`](threads-plugin.user.js)。

安裝 Tampermonkey 後，可直接[安裝 GitHub Raw 版本](https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js)。

Greasy Fork 安裝版由 Greasy Fork 提供更新；兩種來源請擇一使用，避免重複注入。

### Chrome 擴充功能

Chrome 擴充功能已於 Chrome Web Store 正式上線，可直接安裝並由 Chrome 接收後續更新：

[**從 Chrome Web Store 安裝 Threads Plugin**](https://chromewebstore.google.com/detail/threads-plugin-clean-link/ebgjgcallolfhondokaipglckandpkhc)

使用 Chrome 擴充功能時，請停用 Tampermonkey 中的 Threads Plugin，避免同一頁面重複載入工具。

## 使用方式

安裝後開啟支援的 Threads 頁面：

1. 在貼文媒體旁使用下載按鈕下載單一項目。
2. 使用貼文工具列開啟媒體選擇器，勾選需要的圖片或影片。
3. 使用文字或連結按鈕複製貼文內容與乾淨連結。

四項頁面功能可以獨立啟用。Chrome 擴充功能請從設定頁調整；Tampermonkey 版請從腳本管理器的 Threads Plugin 選單切換。變更會套用到目前已開啟的 Threads 頁面，不需要重新載入。

Chrome 擴充功能預設跟隨 Threads 語言，也可在設定頁手動選擇繁體中文或英文。

Chrome 版第一次使用時會先顯示頁面內容處理說明；同意後才會啟用貼文工具。進階網路擷取預設關閉，只有另外確認後才會啟用，並可隨時從設定頁停用或撤銷。

登入、私訊、帳號、安全與設定等敏感頁面不啟用 Chrome 版的內容工具或進階擷取。

## 隱私

Threads Plugin 不設開發者後端，不包含 analytics、廣告或追蹤，也不出售資料。貼文與媒體資訊只在完成使用者要求時於本機處理；下載檔案與剪貼簿內容由瀏覽器及作業系統管理。

完整說明請參閱 [PRIVACY.md](PRIVACY.md)。

## 開發

原始碼位於 `src/`。修改後執行：

```powershell
npm.cmd run build
npm.cmd run verify
```

build 會更新根目錄的 Tampermonkey 成品 `threads-plugin.user.js`，並在 `dist/chrome-extension` 產生 Chrome 擴充功能。

專案結構、測試、安全與維護規則請參閱：

- [架構說明](docs/ARCHITECTURE.md)
- [測試矩陣](docs/TEST_MATRIX.md)
- [安全審查](docs/SECURITY_REVIEW.md)

## License

[MIT](LICENSE)
