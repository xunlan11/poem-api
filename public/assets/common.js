(function () {
  const TYPES = ['W', 'G', 'C', 'E', 'S'];
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
    qs(name) { const p = new URLSearchParams(location.search); return p.get(name); },
    today() { return new Date().toISOString().slice(0, 10); },
    base() {
      // Detect if served under /poem/ reverse proxy
      const p = location.pathname;
      // If path starts with /poem/, prefix API calls with /poem
      return p.startsWith('/poem') ? '/poem' : '';
    },
    async api(path, opts) {
      const url = `${Poem.base()}${path}`;
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    },
    // Auth helpers
    async me() {
      // 如果缓存为 undefined 则首次加载；如果为 null（未登录）则允许重新拉取，避免登录后仍返回旧的 null
      if (window.__poem_me !== undefined && window.__poem_me !== null) return window.__poem_me;
      try { window.__poem_me = await Poem.api('/api/auth/me'); } catch (e) { window.__poem_me = null; }
      return window.__poem_me;
    },
    async requireLogin() {
      const me = await Poem.me();
      if (!me) { location.href = 'login.html'; return false; }
      return true;
    },
    async requireProfile() {
      const me = await Poem.me();
      if (!me) { location.href = 'login.html'; return false; }
      // 管理员跳过资料完整性检查
      if (me.role === 'admin') return true;
      if (!me.real_name || !me.student_id) { location.href = 'profile.html'; return false; }
      return true;
    },
    toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3000); },
    fuzzySearch: createFuzzySearch(),
    // Link picker overlay
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
        <div class="modal-header"><div>选择要链接的节点</div><button class="btn" id="closeModal">关闭</button></div>
        <div class="modal-body">
          <div style="display:flex; gap:8px;">
            <select id="lpType">
              <option value="">全部类型</option>
              <option value="W">诗词（W）</option>
              <option value="G">文集（G）</option>
              <option value="C">人物（C）</option>
              <option value="E">典故（E）</option>
              <option value="S">鸟兽草木（S）</option>
            </select>
            <input id="lpSearch" class="search" placeholder="搜索ID/名称/创建者">
            <button id="lpGo" class="btn">搜索</button>
            ${allowPlaceholder ? `<button id="lpPlaceholder" class="btn" style="margin-left:auto;background:#14532d;border-color:#14532d;color:#ecfdf5;">标记为空置</button>` : ''}
          </div>
          ${current ? `<div id="lpCurrent" class="current-link-info" style="margin-top:8px; padding:6px; border:1px dashed var(--border); border-radius:6px; background:#f8fafc; font-size:13px;">当前链接：${current.placeholder ? '<strong>空置</strong>' : `<strong>${escapeHtml(current.targetId || '')}</strong> ${escapeHtml(current.targetName || '')}`}</div>` : ''}
          <div id="lpResults" style="margin-top:8px;"></div>
        </div>
      `;
      modal.appendChild(card);
      document.body.appendChild(modal);
      const close = () => modal.remove();
      card.querySelector('#closeModal').onclick = close;
      async function run() {
        const type = card.querySelector('#lpType').value;
        const q = card.querySelector('#lpSearch').value;
        const { data } = await Poem.api(`/api/nodes?${type ? `type=${type}&` : ''}${q ? `search=${encodeURIComponent(q)}` : ''}`);
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
      }
      card.querySelector('#lpGo').onclick = run;
      const searchInput = card.querySelector('#lpSearch');
      const typeSelect = card.querySelector('#lpType');
      if (typeSelect && current && current.targetType) {
        typeSelect.value = current.targetType;
      }
      if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            run();
          }
        });
        if (current && (current.targetId || current.targetName)) {
          searchInput.value = current.targetId || current.targetName || '';
          setTimeout(run, 0);
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
    }
  };
})();