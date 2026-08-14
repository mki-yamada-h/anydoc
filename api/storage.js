/**
 * Azure Blob Storage 統合モジュール
 * ファイルのアップロードと SAS URL生成を担当
 */

const { BlobServiceClient, generateBlobSASUrl, BlobSASPermissions } = require('@azure/storage-blob');

let blobServiceClient = null;

/**
 * Azure Blob Storage クライアントを初期化
 * 環境変数が設定されていない場合は null を返す
 */
function initializeBlobClient() {
  if (process.env.AZURE_STORAGE_ENABLED !== 'true') {
    console.log('[STORAGE] Blob Storage is disabled');
    return null;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    console.warn('[STORAGE] AZURE_STORAGE_CONNECTION_STRING is not set. Blob Storage disabled.');
    return null;
  }

  try {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    console.log('[STORAGE] Blob Storage client initialized');
    return blobServiceClient;
  } catch (error) {
    console.error('[STORAGE] Failed to initialize Blob Storage client:', error.message);
    return null;
  }
}

/**
 * ファイルを Blob Storage にアップロード
 * @param {Buffer} fileBuffer - ファイルのバッファ
 * @param {string} filename - ファイル名
 * @param {string} prefix - URLプレフィックス（"input" または "output"）
 * @returns {Promise<Object|null>} { url, name } または null（ストレージ無効時）
 */
async function uploadFile(fileBuffer, filename, prefix = 'input') {
  // ストレージが無効の場合はスキップ
  if (process.env.AZURE_STORAGE_ENABLED !== 'true') {
    return null;
  }

  if (!blobServiceClient) {
    console.warn('[STORAGE] Blob Service Client not initialized');
    return null;
  }

  try {
    const containerName = process.env.AZURE_STORAGE_CONTAINER || 'documents';
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // コンテナが存在しない場合は作成
    try {
      await containerClient.getProperties();
    } catch (error) {
      if (error.code === 'ContainerNotFound') {
        console.log(`[STORAGE] Creating container: ${containerName}`);
        await containerClient.create();
      } else {
        throw error;
      }
    }

    // ユニークなブロブ名を生成
    const timestamp = Date.now();
    const ext = filename.split('.').pop();
    const blobName = `${prefix}/${timestamp}-${filename}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    console.log(`[STORAGE] Uploading file: ${blobName}`);
    await blockBlobClient.upload(fileBuffer, fileBuffer.length);

    // SAS URL を生成
    const sasUrl = generateSasUrl(containerName, blobName);

    console.log(`[STORAGE] File uploaded successfully: ${blobName}`);
    return {
      url: sasUrl,
      name: blobName,
      displayName: filename
    };
  } catch (error) {
    console.error('[STORAGE] Failed to upload file:', error.message);
    throw new Error(`Failed to upload file to Blob Storage: ${error.message}`);
  }
}

/**
 * SAS URL を生成
 * @param {string} containerName - コンテナ名
 * @param {string} blobName - ブロブ名
 * @returns {string} SAS URL
 */
function generateSasUrl(containerName, blobName) {
  if (!blobServiceClient) {
    throw new Error('Blob Service Client not initialized');
  }

  try {
    const expiryHours = parseInt(process.env.AZURE_STORAGE_SAS_EXPIRY_HOURS || '24');
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + expiryHours);

    const sasUrl = generateBlobSASUrl(
      blobServiceClient.accountName,
      containerName,
      blobName,
      // アカウントキーから SAS を生成（本番環境では推奨されません）
      // 代わりに Managed Identity や Key Vault を使用してください
      (() => {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const match = connectionString.match(/AccountKey=([^;]+)/);
        return match ? match[1] : null;
      })(),
      {
        permissions: BlobSASPermissions.parse('r'), // Read only
        expiresOn: expiryDate
      }
    );

    return sasUrl;
  } catch (error) {
    console.error('[STORAGE] Failed to generate SAS URL:', error.message);
    throw new Error(`Failed to generate SAS URL: ${error.message}`);
  }
}

/**
 * Blob Storage が利用可能かチェック
 * @returns {boolean} 利用可能な場合 true
 */
function isStorageEnabled() {
  return process.env.AZURE_STORAGE_ENABLED === 'true' && blobServiceClient !== null;
}

module.exports = {
  initializeBlobClient,
  uploadFile,
  isStorageEnabled,
  generateSasUrl
};
