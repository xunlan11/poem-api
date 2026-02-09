// 通用工具
(function () {
  // 节点类型
  const TYPES = ['W', 'G', 'C', 'E', 'S', 'L'];
  const LV_SUB_TYPES = [
    { key: 'yunbu', label: '韵部（L）' },
    { key: 'ciqupu', label: '词曲谱（L）' },
  ];
  // 用户缓存键
  const ME_CACHE_KEY = 'poem_me_cache_v1';
  // 用户缓存TTL
  const ME_CACHE_TTL = 5 * 60 * 1000; 
  // 用户Promise
  let mePromise = null;
  // 客户端指纹
  const CLIENT_FP_KEY = 'poem_client_fp_v1';
  const CLIENT_FP_ENDPOINT = '/api/client-fingerprint';
  const CLIENT_FP_INTERVAL = 0;
  let clientFpTimer = null;
  let clientFpStarted = false;

  // 读取用户缓存的函数
  function readMeCache() {
    try {
      const raw = sessionStorage.getItem(ME_CACHE_KEY);
      if (!raw) return undefined;
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') return undefined;
      if (payload.expires && Date.now() > payload.expires) {
        sessionStorage.removeItem(ME_CACHE_KEY);
        return undefined;
      }
      return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : undefined;
    } catch (err) {
      return undefined;
    }
  }

  // 写入用户缓存的函数
  function writeMeCache(value) {
    if (!value || typeof value !== 'object') {
      try { sessionStorage.removeItem(ME_CACHE_KEY); } catch (err) { }
      return;
    }
    try {
      sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify({ data: value, expires: Date.now() + ME_CACHE_TTL }));
    } catch (err) { }
  }

  // 清除用户缓存的函数
  function clearMeCache() {
    try { sessionStorage.removeItem(ME_CACHE_KEY); } catch (err) { }
    if (typeof window !== 'undefined') {
      delete window.__poem_me;
    }
  }

  function readClientFingerprint() {
    try { return sessionStorage.getItem(CLIENT_FP_KEY) || ''; } catch (err) { return ''; }
  }

  function writeClientFingerprint(value) {
    try {
      if (value) {
        sessionStorage.setItem(CLIENT_FP_KEY, value);
      } else {
        sessionStorage.removeItem(CLIENT_FP_KEY);
      }
    } catch (err) { }
  }

  async function checkClientFingerprintOnce(options) {
    const opts = options || {};
    try {
      const payload = await Poem.api(CLIENT_FP_ENDPOINT);
      const serverHash = payload && payload.hash ? String(payload.hash) : '';
      if (!serverHash) return false;
      const current = readClientFingerprint();
      if (current && current !== serverHash) {
        if (!opts.silent && typeof Poem.toast === 'function') {
          Poem.toast('检测到新版本，正在刷新...');
        }
        writeClientFingerprint(serverHash);
        setTimeout(() => { window.location.reload(); }, 500);
        return true;
      }
      writeClientFingerprint(serverHash);
      return false;
    } catch (err) {
      if (!opts.silent) console.warn('fingerprint check failed', err);
      return false;
    }
  }

  function startAutoUpdateCheck(options) {
    if (clientFpStarted) return;
    clientFpStarted = true;
    const rawInterval = (options && typeof options.interval === 'number') ? options.interval : CLIENT_FP_INTERVAL;
    const interval = Number.isFinite(rawInterval) ? rawInterval : 0;
    const initialDelay = Math.max(0, (options && options.initialDelay) || 500);
    const silent = !!(options && options.silent);
    const runCheck = () => { checkClientFingerprintOnce({ silent }).catch(() => { }); };
    setTimeout(runCheck, initialDelay);
    // 默认不做轮询，避免编辑过程中被强制刷新导致内容丢失
    if (interval > 0) {
      clientFpTimer = setInterval(runCheck, interval);
    }
  }


  window.Poem = {
    TYPES,
    LV_SUB_TYPES,
    // 获取查询字符串参数的函数
    qs(name) { const p = new URLSearchParams(location.search); return p.get(name); },
    // 获取今天的日期字符串的函数
    today() { return new Date().toISOString().slice(0, 10); },
    // 获取基础路径的函数
    base() {
      const p = location.pathname;
      return p.startsWith('/poem') ? '/poem' : '';
    },
    // API调用的函数
    async api(path, opts) {
      const url = `${Poem.base()}${path}`;
      const defaults = { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
      const res = await fetch(url, { ...defaults, ...opts });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    },
    // 获取当前用户信息的函数
    async me(options) {
      const forceRefresh = !!(options && options.force);
      if (forceRefresh) {
        clearMeCache();
        window.__poem_me = undefined;
      }
      if (!forceRefresh && window.__poem_me !== undefined && window.__poem_me !== null) {
        return window.__poem_me;
      }
      if (!forceRefresh && window.__poem_me === undefined) {
        const cached = readMeCache();
        if (cached !== undefined) {
          window.__poem_me = cached;
          return cached;
        }
        if (mePromise) return mePromise;
      }
      mePromise = Poem.api('/api/auth/me').then(data => {
        window.__poem_me = data;
        if (data) {
          writeMeCache(data);
        } else {
          try { sessionStorage.removeItem(ME_CACHE_KEY); } catch (err) { }
        }
        return data;
      }).catch(() => {
        window.__poem_me = null;
        try { sessionStorage.removeItem(ME_CACHE_KEY); } catch (err) { }
        return null;
      }).finally(() => { mePromise = null; });
      return mePromise;
    },
    // 要求登录的函数
    async requireLogin() {
      const me = await Poem.me();
      if (!me) { location.href = 'login.html'; return false; }
      return true;
    },
    // 要求完善资料的函数
    async requireProfile() {
      const me = await Poem.me();
      if (!me) { location.href = 'login.html'; return false; }
      if (me.role === 'admin') return true;
      if (!me.real_name || !me.student_id) { location.href = 'profile.html'; return false; }
      return true;
    },
    // 显示提示消息的函数
    toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3000); },
    checkClientFingerprintOnce,
    startAutoUpdateCheck,
    clearMeCache,
    // 打开链接选择器的函数
    openLinkPicker(onPick, options) {
      const opts = options || {};
      const allowPlaceholder = opts.allowPlaceholder !== false;
      const current = opts.current || null;
      function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
      const modal = document.createElement('div');
      modal.className = 'modal';
      const card = document.createElement('div');
      card.className = 'modal-card';
      card.innerHTML = `
        <div class="modal-header"><div>要链接的节点</div><button class="btn small" id="closeModal">关闭</button></div>
        <div class="modal-body">
          <div style="display:flex; gap:8px;">
            <select id="lpType">
              <option value="">全部类型</option>
              <option value="W">诗词（W）</option>
              <option value="G">文集（G）</option>
              <option value="C">人物（C）</option>
              <option value="E">典故（E）</option>
              <option value="S">鸟兽草木（S）</option>
              <option value="L">格律（L）</option>
            </select>
            <input id="lpSearch" class="search" placeholder="搜索ID/名称/创建者">
            ${allowPlaceholder ? `<button id="lpPlaceholder" class="btn small link-mode" style="margin-left:auto;">空置</button>` : ''}
          </div>
          ${current ? `<div id="lpCurrent" class="current-link-info" style="margin-top:8px; padding:6px; border:1px dashed var(--border); border-radius:6px; background:#f8fafc; font-size:13px;">当前链接：${current.placeholder ? '<strong>空置</strong>' : `<strong>${escapeHtml(current.targetId || '')}</strong> ${escapeHtml(current.targetName || '')}`}</div>` : ''}
          <div id="lpResults" style="margin-top:8px;"></div>
        </div>
      `;
      modal.appendChild(card);
      document.body.appendChild(modal);
      const close = () => modal.remove();
      card.querySelector('#closeModal').onclick = close;
      const PAGE_LIMIT = 5;
      let lpCurrentPage = 0;
      let lpTotalPages = 1;

      function renderLinkPickerPagination(container) {
        if (!container) return;
        if (lpTotalPages <= 1) return;
        const paginationEl = document.createElement('div');
        paginationEl.className = 'pagination-bar';
        // 该分页条需要出现在结果顶部，不需要额外上边距
        paginationEl.style.marginTop = '0';

        const goToPage = (targetPageOneBased) => {
          const target = parseInt(targetPageOneBased, 10);
          if (Number.isNaN(target)) return;
          const clamped = Math.max(1, Math.min(target, lpTotalPages));
          run(clamped - 1);
        };

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn small';
        prevBtn.type = 'button';
        prevBtn.textContent = '◀';
        prevBtn.disabled = lpCurrentPage <= 0;
        prevBtn.addEventListener('click', () => {
          if (lpCurrentPage > 0) run(lpCurrentPage - 1);
        });

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn small';
        nextBtn.type = 'button';
        nextBtn.textContent = '▶';
        nextBtn.disabled = lpCurrentPage >= lpTotalPages - 1;
        nextBtn.addEventListener('click', () => {
          if (lpCurrentPage < lpTotalPages - 1) run(lpCurrentPage + 1);
        });

        const info = document.createElement('span');
        info.className = 'pagination-info';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'pagination-input';
        input.min = '1';
        input.max = String(lpTotalPages);
        input.value = String(lpCurrentPage + 1);
        input.title = '按回车跳转';
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            goToPage(input.value);
          }
        });
        input.addEventListener('blur', () => {
          input.value = String(lpCurrentPage + 1);
        });
        info.textContent = '第 ';
        info.appendChild(input);
        const totalSpan = document.createElement('span');
        totalSpan.textContent = ` / ${lpTotalPages} 页`;
        info.appendChild(totalSpan);

        paginationEl.appendChild(prevBtn);
        paginationEl.appendChild(info);
        paginationEl.appendChild(nextBtn);
        container.appendChild(paginationEl);
      }

      async function run(page = 0) {
        const type = card.querySelector('#lpType').value;
        const q = card.querySelector('#lpSearch').value;
        const off = Math.max(0, parseInt(page, 10) || 0) * PAGE_LIMIT;
        const { data, pagination } = await Poem.api(`/api/nodes?${type ? `type=${type}&` : ''}${q ? `search=${encodeURIComponent(q)}&` : ''}limit=${PAGE_LIMIT}&offset=${off}`);
        const list = document.createElement('div');
        list.style.marginTop = '8px';
        data.forEach(item => {
          const div = document.createElement('div');
          div.className = 'result-item';
          div.innerHTML = `<div>${item.id}｜${item.name || '（未命名）'}</div><div class="small">${item.creator || ''}｜${item.createdAt || ''}</div>`;
          if (current && current.targetId && item.id === current.targetId) {
            div.classList.add('selected');
            div.style.background = '#dcfce7';
            div.style.borderColor = '#86efac';
          }
          div.onclick = () => { onPick(item); close(); };
          list.appendChild(div);
        });
        const container = card.querySelector('#lpResults');
        container.innerHTML = '';
        const total = (pagination && typeof pagination.total === 'number') ? pagination.total : (Array.isArray(data) ? data.length : 0);
        const currentOffset = (pagination && typeof pagination.offset === 'number') ? pagination.offset : off;
        const limit = (pagination && typeof pagination.limit === 'number') ? pagination.limit : PAGE_LIMIT;
        lpCurrentPage = Math.max(0, Math.floor(currentOffset / limit));
        lpTotalPages = Math.max(1, Math.ceil(total / limit));
        renderLinkPickerPagination(container);
        container.appendChild(list);
      }
      const searchInput = card.querySelector('#lpSearch');
      const typeSelect = card.querySelector('#lpType');
      if (typeSelect && current && current.targetType) {
        typeSelect.value = current.targetType;
      }
      // 防抖自动搜索
      if (searchInput) {
        let debounceTimer = null;
        const scheduleRun = (page = 0) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => run(page), 200);
        };
        searchInput.addEventListener('input', () => scheduleRun(0));
        typeSelect.addEventListener('change', () => run(0));
        if (current && (current.targetId || current.targetName)) {
          searchInput.value = current.targetId || current.targetName || '';
          setTimeout(() => run(0), 0);
        }
      }
      if (!current) {
        setTimeout(() => { searchInput && searchInput.focus(); }, 0);
      }
      if (allowPlaceholder) {
        const placeholderBtn = card.querySelector('#lpPlaceholder');
        if (placeholderBtn) {
          placeholderBtn.addEventListener('click', () => {
            try { if (typeof opts.onPlaceholder === 'function') opts.onPlaceholder(); } catch (e) { }
            close();
          });
        }
      }
    },
    // 打开格律子类型选择器的函数
    openLvSubtypePicker(options) {
      const opts = options || {};
      const subs = Array.isArray(LV_SUB_TYPES) && LV_SUB_TYPES.length ? LV_SUB_TYPES : [];
      if (!subs.length) return () => { };
      const modal = document.createElement('div');
      modal.className = 'modal';
      const card = document.createElement('div');
      card.className = 'modal-card';
      card.innerHTML = `
        <div class="modal-header"><div>选择格律子类</div><button class="btn" id="closeLvPicker">关闭</button></div>
        <div class="modal-body lv-subtype-picker"></div>
      `;
      modal.appendChild(card);
      document.body.appendChild(modal);
      const close = () => modal.remove();
      card.querySelector('#closeLvPicker').onclick = close;
      const body = card.querySelector('.modal-body');
      subs.forEach(sub => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn lv-subtype-btn';
        btn.textContent = sub.label;
        btn.title = sub.description || '';
        btn.addEventListener('click', () => {
          close();
          try { if (typeof opts.onSelect === 'function') opts.onSelect(sub.key, sub); } catch (e) { }
        });
        body.appendChild(btn);
      });
      return close;
    },
    // 打开类型选择器的函数
    openTypePicker(options) {
      const opts = options || {};
      const baseEntries = [
        { type: 'W', label: '诗词（W）' },
        { type: 'G', label: '文集（G）' },
        { type: 'C', label: '人物（C）' },
        { type: 'E', label: '典故（E）' },
        { type: 'S', label: '鸟兽草木（S）' },
      ];
      const entryMap = baseEntries.reduce((acc, entry) => {
        acc[entry.type] = entry;
        return acc;
      }, {});
      const lvSubs = Array.isArray(LV_SUB_TYPES) ? LV_SUB_TYPES : [];
      const modal = document.createElement('div');
      modal.className = 'modal';
      const card = document.createElement('div');
      card.className = 'modal-card';
      card.innerHTML = `
        <div class="modal-header"><div>要创建的类别</div><button class="btn" id="closeTypePicker">关闭</button></div>
        <div class="modal-body type-picker-grid"></div>
      `;
      modal.appendChild(card);
      document.body.appendChild(modal);
      const close = () => modal.remove();
      card.querySelector('#closeTypePicker').onclick = close;
      const grid = card.querySelector('.modal-body');
      const buildButton = (entry) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn type-picker-btn';
        btn.textContent = entry.label;
        if (entry.type) btn.dataset.type = entry.type;
        if (entry.description) btn.title = entry.description;
        if (entry.sub) btn.classList.add('type-picker-btn--sub');
        btn.addEventListener('click', () => {
          close();
          try { if (typeof opts.onSelect === 'function') opts.onSelect({ type: entry.type, sub: entry.sub || null, entry }); } catch (e) { }
        });
        return btn;
      };
      const addCellWithEntry = (entry) => {
        if (!entry) return;
        const cell = document.createElement('div');
        cell.className = 'type-picker-cell';
        cell.appendChild(buildButton(entry));
        grid.appendChild(cell);
      };
      const addLvCell = () => {
        const cell = document.createElement('div');
        cell.className = 'type-picker-cell type-picker-cell--lv';
        if (lvSubs.length) {
          const subWrapper = document.createElement('div');
          subWrapper.className = 'type-picker-lv-buttons';
          lvSubs.forEach(sub => {
            const subBtn = buildButton({ type: 'L', sub: sub.key, label: sub.label, description: sub.description || '' });
            subWrapper.appendChild(subBtn);
          });
          cell.appendChild(subWrapper);
        } else {
          cell.appendChild(buildButton({ type: 'L', label: '格律（L）' }));
        }
        grid.appendChild(cell);
      };
      const ROWS = [
        ['W', 'G'],
        ['C', 'E'],
        ['S', 'L_GROUP']
      ];
      ROWS.forEach(row => {
        row.forEach(token => {
          if (token === 'L_GROUP') {
            addLvCell();
          } else {
            addCellWithEntry(entryMap[token]);
          }
        });
      });
      return close;
    }
  };

  if (typeof window !== 'undefined') {
    const bootAutoUpdate = () => {
      try {
        const pathname = String(location && location.pathname ? location.pathname : '');
        const isEditorPage = /\/editor\.html$/.test(pathname);
        // 非编辑页：定时检查，避免“只有一个页面刷新，其他打开的页面不更新”
        // 编辑页：不做轮询，减少强制刷新导致内容丢失的风险
        const interval = isEditorPage ? 0 : 30 * 1000;
        Poem.startAutoUpdateCheck({ initialDelay: 500, interval, silent: false });

        // 非编辑页：切回前台时也检查一次（多标签页更容易及时拿到更新）
        if (!isEditorPage && typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              Poem.checkClientFingerprintOnce({ silent: true }).catch(() => { });
            }
          });
        }
      } catch (err) {
        console.warn('auto update init failed', err);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootAutoUpdate, { once: true });
    } else {
      bootAutoUpdate();
    }
  }
})();