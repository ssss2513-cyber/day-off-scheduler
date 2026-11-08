// ===== State =====
let currentUser = null;
let currentWeek = null;
let allDayOffs = [];
let myDayOffs = [];
let members = [];
let viewDate = new Date(); // Current viewing week reference date

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// ===== API Helper =====
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 401 && !url.includes('/login') && !url.includes('/register') && !url.includes('/me')) {
    currentUser = null;
    document.getElementById('main-page').style.display = 'none';
    document.getElementById('auth-page').style.display = 'flex';
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || '요청 실패');
  }
  return data;
}

// ===== Toast =====
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + type;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// ===== Auth =====
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').style.display = isLogin ? 'block' : 'none';
    document.getElementById('register-form').style.display = isLogin ? 'none' : 'block';
    document.getElementById('auth-error').style.display = 'none';
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('auth-error');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value,
      }),
    });
    currentUser = data.user;
    showMainPage();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('auth-error');
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('reg-name').value,
        username: document.getElementById('reg-username').value,
        password: document.getElementById('reg-password').value,
      }),
    });
    currentUser = data.user;
    showToast(data.message, 'success');
    showMainPage();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  document.getElementById('main-page').style.display = 'none';
  document.getElementById('auth-page').style.display = 'flex';
});

// ===== Initialize =====
async function init() {
  try {
    const data = await api('/api/auth/me');
    currentUser = data.user;
    showMainPage();
  } catch {
    document.getElementById('auth-page').style.display = 'flex';
  }
}

async function showMainPage() {
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('main-page').style.display = 'block';

  const badge = currentUser.role === 'admin' ? '👑 ' : '';
  document.getElementById('user-info').textContent = `${badge}${currentUser.name}`;

  // Show admin or member controls
  document.getElementById('admin-controls').style.display = currentUser.role === 'admin' ? 'flex' : 'none';
  document.getElementById('member-controls').style.display = currentUser.role !== 'admin' ? 'flex' : 'none';

  await loadMembers();
  await loadWeekData();
}

