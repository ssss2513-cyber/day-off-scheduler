const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware');

const router = express.Router();

// 주차 마감
router.post('/close-week/:weekId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const week = await db.queryOne('SELECT * FROM weeks WHERE id = ?', [req.params.weekId]);
    if (!week) {
      return res.status(404).json({ error: '해당 주차를 찾을 수 없습니다.' });
    }

    await db.execute(
      'UPDATE weeks SET is_closed = 1, closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE id = ?',
      [req.user.id, req.params.weekId]
    );

    res.json({ message: `${week.year}년 ${week.week_number}주차가 마감되었습니다.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 주차 마감 해제
router.post('/open-week/:weekId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const week = await db.queryOne('SELECT * FROM weeks WHERE id = ?', [req.params.weekId]);
    if (!week) {
      return res.status(404).json({ error: '해당 주차를 찾을 수 없습니다.' });
    }

    await db.execute(
      'UPDATE weeks SET is_closed = 0, closed_at = NULL, closed_by = NULL WHERE id = ?',
      [req.params.weekId]
    );

    res.json({ message: `${week.year}년 ${week.week_number}주차 마감이 해제되었습니다.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 엑셀 다운로드 (관리자 전용)
router.get('/export/:weekId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const week = await db.queryOne('SELECT * FROM weeks WHERE id = ?', [req.params.weekId]);
    if (!week) {
      return res.status(404).json({ error: '해당 주차를 찾을 수 없습니다.' });
    }

    const members = await db.queryAll('SELECT id, name, username FROM users ORDER BY name');
    const dayOffs = await db.queryAll(`
      SELECT d.*, u.name as user_name, u.username
      FROM day_offs d
      JOIN users u ON d.user_id = u.id
      WHERE d.week_id = ?
      ORDER BY u.name, d.date
    `, [req.params.weekId]);

    // Generate dates for the week (Sun-Sat)
    const dates = [];
    const [sy, sm, sd] = week.start_date.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '휴무 취합 시스템';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`${week.year}년 ${week.week_number}주차`);

    // Title row
    sheet.mergeCells('A1', `${String.fromCharCode(65 + dates.length)}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${week.year}년 ${week.week_number}주차 휴무표 (${week.start_date} ~ ${week.end_date})`;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Status row
    sheet.mergeCells('A2', `${String.fromCharCode(65 + dates.length)}2`);
    const statusCell = sheet.getCell('A2');
    statusCell.value = week.is_closed ? '📌 마감됨' : '📝 진행 중';
    statusCell.font = { size: 11, bold: true, color: { argb: week.is_closed ? 'FFFF0000' : 'FF008000' } };
    statusCell.alignment = { horizontal: 'center' };

    // Header row
    const headerRow = sheet.getRow(3);
    headerRow.getCell(1).value = '이름';
    headerRow.getCell(1).font = { bold: true };
    headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.getCell(1).border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };

    dates.forEach((date, idx) => {
      const cell = headerRow.getCell(idx + 2);
      const d = new Date(date + 'T00:00:00');
      cell.value = `${d.getMonth() + 1}/${d.getDate()} (${dayNames[idx]})`;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      const isWeekend = idx === 0 || idx === 6;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isWeekend ? 'FFE74C3C' : 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    // Data rows
    members.forEach((member, rowIdx) => {
      const row = sheet.getRow(rowIdx + 4);
      row.getCell(1).value = member.name;
      row.getCell(1).font = { bold: true };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(1).border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };

      dates.forEach((date, colIdx) => {
        const cell = row.getCell(colIdx + 2);
        const dayOff = dayOffs.find(d => Number(d.user_id) === Number(member.id) && d.date === date);

        if (dayOff) {
          if (dayOff.is_fixed) {
            cell.value = `🔒 ${dayOff.reason || '픽스'}`;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };
            cell.font = { bold: true };
          } else {
            cell.value = '휴무';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBDEFB' } };
          }
        } else {
          cell.value = '';
          if (colIdx === 0 || colIdx === 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          }
        }

        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });

    // Column widths
    sheet.getColumn(1).width = 15;
    dates.forEach((_, idx) => {
      sheet.getColumn(idx + 2).width = 18;
    });

    // Summary sheet
    const summarySheet = workbook.addWorksheet('요약');
    summarySheet.getRow(1).getCell(1).value = '이름';
    summarySheet.getRow(1).getCell(2).value = '총 휴무일';
    summarySheet.getRow(1).getCell(3).value = '픽스 휴무';
    summarySheet.getRow(1).getCell(4).value = '일반 휴무';
    summarySheet.getRow(1).font = { bold: true };

    [1, 2, 3, 4].forEach(col => {
      const cell = summarySheet.getRow(1).getCell(col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    members.forEach((member, idx) => {
      const row = summarySheet.getRow(idx + 2);
      const memberDayOffs = dayOffs.filter(d => Number(d.user_id) === Number(member.id));
      const fixedCount = memberDayOffs.filter(d => d.is_fixed).length;

      row.getCell(1).value = member.name;
      row.getCell(2).value = memberDayOffs.length;
      row.getCell(3).value = fixedCount;
      row.getCell(4).value = memberDayOffs.length - fixedCount;

      [1, 2, 3, 4].forEach(col => {
        row.getCell(col).alignment = { horizontal: 'center' };
        row.getCell(col).border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });

    summarySheet.getColumn(1).width = 15;
    summarySheet.getColumn(2).width = 12;
    summarySheet.getColumn(3).width = 12;
    summarySheet.getColumn(4).width = 12;

    // Send file
    const fileName = encodeURIComponent(`휴무표_${week.year}년_${week.week_number}주차.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '엑셀 파일 생성 중 오류가 발생했습니다.' });
  }
});

// 사용자 역할 변경 (관리자)
router.post('/change-role/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: '유효하지 않은 역할입니다.' });
  }

  try {
    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.userId]);
    res.json({ message: '역할이 변경되었습니다.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
