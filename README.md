# 🗓️ 휴무 취합 시스템

팀 휴무 일정을 간편하게 관리하는 웹 애플리케이션입니다.

## 기능

- ✅ 날짜별 자유로운 휴무 선택 (주차 단위)
- 🔒 픽스(필수) 휴무 설정 및 사유 작성
- 📊 팀 전체 휴무 현황 한눈에 보기
- 📥 주차별 엑셀(xlsx) 파일 다운로드
- 👥 팀원 회원가입/로그인
- 🛡️ 관리자 주차 마감/해제 관리

## 설치 및 실행

### 1. 클론
```bash
git clone https://github.com/YOUR_USERNAME/day-off-scheduler.git
cd day-off-scheduler
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 실행
```bash
npm start
```

서버가 `http://localhost:3000` 에서 실행됩니다.

### 환경 변수 (선택)
```bash
PORT=3000              # 서버 포트
JWT_SECRET=your-secret # JWT 시크릿 키
```

## 배포 (Render)

1. GitHub에 코드를 푸시합니다.
2. [Render](https://render.com)에서 New Web Service를 생성합니다.
3. GitHub 레포를 연결합니다.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. 환경 변수에 `JWT_SECRET`을 설정합니다.

## 사용법

1. 첫 번째 가입자가 자동으로 **관리자**가 됩니다.
2. 관리자는 주차 **마감/해제**, **엑셀 다운로드**, **팀원 역할 관리**가 가능합니다.
3. 팀원은 마감 전까지 자유롭게 휴무를 선택/취소할 수 있습니다.
4. 꼭 쉬어야 하는 날은 **📌 픽스** 버튼으로 사유와 함께 등록합니다.

## 기술 스택

- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT + bcrypt
- **Excel**: ExcelJS
- **Frontend**: Vanilla JS, CSS
