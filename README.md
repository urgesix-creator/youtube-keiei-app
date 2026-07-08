# YouTube経営実践アプリ

スマホからYouTubeリンクを貼り付け、Mac上の専用ChromeプロファイルでYouTube Summaryのトランスクリプト/翻訳を取得し、中小企業向けの経営実践レポートとSNS別原稿を生成する自分専用Webアプリです。

## 構成

- Webアプリ: Next.js App Router
- 配置先: Macローカル常駐。必要に応じてVercelへ配置
- 認証: ローカルID・パスワード。必要に応じてSupabase Auth併用
- 履歴DB: Supabase Postgres
- AI生成: OpenAI API
- 保存: Google Drive Markdown
- Obsidian: Mac側同期スクリプト
- 通知: Slack 自分宛DM
- 文字起こし取得: Mac常駐Chromeワーカー + YouTube Summary

## 主な機能

- YouTube URLを1本ずつ登録
- 一括出力と個別出力
- Chrome処理失敗時の最大2回リトライ
- 手動文字起こし貼り付け再開
- 経営実践レポート、X、Threads、note、Instagram一式の生成
- 勧誘・セールス表現の本文除外
- 1動画1Markdownでローカル/Obsidian保存。Google Drive設定時はDriveにも保存
- 完成時Slack DM通知
- 完成画面の媒体別コピーボタン
- 履歴検索と再表示

## 初期セットアップ

1. 依存関係を入れる

```bash
npm install
```

2. `.env.example` を参考に `.env.local` を作る

3. Supabase SQL Editorで以下を実行する

```text
supabase/migrations/20260708000000_initial_schema.sql
```

4. `.env.local` に `APP_LOGIN_ID`、`APP_LOGIN_PASSWORD`、`APP_USER_ID` を設定する

5. 外部公開する場合は、Vercel環境変数に `.env.example` と同じ値を設定する

6. Macワーカー用に `.env.worker.example` を参考に `.env.worker` を作る

7. 専用ChromeプロファイルでYouTube Summaryが使える状態にする

## 開発起動

```bash
npm run dev
```

## Mac Chromeワーカー

```bash
npm run worker
```

ワーカーは60秒ごとに未処理ジョブを確認し、専用ChromeプロファイルでYouTube Summaryのトランスクリプト/翻訳を取得します。

YouTube Summaryの画面構成が変わった場合は、`.env.worker` の以下を調整します。

```text
YOUTUBE_SUMMARY_OPEN_SELECTOR=
YOUTUBE_SUMMARY_TRANSLATE_SELECTOR=
YOUTUBE_SUMMARY_TRANSCRIPT_SELECTOR=
```

## Obsidian同期

```bash
npm run sync:obsidian
```

通常の生成完了時は `OBSIDIAN_VAULT_PATH` / `OBSIDIAN_TARGET_DIR` に直接保存します。
Google Driveから再同期したい場合だけ、以下を実行します。

## ローカル動作確認用AIモック

OpenAI APIを呼ばずにUIと保存処理を確認する場合は、`.env.local` に以下を設定します。

```text
USE_MOCK_AI=true
```

本番運用では `false` にしてください。

## 重要な注意

- VercelだけではMac上のChromeを操作できないため、Mac常駐ワーカーが必須です。
- 携帯電話から使う場合は、Macと同じネットワーク内で `http://<MacのIP>:3001` を開きます。
- Chrome実画面操作は、YouTubeや拡張機能の画面変更で失敗する可能性があります。
- Google Drive保存には、サービスアカウントが保存先フォルダへ書き込める必要があります。未設定の場合はローカルMarkdownリンクとObsidian保存で完了します。
- Slack DM送信にはSlack Appの権限と自分のSlackユーザーIDが必要です。
- `SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY`、`APP_LOGIN_PASSWORD`、`SLACK_BOT_TOKEN`、`GOOGLE_PRIVATE_KEY` はブラウザに出さないでください。

## 仕様書

[20260708_youtube_summary_app_spec.md](./20260708_youtube_summary_app_spec.md)
