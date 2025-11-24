(async function () {
  const type = Poem.qs('type') || '';
  const title = document.getElementById('listTitle');
  const TITLE_MAP = { W: '诗词（W）', G: '文集（G）', C: '人物（C）', E: '典故（E）', S: '鸟兽草木（S）', A: '汇总' };
  title.textContent = type ? (TITLE_MAP[type] || '列表') : '全部';
  // Set the name-column header to the appropriate label for the selected type
  try {
    const NAME_MAP = { W: '诗词', G: '文集', C: '人物', E: '典故', S: '鸟兽草木', A: '名称' };
    const nameHeader = document.getElementById('colNameHeader');
    if (nameHeader) nameHeader.textContent = type && NAME_MAP[type] ? NAME_MAP[type] : '名称';
  } catch (e) { }
  const searchInput = document.getElementById('listSearch');
  const tbody = document.getElementById('listBody');
  const createBtn = document.getElementById('createBtn');
  const countEl = document.getElementById('listCount');
  const paginationEl = document.getElementById('pagination');
  const PAGE_SIZE = 15;
  const initialPageParam = parseInt(Poem.qs('page'), 10);
  let currentPage = Number.isNaN(initialPageParam) || initialPageParam < 1 ? 1 : initialPageParam;
  let filteredItems = [];
  let allItems = [];
  let itemsLoaded = false;
  let loadPromise = null;
  let searchTimer = null;
  // Only allow create for the main 4 types — if createBtn exists (some layouts may remove it)
  const CREATABLE = ['W', 'G', 'C', 'E', 'S'];
  if (createBtn) {
    createBtn.textContent = '新建';
    if (CREATABLE.includes(type)) {
      createBtn.style.display = '';
      createBtn.disabled = false;
      createBtn.onclick = async () => {
        const ok = await Poem.requireProfile();
        if (!ok) return;
        const encodedType = encodeURIComponent(type || '');
        const backQuery = getEncodedReturnQuery();
        const link = backQuery ? `editor.html?type=${encodedType}&new=1&return=${backQuery}` : `editor.html?type=${encodedType}&new=1`;
        location.href = link;
      };
    } else {
      createBtn.style.display = 'none';
      createBtn.onclick = null;
    }
  }

  const me = await Poem.me();
  const canDelete = me && (me.role === 'reviewer' || me.role === 'admin');

  // filter state and controls
  const filterBtn = document.getElementById('filterBtn');
  const exportDurationBtn = document.getElementById('exportDurationBtn');
  const exportListBtn = document.getElementById('exportListBtn');
  const archiveBtn = document.getElementById('archiveBtn');
  let dateFilter = { start: null, end: null };
  let typeFilter = '';
  let reviewFilter = '';
  let repairFilter = '';
  let loadXlsxPromise = null;
  let currentViewItems = [];

  const initialSearch = Poem.qs('q') || '';
  if (searchInput) searchInput.value = initialSearch;
  const initialStart = Poem.qs('ds');
  const initialEnd = Poem.qs('de');
  dateFilter = {
    start: initialStart ? initialStart : null,
    end: initialEnd ? initialEnd : null
  };
  typeFilter = Poem.qs('ft') || '';
  reviewFilter = Poem.qs('rs') || '';
  repairFilter = reviewFilter === 'rejected' ? (Poem.qs('rr') || '') : '';

  async function ensureXLSX() {
    if (typeof XLSX !== 'undefined') return;
    if (!loadXlsxPromise) {
      loadXlsxPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); loadXlsxPromise = null; reject(new Error('无法加载导出组件')); };
        document.head.appendChild(script);
      });
    }
    await loadXlsxPromise;
  }

  function updateCountDisplay(count) {
    if (!countEl) return;
    const safe = typeof count === 'number' && !isNaN(count) ? count : (tbody ? tbody.querySelectorAll('tr').length : 0);
    countEl.textContent = `共 ${safe} 条`;
  }

  function syncQueryParams() {
    const url = new URL(window.location.href);
    const qValue = (searchInput?.value || '').trim();
    if (qValue) url.searchParams.set('q', qValue);
    else url.searchParams.delete('q');

    if (dateFilter.start) url.searchParams.set('ds', dateFilter.start);
    else url.searchParams.delete('ds');

    if (dateFilter.end) url.searchParams.set('de', dateFilter.end);
    else url.searchParams.delete('de');

    if (typeFilter) url.searchParams.set('ft', typeFilter);
    else url.searchParams.delete('ft');

    if (reviewFilter) {
      url.searchParams.set('rs', reviewFilter);
      if (reviewFilter === 'rejected' && repairFilter) url.searchParams.set('rr', repairFilter);
      else url.searchParams.delete('rr');
    } else {
      url.searchParams.delete('rs');
      url.searchParams.delete('rr');
    }

    if (currentPage > 1) url.searchParams.set('page', String(currentPage));
    else url.searchParams.delete('page');

    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function getEncodedReturnQuery() {
    const search = window.location.search || '';
    const trimmed = search.startsWith('?') ? search.slice(1) : search;
    return trimmed ? encodeURIComponent(trimmed) : '';
  }

  async function fetchItems(forceRefresh) {
    if (forceRefresh) {
      itemsLoaded = false;
      allItems = [];
    }
    if (itemsLoaded) return allItems;
    if (loadPromise) return loadPromise;
    const limit = 200;
    const base = type ? `type=${type}&` : '';
    const pending = (async () => {
      const collected = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const { data, pagination } = await Poem.api(`/api/nodes?${base}limit=${limit}&offset=${offset}`);
        const chunk = Array.isArray(data) ? data : [];
        collected.push(...chunk);
        const received = chunk.length;
        if (pagination && typeof pagination.total !== 'undefined') {
          const parsedTotal = parseInt(pagination.total, 10);
          if (!Number.isNaN(parsedTotal)) total = parsedTotal;
        } else if (received < limit) {
          total = offset + received;
        }
        offset += limit;
        if (!pagination && received < limit) break;
        if (received < limit) break;
      }
      return collected;
    })();
    loadPromise = pending.then(items => {
      allItems = items;
      itemsLoaded = true;
      return allItems;
    }).catch(err => {
      itemsLoaded = false;
      allItems = [];
      throw err;
    }).finally(() => { loadPromise = null; });
    return loadPromise;
  }

  function queueSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { search(); }, 200);
  }

  const REVIEW_STATUS_CLASS = {
    pending: 'status-pending',
    rejected: 'status-rejected',
    approved: 'status-approved',
    archived: 'status-archived',
    final: 'status-final'
  };
  const REPAIR_STATUS_CLASS = {
    unfinished: 'status-rejected',
    finished: 'status-approved'
  };

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str || '').replace(/[&<>"']/g, c => map[c] || c);
  }

  function idNumber(id) {
    if (!id || typeof id !== 'string') return 0;
    const num = parseInt(id.slice(1), 10);
    return Number.isNaN(num) ? 0 : num;
  }

  function compareSummaryItems(a, b) {
    const da = a && a.createdAt ? Date.parse(a.createdAt) : NaN;
    const db = b && b.createdAt ? Date.parse(b.createdAt) : NaN;
    const va = Number.isNaN(da) ? 0 : da;
    const vb = Number.isNaN(db) ? 0 : db;
    if (vb !== va) return vb - va;
    return idNumber(b?.id || '') - idNumber(a?.id || '');
  }

  function renderStatusTag(status, label, classMap) {
    if (!label) return '';
    const cls = classMap[status] || 'status-default';
    return `<span class="status-tag ${cls}">${escapeHtml(label)}</span>`;
  }

  function goToPage(page) {
    const totalPages = filteredItems.length ? Math.ceil(filteredItems.length / PAGE_SIZE) : 1;
    const parsed = parseInt(page, 10);
    const target = Math.max(1, Math.min(Number.isNaN(parsed) ? currentPage : parsed, totalPages));
    if (target === currentPage) return;
    currentPage = target;
    renderCurrentPage();
  }

  function renderPagination(totalCount, totalPages) {
    if (!paginationEl) return;
    paginationEl.innerHTML = '';
    if (countEl) {
      countEl.classList.add('pagination-count');
      paginationEl.appendChild(countEl);
    }
    if (!totalCount) {
      const empty = document.createElement('span');
      empty.className = 'pagination-info';
      empty.textContent = '暂无数据';
      paginationEl.appendChild(empty);
      return;
    }
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn small';
    prevBtn.type = 'button';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => { if (currentPage > 1) goToPage(currentPage - 1); });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn small';
    nextBtn.type = 'button';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => { if (currentPage < totalPages) goToPage(currentPage + 1); });

    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `第 ${currentPage} / ${totalPages} 页`;

    const jumpWrapper = document.createElement('div');
    jumpWrapper.className = 'pagination-jump';
    const jumpText = document.createElement('span');
    jumpText.textContent = '跳至';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pagination-input';
    input.min = '1';
    input.max = String(totalPages);
    input.value = String(currentPage);
    input.title = '输入页码后按回车';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = parseInt(input.value, 10);
        if (!Number.isNaN(target)) goToPage(target);
      }
    });
    input.addEventListener('blur', () => { input.value = String(currentPage); });
    const suffix = document.createElement('span');
    suffix.textContent = '页';
    jumpWrapper.appendChild(jumpText);
    jumpWrapper.appendChild(input);
    jumpWrapper.appendChild(suffix);

    paginationEl.appendChild(prevBtn);
    paginationEl.appendChild(info);
    paginationEl.appendChild(nextBtn);
    paginationEl.appendChild(jumpWrapper);
  }

  function renderCurrentPage() {
    const rows = Array.isArray(filteredItems) ? filteredItems : [];
    const total = rows.length;
    const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (!tbody) return;
    tbody.innerHTML = '';
    syncQueryParams();
    const currentQueryEncoded = getEncodedReturnQuery();
    const start = total ? (currentPage - 1) * PAGE_SIZE : 0;
    const pageItems = rows.slice(start, start + PAGE_SIZE);
    currentViewItems = rows.slice();
    pageItems.forEach(item => {
      const reviewerDisplay = item.reviewer || '';
      const durationDisplay = item.reviewDuration ?? '';
      const reviewStatusHtml = renderStatusTag(item.reviewStatus || '', item.reviewStatusLabel || '', REVIEW_STATUS_CLASS);
      const repairStatusHtml = item.reviewStatus === 'rejected' ? renderStatusTag(item.repairStatus || '', item.repairStatusLabel || '', REPAIR_STATUS_CLASS) : '';
      const typeCls = item.type ? `type-${item.type}` : '';
      const idText = escapeHtml(item.id || '');
      const idLabel = typeCls ? `<span class="type-tag ${typeCls}">${idText}</span>` : idText;
      const encodedId = encodeURIComponent(item.id || '');
      const editorHref = currentQueryEncoded ? `editor.html?id=${encodedId}&return=${currentQueryEncoded}` : `editor.html?id=${encodedId}`;
      const editorHrefEsc = escapeHtml(editorHref);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idLabel}</td>
        <td><div class="name-cell">${item.name || ''}</div></td>
        <td>${item.creator || ''}</td>
        <td>${item.createdAt || ''}</td>
        <td>${reviewerDisplay}</td>
        <td>${durationDisplay}</td>
        <td>${reviewStatusHtml}</td>
        <td>${repairStatusHtml}</td>
        <td class="actions-cell"><div class="row-actions"><button data-act="open" data-id="${item.id}" data-url="${editorHrefEsc}" class="btn small">打开</button>
        <button data-act="delete" data-id="${item.id}" class="btn danger small" ${canDelete ? '' : 'disabled'}>删除</button></div></td>
      `;
      tr.querySelectorAll('button[data-act]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const act = btn.dataset.act;
          const id = btn.dataset.id;
          if (act === 'open') {
            const targetUrl = btn.dataset.url || (() => {
              const encoded = encodeURIComponent(id || '');
              const currentQuery = getEncodedReturnQuery();
              return currentQuery ? `editor.html?id=${encoded}&return=${currentQuery}` : `editor.html?id=${encoded}`;
            })();
            location.href = targetUrl;
            return;
          }
          if (act === 'delete') {
            if (!canDelete) { Poem.toast('权限不足'); return; }
            const ok = confirm(`确定删除 ${id} 吗？此操作不可恢复。`);
            if (!ok) return;
            try {
              await Poem.api(`/api/nodes/${id}`, { method: 'DELETE' });
              Poem.toast('删除成功');
              if (Array.isArray(allItems)) {
                const pos = allItems.findIndex(entry => String(entry?.id || '') === String(id));
                if (pos > -1) allItems.splice(pos, 1);
              }
              filteredItems = filteredItems.filter(item => String(item?.id || '') !== String(id));
              currentViewItems = currentViewItems.filter(item => String(item?.id || '') !== String(id));
              renderCurrentPage();
              return;
            } catch (err) {
              console.error(err);
              Poem.toast('删除失败：' + (err && err.error ? err.error : '服务器错误'));
            }
          }
        });
      });
      tbody.appendChild(tr);
    });
    updateCountDisplay(total);
    renderPagination(total, totalPages);
  }

  // Show export button only on 汇总 (type==='A'). When visible, only reviewer/admin can trigger it.
  const hasExportPermission = me && (me.role === 'reviewer' || me.role === 'admin');
  const isAdmin = me && me.role === 'admin';
  if (exportDurationBtn) {
    if (type !== 'A') {
      exportDurationBtn.style.display = 'none';
    } else {
      if (!hasExportPermission) {
        exportDurationBtn.disabled = true;
        exportDurationBtn.title = '仅审核者/管理员可用';
      } else {
        exportDurationBtn.disabled = false;
        exportDurationBtn.title = '';
        exportDurationBtn.addEventListener('click', showExportModal);
      }
    }
  }

  if (exportListBtn) {
    if (type !== 'A') {
      exportListBtn.style.display = 'none';
    } else {
      if (!hasExportPermission) {
        exportListBtn.disabled = true;
        exportListBtn.title = '仅审核者/管理员可用';
      } else {
        exportListBtn.disabled = false;
        exportListBtn.title = '';
        exportListBtn.addEventListener('click', handleExportList);
      }
    }
  }

  if (archiveBtn) {
    if (type !== 'A') {
      archiveBtn.style.display = 'none';
    } else {
      if (!isAdmin) {
        archiveBtn.disabled = true;
        archiveBtn.title = '仅管理员可用';
      } else {
        archiveBtn.disabled = false;
        archiveBtn.title = '';
        archiveBtn.addEventListener('click', handleArchiveAction);
      }
    }
  }

  function applyFilters(items) {
    if (!items || !items.length) return items;
    return items.filter(it => {
      if (typeFilter) {
        if ((it.type || '') !== typeFilter) return false;
      }
      // date filter
      if (dateFilter.start) {
        const created = it.createdAt ? Date.parse(it.createdAt) : NaN;
        const s = Date.parse(dateFilter.start);
        const e = dateFilter.end ? (Date.parse(dateFilter.end) + 86400000 - 1) : (Date.parse(dateFilter.start) + 86400000 - 1);
        if (isNaN(created) || created < s || created > e) return false;
      }
      // review status filter
      if (reviewFilter) {
        if ((it.reviewStatus || '') !== reviewFilter) return false;
        if (reviewFilter === 'rejected' && repairFilter) {
          if ((it.repairStatus || '') !== repairFilter) return false;
        }
      }
      return true;
    });
  }

  function createModal(titleText) {
    const modal = document.createElement('div'); modal.className = 'modal';
    const card = document.createElement('div'); card.className = 'modal-card';
    card.innerHTML = `<div class="modal-header"><div>${titleText}</div><button class="btn" id="closeModal">关闭</button></div><div class="modal-body"></div>`;
    modal.appendChild(card); document.body.appendChild(modal);
    const close = () => modal.remove();
    card.querySelector('#closeModal').onclick = close;
    return { modal, card, close };
  }

  function showFilterModal() {
    const { modal, card, close } = createModal('筛选');
    const body = card.querySelector('.modal-body');
    body.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start;flex-direction:column;min-width:260px">
      <label style="display:flex;flex-direction:column;gap:4px;width:100%">节点类别
        <select id="fltType">
          <option value="">全部</option>
          <option value="W">诗词（W）</option>
          <option value="G">文集（G）</option>
          <option value="C">人物（C）</option>
          <option value="E">典故（E）</option>
          <option value="S">鸟兽草木（S）</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;width:100%">创建日期
        <div style="display:flex;gap:12px;width:100%;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <span>开始日期</span>
            <input id="fltStart" type="date" style="flex:1;min-width:120px">
          </label>
          <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <span>结束日期</span>
            <input id="fltEnd" type="date" style="flex:1;min-width:120px">
          </label>
        </div>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;width:100%">审核状态
        <select id="fltStatus">
          <option value="">全部</option>
          <option value="pending">未审核</option>
          <option value="rejected">未通过</option>
          <option value="approved">通过</option>
          <option value="archived">归档</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;width:100%;opacity:0.6" id="repairFilterLabel">返修状态
        <select id="fltRepair" disabled>
          <option value="">全部</option>
          <option value="unfinished">未完成</option>
          <option value="finished">完成</option>
        </select>
      </label>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px">
        <button id="fltOk" class="btn primary">确定</button>
        <button id="fltClear" class="btn">清除</button>
        <button id="fltCancel" class="btn">取消</button>
      </div>
    </div>`;
    const startEl = body.querySelector('#fltStart');
    const endEl = body.querySelector('#fltEnd');
    const typeEl = body.querySelector('#fltType');
    const statusEl = body.querySelector('#fltStatus');
    const repairEl = body.querySelector('#fltRepair');
    const repairLabel = body.querySelector('#repairFilterLabel');
    startEl.value = dateFilter.start || '';
    endEl.value = dateFilter.end || '';
    const defaultTypeValue = typeFilter || ((type && type !== 'A') ? type : '');
    typeEl.value = defaultTypeValue;
    statusEl.value = reviewFilter || '';
    repairEl.value = repairFilter || '';
    const syncRepairState = () => {
      const active = statusEl.value === 'rejected';
      repairEl.disabled = !active;
      repairLabel.style.opacity = active ? '1' : '0.6';
      if (!active) {
        repairEl.value = '';
      }
    };
    syncRepairState();
    statusEl.addEventListener('change', syncRepairState);
    body.querySelector('#fltOk').onclick = () => {
      dateFilter.start = startEl.value || null;
      dateFilter.end = endEl.value || null;
      typeFilter = typeEl.value || '';
      reviewFilter = statusEl.value || '';
      repairFilter = reviewFilter === 'rejected' ? (repairEl.value || '') : '';
      close();
      search();
      Poem.toast('筛选已应用');
    };
    body.querySelector('#fltClear').onclick = () => {
      startEl.value = '';
      endEl.value = '';
      typeEl.value = '';
      statusEl.value = '';
      repairEl.value = '';
      dateFilter.start = null;
      dateFilter.end = null;
      typeFilter = '';
      reviewFilter = '';
      repairFilter = '';
      close();
      search();
      Poem.toast('筛选已清除');
    };
    body.querySelector('#fltCancel').onclick = () => { close(); };
  }

  function showExportModal() {
    const { modal, card, close } = createModal('导出：填写期数');
    const body = card.querySelector('.modal-body');
    body.innerHTML = `<div style="display:flex;gap:8px;flex-direction:column;align-items:flex-start">
      <label>第几期（数字）：<input id="exportSession" type="number" min="1" value="1" style="width:120px"></label>
      <div style="margin-top:8px"><button id="exportOk" class="btn primary">导出</button> <button id="exportCancel" class="btn">取消</button></div>
    </div>`;
    const sessionEl = body.querySelector('#exportSession');
    body.querySelector('#exportOk').onclick = async () => {
      const session = (sessionEl.value || '1').toString();
      close();
      // perform export
      try {
        await ensureXLSX();
        const items = Array.isArray(currentViewItems) ? currentViewItems : [];
        // aggregate by creator string
        const map = new Map();
        items.forEach(it => {
          const creator = it.creator || '';
          const key = creator;
          const dur = parseFloat(String(it.reviewDuration ?? '').trim());
          const num = isNaN(dur) ? 0 : dur;
          if (!map.has(key)) map.set(key, { creator: creator, total: 0 });
          map.get(key).total += num;
        });
        // build rows: 学号, 服务时长（小时） (total/3), 活动地点(线上), 姓名, 时长（单位）(total)
        const outRows = [];
        map.forEach(v => {
          if (!v.creator || String(v.creator).trim() === '') return; // skip anonymous/no-creator entries
          // parse creator string like '姓名(学号)'
          const m = /^\s*(.*?)\s*(?:\((.*?)\))?\s*$/.exec(v.creator || '');
          const name = m && m[1] ? m[1] : '';
          const sid = m && m[2] ? m[2] : '';
          const total = v.total || 0;
          const hours = +(total / 3).toFixed(2);
          outRows.push({ 学号: sid, '服务时长（小时）': hours, 活动地点: '线上', 姓名: name, '时长（单位）': total });
        });
        const ws = XLSX.utils.json_to_sheet(outRows, { header: ['学号', '服务时长（小时）', '活动地点', '姓名', '时长（单位）'] });
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '时长统计');
        const fn = `诗词楹联学会+诗词库构建（第${session}期）+时长认定.xlsx`;
        XLSX.writeFile(wb, fn);
        Poem.toast('导出已完成');
      } catch (e) { console.error(e); Poem.toast('导出失败'); }
    };
    body.querySelector('#exportCancel').onclick = () => { close(); };
  }

  if (filterBtn) filterBtn.addEventListener('click', showFilterModal);

  async function handleExportList() {
    try {
      await ensureXLSX();
      const base = await fetchItems();
      let items = Array.isArray(base) ? base.slice() : [];
      const q = (searchInput.value || '').trim();
      if (type === 'A') items.sort(compareSummaryItems);
      if (q) {
        if (window.Poem && typeof Poem.fuzzySearch === 'function') {
          items = Poem.fuzzySearch(items, q);
        } else {
          const ql = q.toLowerCase();
          items = items.filter(it => {
            return (it.id || '').includes(q) ||
              (it.name || '').toLowerCase().includes(ql) ||
              (it.creator || '').toLowerCase().includes(ql) ||
              (it.otherStatement || '').toLowerCase().includes(ql);
          });
        }
      }
      items = applyFilters(items);
      const headers = ['ID', '名称', '创建者', '创建日期', '审核者', '时长', '审核状态', '返修状态'];
      const rows = items.map(item => ({
        ID: item.id || '',
        名称: item.name || '',
        创建者: item.creator || '',
        创建日期: item.createdAt || '',
        审核者: item.reviewer || '',
        时长: item.reviewDuration ?? '',
        审核状态: item.reviewStatusLabel || item.reviewStatus || '',
        返修状态: item.reviewStatus === 'rejected' ? (item.repairStatusLabel || item.repairStatus || '') : ''
      }));
      const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, '列表');
      const filename = `诗词节点列表_${Poem.today ? Poem.today() : new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      Poem.toast('列表已导出');
    } catch (err) {
      console.error(err);
      Poem.toast('导出失败');
    }
  }

  async function handleArchiveAction() {
    if (!isAdmin || type !== 'A') {
      Poem.toast('仅管理员可用');
      return;
    }
    const items = Array.isArray(currentViewItems) ? currentViewItems : [];
    if (!items.length) {
      alert('当前筛选没有可归档的记录。');
      return;
    }
    const hasNonApproved = items.some(item => (item.reviewStatus || '') !== 'approved');
    if (hasNonApproved) {
      alert('仅可归档审核状态为“通过”的节点，请调整筛选条件后再试。');
      return;
    }
    if (!confirm(`确定将当前 ${items.length} 条记录归档吗？`)) return;
    if (archiveBtn) archiveBtn.disabled = true;
    try {
      const ids = items.map(item => item.id).filter(Boolean);
      if (!ids.length) {
        Poem.toast('没有有效的节点可归档');
        return;
      }
      await Poem.api('/api/nodes/archive', { method: 'POST', body: JSON.stringify({ ids }) });
      Poem.toast('归档成功');
      await search({ forceRefresh: true, keepPage: true });
    } catch (err) {
      console.error(err);
      Poem.toast('归档失败');
    } finally {
      if (archiveBtn) archiveBtn.disabled = !isAdmin;
    }
  }

  function render(items) {
    filteredItems = Array.isArray(items) ? items.slice() : [];
    renderCurrentPage();
  }

  async function search(options) {
    const q = (searchInput.value || '').trim();
    try {
      const keepPage = !!(options && options.keepPage);
      if (!keepPage) currentPage = 1;
      const base = await fetchItems(options && options.forceRefresh);
      let items = Array.isArray(base) ? base.slice() : [];
      if (type === 'A') items.sort(compareSummaryItems);
      if (q) {
        if (window.Poem && typeof Poem.fuzzySearch === 'function') {
          items = Poem.fuzzySearch(items, q);
        } else {
          const ql = q.toLowerCase();
          items = items.filter(it => {
            return (it.id || '').includes(q) ||
              (it.name || '').toLowerCase().includes(ql) ||
              (it.creator || '').toLowerCase().includes(ql) ||
              (it.otherStatement || '').toLowerCase().includes(ql);
          });
        }
      }
      items = applyFilters(items);
      render(items);
    } catch (err) {
      console.error(err);
      Poem.toast('加载失败');
    }
  }
  searchInput.addEventListener('input', queueSearch);
  search({ keepPage: true });
})();