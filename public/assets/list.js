// 列表
(async function () {
  // 类型与标题
  const type = Poem.qs('type') || '';
  const title = document.getElementById('listTitle');
  const TITLE_MAP = { W: '诗词（W）', G: '文集（G）', C: '人物（C）', E: '典故（E）', S: '鸟兽草木（S）', L: '格律（L）', A: '汇总' };
  title.textContent = type ? (TITLE_MAP[type] || '列表') : '全部';
  // 表格
  const tbody = document.getElementById('listBody');
  // 名称列标题
  try {
    const NAME_MAP = { W: '诗词', G: '文集', C: '人物', E: '典故', S: '鸟兽草木', L: '格律', A: '名称' };
    const nameHeader = document.getElementById('colNameHeader');
    if (nameHeader) nameHeader.textContent = type && NAME_MAP[type] ? NAME_MAP[type] : '名称';
  } catch (e) { }
  // 计数
  const countEl = document.getElementById('listCount');
  let totalCount = 0;
  function updateCountDisplay(count) {
    if (!countEl) return;
    const safe = typeof count === 'number' && !isNaN(count) ? count : (tbody ? tbody.querySelectorAll('tr').length : 0);
    countEl.textContent = `共 ${safe} 条`;
  }
  // 删除权限
  const me = await Poem.me();
  const canDelete = me && (me.role === 'reviewer' || me.role === 'admin');
  // 分页
  const paginationEl = document.getElementById('pagination');
  const PAGE_SIZE = 15;
  const initialPageParam = parseInt(Poem.qs('page'), 10);
  let currentPage = Number.isNaN(initialPageParam) || initialPageParam < 1 ? 1 : initialPageParam;
  let currentItems = [];
  // 创建
  const createBtn = document.getElementById('createBtn');
  const CREATABLE = ['W', 'G', 'C', 'E', 'S', 'L'];
  const isAggregatedList = !type || type === 'A';
  if (createBtn) {
    createBtn.textContent = '新建';
    const shouldShowCreate = isAggregatedList || CREATABLE.includes(type);
    if (!shouldShowCreate) {
      createBtn.style.display = 'none';
      createBtn.onclick = null;
    } else {
      createBtn.style.display = '';
      createBtn.disabled = false;
      createBtn.onclick = async () => {
        const ok = await Poem.requireProfile();
        if (!ok) return;
        const backQuery = getEncodedReturnQuery();
        const redirectToEditor = (targetType, subKey) => {
          if (!targetType) return;
          const encodedType = encodeURIComponent(targetType);
          const subParam = subKey ? `&sub=${encodeURIComponent(subKey)}` : '';
          const link = backQuery
            ? `editor.html?type=${encodedType}&new=1${subParam}&return=${backQuery}`
            : `editor.html?type=${encodedType}&new=1${subParam}`;
          location.href = link;
        };
        if (isAggregatedList) {
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
        if (type === 'L' && typeof Poem.openLvSubtypePicker === 'function') {
          Poem.openLvSubtypePicker({
            onSelect(subKey) {
              redirectToEditor('L', subKey);
            }
          });
          return;
        }
        redirectToEditor(type);
      };
    }
  }
  // 创建模态框
  function createModal(titleText) {
    const modal = document.createElement('div'); modal.className = 'modal';
    const card = document.createElement('div'); card.className = 'modal-card';
    card.innerHTML = `<div class="modal-header"><div>${titleText}</div><button class="btn small" id="closeModal">关闭</button></div><div class="modal-body"></div>`;
    modal.appendChild(card); document.body.appendChild(modal);
    const close = () => modal.remove();
    card.querySelector('#closeModal').onclick = close;
    return { modal, card, close };
  }
  // 筛选
  const filterBtn = document.getElementById('filterBtn');
  let dateFilter = { start: null, end: null };
  let typeFilter = '';
  let reviewFilter = '';
  let repairFilter = '';
  // 筛选模态框
  function showFilterModal() {
    const { modal, card, close } = createModal('筛选');
    const header = card.querySelector('.modal-header');
    const closeBtn = card.querySelector('#closeModal');
    if (closeBtn) closeBtn.remove();
    if (header) {
      const headerActions = document.createElement('div');
      headerActions.className = 'modal-header-actions';
      headerActions.innerHTML = `
        <button id="fltOk" class="btn primary small">确定</button>
        <button id="fltClear" class="btn danger small">清除</button>
        <button id="fltCancel" class="btn small">取消</button>
      `;
      header.appendChild(headerActions);
    }
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
          <option value="L">格律（L）</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;width:100%">创建日期
        <div style="display:flex;gap:12px;width:100%;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <span>开始</span>
            <input id="fltStart" type="date" style="flex:1;min-width:120px">
          </label>
          <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <span>结束</span>
            <input id="fltEnd" type="date" style="flex:1;min-width:120px">
          </label>
        </div>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;width:100%">状态
        <div style="display:flex;gap:12px;width:100%;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <span>审核</span>
            <select id="fltStatus" style="flex:1;min-width:120px">
              <option value="">全部</option>
              <option value="unarchived">未归档</option>
              <option value="pending">未审核</option>
              <option value="rejected">未通过</option>
              <option value="approved">通过</option>
              <option value="archived">归档</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px;opacity:0.6" id="repairFilterLabel">
            <span>返修</span>
            <select id="fltRepair" disabled style="flex:1;min-width:120px">
              <option value="">全部</option>
              <option value="unfinished">未完成</option>
              <option value="finished">完成</option>
            </select>
          </label>
        </div>
      </label>
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
    card.querySelector('#fltOk').onclick = () => {
      dateFilter.start = startEl.value || null;
      dateFilter.end = endEl.value || null;
      typeFilter = typeEl.value || '';
      reviewFilter = statusEl.value || '';
      repairFilter = reviewFilter === 'rejected' ? (repairEl.value || '') : '';
      close();
      search();
      Poem.toast('筛选已应用');
    };
    card.querySelector('#fltClear').onclick = () => {
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
    card.querySelector('#fltCancel').onclick = () => { close(); };
  }
  // 归档
  const archiveBtn = document.getElementById('archiveBtn');
  async function handleArchiveAction() {
    if (!isAdmin || type !== 'A') {
      Poem.toast('仅管理员可用');
      return;
    }
    const items = await fetchAllMatching();
    if (!items.length) {
      alert('当前筛选没有可归档节点。');
      return;
    }
    const hasNonApproved = items.some(item => (item.reviewStatus || '') !== 'approved');
    if (hasNonApproved) {
      alert('仅可归档通过节点，请调整筛选条件。');
      return;
    }
    if (!confirm(`归档当前 ${items.length} 条记录？`)) return;
    if (archiveBtn) archiveBtn.disabled = true;
    try {
      const ids = items.map(item => item.id).filter(Boolean);
      if (!ids.length) {
        Poem.toast('没有可归档节点');
        return;
      }
      await Poem.api('/api/nodes/archive', { method: 'POST', body: JSON.stringify({ ids }) });
      Poem.toast('归档成功');
      await search({ keepPage: true });
    } catch (err) {
      console.error(err);
      Poem.toast('归档失败');
    } finally {
      if (archiveBtn) archiveBtn.disabled = !isAdmin;
    }
  }
  // 搜索
  const searchInput = document.getElementById('listSearch');
  let searchTimer = null;
  // 初始搜索
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
  // 搜索函数
  async function search(options) {
    try {
      const keepPage = !!(options && options.keepPage);
      const requestedPage = options && Number(options.page);
      let targetPage = keepPage ? (Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : currentPage || 1) : 1;
      if (!keepPage) targetPage = 1;
      const { data, pagination } = await fetchPage(targetPage);
      const rows = Array.isArray(data) ? data : [];
      const total = pagination && typeof pagination.total !== 'undefined' ? parseInt(pagination.total, 10) : rows.length;
      currentItems = rows;
      totalCount = Number.isNaN(total) ? rows.length : total;
      currentPage = targetPage;
      if (!rows.length && totalCount > 0 && targetPage > 1 && !options?.__retry) {
        await search({ keepPage: true, page: targetPage - 1, __retry: true });
        return;
      }
      renderCurrentPage();
    } catch (err) {
      console.error(err);
      Poem.toast('加载失败');
    }
  }
  searchInput.addEventListener('input', queueSearch);
  search({ keepPage: true });
  // XLSX加载Promise
  let loadXlsxPromise = null;
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
  // 同步查询参数到URL
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
  // 获取编码的返回查询字符串
  function getEncodedReturnQuery() {
    const search = window.location.search || '';
    const trimmed = search.startsWith('?') ? search.slice(1) : search;
    return trimmed ? encodeURIComponent(trimmed) : '';
  }
  // 构建基础查询参数
  function buildBaseQueryParams() {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    const q = (searchInput?.value || '').trim();
    if (q) params.set('search', q);
    if (dateFilter.start) params.set('ds', dateFilter.start);
    if (dateFilter.end) params.set('de', dateFilter.end);
    if (typeFilter) params.set('ft', typeFilter);
    if (reviewFilter) params.set('rs', reviewFilter);
    if (reviewFilter === 'rejected' && repairFilter) params.set('rr', repairFilter);
    return params;
  }
  // 构建页面查询参数
  function buildPageQuery(page, pageSize) {
    const params = buildBaseQueryParams();
    const limit = pageSize || PAGE_SIZE;
    const offset = Math.max(0, (Math.max(1, page) - 1) * limit);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params;
  }
  // 获取页面数据
  async function fetchPage(page) {
    const params = buildPageQuery(page, PAGE_SIZE);
    const query = params.toString();
    return Poem.api(`/api/nodes${query ? `?${query}` : ''}`);
  }
  // 获取所有匹配的数据
  async function fetchAllMatching(limitPerRequest = EXPORT_LIMIT) {
    const params = buildBaseQueryParams();
    const limit = Math.min(Math.max(limitPerRequest || EXPORT_LIMIT, 1), 200);
    let offset = 0;
    const collected = [];
    while (true) {
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const query = params.toString();
      const { data, pagination } = await Poem.api(`/api/nodes${query ? `?${query}` : ''}`);
      const chunk = Array.isArray(data) ? data : [];
      collected.push(...chunk);
      const total = pagination && typeof pagination.total !== 'undefined' ? parseInt(pagination.total, 10) : null;
      if (!pagination || !chunk.length) break;
      if (Number.isInteger(total) && offset + chunk.length >= total) break;
      if (chunk.length < limit) break;
      offset += limit;
    }
    return collected;
  }
  // 排队搜索
  function queueSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { search(); }, 200);
  }
  // 审核状态CSS类映射
  const REVIEW_STATUS_CLASS = {
    pending: 'status-pending',
    rejected: 'status-rejected',
    approved: 'status-approved',
    archived: 'status-archived',
    final: 'status-final'
  };
  // 返修状态CSS类映射
  const REPAIR_STATUS_CLASS = {
    unfinished: 'status-rejected',
    finished: 'status-approved'
  };
  // HTML转义函数
  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str || '').replace(/[&<>"']/g, c => map[c] || c);
  }
  // 从ID中提取数字
  function idNumber(id) {
    if (!id || typeof id !== 'string') return 0;
    const num = parseInt(id.slice(1), 10);
    return Number.isNaN(num) ? 0 : num;
  }
  // 渲染状态标签
  function renderStatusTag(status, label, classMap) {
    if (!label) return '';
    const cls = classMap[status] || 'status-default';
    return `<span class="status-tag ${cls}">${escapeHtml(label)}</span>`;
  }
  // 跳转到指定页面
  function goToPage(page) {
    const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;
    const parsed = parseInt(page, 10);
    const target = Math.max(1, Math.min(Number.isNaN(parsed) ? currentPage : parsed, totalPages));
    if (target === currentPage) return;
    search({ keepPage: true, page: target }).catch(err => { console.error(err); });
  }
  // 渲染分页
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
    prevBtn.textContent = '◀';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => { if (currentPage > 1) goToPage(currentPage - 1); });
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn small';
    nextBtn.type = 'button';
    nextBtn.textContent = '▶';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => { if (currentPage < totalPages) goToPage(currentPage + 1); });
    const info = document.createElement('span');
    info.className = 'pagination-info';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pagination-input';
    input.min = '1';
    input.max = String(totalPages);
    input.value = String(currentPage);
    input.title = '按回车跳转';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = parseInt(input.value, 10);
        if (!Number.isNaN(target)) goToPage(target);
      }
    });
    input.addEventListener('blur', () => { input.value = String(currentPage); });
    info.textContent = '第 ';
    info.appendChild(input);
    const totalSpan = document.createElement('span');
    totalSpan.textContent = ` / ${totalPages} 页`;
    info.appendChild(totalSpan);
    paginationEl.appendChild(prevBtn);
    paginationEl.appendChild(info);
    paginationEl.appendChild(nextBtn);
  }

  // 查询引用并格式化提示
  async function fetchReferences(nodeId) {
    if (!nodeId) return null;
    try {
      return await Poem.api(`/api/nodes/references/${nodeId}`);
    } catch (err) {
      console.error('查询引用失败', err);
      return null;
    }
  }

  function buildReferenceMessage(id, payload, maxItems = 5) {
    const list = Array.isArray(payload?.data) ? payload.data : [];
    const total = typeof payload?.total === 'number' ? payload.total : list.length;
    if (!list.length) return `删除 ${id} ？`;
    const lines = list.slice(0, maxItems).map(r => {
      const name = r.label || '';
      const count = r.linkCount ? `（链接${r.linkCount}处）` : '';
      return `- ${r.id}${name ? ' ' + name : ''}${count}`;
    });
    const extra = total > lines.length ? `... 共 ${total} 个引用` : '';
    return `以下节点引用了 ${id}：\n${lines.join('\n')}${extra ? `\n${extra}` : ''}\n\n继续删除并将这些链接置为空置吗？`;
  }

  async function clearLinksToNode(targetId) {
    if (!targetId) return { ok: false };
    return Poem.api('/api/nodes/clear-links', { method: 'POST', body: JSON.stringify({ targetId }) });
  }

  // 渲染当前页面
  function renderCurrentPage() {
    const rows = Array.isArray(currentItems) ? currentItems : [];
    const total = Math.max(0, parseInt(totalCount, 10) || 0);
    const totalPages = total ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (!tbody) return;
    tbody.innerHTML = '';
    syncQueryParams();
    const currentQueryEncoded = getEncodedReturnQuery();
    const pageItems = rows;
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
      const deleteButtonHtml = canDelete ? `<button data-act="delete" data-id="${item.id}" class="btn danger small">删除</button>` : '';
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
        ${deleteButtonHtml}</div></td>
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
            const references = await fetchReferences(id);
            const hasRefs = references && Array.isArray(references.data) && references.data.length > 0;
            const ok = confirm(hasRefs ? buildReferenceMessage(id, references) : `删除 ${id} ？`);
            if (!ok) return;
            try {
              if (hasRefs) {
                await clearLinksToNode(id);
              }
              await Poem.api(`/api/nodes/${id}`, { method: 'DELETE' });
              Poem.toast('删除成功');
              await search({ keepPage: true });
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
  // 导出（汇总，审核者/管理员）
  const exportDurationBtn = document.getElementById('exportDurationBtn');
  const exportListBtn = document.getElementById('exportListBtn');
  const EXPORT_LIMIT = 200;
  const hasExportPermission = me && (me.role === 'reviewer' || me.role === 'admin');
  const isAdmin = me && me.role === 'admin';
  if (exportDurationBtn) {
    if (type !== 'A') {
      exportDurationBtn.style.display = 'none';
    } else {
      if (!hasExportPermission) {
        exportDurationBtn.style.display = 'none';
      } else {
        exportDurationBtn.style.display = '';
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
        exportListBtn.style.display = 'none';
      } else {
        exportListBtn.style.display = '';
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
        archiveBtn.style.display = 'none';
      } else {
        archiveBtn.style.display = '';
        archiveBtn.disabled = false;
        archiveBtn.title = '';
        archiveBtn.addEventListener('click', handleArchiveAction);
      }
    }
  }
  // 导出数据模态框
  function showExportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    const card = document.createElement('div');
    card.className = 'modal-card';
    card.innerHTML = `
      <div class="modal-body"></div>
    `;
    modal.appendChild(card);
    document.body.appendChild(modal);
    const close = () => modal.remove();
    const body = card.querySelector('.modal-body');
    body.innerHTML = `
      <div class="export-session-row">
        <span class="export-session-text">导出第</span>
        <input id="exportSession" class="pagination-input export-session-input" type="number" min="1" value="1">
        <span class="export-session-text">期</span>
        <span class="export-session-actions">
          <button id="exportOk" class="btn primary small">导出</button>
          <button id="exportCancel" class="btn small">取消</button>
        </span>
      </div>
    `;
    const sessionEl = body.querySelector('#exportSession');
    body.querySelector('#exportOk').onclick = async () => {
      const session = (sessionEl.value || '1').toString();
      close();
      try {
        await ensureXLSX();
        const items = await fetchAllMatching();
        if (!items.length) {
          Poem.toast('没有可导出的记录');
          return;
        }
        // 按创建者聚合
        const map = new Map();
        items.forEach(it => {
          const creator = it.creator || '';
          const key = creator;
          const dur = parseFloat(String(it.reviewDuration ?? '').trim());
          const num = isNaN(dur) ? 0 : dur;
          if (!map.has(key)) map.set(key, { creator: creator, total: 0 });
          map.get(key).total += num;
        });
        // 构建行：学号, 服务时长（total/3小时）, 活动地点(线上), 姓名, 时长（total单位）
        const outRows = [];
        map.forEach(v => {
          if (!v.creator || String(v.creator).trim() === '') return; // 跳过匿名条目
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
  // 导出列表
  async function handleExportList() {
    try {
      await ensureXLSX();
      const items = await fetchAllMatching();
      if (!items.length) {
        Poem.toast('没有可导出的数据');
        return;
      }
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
})();