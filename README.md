# Threads Plugin

Threads Plugin 是一套 Threads 貼文內容工具，提供 Tampermonkey userscript 與 Manifest V3 Chrome Extension 兩種版本。

它可以直接在 Threads 貼文旁下載圖片或影片、選擇輪播媒體批次下載、複製貼文文字，以及取得移除追蹤參數的乾淨連結。

## 功能

- 下載單張圖片或影片。
- 依原始順序顯示圖片／影片混合輪播，並批次下載勾選項目。
- 複製清理介面文字後的貼文內容。
- 複製移除已知追蹤參數的貼文連結。
- 在 Threads 原生分享選單中加入乾淨連結操作。
- 隔離引用、回覆與外層貼文，避免下載到錯誤媒體。
- 支援 Threads 單頁導覽，切換貼文後不沿用上一頁的媒體資料。
- 支援鍵盤操作、焦點管理與 Escape 關閉媒體選擇器。

## 支援平台

### Tampermonkey

正式 userscript 是 repo 根目錄的 [`threads-plugin.user.js`](threads-plugin.user.js)。

安裝 Tampermonkey 後，可由以下網址安裝 GitHub Raw 版本：

```text
https://raw.githubusercontent.com/Jwander0820/threads-plugin/main/threads-plugin.user.js
```

Greasy Fork 安裝版由 Greasy Fork 提供更新；兩種來源請擇一使用，避免重複注入。

### Chrome Extension

Chrome Web Store 版本尚未上架。目前可從 source 建置後，以開發人員模式載入：

```powershell
npm.cmd ci
npm.cmd run build
```

開啟 `chrome://extensions`、啟用「開發人員模式」，再以「載入未封裝項目」選擇 `dist/chrome-extension`。

測試 Chrome Extension 時請停用 Tampermonkey 中的 Threads Plugin。

## 使用方式

安裝後開啟支援的 Threads 頁面：

1. 在貼文媒體旁使用下載按鈕下載單一項目。
2. 使用貼文工具列開啟媒體選擇器，勾選需要的圖片或影片。
3. 使用文字或連結按鈕複製貼文內容與乾淨連結。

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

build 會更新根目錄的 Tampermonkey 成品 `threads-plugin.user.js`，並在 `dist/chrome-extension` 產生 Chrome Extension。

專案結構、測試、安全與維護規則請參閱：

- [架構說明](docs/ARCHITECTURE.md)
- [測試矩陣](docs/TEST_MATRIX.md)
- [安全審查](docs/SECURITY_REVIEW.md)

## License

[MIT](LICENSE)
