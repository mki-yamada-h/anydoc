/**
 * Express APIサーバー
 * anydoc ライブラリを使用したドキュメント変換 API
 */

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { initializeBlobClient } = require('./storage');
const convertRoutes = require('./routes/convert');

const app = express();

// =======================================
// ミドルウェア設定
// =======================================

// JSON パーサー
app.use(express.json());

// ファイルアップロード設定
// メモリに一時保存（ファイルサイズ上限: 50MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    // ファイル名のログ
    console.log(`[MULTER] File received: ${file.originalname} (${file.mimetype})`);
    cb(null, true);
  }
});

// =======================================
// ルート定義
// =======================================

/**
 * GET /health
 * ヘルスチェックエンドポイント（認証不要）
 */
app.get('/health', (req, res) => {
  console.log('[HEALTH] Health check request');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

/**
 * ファイル変換ルートをマウント
 * POST /api/convert
 * POST /api/convert-to-storage
 */
app.post('/api/convert', upload.single('file'), convertRoutes);
app.post('/api/convert-to-storage', upload.single('file'), convertRoutes);

// =======================================
// エラーハンドリング
// =======================================

/**
 * 404 Not Found
 */
app.use((req, res) => {
  console.log(`[404] Not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found',
    code: 'endpoint_not_found'
  });
});

/**
 * グローバルエラーハンドリング
 */
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err.message);

  // multer エラー（ファイルサイズオーバー等）
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'file_too_large',
        message: 'File size exceeds maximum limit (50MB)',
        code: 'file_size_exceeded'
      });
    }
    return res.status(400).json({
      error: 'upload_error',
      message: err.message,
      code: err.code
    });
  }

  // その他のエラー
  res.status(500).json({
    error: 'internal_server_error',
    message: 'An unexpected error occurred',
    code: 'internal_error'
  });
});

// =======================================
// サーバー起動
// =======================================

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * サーバー起動
 */
async function startServer() {
  try {
    // Azure Blob Storage を初期化
    initializeBlobClient();

    // サーバー起動
    app.listen(PORT, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[SERVER] anydoc API Server started`);
      console.log(`[SERVER] Environment: ${NODE_ENV}`);
      console.log(`[SERVER] Listening on port: ${PORT}`);
      console.log(`[SERVER] API endpoint: http://localhost:${PORT}/api/convert`);
      console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
      console.log(`${'='.repeat(60)}\n`);

      // 認証設定をログ
      if (process.env.API_KEY_ENABLED === 'true') {
        console.log(`[AUTH] API Key authentication is ENABLED`);
      } else {
        console.log(`[AUTH] API Key authentication is DISABLED (for development only)`);
      }

      // ストレージ設定をログ
      if (process.env.AZURE_STORAGE_ENABLED === 'true') {
        console.log(`[STORAGE] Azure Blob Storage is ENABLED`);
        console.log(`[STORAGE] Container: ${process.env.AZURE_STORAGE_CONTAINER}`);
        console.log(`[STORAGE] SAS Expiry: ${process.env.AZURE_STORAGE_SAS_EXPIRY_HOURS || 24} hours`);
      } else {
        console.log(`[STORAGE] Azure Blob Storage is DISABLED`);
      }

      console.log('');
    });
  } catch (error) {
    console.error('[STARTUP] Failed to start server:', error);
    process.exit(1);
  }
}

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// サーバー起動
startServer();

module.exports = app;
