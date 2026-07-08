# 運用メモ

## 日常運用

1. Macを起動したままにする。
2. 専用ChromeプロファイルでGoogleログインとYouTube Summaryの動作を確認する。
3. `npm run worker` を常駐起動する。
4. スマホからVercelのURLを開いてYouTube URLを登録する。
5. 完成時はSlack DMの「アプリで開く」「Google Driveで開く」から確認する。

## Chrome処理が失敗した場合

- 初回失敗後、ワーカーはChromeを閉じて再起動し、最大2回まで再試行する。
- 2回再試行しても失敗した場合、ステータスは `chrome_automation_failed` になる。
- Slack DMを受け取ったら、手動で文字起こしを取得し、アプリの「手動」画面に貼り付ける。

## 長尺動画

- 60分超の動画は `long_video_review_required` になる。
- アプリ上で承認すると処理待ちに戻る。

## 日次上限

- 1日10本まで自動処理する。
- 上限到達時は `daily_limit_reached` になる。

## Obsidian同期

Google Drive保存後、Macで以下を実行します。

```bash
npm run sync:obsidian
```

定期実行する場合はmacOSのLaunchAgentでこのコマンドを呼び出します。
