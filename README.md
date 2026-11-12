# 單字散步 · Word Walk

在 Agent Pets 以日文 N5 翻卡學習 674 個單字，也能用六種題型練習日文與生活英文。介面可切換繁體中文與英文。

## 小測驗

進入「小測驗」選擇學習語言、題型和題數。每輪可做 3、5 或 10 題，也可選「混合題型」交替練習。每題送出後立即顯示正解，結束時可查看得分及錯題。切換分頁可以接續，測驗紀錄保留至插件重啟。

| 學習語言 | 題型 | 題庫 |
| --- | --- | --- |
| 日文 | 看日文選英文詞義、看漢字選讀音、看假名與詞義選日文寫法 | 沿用已驗證的 OpenJLPT N5。讀音與寫法題會篩選含漢字的詞條。 |
| 英文 | 看英文選繁中詞義、句子選詞填空、依繁中提示重組字母並輸入單字 | 隨插件附上 48 個生活單字、繁中釋義與 Word Walk 原創例句，可離線使用。 |

日文每日複習沿用原有自評與排程。小測驗的客觀得分獨立計算，兩種練習可以交錯使用。

## 安裝與使用

1. 使用 Agent Pets 1.14.0 或以上版本，開啟「設定 → 插件 → 線上插件目錄」，在目錄裡選取「單字散步」。也可以從檔案安裝商店提供的同一套件。
2. 核對發行者指紋 `4243 6e4d 75b7 4141`，檢視權限後安裝並啟用。
3. 選「開始每日練習」，先做最多 10 個到期詞，再看 5 個新字。可在設定中調整數量。選「本次練習」則練習 3、5 或 10 個隨機字，作答只保留在記憶體。
4. 空白鍵翻面，1、2、3 分別代表「再練一次」「有點吃力」「記得」。第一次標為再練的詞會回到這一輪，最多回插一次。總數按不同單字計算。

每日練習把目前卡片、自評與下次複習日期保存在本機。新字在隔天複習，之後按自評依序延長至 3、7、14、30、60、120 天。同日重看只更新自評。重啟後可回到今天的進度，需連線再次取得題庫。宿主接受儲存後會延後寫入磁碟，突然斷電時可能遺失最近一次變更。

「單字本」可按單字、假名或英文搜尋，也可只看待複習或需要再練的詞。在「設定與備份」可複製 JSON 備份、貼上預覽還原或清除進度。確認覆蓋前會顯示影響的單字數，另保留上一次替換前的資料。每日提醒預設關閉；開啟後，在所選時間起的一小時內、App 運行且仍有任務時提醒一次。寵物徽章預設顯示待複習單字數。若要隱藏，請在「設定與備份」取消勾選「在寵物徽章顯示待複習單字數」，再按「套用設定」。每日完成時也可選擇讓寵物鼓勵你。

## 資安與資料來源

Worker 透過宿主代理向 `raw.githubusercontent.com` 取得固定 Git commit 的題庫。下載請求不含作答資料。先比對位元組數與 SHA-256，再驗證程度、詞條 ID、欄位與例句識別碼。遠端文字以 DOM 文字節點呈現。可開啟的外部連結限 GitHub、Creative Commons 與 Tatoeba。

本機儲存用於作答、設定與還原前的備份。排程用於選用提醒及更新徽章。插件透過宿主發送通知、顯示徽章及完成反應，無執行期第三方套件。

資料採 OpenJLPT 的 CC BY-SA 4.0 授權，選取原文欄位呈現。來源包括 Jonathan Waller、EDRDG 的 JMdict 與 KANJIDIC2，以及 Tatoeba。每個採用的日文例句附原句與作者入口。原始 NOTICE 與 LICENSE 收在 `plugin/legal/openjlpt.json`。[上游授權聲明](https://github.com/evanclan/OpenJLPT/blob/0d1d3410bec90bd4098a7c72de820543cb4f707c/NOTICE.md)

## 建置與驗證

使用 Node.js 22.12 以上與 PowerShell 7。以下指令分別執行離線測試、正式題庫契約檢查及開發套件建置。

```powershell
node --test tests/*.test.js
node scripts/check-source.js
pwsh -NoProfile -File scripts/package.ps1
```

正式發行使用 Windows。以發行者帳號執行 `pwsh -NoProfile -File scripts/package.ps1 -Sign`。首度建立發行者金鑰時才加上 `-InitializePublisher`。Ed25519 私鑰以 Windows CurrentUser DPAPI 加密存放在 `%LOCALAPPDATA%\WordWalk\signing\publisher.dpapi`。請依 Windows 帳號的復原程序備份金鑰與 DPAPI 使用者設定檔。更新已上架的插件時先核對指紋。

簽章涵蓋封裝內每個內容檔案的相對路徑及雜湊。打包工具只收錄指定檔案，最後印出整包 SHA-256。安裝包位於 `build/word-walk.agentpet-plugin`。隔離 Electron 驗收使用 `tests/electron.mjs`，啟動方式見 [測試環境說明](docs/phase-reports/wp-1.md#重跑-electron-驗收)。

## English

Open **Quiz** for Japanese N5 or Everyday English. Choose one format or mix all three for your chosen language. Japanese quizzes cover meanings, kana readings and written forms. English quizzes cover Traditional Chinese meanings, sentence completion and spelling from scrambled letters. Each round ends with a score and a review of missed answers. English content is bundled for offline use.

Enable the online plugin catalog in Agent Pets 1.14.0 or later, install **Word Walk** and verify the publisher fingerprint above. Select **English** in the panel. Daily practice keeps your progress on this device and schedules reviews. **Practice without saving** keeps ratings in memory. Vocabulary supports search and due-word filtering. In **Settings & backup**, set your daily limits, opt into reminders, export progress or preview a restore. To hide the count, clear **Show due word count on the pet badge** and select **Save settings**. The first practice after a restart downloads the pinned Japanese N5 deck with English definitions.
