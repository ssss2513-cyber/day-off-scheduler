const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware');

const router = express.Router();

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYMD(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 해당 날짜가 속한 주차 가져오기 (일요일 ~ 토요일 기준)
async function getOrCreateWeek(dateStr) {
  const date = parseYMD(dateStr);
  const dayOfWeek = date.getDay(); // 0=일, 1=월, 2=화, ..., 6=토

  // 일요일 시작
  const sunday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek);

  // 토요일 종료
  const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6);

  const startDate = formatYMD(sunday);
  const endDate = formatYMD(saturday);

  // 연도 및 주차 계산
  const year = sunday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((sunday - jan1) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + jan1.getDay() + 1) / 7);

  let week = await db.queryOne('SELECT * FROM weeks WHERE year = ? AND week_number = ?', [year, weekNumber]);

  if (!week) {
    try {
      const result = await db.execute(
        'INSERT INTO weeks (year, week_number, start_date, end_date) VALUES (?, ?, ?, ?)',
        [year, weekNumber, startDate, endDate]
      );
      week = await db.queryOne('SELECT * FROM weeks WHERE id = ?', [result.lastInsertRowid]);
    } catch (e) {
      week = await db.queryOne('SELECT * FROM weeks WHERE year = ? AND week_number = ?', [year, weekNumber]);
    }
  }

  return week;
}

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

// 현재 주차 기준으로 데이터 가져오기
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const todayStr = formatYMD(today);
    const week = await getOrCreateWeek(todayStr);

    const dayOffs = await db.queryAll(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY d.date, u.name
    `, [week.id]);

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

    const dayOffs = await db.queryAll(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY d.date, u.name
    `, [week.id]);

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
