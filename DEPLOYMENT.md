# デプロイメントガイド

anydoc API サーバーのローカルテスト手順を説明します。

## 前提条件

- Docker Desktop がインストールされていること
- Docker Compose がインストールされていること（Docker Desktop に含まれます）
- curl または Postman がインストールされていること（API テスト用）

## ローカルテスト手順

### ステップ 1: リポジトリの準備

```bash
# リポジトリをクローン
git clone https://github.com/mki-yamada-h/anydoc.git
cd anydoc

# feature/azure-api-server ブランチに切り替え
git checkout feature/azure-api-server
```

### ステップ 2: 環境変数ファイルの作成

```bash
# api ディレクトリに .env ファイルを作成
cd api
cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
API_KEY_ENABLED=true
API_KEY=dev-api-key-12345-change-in-production
AZURE_STORAGE_ENABLED=false
AZURE_STORAGE_CONTAINER=documents
AZURE_STORAGE_SAS_EXPIRY_HOURS=24
EOF
```

**注：** ローカルテストでは Azure Blob Storage は無効化されています。
ストレージ機能をテストする場合は、`AZURE_STORAGE_ENABLED=true` に変更し、
`AZURE_STORAGE_CONNECTION_STRING` を設定してください。

### ステップ 3: Docker Compose で起動

```bash
# プロジェクトルートに戻る
cd ..

# Docker イメージをビルドしてコンテナを起動
docker-compose up --build
```

初回は依存パッケージのインストール等で 1-2 分かかることがあります。
以下のログが表示されれば、サーバーの起動に成功しています：

```
[SERVER] anydoc API Server started
[SERVER] Environment: development
[SERVER] Listening on port: 3000
[AUTH] API Key authentication is ENABLED
[STORAGE] Azure Blob Storage is DISABLED
```

### ステップ 4: API のテスト

別のターミナルウィンドウを開いて、以下のコマンドでテストを実行します。

#### ヘルスチェック

```bash
curl http://localhost:3000/health
```

**レスポンス例：**
```json
{
  "status": "ok",
  "timestamp": "2026-08-14T05:30:00.000Z"
}
```

#### ファイル変換テスト（メモリ処理）

```bash
curl -X POST \
  -H "Authorization: Bearer dev-api-key-12345-change-in-production" \
  -F "file=@path/to/your/document.pdf" \
  http://localhost:3000/api/convert
```

**レスポンス例：**
```json
{
  "success": true,
  "filename": "document.pdf",
  "markdown": "# Document Title\n\nContent here..."
}
```

#### ファイル変換＆ストレージ保存テスト

```bash
curl -X POST \
  -H "Authorization: Bearer dev-api-key-12345-change-in-production" \
  -F "file=@path/to/your/document.docx" \
  http://localhost:3000/api/convert-to-storage
```

**レスポンス例（ストレージ無効時）：**
```json
{
  "success": true,
  "filename": "document.docx",
  "markdown": "# Document Title\n\nContent here...",
  "inputFileUrl": null,
  "outputFileUrl": null,
  "expiresIn": "24 hours"
}
```

### ステップ 5: ログの確認

コンテナのログをリアルタイムで確認する場合：

```bash
docker-compose logs -f api
```

### ステップ 6: クリーンアップ

テスト完了後、コンテナを停止します：

```bash
# コンテナ停止
docker-compose down

# イメージ・ボリュームも削除する場合
docker-compose down -v
```

## トラブルシューティング

### ポート 3000 が既に使用されている場合

```bash
# docker-compose.yml でポート番号を変更
# ports:
#   - "3001:3000"  # ホスト側を 3001 に変更

docker-compose up --build
```

### Docker イメージの再構築

キャッシュを無視してイメージを再構築する場合：

```bash
docker-compose build --no-cache
docker-compose up
```

### コンテナ内で対話的にデバッグ

```bash
docker-compose exec api sh

# 内部から npm スクリプト実行など可能
npm list
node --version
```

### ネットワークエラー

Windows の場合、ファイアウォール設定によってアクセスがブロックされることがあります。
Docker Desktop のファイアウォール例外設定を確認してください。

macOS の場合、Docker Desktop が十分なリソース（メモリ、CPU）を割り当てられているか確認してください。
Docker Desktop → Preferences → Resources から設定を確認できます。

## Windows での特別な注意事項

- **改行コード（CRLF vs LF）**: 
  git でチェックアウト時に改行が CRLF に変換される場合があります。
  以下で LF に統一することをお勧めします：
  ```bash
  git config --global core.autocrlf false
  ```

- **パスの指定**:
  curl でファイルパスを指定する際は、バックスラッシュではなくフォワードスラッシュを使用してください：
  ```bash
  # ✅ 推奨
  -F "file=@C:/Users/username/Documents/file.pdf"
  
  # ❌ 非推奨
  -F "file=@C:\Users\username\Documents\file.pdf"
  ```

- **PowerShell でのエスケープ**:
  PowerShell を使用する場合、ダブルクォートをエスケープする必要があります：
  ```powershell
  curl -X POST `
    -H "Authorization: Bearer dev-api-key-12345-change-in-production" `
    -F "file=@C:/Users/username/Documents/file.pdf" `
    http://localhost:3000/api/convert
  ```

## macOS での特別な注意事項

- **M1/M2 チップ搭載 Mac**:
  docker-compose.yml でプラットフォームを明示的に指定することで、パフォーマンスが向上する場合があります：
  ```yaml
  services:
    api:
      platform: linux/amd64
  ```

- **ファイルシステムのパフォーマンス**:
  Docker Desktop のファイル共有パフォーマンスが低い場合、ボリューム設定を調整してください。
  詳細は [Docker Desktop for Mac のドキュメント](https://docs.docker.com/desktop/mac/troubleshoot/#performance) を参照してください。

## 次のステップ

- [Azure Container Instances へのデプロイ](./DEPLOYMENT.md#azure-container-instances-へのデプロイ)（今後追記）
- [Azure App Service へのデプロイ](./DEPLOYMENT.md#azure-app-service-へのデプロイ)（今後追記）
