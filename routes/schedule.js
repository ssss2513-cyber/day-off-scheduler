const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware');

const router = express.Router();

// 해당 날짜가 속한 주차 가져오기 (일요일 ~ 토요일 기준)
function getOrCreateWeek(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0=일, 1=월, 2=화, ..., 6=토

  // 일요일 시작 (dayOfWeek 만큼 뒤로 가면 해당 주의 일요일)
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - dayOfWeek);

  // 토요일 종료 (일요일 + 6일)
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  const startDate = sunday.toISOString().split('T')[0];
  const endDate = saturday.toISOString().split('T')[0];

  // 연도 및 주차 계산 (일요일 기준)
  const year = sunday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((sunday - jan1) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + jan1.getDay() + 1) / 7);

  let week = db.prepare('SELECT * FROM weeks WHERE year = ? AND week_number = ?').get(year, weekNumber);

  if (!week) {
    const result = db.prepare(
      'INSERT INTO weeks (year, week_number, start_date, end_date) VALUES (?, ?, ?, ?)'
    ).run(year, weekNumber, startDate, endDate);
    week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(result.lastInsertRowid);
  }

  return week;
}

// 주차 목록 가져오기
router.get('/weeks', authMiddleware, (req, res) => {
  try {
    const weeks = db.prepare('SELECT * FROM weeks ORDER BY year DESC, week_number DESC').all();
    res.json({ weeks });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 특정 주차의 모든 휴무 조회
router.get('/week/:weekId', authMiddleware, (req, res) => {
  try {
    const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(req.params.weekId);
    if (!week) {
      return res.status(404).json({ error: '해당 주차를 찾을 수 없습니다.' });
    }

    const dayOffs = db.prepare(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY d.date, u.name
    `).all(req.params.weekId);

    res.json({ week, dayOffs });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 현재 주차 기준으로 데이터 가져오기
router.get('/current', authMiddleware, (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const week = getOrCreateWeek(todayStr);

    const dayOffs = db.prepare(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY d.date, u.name
    `).all(week.id);

    const myDayOffs = db.prepare(`
      SELECT * FROM day_offs WHERE user_id = ? AND week_id = ?
    `).all(req.user.id, week.id);

    res.json({ week, dayOffs, myDayOffs });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 특정 날짜 범위의 주차 가져오기
router.get('/range', authMiddleware, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate) {
      return res.status(400).json({ error: '시작 날짜를 입력해주세요.' });
    }

    const week = getOrCreateWeek(startDate);

    const dayOffs = db.prepare(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY d.date, u.name
    `).all(week.id);

    const myDayOffs = db.prepare(`
      SELECT * FROM day_offs WHERE user_id = ? AND week_id = ?
    `).all(req.user.id, week.id);

    res.json({ week, dayOffs, myDayOffs });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 휴무 등록/수정
router.post('/dayoff', authMiddleware, (req, res) => {
  const { date, is_fixed, reason } = req.body;

  if (!date) {
    return res.status(400).json({ error: '날짜를 선택해주세요.' });
  }

  try {
    const week = getOrCreateWeek(date);

    if (week.is_closed) {
      return res.status(400).json({ error: '해당 주차는 마감되어 수정할 수 없습니다.' });
    }

    const existing = db.prepare(
      'SELECT * FROM day_offs WHERE user_id = ? AND date = ?'
    ).get(req.user.id, date);

    if (existing) {
      db.prepare(
        'UPDATE day_offs SET is_fixed = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(is_fixed ? 1 : 0, reason || null, existing.id);
    } else {
      db.prepare(
        'INSERT INTO day_offs (user_id, date, week_id, is_fixed, reason) VALUES (?, ?, ?, ?, ?)'
      ).run(req.user.id, date, week.id, is_fixed ? 1 : 0, reason || null);
    }

    res.json({ message: '휴무가 등록되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 휴무 삭제
router.delete('/dayoff/:date', authMiddleware, (req, res) => {
  try {
    const week = getOrCreateWeek(req.params.date);

    if (week.is_closed) {
      return res.status(400).json({ error: '해당 주차는 마감되어 수정할 수 없습니다.' });
    }

    db.prepare('DELETE FROM day_offs WHERE user_id = ? AND date = ?')
      .run(req.user.id, req.params.date);

    res.json({ message: '휴무가 취소되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
