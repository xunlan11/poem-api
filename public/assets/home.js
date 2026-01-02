// 首页
(function () {
  // 类型标签映射
  const TYPE_LABELS = { W: '诗词', G: '文集', C: '人物', E: '典故', S: '鸟兽草木', L: '格律' };
  // 页面大小
  const PENDING_PAGE_SIZE = 8;
  // 部分
  const pendingSection = document.getElementById('myPendingSection');
  // 主体
  const pendingBody = document.getElementById('myPendingBody');
  // 摘要
  const pendingSummary = document.getElementById('myPendingSummary');
  // 分页
  const pendingPagination = document.getElementById('myPendingPagination');
  // 待审核状态
  const pendingState = { items: [], page: 1 };
  // 审核状态映射
  const REVIEW_STATUS_CLASS = {
    pending: 'status-pending',
    rejected: 'status-rejected',
    approved: 'status-approved',
    archived: 'status-archived',
    final: 'status-final'
  };
  // 角色标签映射
  const ROLE_LABELS = { user: '整理员', reviewer: '审核员', admin: '管理员' };
  // 返修状态映射
  const REPAIR_STATUS_CLASS = {
    unfinished: 'status-rejected',
    finished: 'status-approved'
  };

  // 转义HTML
  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str || '').replace(/[&<>"']/g, c => map[c] || c);
  }

  // 渲染状态标签
  function renderStatusTag(status, label, classMap) {
    if (!label) return '';
    const cls = classMap[status] || 'status-default';
    return `<span class="status-tag ${cls}">${escapeHtml(label)}</span>`;
  }

  // 绑定行事件
  function bindRow(type) {
    const addBtn = document.querySelector(`.btn.add[data-type='${type}']`);
    const viewBtn = document.querySelector(`.btn.view[data-type='${type}']`);
    if (addBtn) {
      addBtn.onclick = async () => {
        const ok = await Poem.requireProfile();
        if (!ok) return;
        const redirectToEditor = (targetType, subKey) => {
          if (!targetType) return;
          const encodedType = encodeURIComponent(targetType);
          const subParam = subKey ? `&sub=${encodeURIComponent(subKey)}` : '';
          location.href = `editor.html?type=${encodedType}&new=1${subParam}`;
        };
        if (type === 'A') {
          if (typeof Poem.openTypePicker === 'function') {
            Poem.openTypePicker({
              onSelect(choice) {
                redirectToEditor(choice?.type, choice?.sub || '');
              }
            });
          } else {
            redirectToEditor('W');
          }
          return;
        }
        const encodedType = encodeURIComponent(type);
        if (type === 'L' && typeof Poem.openLvSubtypePicker === 'function') {
          Poem.openLvSubtypePicker({
            onSelect(subKey) {
              const subParam = subKey ? `&sub=${encodeURIComponent(subKey)}` : '';
              location.href = `editor.html?type=${encodedType}&new=1${subParam}`;
            }
          });
          return;
        }
        location.href = `editor.html?type=${encodedType}&new=1`;
      };
    }
    if (viewBtn) viewBtn.onclick = () => { location.href = `list.html?type=${type}`; };
  }

  ['W', 'G', 'C', 'E', 'S', 'L', 'A'].forEach(bindRow);

  // 获取所有节点
  async function fetchAllNodes() {
    const limit = 200;
    let offset = 0;
    let total = Infinity;
    const collected = [];
    while (offset < total) {
      const { data, pagination } = await Poem.api(`/api/nodes?type=A&limit=${limit}&offset=${offset}`);
      const chunk = Array.isArray(data) ? data : [];
      collected.push(...chunk);
      const received = chunk.length;
      if (pagination && typeof pagination.total !== 'undefined') {
        const parsed = parseInt(pagination.total, 10);
        if (!Number.isNaN(parsed)) total = parsed;
      }
      offset += limit;
      if (received < limit) break;
    }
    return collected;
  }

  // 标准化用户名
  function normalizeUserNames(me) {
    const variants = new Set();
    if (!me) return variants;
    const hasIds = me.real_name && me.student_id;
    if (hasIds) {
      variants.add(`${me.real_name}(${me.student_id})`);
      variants.add(`${me.real_name} (${me.student_id})`);
    }
    if (me.real_name) variants.add(me.real_name.trim());
    if (me.username) variants.add(me.username.trim());
    return new Set(Array.from(variants).filter(Boolean).map(str => str.trim()));
  }

  // 格式化状态标签
  function formatStatusLabel(item) {
    return item.reviewStatusLabel || (item.reviewStatus === 'pending' ? '未审核' : (item.reviewStatus === 'rejected' ? '未通过' : ''));
  }

  // 渲染待审核表格
  function renderPendingTable() {
    if (!pendingBody || !pendingPagination) return;
    const total = pendingState.items.length;
    if (!total) {
      pendingBody.innerHTML = '<tr><td colspan="9" class="text-muted">暂无</td></tr>';
      pendingPagination.innerHTML = '';
      pendingPagination.style.display = 'none';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(total / PENDING_PAGE_SIZE));
    const page = Math.min(Math.max(1, pendingState.page), totalPages);
    pendingState.page = page;
    const start = (page - 1) * PENDING_PAGE_SIZE;
    const pageItems = pendingState.items.slice(start, start + PENDING_PAGE_SIZE);
    pendingBody.innerHTML = pageItems.map(item => {
      const typeCls = item.type ? `type-${item.type}` : '';
      const idLabel = typeCls ? `<span class="type-tag ${typeCls}">${item.id}</span>` : item.id;
      const name = item.name || '（未命名）';
      const creator = item.creator || '—';
      const createdAt = item.createdAt || '—';
      const reviewer = item.reviewer || '';
      const duration = item.reviewDuration ?? '';
      const reviewStatusHtml = renderStatusTag(item.reviewStatus || '', item.reviewStatusLabel || formatStatusLabel(item), REVIEW_STATUS_CLASS);
      const repairStatusHtml = item.reviewStatus === 'rejected' ? renderStatusTag(item.repairStatus || '', item.repairStatusLabel || '', REPAIR_STATUS_CLASS) : '';
      return `<tr>
        <td>${idLabel}</td>
        <td><div class="name-cell">${name}</div></td>
        <td>${creator}</td>
        <td>${createdAt}</td>
        <td>${reviewer}</td>
        <td>${duration}</td>
        <td>${reviewStatusHtml}</td>
        <td>${repairStatusHtml}</td>
        <td class="actions-cell"><div class="row-actions"><a class="btn small" href="editor.html?id=${encodeURIComponent(item.id)}">打开</a></div></td>
      </tr>`;
    }).join('');
    if (totalPages <= 1) {
      pendingPagination.innerHTML = '';
      pendingPagination.style.display = 'none';
    } else {
      pendingPagination.style.display = 'flex';
      const prevDisabled = page <= 1 ? 'disabled' : '';
      const nextDisabled = page >= totalPages ? 'disabled' : '';
      pendingPagination.innerHTML = `
        <button class="btn" ${prevDisabled} data-page="prev">◀</button>
        <span class="small pagination-info">第 <input type="number" class="pagination-input" min="1" max="${totalPages}" value="${page}" aria-label="页码" /> / ${totalPages} 页</span>
        <button class="btn" ${nextDisabled} data-page="next">▶</button>
      `;
      const inputEl = pendingPagination.querySelector('.pagination-input');
      if (inputEl) {
        inputEl.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const target = parseInt(inputEl.value, 10);
            if (!Number.isNaN(target)) {
              const clamped = Math.max(1, Math.min(target, totalPages));
              pendingState.page = clamped;
              renderPendingTable();
            }
          }
        });
        inputEl.addEventListener('blur', () => { inputEl.value = String(pendingState.page); });
      }
      pendingPagination.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          if (btn.dataset.page === 'prev' && pendingState.page > 1) pendingState.page -= 1;
          if (btn.dataset.page === 'next' && pendingState.page < totalPages) pendingState.page += 1;
          renderPendingTable();
        });
      });
    }
  }

  // 初始化待审核列表
  async function initPendingList() {
    if (!pendingSection) return;
    try {
      const me = await Poem.me();
      if (!me) {
        pendingSection.style.display = 'none';
        return;
      }
      if (pendingSummary) pendingSummary.textContent = '加载中';
      const variants = normalizeUserNames(me);
      const all = await fetchAllNodes();
      const needsAttention = all.filter(item => {
        if (!item) return false;
        const status = (item.reviewStatus || '').trim();
        const isUnapproved = !status || status === 'pending' || status === 'rejected';
        if (!isUnapproved) return false;
        const creator = (item.creator || '').trim();
        const reviewer = (item.reviewer || '').trim();
        const belongs = (creator && variants.has(creator)) || (reviewer && variants.has(reviewer));
        return belongs;
      }).sort((a, b) => {
        const da = a && a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b && b.createdAt ? Date.parse(b.createdAt) : 0;
        if (db !== da) return db - da;
        return (b.id || '').localeCompare(a.id || '');
      });
      pendingState.items = needsAttention;
      pendingState.page = 1;
      if (pendingSummary) {
        pendingSummary.textContent = needsAttention.length ? `共 ${needsAttention.length} 条` : '暂无';
      }
      renderPendingTable();
    } catch (err) {
      console.error(err);
      if (pendingSummary) pendingSummary.textContent = '加载失败';
      if (pendingBody) pendingBody.innerHTML = '<tr><td colspan="9" class="text-muted">加载失败，请稍后重试</td></tr>';
    }
  }

  initPendingList();

  // 初始化用户栏
  async function initUserBar() {
    const bar = document.getElementById('userBar');
    const adminEntry = document.getElementById('adminEntry');
    if (!bar || !adminEntry) return;
    try {
      const me = await Poem.me();
      if (me) {
        const roleLabel = ROLE_LABELS[me.role] || me.role || '';
        bar.innerHTML = `${me.real_name || me.username}（${roleLabel}）｜<a class="link" id="logout">退出</a>`;
        const logout = document.getElementById('logout');
        if (logout) {
          logout.onclick = async () => {
            try {
              await Poem.api('/api/auth/logout', { method: 'POST' });
            } catch (err) {
              console.warn('Logout request failed:', err);
            }
            try { window.__poem_me = undefined; } catch (e) { }
            try { sessionStorage.removeItem('poem_me_cache_v1'); } catch (e) { }
            location.reload();
          };
        }
        if (me.role === 'admin') adminEntry.style.display = 'block';
      } else {
        bar.innerHTML = `<a class="link" href="login.html">登录</a>`;
      }
    } catch (e) {
      bar.textContent = '';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserBar, { once: true });
  } else {
    initUserBar();
  }
})();