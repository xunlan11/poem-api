// 通用工具
(function () {
  // 节点类型
  const TYPES = ['W', 'G', 'C', 'E', 'S', 'L'];
  const LV_SUB_TYPES = [
    { key: 'yunbu', label: '韵部（L）' },
    { key: 'ciqupu', label: '词曲谱（L）' },
  ];
  // 搜索脚本列表
  const SEARCH_SCRIPTS = {
    fuse: 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0',
    pinyin: 'https://cdn.jsdelivr.net/npm/pinyin-pro@3.20.1/dist/pinyin-pro.min.js'
  };
  // 已加载脚本映射
  const loadedScripts = new Map();
  // 全局脚本缓存
  const globalScriptCache = typeof window !== 'undefined' ? (window.__poemScriptCache = window.__poemScriptCache || {}) : {};
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

  // 一次性加载脚本的函数
  function loadScriptOnce(src) {
    if (!src) return Promise.resolve();
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    if (globalScriptCache[src] === 'loaded') return Promise.resolve();
    if (globalScriptCache[src] && typeof globalScriptCache[src].then === 'function') return globalScriptCache[src];
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (err) => {
        loadedScripts.delete(src);
        delete globalScriptCache[src];
        reject(err || new Error(`Failed to load script: ${src}`));
      };
      document.head.appendChild(script);
    });
    loadedScripts.set(src, promise);
    globalScriptCache[src] = promise;
    promise.then(() => { globalScriptCache[src] = 'loaded'; }).catch(() => { });
    return promise;
  }

  // 确保搜索依赖的函数
  async function ensureSearchDeps() {
    const tasks = [];
    if (typeof window !== 'undefined') {
      if (!window.Fuse) tasks.push(loadScriptOnce(SEARCH_SCRIPTS.fuse));
      if (!window.PinyinPro) tasks.push(loadScriptOnce(SEARCH_SCRIPTS.pinyin));
    }
    if (tasks.length) {
      try {
        await Promise.all(tasks);
      } catch (err) {
        console.error('加载搜索依赖失败', err);
      }
    }
  }
  // 构建搜索令牌的函数
  function buildSearchTokens(text) {
    if (!text) return [];
    const str = String(text);
    const trimmed = str.trim().toLowerCase();
    if (!trimmed) return [str];
    const tokens = new Set([str, trimmed]);
    try {
      if (window.PinyinPro && typeof window.PinyinPro.pinyin === 'function') {
        const full = window.PinyinPro.pinyin(str, { toneType: 'none', v: true, nonZh: 'consecutive', type: 'array' }) || [];
        if (Array.isArray(full) && full.length) {
          const joined = full.join('');
          const spaced = full.join(' ');
          if (joined) tokens.add(joined.toLowerCase());
          if (spaced) tokens.add(spaced.toLowerCase());
          if (full.every(s => s && s.length)) tokens.add(full.map(s => s[0]).join('').toLowerCase());
        }
      }
    } catch (e) { }
    return Array.from(tokens);
  }

  // 创建模糊搜索的函数
  function createFuzzySearch() {
    const fuseCache = new Map();
    function ensureFuse(list) {
      const key = list ? list.length : 0;
      if (fuseCache.has(key)) return fuseCache.get(key);
      const enriched = (list || []).map(item => {
        const copy = { ...item };
        const tokens = new Set();
        const pushTokens = value => {
          buildSearchTokens(value).forEach(tok => tokens.add(tok));
        };
        const fields = [
          item.id,
          item.name,
          item.creator,
          item.otherStatement,
          item.extra?.explanation,
          item.extra?.introduction,
          item.fields?.title,
          item.fields?.name,
          item.fields?.common,
          item.fields?.commonName,
          item.fields?.statement,
          item.fields?.scientificName,
          Array.isArray(item.fields?.otherStatements) ? item.fields.otherStatements.join(' ') : item.fields?.otherStatements,
        ];
        fields.forEach(pushTokens);
        copy.__tokens = Array.from(tokens);
        return copy;
      });
      const fuse = new window.Fuse(enriched, {
        keys: [
          { name: 'id', weight: 0.4 },
          { name: 'name', weight: 0.6 },
          { name: 'creator', weight: 0.3 },
          { name: '__tokens', weight: 0.8 }
        ],
        threshold: 0.45,
        ignoreLocation: true,
        distance: 200,
        minMatchCharLength: 1
      });
      fuseCache.set(key, fuse);
      return fuse;
    }
    return function (list, query) {
      if (!query || !query.trim()) return list;
      if (!window.Fuse) return list;
      const fuse = ensureFuse(list);
      try {
        return fuse.search(query).map(r => r.item);
      } catch (e) { return list; }
    };
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
    fuzzySearch: createFuzzySearch(),
    ensureSearchDeps,
    checkClientFingerprintOnce,
    startAutoUpdateCheck,
    // 重新加载页面的函数
    reloadNow() { window.location.reload(); },
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
            ${allowPlaceholder ? `<button id="lpPlaceholder" class="btn small" style="margin-left:auto;background:#14532d;border-color:#14532d;color:#ecfdf5;">标记为空置</button>` : ''}
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
      async function run(page = 0) {
        const type = card.querySelector('#lpType').value;
        const q = card.querySelector('#lpSearch').value;
        const off = Math.max(0, parseInt(page, 10) || 0) * PAGE_LIMIT;
        const { data, pagination } = await Poem.api(`/api/nodes?${type ? `type=${type}&` : ''}${q ? `search=${encodeURIComponent(q)}&` : ''}limit=${PAGE_LIMIT}&offset=${off}`);
        const list = document.createElement('div');
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
        container.appendChild(list);
        const total = (pagination && typeof pagination.total === 'number') ? pagination.total : (Array.isArray(data) ? data.length : 0);
        const currentOffset = (pagination && typeof pagination.offset === 'number') ? pagination.offset : off;
        const limit = (pagination && typeof pagination.limit === 'number') ? pagination.limit : PAGE_LIMIT;
        const currentPage = Math.floor(currentOffset / limit);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        if (totalPages > 1) {
          const pager = document.createElement('div');
          pager.style.display = 'flex';
          pager.style.gap = '8px';
          pager.style.alignItems = 'center';
          pager.style.marginTop = '8px';
          const prev = document.createElement('button'); prev.className = 'btn small'; prev.textContent = '上一页'; prev.disabled = currentPage <= 0;
          const info = document.createElement('span'); info.className = 'small'; info.textContent = `第 ${currentPage + 1} / ${totalPages} 页`;
          const next = document.createElement('button'); next.className = 'btn small'; next.textContent = '下一页'; next.disabled = currentPage >= totalPages - 1;
          prev.addEventListener('click', () => { if (!prev.disabled) run(currentPage - 1); });
          next.addEventListener('click', () => { if (!next.disabled) run(currentPage + 1); });
          pager.appendChild(prev); pager.appendChild(info); pager.appendChild(next);
          container.appendChild(pager);
        }
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
        <div class="modal-header"><div>选择要创建的类别</div><button class="btn" id="closeTypePicker">关闭</button></div>
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