const db = require('../database');

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

module.exports = {
  formatYMD,
  parseYMD,
  getOrCreateWeek
};