// ===== Members =====
async function loadMembers() {
  try {
    const data = await api('/api/auth/members');
    members = data.members;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Week Navigation (일요일 ~ 토요일) =====
function getSunday(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=일, 1=월, ..., 6=토
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getWeekDates(refDate) {
  const sunday = getSunday(refDate);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

document.getElementById('btn-prev-week').addEventListener('click', () => {
  viewDate.setDate(viewDate.getDate() - 7);
  loadWeekData();
});

document.getElementById('btn-next-week').addEventListener('click', () => {
  viewDate.setDate(viewDate.getDate() + 7);
  loadWeekData();
});

async function loadWeekData() {
  const sunday = getSunday(viewDate);
  const startDate = formatDate(sunday);

  try {
    const data = await api(`/api/schedule/range?startDate=${startDate}`);
    currentWeek = data.week;
    allDayOffs = data.dayOffs;
    myDayOffs = data.myDayOffs;

    updateWeekUI();
    renderCalendar();
    renderSummary();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateWeekUI() {
  const w = currentWeek;
  document.getElementById('week-title').textContent = `${w.year}년 ${w.week_number}주차`;
  document.getElementById('week-dates').textContent = `${w.start_date} ~ ${w.end_date}`;

  const statusEl = document.getElementById('week-status');
  if (w.is_closed) {
    statusEl.textContent = '🔒 마감됨';
    statusEl.className = 'badge badge-closed';
  } else {
    statusEl.textContent = '📝 진행 중';
    statusEl.className = 'badge badge-open';
  }

  // Update admin toggle button
  const toggleBtn = document.getElementById('btn-toggle-week');
  if (toggleBtn) {
    if (w.is_closed) {
      toggleBtn.innerHTML = '<i class="ri-lock-unlock-line"></i> 마감 해제';
      toggleBtn.className = 'btn btn-sm btn-success';
    } else {
      toggleBtn.innerHTML = '<i class="ri-lock-line"></i> 마감';
      toggleBtn.className = 'btn btn-sm btn-danger';
    }
  }
}

// ===== Calendar Rendering =====
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const weekDates = getWeekDates(viewDate);
  const isClosed = currentWeek.is_closed;

  grid.innerHTML = '';

  weekDates.forEach((date) => {
    const dateStr = formatDate(date);
    const dayIdx = date.getDay(); // 0=일, ..., 6=토
    const isSunday = dayIdx === 0;
    const isSaturday = dayIdx === 6;

    // Find my dayoff for this date
    const myDayOff = myDayOffs.find(d => d.date === dateStr);
    // Count all dayoffs for this date
    const dateDayOffs = allDayOffs.filter(d => d.date === dateStr);

    const card = document.createElement('div');
    card.className = 'day-card';
    if (isSunday) card.classList.add('sunday');
    if (isSaturday) card.classList.add('saturday');
    if (isClosed) card.classList.add('disabled');
    if (myDayOff) {
      card.classList.add(myDayOff.is_fixed ? 'fixed' : 'selected');
    }

    let statusHTML = '';
    let actionsHTML = '';

    if (myDayOff) {
      if (myDayOff.is_fixed) {
        statusHTML = `<span class="day-status fix" title="${myDayOff.reason || ''}">🔒 픽스 (${myDayOff.reason ? myDayOff.reason.substring(0, 5) : '사유'})</span>`;
      } else {
        statusHTML = `<span class="day-status off">✓ 휴무 선택됨</span>`;
      }
      if (!isClosed) {
        actionsHTML = `
          <div class="day-actions">
            <button type="button" class="fix-btn" data-date="${dateStr}" title="픽스 사유 작성/수정">📌 픽스</button>
            <button type="button" class="cancel-btn" data-date="${dateStr}" title="선택 취소">✕ 취소</button>
          </div>
        `;
      }
    } else {
      statusHTML = `<span class="day-status placeholder">클릭하여 선택</span>`;
      if (!isClosed) {
        actionsHTML = `
          <div class="day-actions">
            <button type="button" class="fix-btn" data-date="${dateStr}" title="픽스(필수)로 등록">📌 픽스</button>
          </div>
        `;
      }
    }

    const countHTML = dateDayOffs.length > 0
      ? `<span class="day-count">${dateDayOffs.length}명 신청</span>` : '';

    card.innerHTML = `
      ${countHTML}
      <span class="day-name">${DAY_NAMES[dayIdx]}요일</span>
      <span class="day-number">${date.getDate()}</span>
      <span class="day-month">${date.getMonth() + 1}월</span>
      ${statusHTML}
      ${actionsHTML}
    `;

    // Click handler: 카드 클릭 시 즉시 토글 (복수 날짜도 톡톡 누르면 바로바로 다중 선택)
    if (!isClosed) {
      card.addEventListener('click', (e) => {
        const fixBtn = e.target.closest('.fix-btn');
        const cancelBtn = e.target.closest('.cancel-btn');

        if (fixBtn) {
          e.stopPropagation();
          openFixModal(fixBtn.dataset.date);
          return;
        }

        if (cancelBtn) {
          e.stopPropagation();
          removeDayOff(cancelBtn.dataset.date);
          return;
        }

        // 카드 본체 클릭 시: 이미 선택되어 있으면 취소, 없으면 바로 휴무 선택 (토글)
        if (myDayOff) {
          removeDayOff(dateStr);
        } else {
          addDayOff(dateStr);
        }
      });
    }

    grid.appendChild(card);
  });
}

// ===== Day Off Actions =====
async function addDayOff(date) {
  try {
    await api('/api/schedule/dayoff', {
      method: 'POST',
      body: JSON.stringify({ date, is_fixed: false }),
    });
    showToast('휴무가 등록되었습니다.', 'success');
    await loadWeekData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeDayOff(date) {
  try {
    await api(`/api/schedule/dayoff/${date}`, { method: 'DELETE' });
    showToast('휴무가 취소되었습니다.', 'success');
    await loadWeekData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Fix Modal =====
let fixTargetDate = null;

function openFixModal(date) {
  fixTargetDate = date;
  const d = parseDate(date);
  document.getElementById('fix-date-label').textContent =
    `📅 ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]}요일)`;
  document.getElementById('fix-reason').value = '';
  document.getElementById('fix-modal').style.display = 'flex';
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('fix-modal').style.display = 'none';
});

document.getElementById('btn-fix-cancel').addEventListener('click', () => {
  document.getElementById('fix-modal').style.display = 'none';
});

document.getElementById('btn-fix-confirm').addEventListener('click', async () => {
  const reason = document.getElementById('fix-reason').value.trim();
  if (!reason) {
    showToast('픽스 사유를 입력해주세요.', 'error');
    return;
  }

  try {
    await api('/api/schedule/dayoff', {
      method: 'POST',
      body: JSON.stringify({
        date: fixTargetDate,
        is_fixed: true,
        reason,
      }),
    });
    document.getElementById('fix-modal').style.display = 'none';
    showToast('픽스 휴무가 설정되었습니다.', 'success');
    await loadWeekData();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Close modals on backdrop click
document.getElementById('fix-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('fix-modal').style.display = 'none';
  }
});

document.getElementById('members-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('members-modal').style.display = 'none';
  }
});

// ===== Summary Table =====
function renderSummary() {
  const weekDates = getWeekDates(viewDate);
  const headerRow = document.getElementById('summary-header');
  const tbody = document.getElementById('summary-body');

  // Header (일요일 ~ 토요일)
  headerRow.innerHTML = '<th>이름</th>';
  weekDates.forEach((date) => {
    const dayIdx = date.getDay();
    const isSunday = dayIdx === 0;
    const isSaturday = dayIdx === 6;
    const cls = isSunday ? 'sunday-header' : (isSaturday ? 'saturday-header' : '');
    headerRow.innerHTML += `<th class="${cls}">${date.getMonth() + 1}/${date.getDate()}<br><small>${DAY_NAMES[dayIdx]}</small></th>`;
  });

  // Body
  tbody.innerHTML = '';
  members.forEach(member => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="name-cell">${member.name}</td>`;

    weekDates.forEach(date => {
      const dateStr = formatDate(date);
      const dayOff = allDayOffs.find(d => d.user_id === member.id && d.date === dateStr);

      if (dayOff) {
        if (dayOff.is_fixed) {
          tr.innerHTML += `<td class="cell-fix" title="${dayOff.reason || ''}">🔒 ${dayOff.reason ? dayOff.reason.substring(0, 6) : '픽스'}</td>`;
        } else {
          tr.innerHTML += `<td class="cell-off">휴무</td>`;
        }
      } else {
        tr.innerHTML += `<td>-</td>`;
      }
    });

    tbody.appendChild(tr);
  });
}

// ===== Admin: Toggle Week =====
document.getElementById('btn-toggle-week').addEventListener('click', async () => {
  if (!currentWeek) return;

  const action = currentWeek.is_closed ? 'open' : 'close';
  const confirmMsg = currentWeek.is_closed
    ? '마감을 해제하시겠습니까? 팀원들이 다시 수정할 수 있습니다.'
    : '이 주차를 마감하시겠습니까? 팀원들은 더 이상 수정할 수 없습니다.';

  if (!confirm(confirmMsg)) return;

  try {
    const url = `/api/admin/${action}-week/${currentWeek.id}`;
    const data = await api(url, { method: 'POST' });
    showToast(data.message, 'success');
    await loadWeekData();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ===== Admin: Export =====
function exportExcel() {
  if (!currentWeek) return;
  window.location.href = `/api/admin/export/${currentWeek.id}`;
}

document.getElementById('btn-export').addEventListener('click', exportExcel);
document.getElementById('btn-export-member').addEventListener('click', exportExcel);

// ===== Admin: Members Management =====
document.getElementById('btn-members').addEventListener('click', async () => {
  await loadMembers();
  const list = document.getElementById('members-list');
  list.innerHTML = '';

  members.forEach(member => {
    const tr = document.createElement('tr');
    const roleClass = member.role === 'admin' ? 'role-admin' : 'role-member';
    const roleText = member.role === 'admin' ? '관리자' : '멤버';
    const createdAt = new Date(member.created_at).toLocaleDateString('ko-KR');

    tr.innerHTML = `
      <td><strong>${member.name}</strong></td>
      <td>${member.username}</td>
      <td><span class="role-badge ${roleClass}">${roleText}</span></td>
      <td>${createdAt}</td>
      <td>
        ${member.id !== currentUser.id ? `
          <select class="role-select" data-user-id="${member.id}" style="padding:4px 8px;border-radius:4px;border:1px solid #ddd;font-size:12px;font-family:inherit;">
            <option value="member" ${member.role === 'member' ? 'selected' : ''}>멤버</option>
            <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>관리자</option>
          </select>
        ` : '<span style="color:#999;font-size:12px;">본인</span>'}
      </td>
    `;

    const select = tr.querySelector('.role-select');
    if (select) {
      select.addEventListener('change', async (e) => {
        try {
          await api(`/api/admin/change-role/${member.id}`, {
            method: 'POST',
            body: JSON.stringify({ role: e.target.value }),
          });
          showToast('역할이 변경되었습니다.', 'success');
          await loadMembers();
        } catch (err) {
          showToast(err.message, 'error');
          e.target.value = member.role;
        }
      });
    }

    list.appendChild(tr);
  });

  document.getElementById('members-modal').style.display = 'flex';
});

document.getElementById('members-modal-close').addEventListener('click', () => {
  document.getElementById('members-modal').style.display = 'none';
});

// ===== Start =====
init();
