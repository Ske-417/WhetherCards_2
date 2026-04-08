# トランプ風お天気

GitHub Pages 向けの静的Webアプリです。

## デプロイ方法（GitHub Pages）

このリポジトリには、`main` ブランチに push されたら自動デプロイする Workflow を同梱しています。

1. このブランチ（`work`）の変更を `main` へマージする。
2. GitHub の **Settings > Pages** を開く。
3. **Source** を **GitHub Actions** にする。
4. `main` へ push すると `.github/workflows/deploy-pages.yml` が実行される。

デプロイ後の公開URLは、Actionsの `Deploy to GitHub Pages` ジョブ、または Pages 設定画面で確認できます。

## ローカル確認

簡易的には以下で起動できます。

```bash
python3 -m http.server 8000
```

その後 `http://localhost:8000` を開いて動作確認してください。
