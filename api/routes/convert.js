/**
 * ファイル変換ルート
 * POST /api/convert - ファイル変換（メモリ処理）
 * POST /api/convert-to-storage - ファイル変換＆ストレージ保存
 */

const express = require('express');
const { toMarkdownBytes } = require('@firecrawl/anydoc');
const { uploadFile, isStorageEnabled } = require('../storage');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/convert
 * ファイルをアップロードして Markdown に変換
 * レスポンスに直接 Markdown を含める
 */
router.post('/convert', authMiddleware, async (req, res) => {
  try {
    console.log('[CONVERT] Received file conversion request');

    // ファイルがアップロードされているかチェック
    if (!req.file) {
      console.log('[CONVERT] No file provided');
      return res.status(400).json({
        error: 'bad_request',
        message: 'No file provided',
        code: 'missing_file'
      });
    }

    const { filename, buffer } = req.file;
    console.log(`[CONVERT] Processing file: ${filename} (size: ${buffer.length} bytes)`);

    // anydoc でファイルを変換
    let markdown;
    try {
      markdown = await toMarkdownBytes(buffer);
    } catch (error) {
      return handleConversionError(error, res);
    }

    console.log(`[CONVERT] File converted successfully (size: ${markdown.length} bytes)`);

    res.status(200).json({
      success: true,
      filename: filename,
      markdown: markdown
    });
  } catch (error) {
    console.error('[CONVERT] Unexpected error:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred during conversion',
      code: 'internal_server_error'
    });
  }
});

/**
 * POST /api/convert-to-storage
 * ファイルをアップロード、Markdown に変換、ストレージに保存
 * レスポンスに SAS URL を含める
 */
router.post('/convert-to-storage', authMiddleware, async (req, res) => {
  try {
    console.log('[CONVERT-STORAGE] Received file conversion request with storage');

    // ファイルがアップロードされているかチェック
    if (!req.file) {
      console.log('[CONVERT-STORAGE] No file provided');
      return res.status(400).json({
        error: 'bad_request',
        message: 'No file provided',
        code: 'missing_file'
      });
    }

    const { filename, buffer } = req.file;
    console.log(`[CONVERT-STORAGE] Processing file: ${filename} (size: ${buffer.length} bytes)`);

    // 入力ファイルをストレージにアップロード
    let inputFileUrl = null;
    if (isStorageEnabled()) {
      try {
        const inputResult = await uploadFile(buffer, filename, 'input');
        if (inputResult) {
          inputFileUrl = inputResult.url;
          console.log(`[CONVERT-STORAGE] Input file uploaded: ${inputResult.name}`);
        }
      } catch (error) {
        console.error('[CONVERT-STORAGE] Failed to upload input file:', error.message);
        return res.status(500).json({
          error: 'storage_error',
          message: 'Failed to upload input file to storage',
          code: 'input_upload_failed'
        });
      }
    }

    // anydoc でファイルを変換
    let markdown;
    try {
      markdown = await toMarkdownBytes(buffer);
    } catch (error) {
      return handleConversionError(error, res);
    }

    console.log(`[CONVERT-STORAGE] File converted successfully (size: ${markdown.length} bytes)`);

    // 出力ファイル（Markdown）をストレージにアップロード
    let outputFileUrl = null;
    if (isStorageEnabled()) {
      try {
        const outputFilename = filename.replace(/\.[^.]+$/, '') + '.md';
        const outputResult = await uploadFile(
          Buffer.from(markdown, 'utf-8'),
          outputFilename,
          'output'
        );
        if (outputResult) {
          outputFileUrl = outputResult.url;
          console.log(`[CONVERT-STORAGE] Output file uploaded: ${outputResult.name}`);
        }
      } catch (error) {
        console.error('[CONVERT-STORAGE] Failed to upload output file:', error.message);
        return res.status(500).json({
          error: 'storage_error',
          message: 'Failed to upload output file to storage',
          code: 'output_upload_failed'
        });
      }
    }

    const expiryHours = process.env.AZURE_STORAGE_SAS_EXPIRY_HOURS || '24';

    const response = {
      success: true,
      filename: filename,
      markdown: markdown
    };

    // ストレージが有効な場合は URL を追加
    if (isStorageEnabled()) {
      response.inputFileUrl = inputFileUrl;
      response.outputFileUrl = outputFileUrl;
      response.expiresIn = `${expiryHours} hours`;
    }

    console.log('[CONVERT-STORAGE] Conversion and storage completed successfully');
    res.status(200).json(response);
  } catch (error) {
    console.error('[CONVERT-STORAGE] Unexpected error:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred during conversion',
      code: 'internal_server_error'
    });
  }
});

/**
 * ファイル変換エラーをハンドリング
 * anydoc のエラーコードを HTTP ステータスコードにマッピング
 * @param {Error} error - anydoc のエラーオブジェクト
 * @param {Response} res - Express レスポンスオブジェクト
 */
function handleConversionError(error, res) {
  const errorCode = error.code || 'unknown';
  console.log(`[CONVERT] Conversion error: ${errorCode} - ${error.message}`);

  switch (errorCode) {
    case 'encrypted':
      return res.status(400).json({
        error: 'encrypted',
        message: 'The file is encrypted or password-protected',
        code: 'file_encrypted'
      });

    case 'unsupported':
      return res.status(415).json({
        error: 'unsupported',
        message: 'The file format is not supported or cannot be converted',
        code: 'unsupported_format'
      });

    case 'malformed':
      return res.status(400).json({
        error: 'malformed',
        message: 'The file is structurally unusable or corrupted',
        code: 'malformed_file'
      });

    case 'resourceLimit':
      return res.status(413).json({
        error: 'resource_limit',
        message: 'The file exceeds resource limits (size, nesting depth, etc.)',
        code: 'resource_limit_exceeded'
      });

    case 'missingPart':
      return res.status(400).json({
        error: 'missing_part',
        message: 'A required part of the file is missing',
        code: 'missing_required_part'
      });

    case 'io':
      return res.status(400).json({
        error: 'io_error',
        message: 'Failed to read the file',
        code: 'file_read_error'
      });

    default:
      console.error('[CONVERT] Unknown error code:', errorCode, error);
      return res.status(500).json({
        error: 'conversion_error',
        message: error.message || 'An error occurred during file conversion',
        code: 'conversion_failed'
      });
  }
}

module.exports = router;
