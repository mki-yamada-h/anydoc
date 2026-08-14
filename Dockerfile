# Node.js ベースイメージ
FROM node:20-alpine

# 作業ディレクトリを設定
WORKDIR /app

# パッケージファイルをコピー
COPY api/package*.json ./

# 本番依存のみインストール
RUN npm ci --only=production

# アプリケーションコードをコピー
COPY api/ .

# ヘルスチェック設定
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# ポートを公開
EXPOSE 3000

# アプリケーション起動
CMD ["node", "server.js"]
