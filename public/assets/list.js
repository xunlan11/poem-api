// 列表
(async function () {
  // 类型与标题
  const type = Poem.qs('type') || '';
  const rootType = type.startsWith('S_') ? 'S' : (type.startsWith('L_') ? 'L' : type);
  const title = document.getElementById('listTitle');
  const TITLE_MAP = { W: '诗词（W）', G: '文集（G）', C: '人物（C）', E: '典故（E）', S: '尔雅（S）', L: '格律（L）', A: '汇总' };
  title.textContent = type ? (TITLE_MAP[type] || '列表') : '全部';
  // 表格
  const tbody = document.getElementById('listBody');
  // 名称列标题
  try {
    const NAME_MAP = { W: '诗词', G: '文集', C: '人物', E: '典故', S: '尔雅', L: '格律', A: '名称' };
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
  const EDITING_POLL_INTERVAL = 10000;
  const editingPresence = Poem.createEditingPresence({
    meId: me && me.id ? me.id : '',
    pollInterval: EDITING_POLL_INTERVAL,
    onUpdate: () => { applyEditingStatusToRows(); }
  });
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
    const shouldShowCreate = isAggregatedList || CREATABLE.includes(rootType);
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
        if (rootType === 'S' && typeof Poem.openEryaSubtypePicker === 'function') {
          Poem.openEryaSubtypePicker({
            onSelect(subKey) {
              redirectToEditor('S', subKey);
            }
          });
          return;
        }
        if (rootType === 'L' && typeof Poem.openLvSubtypePicker === 'function') {
          Poem.openLvSubtypePicker({
            onSelect(subKey) {
              redirectToEditor('L', subKey);
            }
          });
          return;
        }
        redirectToEditor(rootType || type);
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
  let typeFilter = [];
  const TYPE_FILTER_VALUES = ['W', 'G', 'C', 'E', 'S', 'L'];
  let subFilter = [];
  let reviewFilter = [];
  let repairFilter = [];
  const REVIEW_STATUS_VALUES = ['pending', 'rejected', 'approved', 'archived'];
  const REPAIR_STATUS_VALUES = ['unfinished', 'finished'];
  function normalizeFilter(list, allowed) {
    if (!Array.isArray(list)) return [];
    const allowedMap = new Map((Array.isArray(allowed) ? allowed : []).map(item => [String(item || '').trim().toLowerCase(), item]));
    const filtered = list.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
    const unique = Array.from(new Set(filtered));
    return unique.map(item => allowedMap.get(item)).filter(Boolean);
  }
  function parseFilter(raw, allowed, defaultValues) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return defaultValues.slice();
    if (trimmed.toLowerCase() === 'none') return [];
    const normalized = normalizeFilter(trimmed.split(',').map(s => s.trim()), allowed);
    return normalized.length ? normalized : defaultValues.slice();
  }
  function getFilterParam(list, allowed) {
    if (!Array.isArray(list)) return '';
    if (!list.length) return 'none';
    if (list.length === allowed.length) return '';
    return list.join(',');
  }
  function getDefaultTypeFilter() {
    if (type && type !== 'A' && TYPE_FILTER_VALUES.includes(rootType)) {
      return [rootType];
    }
    return TYPE_FILTER_VALUES.slice();
  }
  function getSubtypeOptions() {
    if (rootType === 'S') {
      return Array.isArray(Poem.ERYA_SUB_TYPES) ? Poem.ERYA_SUB_TYPES : [];
    }
    if (rootType === 'L') {
      return Array.isArray(Poem.LV_SUB_TYPES) ? Poem.LV_SUB_TYPES : [];
    }
    return [];
  }
  function getDefaultSubFilter() {
    const options = getSubtypeOptions();
    return options.map(item => item && item.key).filter(Boolean);
  }
  function resolveTypeScopeParam() {
    if (!type || type === 'A') return '';
    const selectedTypes = normalizeFilter(typeFilter, TYPE_FILTER_VALUES);
    if (!selectedTypes.length) return type;
    if (selectedTypes.length === 1 && selectedTypes[0] === rootType) return type;
    return '';
  }
  // 筛选模态框
  function showFilterModal() {
    const { modal, card, close } = createModal('筛选');
    card.classList.add('modal-card-filter');
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
    const subtypeOptions = getSubtypeOptions();
    const subtypeKeys = subtypeOptions.map(item => item && item.key).filter(Boolean);
    const subtypeTagClass = rootType === 'S' ? 'type-tag type-S' : (rootType === 'L' ? 'type-tag type-L' : 'status-tag status-default');
    const typeFilterHtml = isAggregatedList
      ? `<div style="display:flex;flex-direction:column;gap:4px;width:100%"><span>类别</span>
        <div id="fltType" style="display:flex;flex-wrap:wrap;gap:8px 12px">
          <label class="type-tag type-W"><input type="checkbox" value="W"> 诗词（W）</label>
          <label class="type-tag type-G"><input type="checkbox" value="G"> 文集（G）</label>
          <label class="type-tag type-C"><input type="checkbox" value="C"> 人物（C）</label>
          <label class="type-tag type-E"><input type="checkbox" value="E"> 典故（E）</label>
          <label class="type-tag type-S"><input type="checkbox" value="S"> 尔雅（S）</label>
          <label class="type-tag type-L"><input type="checkbox" value="L"> 格律（L）</label>
        </div>
      </div>`
      : '';
    const subtypeFilterHtml = !isAggregatedList && subtypeOptions.length
      ? `<div style="display:flex;flex-direction:column;gap:4px;width:100%"><span>子类</span>
        <div id="fltSub" style="display:flex;flex-wrap:wrap;gap:8px 12px">${subtypeOptions.map(sub => `<label class="${subtypeTagClass}"><input type="checkbox" value="${Poem.escapeHtml(String(sub.key || ''))}"> ${Poem.escapeHtml(String(sub.label || sub.key || ''))}</label>`).join('')}</div>
      </div>`
      : '';
    body.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start;flex-direction:column;min-width:260px">
      ${typeFilterHtml}
      ${subtypeFilterHtml}
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
      <div style="display:flex;flex-direction:column;gap:4px;width:100%"><span>状态</span>
        <div style="display:flex;gap:12px;width:100%;flex-wrap:wrap">
          <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:160px">
            <span>审核</span>
            <div id="fltStatus" class="filter-status-row" style="display:flex;gap:8px 12px">
              <label class="status-tag status-pending"><input type="checkbox" value="pending"> 未审核</label>
              <label class="status-tag status-rejected"><input type="checkbox" value="rejected"> 未通过</label>
              <label class="status-tag status-approved"><input type="checkbox" value="approved"> 通过</label>
              <label class="status-tag status-archived"><input type="checkbox" value="archived"> 归档</label>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:160px;opacity:0.6" id="repairFilterLabel">
            <span>返修</span>
            <div id="fltRepair" style="display:flex;flex-wrap:wrap;gap:8px 12px">
              <label class="status-tag status-rejected"><input type="checkbox" value="unfinished"> 未完成</label>
              <label class="status-tag status-approved"><input type="checkbox" value="finished"> 完成</label>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    const startEl = body.querySelector('#fltStart');
    const endEl = body.querySelector('#fltEnd');
    const typeWrap = body.querySelector('#fltType');
    const subWrap = body.querySelector('#fltSub');
    const statusWrap = body.querySelector('#fltStatus');
    const repairWrap = body.querySelector('#fltRepair');
    const repairLabel = body.querySelector('#repairFilterLabel');
    startEl.value = dateFilter.start || '';
    endEl.value = dateFilter.end || '';
    const typeChecks = typeWrap ? Array.from(typeWrap.querySelectorAll('input[type="checkbox"]')) : [];
    const subChecks = subWrap ? Array.from(subWrap.querySelectorAll('input[type="checkbox"]')) : [];
    const initialTypes = Array.isArray(typeFilter) && typeFilter.length
      ? typeFilter
      : TYPE_FILTER_VALUES.slice();
    typeChecks.forEach(input => {
      input.checked = initialTypes.includes(input.value);
    });
    const initialSubs = Array.isArray(subFilter) && subFilter.length
      ? subFilter
      : subtypeKeys.slice();
    subChecks.forEach(input => {
      input.checked = initialSubs.includes(input.value);
    });
    const statusChecks = Array.from(statusWrap.querySelectorAll('input[type="checkbox"]'));
    const repairChecks = Array.from(repairWrap.querySelectorAll('input[type="checkbox"]'));
    const initialReview = Array.isArray(reviewFilter) ? reviewFilter : REVIEW_STATUS_VALUES.slice();
    statusChecks.forEach(input => {
      input.checked = initialReview.includes(input.value);
    });
    const initialRepair = Array.isArray(repairFilter) && repairFilter.length
      ? repairFilter
      : REPAIR_STATUS_VALUES.slice();
    repairChecks.forEach(input => {
      input.checked = initialRepair.includes(input.value);
    });
    const getSelectedStatuses = () => statusChecks.filter(input => input.checked).map(input => input.value);
    const getSelectedRepairs = () => repairChecks.filter(input => input.checked).map(input => input.value);
    const getSelectedTypes = () => typeChecks.filter(input => input.checked).map(input => input.value);
    const getSelectedSubs = () => subChecks.filter(input => input.checked).map(input => input.value);
    const syncRepairState = () => {
      const selected = getSelectedStatuses();
      const active = selected.includes('rejected');
      repairChecks.forEach(input => { input.disabled = !active; });
      repairLabel.style.opacity = active ? '1' : '0.6';
      if (!active) {
        repairChecks.forEach(input => { input.checked = false; });
      } else if (!repairChecks.some(input => input.checked)) {
        repairChecks.forEach(input => { input.checked = true; });
      }
    };
    const enforceAtLeastOne = (checks, isActive, event) => {
      if (!isActive()) return;
      if (checks.some(input => input.checked)) return;
      const target = event && event.target && event.target.type === 'checkbox' ? event.target : null;
      if (target) target.checked = true;
    };
    syncRepairState();
    if (typeWrap) {
      typeWrap.addEventListener('change', (event) => {
        enforceAtLeastOne(typeChecks, () => true, event);
      });
    }
    if (subWrap) {
      subWrap.addEventListener('change', (event) => {
        enforceAtLeastOne(subChecks, () => true, event);
      });
    }
    statusWrap.addEventListener('change', (event) => {
      enforceAtLeastOne(statusChecks, () => true, event);
      syncRepairState();
    });
    repairWrap.addEventListener('change', (event) => {
      enforceAtLeastOne(repairChecks, () => getSelectedStatuses().includes('rejected'), event);
    });
    card.querySelector('#fltOk').onclick = () => {
      dateFilter.start = startEl.value || null;
      dateFilter.end = endEl.value || null;
      if (typeWrap) {
        typeFilter = normalizeFilter(getSelectedTypes(), TYPE_FILTER_VALUES);
      }
      if (subWrap) {
        subFilter = normalizeFilter(getSelectedSubs(), subtypeKeys);
      }
      reviewFilter = normalizeFilter(getSelectedStatuses(), REVIEW_STATUS_VALUES);
      const selectedRepair = getSelectedRepairs();
      repairFilter = reviewFilter.includes('rejected')
        ? normalizeFilter(selectedRepair, REPAIR_STATUS_VALUES)
        : [];
      close();
      search();
      Poem.toast('筛选已应用');
    };
    card.querySelector('#fltClear').onclick = () => {
      startEl.value = '';
      endEl.value = '';
      const resetTypes = getDefaultTypeFilter();
      typeChecks.forEach(input => { input.checked = resetTypes.includes(input.value); });
      const resetSubs = subtypeKeys.slice();
      subChecks.forEach(input => { input.checked = resetSubs.includes(input.value); });
      statusChecks.forEach(input => { input.checked = true; });
      repairChecks.forEach(input => { input.checked = true; });
      dateFilter.start = null;
      dateFilter.end = null;
      typeFilter = resetTypes.slice();
      subFilter = resetSubs.slice();
      reviewFilter = REVIEW_STATUS_VALUES.slice();
      repairFilter = REPAIR_STATUS_VALUES.slice();
      syncRepairState();
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
  const initialTypeRaw = Poem.qs('ft') || '';
  typeFilter = initialTypeRaw
    ? parseFilter(initialTypeRaw, TYPE_FILTER_VALUES, TYPE_FILTER_VALUES)
    : getDefaultTypeFilter();
  const subtypeOptions = getSubtypeOptions();
  const subtypeKeys = subtypeOptions.map(item => item && item.key).filter(Boolean);
  const initialSubRaw = Poem.qs('fs') || '';
  subFilter = subtypeKeys.length
    ? (initialSubRaw ? parseFilter(initialSubRaw, subtypeKeys, subtypeKeys) : subtypeKeys.slice())
    : [];
  reviewFilter = parseFilter(Poem.qs('rs') || '', REVIEW_STATUS_VALUES, REVIEW_STATUS_VALUES);
  repairFilter = reviewFilter.includes('rejected')
    ? parseFilter(Poem.qs('rr') || '', REPAIR_STATUS_VALUES, REPAIR_STATUS_VALUES)
    : [];
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
    const typeParam = getFilterParam(typeFilter, TYPE_FILTER_VALUES);
    if (typeParam) url.searchParams.set('ft', typeParam);
    else url.searchParams.delete('ft');
    const subtypeParams = getSubtypeOptions().map(item => item && item.key).filter(Boolean);
    const subParam = subtypeParams.length ? getFilterParam(subFilter, subtypeParams) : '';
    if (subParam) url.searchParams.set('fs', subParam);
    else url.searchParams.delete('fs');
    const reviewParam = getFilterParam(reviewFilter, REVIEW_STATUS_VALUES);
    if (reviewParam) {
      url.searchParams.set('rs', reviewParam);
    } else {
      url.searchParams.delete('rs');
    }
    const repairParam = getFilterParam(repairFilter, REPAIR_STATUS_VALUES);
    if (reviewFilter.includes('rejected') && repairParam) url.searchParams.set('rr', repairParam);
    else url.searchParams.delete('rr');
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
    const scopedType = resolveTypeScopeParam();
    if (scopedType) params.set('type', scopedType);
    const q = (searchInput?.value || '').trim();
    if (q) params.set('search', q);
    if (dateFilter.start) params.set('ds', dateFilter.start);
    if (dateFilter.end) params.set('de', dateFilter.end);
    const typeParam = getFilterParam(typeFilter, TYPE_FILTER_VALUES);
    if (typeParam) params.set('ft', typeParam);
    const subtypeParams = getSubtypeOptions().map(item => item && item.key).filter(Boolean);
    const subParam = subtypeParams.length ? getFilterParam(subFilter, subtypeParams) : '';
    if (subParam) params.set('fs', subParam);
    const reviewParam = getFilterParam(reviewFilter, REVIEW_STATUS_VALUES);
    if (reviewParam) params.set('rs', reviewParam);
    const repairParam = getFilterParam(repairFilter, REPAIR_STATUS_VALUES);
    if (reviewFilter.includes('rejected') && repairParam) params.set('rr', repairParam);
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
  const { REVIEW_STATUS_CLASS, REPAIR_STATUS_CLASS } = Poem;
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

  function getEditingInfo(id) {
    if (!id) return null;
    return editingPresence.getInfo(id);
  }

  function isEditingByOther(info) {
    return editingPresence.isEditingByOther(info);
  }

  function bindActionButtons(container) {
    if (!container) return;
    container.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
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
          const references = await Poem.fetchReferences(id);
          const hasRefs = references && Array.isArray(references.data) && references.data.length > 0;
          const ok = confirm(hasRefs ? Poem.buildReferenceMessage(id, references) : `删除 ${id} ？`);
          if (!ok) return;
          try {
            if (hasRefs) {
              await Poem.clearLinksToNode(id);
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
  }

  function updateRowActions(tr) {
    if (!tr) return;
    const id = tr.dataset.id || '';
    const editorHref = tr.dataset.editorHref || '';
    const actionsCell = tr.querySelector('.actions-cell');
    if (!actionsCell) return;
    const editingInfo = getEditingInfo(id);
    if (isEditingByOther(editingInfo)) {
      actionsCell.innerHTML = `<div class="actions-row"><button class="btn success small" disabled title="编辑中">编辑中</button></div>`;
      return;
    }
    const editorHrefEsc = Poem.escapeHtml(editorHref);
    const deleteButtonHtml = canDelete ? `<button data-act="delete" data-id="${id}" class="btn danger small">删除</button>` : '';
    actionsCell.innerHTML = `<div class="actions-row"><button data-act="open" data-id="${id}" data-url="${editorHrefEsc}" class="btn small">打开</button>${deleteButtonHtml}</div>`;
    bindActionButtons(actionsCell);
  }

  function applyEditingStatusToRows() {
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-id]').forEach(tr => updateRowActions(tr));
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
      const reviewStatusHtml = Poem.renderStatusTag(item.reviewStatus || '', item.reviewStatusLabel || '', REVIEW_STATUS_CLASS);
      const repairStatusHtml = item.reviewStatus === 'rejected' ? Poem.renderStatusTag(item.repairStatus || '', item.repairStatusLabel || '', REPAIR_STATUS_CLASS) : '';
      const typeCls = item.type ? `type-${item.type}` : '';
      const idText = Poem.escapeHtml(item.id || '');
      const idLabel = typeCls ? `<span class="type-tag ${typeCls}">${idText}</span>` : idText;
      const encodedId = encodeURIComponent(item.id || '');
      const editorHref = currentQueryEncoded ? `editor.html?id=${encodedId}&return=${currentQueryEncoded}` : `editor.html?id=${encodedId}`;
      const tr = document.createElement('tr');
      tr.dataset.id = item.id || '';
      tr.dataset.editorHref = editorHref;
      tr.innerHTML = `
        <td>${idLabel}</td>
        <td><div class="name-cell">${item.name || ''}</div></td>
        <td>${item.creator || ''}</td>
        <td>${item.createdAt || ''}</td>
        <td>${reviewerDisplay}</td>
        <td>${durationDisplay}</td>
        <td>${reviewStatusHtml}</td>
        <td>${repairStatusHtml}</td>
        <td class="actions-cell"></td>
      `;
      updateRowActions(tr);
      tbody.appendChild(tr);
    });
    updateCountDisplay(total);
    renderPagination(total, totalPages);
    const ids = pageItems.map(item => item.id).filter(Boolean);
    editingPresence.sync(ids);
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