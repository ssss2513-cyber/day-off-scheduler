const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'dayoff-scheduler-secret-key-2024';

async function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.queryOne('SELECT id, username, name, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      res.clearCookie('token');
      return res.status(401).json({ error: '사용자 정보가 없습니다. 다시 회원가입하거나 로그인해주세요.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: '인증이 만료되었습니다. 다시 로그인해주세요.' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, JWT_SECRET };
