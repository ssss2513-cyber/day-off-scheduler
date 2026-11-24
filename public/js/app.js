// ===== State =====
let currentUser = null;
let currentWeek = null;
let allDayOffs = [];
let myDayOffs = [];
let members = [];
let consecutiveAlerts = [];
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

  const badge = currentUser.role === 'admin' ? '👑 관리자 ' : '';
  document.getElementById('user-info').textContent = `${badge}${currentUser.name}`;

  // 관리자 전용 메뉴 및 요약표 제어 (일반 팀원은 본인 일정만 확인)
  document.getElementById('admin-controls').style.display = currentUser.role === 'admin' ? 'flex' : 'none';
  document.getElementById('admin-summary-section').style.display = currentUser.role === 'admin' ? 'block' : 'none';

  if (currentUser.role === 'admin') {
    await loadMembers();
  }
  // 첫 페이지 진입 시: 마감된 주차가 아닌 '진행 중'인 최신 주차를 실시간으로 먼저 로드
  await loadInitialActiveWeek();
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

document.getElementById('btn-active-week')?.addEventListener('click', () => {
  loadInitialActiveWeek();
});

// 첫 페이지 접속 시 마감되지 않고 진행 중인 가장 빠른 주차 자동 로드
async function loadInitialActiveWeek() {
  try {
    const data = await api('/api/schedule/active');
    currentWeek = data.week;
    allDayOffs = data.dayOffs || [];
    myDayOffs = data.myDayOffs || [];

    if (currentWeek?.start_date) {
      viewDate = parseDate(currentWeek.start_date);
    }

    updateWeekUI();
    renderCalendar();
    renderSummary();
    if (currentUser?.role === 'admin') {
      await loadConsecutiveAlerts();
    }
  } catch (err) {
    await loadWeekData();
  }
}

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
    if (currentUser?.role === 'admin') {
      await loadConsecutiveAlerts();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateWeekUI() {
  const w = currentWeek;
  const titleEl = document.getElementById('week-title');
  if (titleEl) {
    titleEl.textContent = `${w.year}년 ${w.week_number}주차`;
  }

  const datesEl = document.getElementById('week-dates');
  if (datesEl) {
    datesEl.textContent = `${w.year}년 ${w.week_number}주차 (${w.start_date} ~ ${w.end_date})`;
  }

  const statusEl = document.getElementById('week-status');
  if (statusEl) {
    if (w.is_closed) {
      statusEl.textContent = '🔒 마감됨';
      statusEl.className = 'badge badge-closed';
    } else {
      statusEl.textContent = '📝 진행 중';
      statusEl.className = 'badge badge-open';
    }
  }

  // Update admin toggle button
  const toggleBtn = document.getElementById('btn-toggle-week');
  if (toggleBtn) {
    if (w.is_closed) {
      toggleBtn.innerHTML = '<i class="ri-lock-unlock-line"></i> 마감 해제';
      toggleBtn.className = 'btn btn-sm btn-success';
    } else {
      toggleBtn.innerHTML = '<i class="ri-lock-line"></i> 이번 주 마감';
      toggleBtn.className = 'btn btn-sm btn-danger';
    }
  }
}

// ===== Calendar Rendering =====
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const weekDates = getWeekDates(viewDate);
  const isClosed = currentWeek.is_closed;

  const countBadge = document.getElementById('my-count-badge');
  if (countBadge) {
    countBadge.textContent = `내 선택: ${myDayOffs.length}일`;
  }

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

    const countHTML = (currentUser.role === 'admin' && dateDayOffs.length > 0)
      ? `<span class="day-count">${dateDayOffs.length}명</span>` : '';

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

// ===== Summary Table (관리자 전용 & 휴무 직접 수정 가능) =====
function renderSummary() {
  if (currentUser?.role !== 'admin') return;

  const weekDates = getWeekDates(viewDate);
  const headerRow = document.getElementById('summary-header');
  const tbody = document.getElementById('summary-body');
  if (!headerRow || !tbody) return;

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
    tr.innerHTML = `<td class="name-cell">${member.name} <small class="cell-username">(${member.username})</small></td>`;

    weekDates.forEach(date => {
      const dateStr = formatDate(date);
      const dayOff = allDayOffs.find(d => Number(d.user_id) === Number(member.id) && d.date === dateStr);

      let cellContent = '-';
      let cellClass = 'summary-cell-editable';

      if (dayOff) {
        if (dayOff.is_fixed) {
          cellContent = `<span class="cell-fix" title="${dayOff.reason || ''}">🔒 ${dayOff.reason ? dayOff.reason.substring(0, 6) : '픽스'}</span>`;
        } else {
          cellContent = `<span class="cell-off">휴무</span>`;
        }
      }

      const td = document.createElement('td');
      td.className = cellClass;
      td.dataset.userId = member.id;
      td.dataset.userName = member.name;
      td.dataset.date = dateStr;
      td.title = `클릭하여 ${member.name} 님의 휴무 수정`;
      td.innerHTML = cellContent;

      td.addEventListener('click', () => {
        openAdminDayOffModal(member.id, member.name, dateStr);
      });

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ===== Admin Day-off Edit Modal =====
let adminTargetUser = null;
let adminTargetDate = null;

function openAdminDayOffModal(userId, userName, dateStr) {
  adminTargetUser = { id: userId, name: userName };
  adminTargetDate = dateStr;

  const d = parseDate(dateStr);
  document.getElementById('admin-dayoff-info').textContent = `👤 ${userName} 님의 휴무 상태 변경`;
  document.getElementById('admin-dayoff-date').textContent =
    `📅 ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]}요일)`;

  const existing = allDayOffs.find(d => Number(d.user_id) === Number(userId) && d.date === dateStr);
  const reasonGroup = document.getElementById('admin-fixed-reason-group');
  const reasonInput = document.getElementById('admin-fixed-reason');

  if (existing) {
    if (existing.is_fixed) {
      document.querySelector('input[name="admin-dayoff-type"][value="fixed"]').checked = true;
      reasonGroup.style.display = 'block';
      reasonInput.value = existing.reason || '';
    } else {
      document.querySelector('input[name="admin-dayoff-type"][value="off"]').checked = true;
      reasonGroup.style.display = 'none';
      reasonInput.value = '';
    }
  } else {
    document.querySelector('input[name="admin-dayoff-type"][value="work"]').checked = true;
    reasonGroup.style.display = 'none';
    reasonInput.value = '';
  }

  document.getElementById('admin-dayoff-modal').style.display = 'flex';
}

document.querySelectorAll('input[name="admin-dayoff-type"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const isFixed = e.target.value === 'fixed';
    const reasonGroup = document.getElementById('admin-fixed-reason-group');
    if (reasonGroup) {
      reasonGroup.style.display = isFixed ? 'block' : 'none';
    }
  });
});

document.getElementById('btn-admin-dayoff-save')?.addEventListener('click', async () => {
  if (!adminTargetUser || !adminTargetDate) return;

  const selectedType = document.querySelector('input[name="admin-dayoff-type"]:checked')?.value;
  const reason = document.getElementById('admin-fixed-reason').value.trim();

  try {
    if (selectedType === 'work') {
      await api(`/api/admin/dayoff/${adminTargetUser.id}/${adminTargetDate}`, {
        method: 'DELETE',
      });
      showToast(`${adminTargetUser.name} 님의 휴무가 취소(근무)되었습니다.`, 'success');
    } else if (selectedType === 'off') {
      await api('/api/admin/dayoff', {
        method: 'POST',
        body: JSON.stringify({
          userId: adminTargetUser.id,
          date: adminTargetDate,
          is_fixed: false,
        }),
      });
      showToast(`${adminTargetUser.name} 님의 일반 휴무가 저장되었습니다.`, 'success');
    } else if (selectedType === 'fixed') {
      if (!reason) {
        showToast('픽스 사유를 입력해주세요.', 'error');
        return;
      }
      await api('/api/admin/dayoff', {
        method: 'POST',
        body: JSON.stringify({
          userId: adminTargetUser.id,
          date: adminTargetDate,
          is_fixed: true,
          reason,
        }),
      });
      showToast(`${adminTargetUser.name} 님의 픽스 휴무가 설정되었습니다.`, 'success');
    }

    document.getElementById('admin-dayoff-modal').style.display = 'none';
    await loadWeekData();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('admin-dayoff-modal-close')?.addEventListener('click', () => {
  document.getElementById('admin-dayoff-modal').style.display = 'none';
});

document.getElementById('btn-admin-dayoff-cancel')?.addEventListener('click', () => {
  document.getElementById('admin-dayoff-modal').style.display = 'none';
});

document.getElementById('admin-dayoff-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('admin-dayoff-modal').style.display = 'none';
  }
});

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

document.getElementById('btn-export')?.addEventListener('click', exportExcel);

// ===== Admin: Members Management (검색, 역할 변경 & 멤버 해제) =====
function renderMembersList(filterText = '') {
  const list = document.getElementById('members-list');
  const countBadge = document.getElementById('members-count-badge');
  if (!list) return;

  list.innerHTML = '';
  const q = filterText.toLowerCase().trim();
  const filtered = members.filter(m => 
    !q || m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
  );

  if (countBadge) {
    countBadge.textContent = q ? `검색: ${filtered.length}명 / 총 ${members.length}명` : `총 ${members.length}명`;
  }

  filtered.forEach(member => {
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
        ${Number(member.id) !== Number(currentUser.id) ? `
          <div style="display:inline-flex;align-items:center;gap:6px;">
            <select class="role-select" data-user-id="${member.id}" style="padding:4px 8px;border-radius:4px;border:1px solid #ddd;font-size:12px;font-family:inherit;">
              <option value="member" ${member.role === 'member' ? 'selected' : ''}>멤버</option>
              <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>관리자</option>
            </select>
            <button type="button" class="btn-remove-member" data-user-id="${member.id}" data-user-name="${member.name}" title="팀원에서 해제">
              <i class="ri-user-unfollow-line"></i> 해제
            </button>
          </div>
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
          renderMembersList(document.getElementById('member-search-input')?.value || '');
        } catch (err) {
          showToast(err.message, 'error');
          e.target.value = member.role;
        }
      });
    }

    const removeBtn = tr.querySelector('.btn-remove-member');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const confirmMsg = `정말 "${member.name} (${member.username})" 님을 멤버에서 해제(삭제)하시겠습니까?\n등록된 모든 휴무 일정 데이터도 함께 삭제됩니다.`;
        if (!confirm(confirmMsg)) return;

        try {
          const res = await api(`/api/admin/members/${member.id}`, { method: 'DELETE' });
          showToast(res.message, 'success');
          await loadMembers();
          await loadWeekData();
          renderMembersList(document.getElementById('member-search-input')?.value || '');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    list.appendChild(tr);
  });
}

document.getElementById('btn-members').addEventListener('click', async () => {
  await loadMembers();
  const searchInput = document.getElementById('member-search-input');
  if (searchInput) searchInput.value = '';
  renderMembersList();
  document.getElementById('members-modal').style.display = 'flex';
});

document.getElementById('member-search-input')?.addEventListener('input', (e) => {
  renderMembersList(e.target.value);
});

document.getElementById('members-modal-close').addEventListener('click', () => {
  document.getElementById('members-modal').style.display = 'none';
});

// ===== Admin: Consecutive Day-Off Alerts (3일 이상 연속 휴무 감지 & 확인) =====
async function loadConsecutiveAlerts() {
  if (currentUser?.role !== 'admin') return;

  try {
    const data = await api('/api/admin/consecutive-alerts');
    consecutiveAlerts = data.alerts || [];

    // 1. 관리자 메뉴 상단 뱃지 카운트 업데이트
    const pill = document.getElementById('consecutive-count-pill');
    if (pill) {
      pill.textContent = consecutiveAlerts.length;
      pill.style.display = consecutiveAlerts.length > 0 ? 'inline-block' : 'none';
    }

    // 2. 현황표 상단 배너 알림 업데이트
    const banner = document.getElementById('consecutive-alert-banner');
    const bannerCount = document.getElementById('consecutive-banner-count');
    const bannerList = document.getElementById('consecutive-banner-list');

    if (banner && bannerList) {
      if (consecutiveAlerts.length > 0) {
        banner.style.display = 'block';
        if (bannerCount) bannerCount.textContent = consecutiveAlerts.length;
        bannerList.innerHTML = '';

        consecutiveAlerts.forEach(alert => {
          const chip = document.createElement('div');
          chip.className = 'consecutive-mini-chip';
          const reasonStr = alert.reasons.length > 0 ? ` [${alert.reasons.join(', ')}]` : '';
          chip.innerHTML = `
            <span class="chip-name">👤 ${alert.userName}</span>
            <span class="chip-streak">${alert.streakDays}일 연속</span>
            <span class="chip-dates">${alert.startDate.substring(5)} ~ ${alert.endDate.substring(5)}${reasonStr}</span>
          `;
          chip.addEventListener('click', () => {
            openConsecutiveModal();
          });
          bannerList.appendChild(chip);
        });
      } else {
        banner.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to load consecutive alerts:', err);
  }
}

function openConsecutiveModal() {
  const modal = document.getElementById('consecutive-modal');
  const countBadge = document.getElementById('consecutive-modal-count');
  const container = document.getElementById('consecutive-modal-list');
  if (!modal || !container) return;

  if (countBadge) {
    countBadge.textContent = `총 ${consecutiveAlerts.length}건의 3일 이상 연속 휴무`;
  }

  container.innerHTML = '';

  if (consecutiveAlerts.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--gray-400);">
        <i class="ri-checkbox-circle-line" style="font-size:36px;color:var(--success);margin-bottom:8px;display:inline-block;"></i>
        <p style="font-size:14px;font-weight:700;">현재 3일 이상 연속으로 휴무를 신청한 팀원이 없습니다.</p>
      </div>
    `;
  } else {
    consecutiveAlerts.forEach(alert => {
      const card = document.createElement('div');
      card.className = 'consecutive-card';

      const reasonsBadge = alert.reasons.length > 0 
        ? `<div style="font-size:12px;color:#9f1239;font-weight:700;margin-bottom:10px;background:#fff1f2;padding:6px 12px;border-radius:6px;border:1px solid #fecdd3;">📌 픽스 사유: ${alert.reasons.join(', ')}</div>` : '';

      const gridId = `streak-grid-${alert.userId}-${alert.startDate.replace(/-/g, '')}`;

      card.innerHTML = `
        <div class="consecutive-card-top">
          <div class="consecutive-card-user">
            <span class="user-name">👤 ${alert.userName}</span>
            <span class="user-id">(${alert.username})</span>
          </div>
          <span class="streak-pill-lg">🔥 ${alert.streakDays}일 연속 휴무 (${alert.startDate} ~ ${alert.endDate})</span>
        </div>
        ${reasonsBadge}
        <div class="consecutive-dates-grid" id="${gridId}">
          <!-- date chips -->
        </div>
      `;

      const datesGrid = card.querySelector(`#${gridId}`);
      alert.details.forEach(d => {
        const item = document.createElement('div');
        item.className = 'consecutive-date-item' + (d.is_fixed ? ' is-fixed' : '');
        const dateObj = parseDate(d.date);
        const dayName = DAY_NAMES[dateObj.getDay()];
        const statusText = d.is_fixed ? `🔒 ${d.reason || '픽스'}` : '🌿 일반 휴무';

        item.innerHTML = `
          <div class="item-date">${d.date.substring(5)} (${dayName})</div>
          <div class="item-status" title="${d.reason || ''}">${statusText}</div>
        `;

        item.addEventListener('click', () => {
          modal.style.display = 'none';
          openAdminDayOffModal(alert.userId, alert.userName, d.date);
        });

        datesGrid.appendChild(item);
      });

      container.appendChild(card);
    });
  }

  modal.style.display = 'flex';
}

document.getElementById('btn-consecutive-alerts')?.addEventListener('click', () => {
  openConsecutiveModal();
});

document.getElementById('btn-open-consecutive-modal')?.addEventListener('click', () => {
  openConsecutiveModal();
});

document.getElementById('consecutive-modal-close')?.addEventListener('click', () => {
  document.getElementById('consecutive-modal').style.display = 'none';
});

document.getElementById('consecutive-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('consecutive-modal').style.display = 'none';
  }
});

// ===== Start =====
init();
