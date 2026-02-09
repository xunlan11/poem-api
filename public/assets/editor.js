// 编辑器
(function () {
  // 节点类型列表
  const TYPES = Poem.TYPES;
  // 编辑器ID
  const id = Poem.qs('id');
  // 是否新建
  let isNew = Poem.qs('new') === '1';
  // 节点类型
  const type = Poem.qs('type');
  // 节点ID元素
  const nodeIdEl = document.getElementById('nodeId');
  // 链接按钮
  const linkBtn = document.getElementById('linkBtn');
  // 编辑/保存切换按钮
  const editBtn = document.getElementById('editBtn');
  // 旧保存按钮（隐藏）
  const saveBtn = document.getElementById('saveBtn');
  // 审核按钮
  const reviewBtn = document.getElementById('reviewBtn');
  // 自检按钮
  const selfCheckBtn = document.getElementById('selfCheckBtn');
  // 返回列表按钮
  const backListBtn = document.getElementById('backListBtn');
  // 返回全部按钮
  const backAllBtn = document.getElementById('backAllBtn');
  // 表单容器
  const formContainer = document.getElementById('formContainer');
  // 创建者元素
  const createdBy = document.getElementById('createdBy');
  // 创建时间元素
  const createdAt = document.getElementById('createdAt');
  // 审核者元素
  const reviewedBy = document.getElementById('reviewedBy');
  // 审核时间元素
  const reviewedAt = document.getElementById('reviewedAt');
  // 期望时长输入
  const expectedDurationInput = document.getElementById('metaExpectedDuration');
  // 审核时长输入
  const reviewDurationInput = document.getElementById('metaReviewDuration');
  // 接受期望按钮
  const acceptExpectedBtn = document.getElementById('metaAcceptExpected');
  // 返回查询
  const returnQuery = (Poem.qs('return') || '').replace(/^\?/, '');
  // 当前用户
  let currentUser = null;
  const EDITING_PING_INTERVAL = 15000;
  let editingLockActive = false;
  let editingLockTimer = null;
  let editingLockId = '';

  function sanitizeDurationValue(raw) {
    const cleaned = String(raw || '').replace(/[^\d.]/g, '');
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex === -1) return cleaned;
    const integerPart = cleaned.slice(0, dotIndex);
    const decimals = cleaned.slice(dotIndex + 1).replace(/\./g, '');
    const decimalPart = decimals.slice(0, 1);
    return `${integerPart}.${decimalPart}`;
  }

  function bindDurationSanitizer(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const next = sanitizeDurationValue(input.value);
      if (next !== input.value) input.value = next;
    });
    input.addEventListener('blur', () => {
      const next = sanitizeDurationValue(input.value);
      if (next !== input.value) input.value = next;
    });
  }

  bindDurationSanitizer(expectedDurationInput);
  bindDurationSanitizer(reviewDurationInput);

  // 格式化审核者显示的函数
  function formatReviewerDisplay(user) {
    if (!user) return '';
    if (user.real_name && user.student_id) return `${user.real_name} (${user.student_id})`;
    if (user.real_name) return user.real_name;
    return user.username || '';
  }

  let state = { editable: true, node: null };
  let isReviewerOrAdmin = false;  // 审核者或管理员权限
  let isAdmin = false;
  let isOwner = false;  // 创建者
  const editableWatchers = [];
  let requestImmediateSave = null;
  let saveInFlight = false;
  let currentSavePromise = null;
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function sendEditingStopBeacon(id) {
    if (!id) return;
    const payload = JSON.stringify({ id });
    const url = `${Poem.base()}/api/editing/stop`;
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, credentials: 'same-origin', keepalive: true }).catch(() => { });
  }



  function startEditingLock() {
    if (isNew || !state.node || !state.node.id) return;
    if (!state.canEditNode) return;
    const nodeId = state.node.id;
    editingLockId = nodeId;
    editingLockActive = true;
    Poem.api('/api/editing/start', { method: 'POST', body: JSON.stringify({ id: nodeId }) }).catch(() => { });
    if (!editingLockTimer) {
      editingLockTimer = setInterval(() => {
        if (!editingLockActive || !editingLockId) return;
        Poem.api('/api/editing/heartbeat', { method: 'POST', body: JSON.stringify({ id: editingLockId }) }).catch(() => { });
      }, EDITING_PING_INTERVAL);
    }
  }

  function stopEditingLock(options) {
    if (!editingLockId) return;
    const id = editingLockId;
    editingLockActive = false;
    editingLockId = '';
    if (editingLockTimer) {
      clearInterval(editingLockTimer);
      editingLockTimer = null;
    }
    if (options && options.beacon) {
      sendEditingStopBeacon(id);
      return;
    }
    Poem.api('/api/editing/stop', { method: 'POST', body: JSON.stringify({ id }) }).catch(() => { });
  }

  window.addEventListener('beforeunload', () => {
    if (editingLockActive && editingLockId) stopEditingLock({ beacon: true });
  });

  const selfCheckFactory = window.PoemEditor && window.PoemEditor.initSelfCheck;
  const selfCheckModule = typeof selfCheckFactory === 'function'
    ? selfCheckFactory({ document, window, Poem, formContainer, escapeHtml })
    : null;
  const runSelfCheck = selfCheckModule && typeof selfCheckModule.runSelfCheck === 'function'
    ? selfCheckModule.runSelfCheck
    : () => { };
  const clearSelfCheckIndicators = selfCheckModule && typeof selfCheckModule.clearSelfCheckIndicators === 'function'
    ? selfCheckModule.clearSelfCheckIndicators
    : () => { };

  if (selfCheckBtn) {
    selfCheckBtn.addEventListener('click', () => {
      if (!state.editable) {
        return;
      }
      try {
        runSelfCheck();
      } catch (err) {
        console.error(err);
        try { Poem.toast('自检失败'); } catch (e) { }
      }
    });
  }

  registerEditableWatcher(editable => {
    if (!editable) {
      try { clearSelfCheckIndicators(); } catch (e) { }
    }
  });

  const linkingFactory = window.PoemEditor && window.PoemEditor.initLinking;
  const linkingModule = typeof linkingFactory === 'function'
    ? linkingFactory({ document, window, Poem, formContainer, linkBtn, state })
    : null;
  const annotationsFactory = window.PoemEditor && window.PoemEditor.initAnnotations;
  const linkApi = linkingModule || {};
  const links = Array.isArray(linkApi.links) ? linkApi.links : [];
  const normalizeLink = typeof linkApi.normalizeLink === 'function' ? linkApi.normalizeLink : fallbackNormalizeLink;
  const initializeLinkFields = typeof linkApi.initializeLinkFields === 'function' ? linkApi.initializeLinkFields : () => { };
  const registerLinkField = typeof linkApi.registerLinkField === 'function' ? linkApi.registerLinkField : () => { };
  const reindexFieldLinks = typeof linkApi.reindexFieldLinks === 'function' ? linkApi.reindexFieldLinks : () => { };
  const renderFieldDisplay = typeof linkApi.renderFieldDisplay === 'function' ? linkApi.renderFieldDisplay : () => { };
  const getFieldSpec = typeof linkApi.getFieldSpec === 'function' ? linkApi.getFieldSpec : () => undefined;
  const cleanupLinkFieldSpec = typeof linkApi.cleanupLinkFieldSpec === 'function' ? linkApi.cleanupLinkFieldSpec : () => { };
  const startLinkFlow = typeof linkApi.startLinkFlow === 'function' ? linkApi.startLinkFlow : () => { };
  const editExistingLink = typeof linkApi.editExistingLink === 'function' ? linkApi.editExistingLink : () => { };
  const replaceLinks = typeof linkApi.replaceLinks === 'function'
    ? linkApi.replaceLinks
    : (nextList) => {
      if (!state.node) state.node = { links: [] };
      state.node.links = Array.isArray(nextList) ? nextList.slice() : [];
    };
  const syncLinksToState = typeof linkApi.syncLinksToState === 'function' ? linkApi.syncLinksToState : () => { };
  const registerLinkBrushHandler = typeof linkApi.registerLinkBrushHandler === 'function' ? linkApi.registerLinkBrushHandler : () => () => { };
  const isLinkBrushActive = typeof linkApi.isLinkBrushActive === 'function' ? linkApi.isLinkBrushActive : () => false;
  const findSpanForNode = typeof linkApi.findSpanForNode === 'function' ? linkApi.findSpanForNode : () => null;
  const offsetWithinSpan = typeof linkApi.offsetWithinSpan === 'function' ? linkApi.offsetWithinSpan : () => 0;
  const findBestLinkPosition = typeof linkApi.findBestLinkPosition === 'function' ? linkApi.findBestLinkPosition : () => null;
  const applyLinkEditableState = typeof linkApi.applyEditableState === 'function' ? linkApi.applyEditableState : () => { };
  const setLinkingImmediateSave = typeof linkApi.setRequestImmediateSave === 'function' ? linkApi.setRequestImmediateSave : () => { };

  const fallbackNormalizeLink = (raw) => {
    if (!raw) return null;
    const field = raw.field || 'content';
    const start = Math.max(0, parseInt(raw.start, 10) || 0);
    const end = Math.max(start, parseInt(raw.end, 10) || start);
    const text = typeof raw.text === 'string' ? raw.text : '';
    return {
      field,
      start,
      end,
      text,
      targetId: raw.targetId || raw.target || raw.id || '',
      targetName: raw.targetName || raw.name || '',
      targetType: raw.targetType || raw.type || '',
      placeholder: !!raw.placeholder,
    };
  };

  // 注册可编辑观察者的函数
  function registerEditableWatcher(fn) {
    if (typeof fn !== 'function') return () => { };
    editableWatchers.push(fn);
    try { fn(!!state.editable); } catch (e) { }
    return () => {
      const idx = editableWatchers.indexOf(fn);
      if (idx >= 0) editableWatchers.splice(idx, 1);
    };
  }

  // 设置可编辑状态的函数
  function setEditable(nextEditable) {
    const editable = !!nextEditable;
    if (state.editable === editable) {
      refreshActionButtons();
      return;
    }
    const wasEditable = !!state.editable;
    state.editable = editable;
    if (formContainer) {
      formContainer.classList.toggle('poem-readonly', !editable);
      const controls = formContainer.querySelectorAll('input, textarea, select, button');
      controls.forEach(el => {
        if (el.dataset && el.dataset.keepEnabled === 'true') return;
        const tag = (el.tagName || '').toLowerCase();
        const type = (el.type || '').toLowerCase();
        const isTextLike = (tag === 'textarea') || (tag === 'input' && !['button', 'submit', 'checkbox', 'radio', 'file'].includes(type));
        if (isTextLike) {
          if ('readOnly' in el) el.readOnly = !editable;
          el.classList.toggle('read-mode', !editable);
        } else {
          el.disabled = !editable;
        }
      });
    }
    try { applyLinkEditableState(editable); } catch (e) { }
    editableWatchers.slice().forEach(fn => {
      try { fn(editable); } catch (e) { }
    });
    try { applyMetaPermissions(); } catch (e) { }
    refreshActionButtons();
    if (!isNew && state.node && state.node.id) {
      if (editable && !wasEditable) startEditingLock();
      if (!editable && wasEditable) stopEditingLock();
    }
  }

  // 刷新动作按钮的函数
  function refreshActionButtons() {
    const editable = !!state.editable;
    if (editBtn) {
      editBtn.textContent = saveInFlight ? '保存中' : (editable ? '保存' : '编辑');
      editBtn.disabled = saveInFlight;
    }
    if (saveBtn) {
      saveBtn.style.display = 'none';
    }
    if (reviewBtn) reviewBtn.disabled = !editable || saveInFlight;
    if (selfCheckBtn) selfCheckBtn.disabled = !editable || saveInFlight;
    if (linkBtn) linkBtn.disabled = editable;
  }

  // 自动调整文本区域大小的函数
  function autosizeTextarea(el) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.dataset.autosize = 'true';
    const previous = el.style.height;
    el.style.height = 'auto';
    const resolveMinHeight = () => {
      const minAttr = el.dataset && el.dataset.autosizeMin
        ? Math.max(0, parseInt(el.dataset.autosizeMin, 10) || 0)
        : null;
      if (minAttr !== null) return minAttr;
      try {
        const styles = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (styles) {
          const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) || 16;
          const padding = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
          const border = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
          const singleLine = lineHeight + padding + border;
          if (!Number.isNaN(singleLine) && singleLine > 0) return Math.round(singleLine);
        }
      } catch (e) { }
      return 32;
    };
    const minHeight = Math.max(24, resolveMinHeight());
    const nextHeight = el.scrollHeight > 0 ? el.scrollHeight + 2 : 0;
    const target = Math.max(nextHeight, minHeight);
    el.style.height = `${target}px`;
    if (target === 0) el.style.height = previous;
  }

  // 分割多行文本的函数
  function splitMultilineText(raw) {
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  // 修复“添加”按钮误触：当按钮被放在 label 内时，点击 label 的空白区域会触发按钮默认激活
  function installAddRowLabelGuard() {
    if (!formContainer) return;
    if (formContainer.dataset.addRowLabelGuardInstalled === '1') return;
    formContainer.dataset.addRowLabelGuardInstalled = '1';
    formContainer.addEventListener('click', (e) => {
      const target = e.target;
      const label = target && target.closest ? target.closest('label') : null;
      if (!label) return;
      const addBtn = label.querySelector && label.querySelector('button.add-row');
      if (!addBtn) return;
      if (target.closest && target.closest('button.add-row')) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  // 渲染内联对的函数
  function renderInlinePairs(container, list, key1, key2, label1, label2, options) {
    if (!container) return;
    const opts = options || {};
    const entries = Array.isArray(list) ? list : [];
    container.innerHTML = '';
    if (opts.containerClass) {
      opts.containerClass.split(/\s+/).filter(Boolean).forEach(cls => container.classList.add(cls));
    }
    const pairLayout = !(opts.wrapperClass && /note-item/.test(opts.wrapperClass));
    const allowReorder = opts.enableReorder !== false;
    const allowDelete = opts.enableDelete !== false;
    const rerender = () => renderInlinePairs(container, entries, key1, key2, label1, label2, opts);
    const notifyChange = () => { if (typeof opts.onChange === 'function') opts.onChange(entries); };
    const moveEntry = (from, delta) => {
      const to = from + delta;
      if (to < 0 || to >= entries.length) return;
      const item = entries.splice(from, 1)[0];
      entries.splice(to, 0, item);
      notifyChange();
      rerender();
    };
    const removeEntry = (idx) => {
      entries.splice(idx, 1);
      notifyChange();
      rerender();
    };
    entries.forEach((entry, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = opts.wrapperClass || 'ordered-item';
      if (allowReorder) {
        const controls = document.createElement('div');
        controls.className = 'pair-order-controls';
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.textContent = '↑';
        upBtn.className = 'btn small move-btn';
        upBtn.disabled = (index === 0);
        upBtn.addEventListener('click', () => moveEntry(index, -1));
        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.textContent = '↓';
        downBtn.className = 'btn small move-btn';
        downBtn.disabled = (index === entries.length - 1);
        downBtn.addEventListener('click', () => moveEntry(index, 1));
        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        wrapper.appendChild(controls);
      }
      const input1 = document.createElement('input');
      input1.type = 'text';
      input1.value = entry[key1] || '';
      if (label1) input1.placeholder = label1;
      if (opts.inputClass1) input1.classList.add(...opts.inputClass1.split(/\s+/));
      if (opts.linkFieldPrefix) input1.dataset.linkField = `${opts.linkFieldPrefix}[${index}].${key1}`;
      input1.addEventListener('input', () => {
        entry[key1] = input1.value;
        if (typeof opts.onChange === 'function') opts.onChange(entries);
      });
      const input2 = document.createElement('input');
      input2.type = 'text';
      input2.value = entry[key2] || '';
      if (label2) input2.placeholder = label2;
      if (opts.inputClass2) input2.classList.add(...opts.inputClass2.split(/\s+/));
      if (opts.linkFieldPrefix) input2.dataset.linkField = `${opts.linkFieldPrefix}[${index}].${key2}`;
      if (opts.paragraphCheck2) input2.dataset.checkParagraph = 'true';
      input2.addEventListener('input', () => {
        entry[key2] = input2.value;
        if (typeof opts.onChange === 'function') opts.onChange(entries);
      });
      if (pairLayout) {
        const firstWrap = document.createElement('div');
        firstWrap.className = 'pair-label';
        firstWrap.appendChild(input1);
        const secondWrap = document.createElement('div');
        secondWrap.className = 'pair-value';
        secondWrap.appendChild(input2);
        wrapper.appendChild(firstWrap);
        wrapper.appendChild(secondWrap);
      } else {
        wrapper.appendChild(input1);
        wrapper.appendChild(input2);
      }
      if (allowDelete) {
        const delWrap = document.createElement('div');
        delWrap.className = 'pair-remove-controls';
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '删除';
        delBtn.className = 'btn danger small del-row';
        delBtn.addEventListener('click', () => removeEntry(index));
        delWrap.appendChild(delBtn);
        wrapper.appendChild(delWrap);
      }
      container.appendChild(wrapper);
    });
    initializeLinkFields(container);
  }

  const DUP_MODAL_CLASS = 'dup-modal';

  // 移除现有重复模态框的函数
  function removeExistingDuplicateModal() {
    document.querySelectorAll(`.${DUP_MODAL_CLASS}`).forEach(el => el.remove());
  }

  // 构建重复查询的函数
  function buildDuplicateQueries(raw) {
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    if (!normalized) return [];
    const parts = normalized
      .split(/[，,、；;\r\n]+/)
      .map(seg => seg.trim())
      .filter(Boolean);
    const tokens = [];
    parts.forEach(seg => {
      const sub = seg.split(/\s+/).map(s => s.trim()).filter(Boolean);
      if (sub.length) tokens.push(...sub);
      else tokens.push(seg);
    });
    const unique = Array.from(new Set(tokens));
    return unique.length ? unique : [normalized];
  }

  // 查重匹配：忽略括号及括号内内容，但展示时保留原文
  function stripBracketedContent(raw) {
    const s = typeof raw === 'string' ? raw : String(raw || '');
    return s
      // 中文全角括号
      .replace(/（[^）]*）/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 显示重复模态框的函数
  function showDuplicateModal(results, query) {
    removeExistingDuplicateModal();
    const modal = document.createElement('div');
    modal.className = `modal ${DUP_MODAL_CLASS}`;
    const card = document.createElement('div');
    card.className = 'modal-card';
    let listHtml = '';
    if (results.length === 0) {
      listHtml = '<div style="padding:16px;text-align:center;color:#666">未发现重复项</div>';
    } else {
      listHtml = '<div class="list-group">';
      results.forEach(item => {
        const leftText = `${item.id} | ${escapeHtml(item.name || item.title)}`;
        const rightParts = [];
        if (item.creator) rightParts.push(item.creator);
        if (item.createdAt) rightParts.push(item.createdAt.slice(0, 10));
        const rightText = rightParts.join(' | ');
        listHtml += `
          <a href="editor.html?id=${item.id}&type=${item.type}" target="_blank" class="result-item" style="text-decoration:none;color:inherit;margin-bottom:6px">
            <div style="font-weight:500">${leftText}</div>
            <div style="font-size:13px;color:#64748b">${escapeHtml(rightText)}</div>
          </a>
        `;
      });
      listHtml += '</div>';
    }
    card.innerHTML = `
      <div class="modal-header">
        <div>查重："${escapeHtml(query)}"</div>
        <button class="btn" id="closeDupModal">关闭</button>
      </div>
      <div class="modal-body" style="max-height:60vh;overflow-y:auto">
        ${listHtml}
      </div>
    `;
    modal.appendChild(card);
    document.body.appendChild(modal);
    const close = () => modal.remove();
    card.querySelector('#closeDupModal').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
  }

  // 检查重复的函数
  async function checkDuplicate(query, type) {
    const displayQueries = buildDuplicateQueries(query);
    const queries = buildDuplicateQueries(stripBracketedContent(query));
    if (!queries.length) {
      Poem.toast('请先输入内容');
      return;
    }
    try {
      const currentId = state.node ? state.node.id : null;
      const responses = await Promise.all(queries.map(q => Poem.api(`/api/search?type=${type}&q=${encodeURIComponent(q)}`)));
      const merged = new Map();
      responses.forEach(res => {
        (res?.results || []).forEach(item => {
          const key = item && item.id ? item.id : `${item.type || ''}-${item.name || item.title || Math.random()}`;
          if (key && !merged.has(key)) merged.set(key, item);
        });
      });
      const filtered = Array.from(merged.values()).filter(r => r.id !== currentId);
      const displayQuery = displayQueries.length ? displayQueries.join('、') : queries.join('、');
      showDuplicateModal(filtered, displayQuery);
    } catch (err) {
      console.error(err);
      Poem.toast('查重失败');
    }
  }

  // 获取渲染器工厂的函数
  function getRendererFactory(typeCode) {
    if (!typeCode) return null;
    const registry = window.PoemRenderers || {};
    const normalized = typeof typeCode === 'string' ? typeCode.toUpperCase() : '';
    const lowercase = typeof typeCode === 'string' ? typeCode.toLowerCase() : '';
    const direct = registry[typeCode];
    if (typeof direct === 'function') return direct;
    if (normalized && typeof registry[normalized] === 'function') return registry[normalized];
    if (lowercase && typeof registry[lowercase] === 'function') return registry[lowercase];
    return null;
  }

  // 构建渲染器上下文的函数
  function buildRendererContext(node, typeCode) {
    return {
      node,
      type: typeCode,
      formContainer,
      state,
      escapeHtml,
      initializeLinkFields,
      annotationsFactory,
      registerEditableWatcher,
      registerLinkBrushHandler,
      registerLinkField,
      reindexFieldLinks,
      renderFieldDisplay,
      getFieldSpec,
      cleanupLinkFieldSpec,
      startLinkFlow,
      editExistingLink,
      replaceLinks,
      normalizeLink,
      links,
      findSpanForNode,
      offsetWithinSpan,
      findBestLinkPosition,
      autosizeTextarea,
      renderInlinePairs,
      splitMultilineText,
      isNew,
      document,
      window,
      Poem,
      syncLinksToState,
      isLinkBrushActive,
      checkDuplicate,
    };
  }

  // 将通用元数据应用到节点的函数
  function commonMetaToNode(node) {
    node.extra = node.extra || {};
    node.meta = node.meta || {};
    node.meta.createdBy = createdBy.value || node.meta.createdBy || '';
    node.meta.createdAt = createdAt.value || node.meta.createdAt || Poem.today();
    const expectedEl = document.getElementById('metaExpectedDuration');
    const reviewDurationEl = document.getElementById('metaReviewDuration');
    const reviewStatusInputs = Array.from(document.querySelectorAll('input[name="metaReviewStatus"]'));
    const rs = reviewStatusInputs.find(i => i.checked);
    const reviewStatus = ((rs ? rs.value : (node.extra.reviewStatus || '')) || '').trim() || 'pending';
    const canEditReview = !isOwner && isReviewerOrAdmin;
    const reviewerDisplay = formatReviewerDisplay(currentUser);
    if (canEditReview) {
      const reviewDurationVal = ((reviewDurationEl || {}).value || '').trim();
      node.extra.reviewDuration = reviewDurationVal;
      node.extra.reviewStatus = reviewStatus || 'pending';
      const shouldStampMeta = reviewStatus && reviewStatus !== 'pending';
      if (shouldStampMeta) {
        node.meta.reviewedBy = reviewedBy.value || node.meta.reviewedBy || reviewerDisplay || '';
        node.meta.reviewedAt = reviewedAt.value || node.meta.reviewedAt || Poem.today();
        if (reviewedBy && !reviewedBy.value) reviewedBy.value = node.meta.reviewedBy;
        if (reviewedAt && !reviewedAt.value) reviewedAt.value = node.meta.reviewedAt;
      } else {
        node.meta.reviewedBy = node.meta.reviewedBy || '';
        node.meta.reviewedAt = node.meta.reviewedAt || '';
      }
    } else {
      node.meta.reviewedBy = node.meta.reviewedBy || '';
      node.meta.reviewedAt = node.meta.reviewedAt || '';
      node.extra.reviewDuration = node.extra.reviewDuration || '';
      node.extra.reviewStatus = node.extra.reviewStatus || 'pending';
      reviewStatusInputs.forEach(r => { r.checked = (r.value === (node.extra.reviewStatus || 'pending')); });
    }
    const expectedVal = ((expectedEl || {}).value || '').trim();
    node.extra.expectedDuration = expectedVal;
    const rp = Array.from(document.querySelectorAll('input[name="metaRepairStatus"]')).find(i => i.checked);
    node.extra.repairStatus = rp ? rp.value : (node.extra.repairStatus || 'unfinished');
    const remarkInput = document.getElementById('metaRemark');
    if (remarkInput) {
      node.extra.remark = remarkInput.value;
    } else if (node.extra.remark === undefined) {
      node.extra.remark = '';
    }
  }

  // 设置通用元数据的函数
  function setCommonMeta(node) {
    createdBy.value = node.meta?.createdBy || '';
    createdAt.value = node.meta?.createdAt || '';
    reviewedBy.value = node.meta?.reviewedBy || '';
    reviewedAt.value = node.meta?.reviewedAt || '';
    const ex = node.extra || {};
    const expEl = document.getElementById('metaExpectedDuration'); if (expEl) expEl.value = ex.expectedDuration || '';
    const revDurEl = document.getElementById('metaReviewDuration'); if (revDurEl) revDurEl.value = ex.reviewDuration || '';
    const remarkEl = document.getElementById('metaRemark'); if (remarkEl) { remarkEl.value = ex.remark || ''; autosizeTextarea(remarkEl); try { remarkEl.removeEventListener('input', remarkEl.__autosizeHandler); } catch (e) { } remarkEl.__autosizeHandler = () => autosizeTextarea(remarkEl); remarkEl.addEventListener('input', remarkEl.__autosizeHandler); }
    // 审核状态
    const status = (ex.reviewStatus || '').trim() || 'pending';
    const reviewRadios = Array.from(document.querySelectorAll('input[name="metaReviewStatus"]'));
    let anyChecked = false;
    reviewRadios.forEach(r => {
      const checked = (r.value === status);
      r.checked = checked;
      anyChecked = anyChecked || checked;
    });
    if (!anyChecked && reviewRadios.length) {
      const pendingRadio = reviewRadios.find(r => r.value === 'pending');
      if (pendingRadio) pendingRadio.checked = true;
    }
    // 返修状态
    const repair = ex.repairStatus || 'unfinished';
    Array.from(document.querySelectorAll('input[name="metaRepairStatus"]')).forEach(r => { r.checked = (r.value === repair); });
    try { const rf = document.getElementById('metaRepairField'); if (rf) rf.style.display = (status === 'rejected') ? 'block' : 'none'; } catch (e) { }
    Array.from(document.querySelectorAll('input[name="metaReviewStatus"]')).forEach(r => r.addEventListener('change', () => {
      const rf = document.getElementById('metaRepairField'); if (!rf) return;
      if (document.querySelector('input[name="metaReviewStatus"]:checked')?.value === 'rejected') rf.style.display = 'block'; else {
        rf.style.display = 'none';
      }
      try { if (typeof applyMetaPermissions === 'function') applyMetaPermissions(); } catch (e) { }
    }));
    try { if (typeof applyMetaPermissions === 'function') applyMetaPermissions(); } catch (e) { }
  }

  // 编辑权限
  function applyMetaPermissions() {
    const editable = !!state.editable;
    const allow = !!isReviewerOrAdmin;
    const allowReview = editable && allow && !isOwner;
    // 审核者/管理员
    const controlsReviewer = [document.getElementById('reviewedBy'), document.getElementById('reviewedAt'), document.getElementById('metaReviewDuration')];
    controlsReviewer.forEach(c => { if (c) c.disabled = !allowReview; });
    // 期望时长（创建者）
    const expectedEl = document.getElementById('metaExpectedDuration');
    if (expectedEl) expectedEl.disabled = !(editable && !!isOwner);
    if (acceptExpectedBtn) acceptExpectedBtn.disabled = !allowReview;
    // 审核状态（审核者）
    Array.from(document.querySelectorAll('input[name="metaReviewStatus"]')).forEach(r => { r.disabled = !allowReview; });
    // 返修状态
    try {
      const repairAllowed = !!(editable && (isOwner || allow));
      Array.from(document.querySelectorAll('input[name="metaRepairStatus"]')).forEach(r => { r.disabled = !repairAllowed; });
    } catch (e) { }
    try {
      const remarkEl = document.getElementById('metaRemark'); if (remarkEl) remarkEl.disabled = !editable;
    } catch (e) { }
    // 创建日期可由管理员覆盖
    try {
      if (createdAt) {
        const allowCreatedAt = editable && isAdmin;
        createdAt.disabled = !allowCreatedAt;
        if ('readOnly' in createdAt) createdAt.readOnly = !allowCreatedAt;
      }
    } catch (e) { }
  }

  // 初始化编辑器的函数
  async function init() {
    if (isNew && !TYPES.includes(type)) { Poem.toast('缺少类型参数'); return; }
    let me = await Poem.me();
    currentUser = me;
    if (isNew) {
      const ensureProfile = async () => {
        const ok = await Poem.requireProfile();
        if (!ok) return false;
        me = await Poem.me();
        return !!me;
      };
      const needsProfile = !me || (me.role !== 'admin' && (!me.real_name || !me.student_id));
      if (needsProfile) {
        const ok = await ensureProfile();
        if (!ok) return;
      }
    }
    isReviewerOrAdmin = !!(me && (me.role === 'reviewer' || me.role === 'admin'));
    isAdmin = me?.role === 'admin';
    if (isNew) {
      nodeIdEl.textContent = '新建（未分配ID）';
      // 自动填充创建者信息
      const creatorDisplayName = me && me.real_name && me.student_id ?
        `${me.real_name} (${me.student_id})` :
        (me && me.real_name ? me.real_name : (me ? me.username : ''));
      state.node = {
        id: '',
        type,
        name: '',
        meta: {
          createdBy: creatorDisplayName,
          createdAt: Poem.today(),
          reviewedBy: '',
          reviewedAt: ''
        },
        fields: {},
        extra: {},
        links: []
      };
      replaceLinks([]);
      isOwner = true;
      state.canEditNode = true;
      if (linkBtn) linkBtn.style.display = 'inline-block';
      if (selfCheckBtn) selfCheckBtn.style.display = 'inline-block';
      setEditable(true);
    }
    else {
      const node = await Poem.api(`/api/node/${id}`);
      state.node = node;
      if (!Array.isArray(state.node.links)) state.node.links = [];
      const loadedLinks = state.node.links.map(normalizeLink).filter(Boolean);
      replaceLinks(loadedLinks);
      nodeIdEl.textContent = node.id;
      // 仅所有者或审核者/管理员可编辑
      isOwner = (node.meta?.createdById && node.meta.createdById === me?.id) || (node.meta?.createdBy && (node.meta.createdBy === (me?.real_name || me?.username)));
      const canEditAll = me && (me.role === 'reviewer' || me.role === 'admin');
      state.canEditNode = !!(isOwner || canEditAll);
      editBtn.style.display = (isOwner || canEditAll) ? 'inline-block' : 'none';
      saveBtn.style.display = 'none';
      if (linkBtn) linkBtn.style.display = (isOwner || canEditAll) ? 'inline-block' : 'none';
      if (selfCheckBtn) selfCheckBtn.style.display = (isOwner || canEditAll) ? 'inline-block' : 'none';
      reviewBtn.style.display = 'none';
    }
    setCommonMeta(state.node);
    // 点击审核字段自动填充
    try {
      const reviewedByEl = document.getElementById('reviewedBy');
      const reviewedAtEl = document.getElementById('reviewedAt');
      const fillReviewerAndTime = () => {
        if (!state.editable) return;
        const reviewerDisplay = (me && me.real_name && me.student_id)
          ? `${me.real_name} (${me.student_id})`
          : (me && me.real_name ? me.real_name : (me ? me.username : ''));
        if (reviewedByEl && !reviewedByEl.disabled) {
          reviewedByEl.value = reviewerDisplay;
        }
        if (reviewedAtEl && !reviewedAtEl.disabled) {
          reviewedAtEl.value = Poem.today();
        }
      };
      if (reviewedByEl) {
        try {
          if (acceptExpectedBtn && expectedDurationInput && reviewDurationInput) {
            const handleAcceptExpected = () => {
              if (!state.editable) return;
              if (acceptExpectedBtn.disabled) return;
              if (!expectedDurationInput.value || !expectedDurationInput.value.trim()) {
                try { Poem.toast('期望时长为空'); } catch (err) { }
                return;
              }
              if (reviewDurationInput.disabled) {
                return;
              }
              const nextValue = expectedDurationInput.value.trim();
              if (reviewDurationInput.value !== nextValue) {
                reviewDurationInput.value = nextValue;
                try { reviewDurationInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { }
              }
            };
            acceptExpectedBtn.addEventListener('click', handleAcceptExpected);
          }
        } catch (e) { }
        reviewedByEl.addEventListener('click', () => {
          if (reviewedByEl.disabled) return;
          fillReviewerAndTime();
        });
      }
      if (reviewedAtEl) {
        reviewedAtEl.addEventListener('click', () => {
          if (reviewedAtEl.disabled) return;
          fillReviewerAndTime();
        });
      }
    } catch (e) { }
    let renderer;
    const t = isNew ? type : (state.node ? state.node.type : '');
    const returnTypeMatch = returnQuery.match(/(?:^|&)type=([^&]*)/);
    const returnType = returnTypeMatch ? returnTypeMatch[1] : '';
    const effectiveReturnType = returnType || 'A';
    const backAllTarget = (effectiveReturnType === 'A' && returnQuery) ? `list.html?${returnQuery}` : 'list.html?type=A';
    const backListTarget = (effectiveReturnType === t && returnQuery) ? `list.html?${returnQuery}` : (t ? `list.html?type=${t}` : 'list.html');
    const rendererFactory = getRendererFactory(t);
    if (rendererFactory) {
      renderer = rendererFactory(buildRendererContext(state.node, t));
    } else {
      formContainer.innerHTML = '<div class="section-card">未知类型</div>';
    }
    installAddRowLabelGuard();
    setEditable(isNew ? true : false);

    // 保存节点的函数
    function saveNode(opts) {
      const options = opts || {};
      const silent = !!options.silent;
      const skipToast = !!options.skipToast;
      if (saveInFlight) {
        if (!silent && !skipToast) Poem.toast('保存中，请稍候');
        return currentSavePromise || Promise.resolve(false);
      }
      saveInFlight = true;
      refreshActionButtons();
      currentSavePromise = (async () => {
        try {
          const collected = renderer?.collect?.() || {};
          const prevMeta = { ...(state.node.meta || {}) };
          const prevExtra = { ...(state.node.extra || {}) };
          try { commonMetaToNode(state.node); } catch (e) { }
          const hasPrevReviewer = !!(prevMeta.reviewedBy || prevMeta.reviewedAt);
          const reviewerChanged = (state.node.meta?.reviewedBy || '') !== (prevMeta.reviewedBy || '')
            || (state.node.meta?.reviewedAt || '') !== (prevMeta.reviewedAt || '');
          const reviewStatusVal = ((state.node.extra && state.node.extra.reviewStatus) || '').trim() || 'pending';
          const intendsOverwriteReview = isReviewerOrAdmin && !isOwner && reviewStatusVal !== 'pending' && (reviewerChanged || !hasPrevReviewer);
          if (isReviewerOrAdmin && !isOwner) {
            const reviewStatus = (state.node.extra && state.node.extra.reviewStatus) || 'pending';
            const reviewDurationVal = ((state.node.extra && state.node.extra.reviewDuration) || '').trim();
            if (reviewStatus !== 'pending' && !reviewDurationVal) {
              Poem.toast('请填写时长');
              return false;
            }
          }
          const derivedName = [
            collected.fields?.title,
            collected.fields?.name,
            collected.fields?.statement,
            collected.fields?.common,
            collected.fields?.otherStatement
          ].find(v => typeof v === 'string' && v.trim());
          const payloadName = derivedName ? derivedName.trim() : (state.node.name || '').trim();
          const payload = {
            name: payloadName,
            content: collected.content,
            annotations: collected.annotations,
            links: Array.isArray(state.node.links) ? state.node.links : [],
            fields: collected.fields,
            extra: Object.assign({}, state.node.extra || {}, collected.extra || {}),
          };
          const metaPayload = {};
          if (state.node?.meta?.createdAt) {
            metaPayload.createdAt = state.node.meta.createdAt;
          }
          if (intendsOverwriteReview && state.node?.meta?.reviewedBy) metaPayload.reviewedBy = state.node.meta.reviewedBy;
          if (intendsOverwriteReview && state.node?.meta?.reviewedAt) metaPayload.reviewedAt = state.node.meta.reviewedAt;
          if (Object.keys(metaPayload).length) payload.meta = metaPayload;
          if (intendsOverwriteReview) payload._overwriteReview = true;
          if (isNew) {
            const created = await Poem.api('/api/node', { method: 'POST', body: JSON.stringify({ type, data: payload }) });
            state.node = created;
            state.node.name = payloadName;
            nodeIdEl.textContent = created.id; setEditable(false);
            isNew = false;
            if (!silent && !skipToast) Poem.toast('已保存');
            try { renderer?.refresh?.(state.node); } catch (e) { }
            const returnSuffix = returnQuery ? `&return=${encodeURIComponent(returnQuery)}` : '';
            history.replaceState(null, '', `editor.html?id=${created.id}${returnSuffix}`);
          } else {
            const apiPath = `/api/node/${state.node.id}`;
            const updated = await Poem.api(apiPath, { method: 'PUT', body: JSON.stringify(payload) });
            state.node = updated;
            const reviewStatusAfter = ((state.node.extra && state.node.extra.reviewStatus) || '').trim() || 'pending';
            if (isReviewerOrAdmin && !isOwner && reviewStatusAfter !== 'pending') {
              const reviewerDisplay = formatReviewerDisplay(currentUser);
              const today = Poem.today();
              state.node.meta = state.node.meta || {};
              if (!state.node.meta.reviewedBy) state.node.meta.reviewedBy = reviewerDisplay;
              if (!state.node.meta.reviewedAt) state.node.meta.reviewedAt = today;
            }
            state.node.name = payloadName;
            setEditable(false);
            if (!silent && !skipToast) Poem.toast('已保存');
            try { renderer?.refresh?.(state.node); } catch (e) { }
            try { setCommonMeta(state.node); } catch (e) { }
          }
          return true;
        } catch (err) {
          console.error(err);
          Poem.toast('保存失败');
          return false;
        } finally {
          saveInFlight = false;
          refreshActionButtons();
          currentSavePromise = null;
        }
      })();
      return currentSavePromise;
    }

    // 立即保存请求的函数
    requestImmediateSave = async function (options) {
      const opts = options ? { ...options } : {};
      if (opts.silent === undefined) opts.silent = true;
      return saveNode(opts);
    };

    setLinkingImmediateSave(requestImmediateSave);
    if (editBtn) {
      editBtn.onclick = async () => {
        if (saveInFlight) return;
        if (!state.editable) {
          if (!state.node || !state.node.id) return;
          try {
            const res = await Poem.api('/api/editing/start', { method: 'POST', body: JSON.stringify({ id: state.node.id }) });
            if (res && res.ok === false) {
              const goHome = confirm('当前有人正在编辑该节点，将返回首页。');
              if (goHome) location.href = './';
              return;
            }
            setEditable(true);
          } catch (err) {
            console.error(err);
            Poem.toast('无法进入编辑');
          }
        } else {
          try {
            const hasIssues = runSelfCheck();
            if (hasIssues) return;
          } catch (err) { }
          await saveNode();
        }
      };
    }
    if (saveBtn) saveBtn.style.display = 'none';

    // 附加确认导航的函数
    function attachConfirmNavigation(el, target) {
      if (!el) return;
      el.addEventListener('click', async (event) => {
        event.preventDefault();
        const href = typeof target === 'function' ? target() : target;
        if (!href) return;
        if (!state.editable) {
          location.href = href;
          return;
        }
        const wantsSave = confirm('是否保存当前修改后返回？');
        if (wantsSave) {
          const ok = await saveNode();
          if (!ok) return;
        }
        location.href = href;
      });
    }

    if (backListBtn) {
      backListBtn.href = backListTarget;
      attachConfirmNavigation(backListBtn, backListTarget || 'list.html');
    }
    if (backAllBtn) {
      backAllBtn.href = backAllTarget;
      attachConfirmNavigation(backAllBtn, backAllTarget);
    }
    const homeLink = document.querySelector('.topbar .actions a[href="./"]');
    attachConfirmNavigation(homeLink, './');
  }
  init();
})();