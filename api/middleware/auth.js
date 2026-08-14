/**
 * APIキー認証ミドルウェア
 * リクエストヘッダーから Authorization: Bearer <API_KEY> を抽出して検証
 */

/**
 * APIキー認証ミドルウェア
 * @param {Request} req - Express リクエストオブジェクト
 * @param {Response} res - Express レスポンスオブジェクト
 * @param {Function} next - Express next関数
 */
function authMiddleware(req, res, next) {
  // 認証が無効化されている場合はスキップ
  if (process.env.API_KEY_ENABLED !== 'true') {
    return next();
  }

  // Authorization ヘッダーを取得
  const authHeader = req.headers.authorization;

  // ヘッダーが存在しない場合
  if (!authHeader) {
    console.log('[AUTH] Authorization header missing');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header is required',
      code: 'missing_authorization_header'
    });
  }

  // "Bearer <token>" 形式をチェック
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.log('[AUTH] Invalid authorization header format');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header must be "Bearer <token>"',
      code: 'invalid_authorization_format'
    });
  }

  const token = parts[1];
  const expectedKey = process.env.API_KEY;

  // APIキーを比較（タイミング攻撃対策）
  if (!constantTimeCompare(token, expectedKey)) {
    console.log('[AUTH] Invalid API key provided');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
      code: 'invalid_api_key'
    });
  }

  console.log('[AUTH] Authorization successful');
  next();
}

/**
 * タイミング攻撃対策用の定時間比較
 * @param {string} a - 比較対象1
 * @param {string} b - 比較対象2
 * @returns {boolean} 文字列が一致する場合 true
 */
function constantTimeCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

module.exports = { authMiddleware };
