const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// UptimeRobot / Health check ping endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/admin', require('./routes/admin'));

const { initDb } = require('./database');

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 휴무 취합 시스템 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`   http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ DB 초기화 실패:', err);
  process.exit(1);
});
