const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware');
const { formatYMD, parseYMD, getOrCreateWeek } = require('./weekHelper');

const router = express.Router();

// 주차 목록 가져오기
router.get('/weeks', authMiddleware, async (req, res) => {
  try {
    const weeks = await db.queryAll('SELECT * FROM weeks ORDER BY year DESC, week_number DESC');
    res.json({ weeks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 특정 주차의 모든 휴무 조회
router.get('/week/:weekId', authMiddleware, async (req, res) => {
  try {
    const week = await db.queryOne('SELECT * FROM weeks WHERE id = ?', [req.params.weekId]);
    if (!week) {
      return res.status(404).json({ error: '해당 주차를 찾을 수 없습니다.' });
    }

    const dayOffs = await db.queryAll(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY d.date, u.name
    `, [req.params.weekId]);

    res.json({ week, dayOffs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 현재 진행 중인(마감되지 않은) 주차 기준으로 데이터 가져오기 (첫 페이지용)
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const todayStr = formatYMD(today);
    const thisWeek = await getOrCreateWeek(todayStr);

    let activeWeek = null;
    if (!thisWeek.is_closed) {
      activeWeek = thisWeek;
    } else {
      activeWeek = await db.queryOne(
        'SELECT * FROM weeks WHERE is_closed = 0 AND start_date >= ? ORDER BY start_date ASC LIMIT 1',
        [thisWeek.start_date]
      );
      if (!activeWeek) {
        activeWeek = await db.queryOne(
          'SELECT * FROM weeks WHERE is_closed = 0 ORDER BY start_date DESC LIMIT 1'
        ) || thisWeek;
      }
    }

    let dayOffs = [];
    if (req.user.role === 'admin') {
      dayOffs = await db.queryAll(`
        SELECT d.*, u.name as user_name, u.username
        FROM day_offs d
        JOIN users u ON d.user_id = u.id
        WHERE d.week_id = ?
        ORDER BY d.date, u.name
      `, [activeWeek.id]);
    }

    const myDayOffs = await db.queryAll(`
      SELECT * FROM day_offs WHERE user_id = ? AND week_id = ?
    `, [req.user.id, activeWeek.id]);

    res.json({ week: activeWeek, dayOffs, myDayOffs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 현재 주차 기준으로 데이터 가져오기
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const todayStr = formatYMD(today);
    const week = await getOrCreateWeek(todayStr);

    let dayOffs = [];
    if (req.user.role === 'admin') {
      dayOffs = await db.queryAll(`
        SELECT d.*, u.name as user_name, u.username
        FROM day_offs d
        JOIN users u ON d.user_id = u.id
        WHERE d.week_id = ?
        ORDER BY d.date, u.name
      `, [week.id]);
    }

    const myDayOffs = await db.queryAll(`
      SELECT * FROM day_offs WHERE user_id = ? AND week_id = ?
    `, [req.user.id, week.id]);

    res.json({ week, dayOffs, myDayOffs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 특정 날짜 범위의 주차 가져오기
router.get('/range', authMiddleware, async (req, res) => {
  try {
    const { startDate } = req.query;
    if (!startDate) {
      return res.status(400).json({ error: '시작 날짜를 입력해주세요.' });
    }

    const week = await getOrCreateWeek(startDate);

    let dayOffs = [];
    if (req.user.role === 'admin') {
      dayOffs = await db.queryAll(`
        SELECT d.*, u.name as user_name, u.username
        FROM day_offs d
        JOIN users u ON d.user_id = u.id
        WHERE d.week_id = ?
        ORDER BY d.date, u.name
      `, [week.id]);
    }

    const myDayOffs = await db.queryAll(`
      SELECT * FROM day_offs WHERE user_id = ? AND week_id = ?
    `, [req.user.id, week.id]);

    res.json({ week, dayOffs, myDayOffs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 휴무 등록/수정
router.post('/dayoff', authMiddleware, async (req, res) => {
  const { date, is_fixed, reason } = req.body;

  if (!date) {
    return res.status(400).json({ error: '날짜를 선택해주세요.' });
  }

  try {
    const week = await getOrCreateWeek(date);

    if (week.is_closed) {
      return res.status(400).json({ error: '해당 주차는 마감되어 수정할 수 없습니다.' });
    }

    const existing = await db.queryOne(
      'SELECT * FROM day_offs WHERE user_id = ? AND date = ?',
      [req.user.id, date]
    );

    if (existing) {
      await db.execute(
        'UPDATE day_offs SET is_fixed = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [is_fixed ? 1 : 0, reason || null, existing.id]
      );
    } else {
      await db.execute(
        'INSERT INTO day_offs (user_id, date, week_id, is_fixed, reason) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, date, week.id, is_fixed ? 1 : 0, reason || null]
      );
    }

    res.json({ message: '휴무가 등록되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 휴무 삭제
router.delete('/dayoff/:date', authMiddleware, async (req, res) => {
  try {
    const week = await getOrCreateWeek(req.params.date);

    if (week.is_closed) {
      return res.status(400).json({ error: '해당 주차는 마감되어 수정할 수 없습니다.' });
    }

    await db.execute('DELETE FROM day_offs WHERE user_id = ? AND date = ?', [req.user.id, req.params.date]);

    res.json({ message: '휴무가 취소되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
