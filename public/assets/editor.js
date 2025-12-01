(function () {
  const TYPES = Poem.TYPES;
  const id = Poem.qs('id');
  let isNew = Poem.qs('new') === '1';
  const type = Poem.qs('type');
  const nodeIdEl = document.getElementById('nodeId');
  const linkBtn = document.getElementById('linkBtn');
  const editBtn = document.getElementById('editBtn');
  const saveBtn = document.getElementById('saveBtn');
  const reviewBtn = document.getElementById('reviewBtn');
  const selfCheckBtn = document.getElementById('selfCheckBtn');
  const backListBtn = document.getElementById('backListBtn');
  const backAllBtn = document.getElementById('backAllBtn');
  const formContainer = document.getElementById('formContainer');
  const createdBy = document.getElementById('createdBy');
  const createdAt = document.getElementById('createdAt');
  const reviewedBy = document.getElementById('reviewedBy');
  const reviewedAt = document.getElementById('reviewedAt');
  const expectedDurationInput = document.getElementById('metaExpectedDuration');
  const reviewDurationInput = document.getElementById('metaReviewDuration');
  const acceptExpectedBtn = document.getElementById('metaAcceptExpected');
  const returnQuery = (Poem.qs('return') || '').replace(/^\?/, '');

  let state = { editable: true, node: null };
  // whether current user has reviewer or admin permissions
  let isReviewerOrAdmin = false;
  let isAdmin = false;
  // whether current user is the owner/creator of the node
  let isOwner = false;
  let linkBrushActive = false;
  const linkBrushHandlers = [];
  const editableWatchers = [];
  let requestImmediateSave = null;
  let links = [];
  let linkSaveChain = Promise.resolve();
  const linkFieldRegistry = new Map();
  let saveInFlight = false;
  let currentSavePromise = null;
  const MAX_VISIBLE_ANNOTATIONS = 5;
  let showAllAnnotations = false;

  function ensureSaveButtonLabel() {
    if (saveBtn && !saveBtn.dataset.originalLabel) {
      saveBtn.dataset.originalLabel = saveBtn.textContent || '保存';
    }
  }

  function refreshActionButtons() {
    ensureSaveButtonLabel();
    if (saveBtn) {
      const label = saveBtn.dataset.originalLabel || '保存';
      saveBtn.textContent = saveInFlight ? '保存中…' : label;
      saveBtn.disabled = !state.editable || saveInFlight;
    }
    if (editBtn) {
      editBtn.disabled = state.editable || saveInFlight;
    }
  }

  if (acceptExpectedBtn) {
    acceptExpectedBtn.addEventListener('click', () => {
      if (acceptExpectedBtn.disabled) return;
      if (!reviewDurationInput || reviewDurationInput.disabled) return;
      const expectedVal = expectedDurationInput ? (expectedDurationInput.value || '') : '';
      reviewDurationInput.value = expectedVal;
      try {
        reviewDurationInput.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (err) {
        console.error(err);
      }
    });
  }

  function normalizeLink(raw) {
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
  }

  function syncLinksToState() {
    if (!state.node) return;
    state.node.links = links.map(link => ({
      field: link.field || 'content',
      start: link.start,
      end: link.end,
      text: link.text,
      targetId: link.targetId || '',
      targetName: link.targetName || '',
      targetType: link.targetType || '',
      placeholder: !!link.placeholder,
    }));
    try { linkFieldRegistry.forEach(spec => { if (typeof spec.renderDisplay === 'function') spec.renderDisplay(); }); } catch (e) { }
  }

  function cleanupLinkFieldSpec(spec) {
    if (!spec || !spec.element) return;
    try { if (spec.key) linkFieldRegistry.delete(spec.key); } catch (e) { }
    try {
      if (Array.isArray(spec.selectionHandlers)) {
        spec.selectionHandlers.forEach(fn => {
          spec.element.removeEventListener('mouseup', fn);
          spec.element.removeEventListener('keyup', fn);
          spec.element.removeEventListener('touchend', fn);
        });
        spec.selectionHandlers = [];
      }
      if (Array.isArray(spec.inputHandlers)) {
        spec.inputHandlers.forEach(fn => spec.element.removeEventListener('input', fn));
        spec.inputHandlers = [];
      }
      if (spec.displayEl && spec.displayEl.parentNode) {
        spec.displayEl.remove();
      }
      if (spec.element) {
        try { delete spec.element.__linkFieldSpec; } catch (e) { }
      }
    } catch (e) { }
  }

  function getFieldSpec(fieldKey) {
    if (!fieldKey) return undefined;
    return linkFieldRegistry.get(fieldKey);
  }


  function setFieldEditableState(spec, editable) {
    if (!spec || !spec.element) return;
    try {
      if (typeof spec.onEditableChange === 'function') {
        spec.onEditableChange(editable);
      } else {
        const el = spec.element;
        if ('disabled' in el) el.disabled = false;
        if ('readOnly' in el) el.readOnly = !editable;
        if (spec.displayEl) {
          if (editable) {
            el.style.display = '';
            spec.displayEl.style.display = 'none';
          } else {
            if (typeof spec.renderDisplay === 'function') spec.renderDisplay();
            spec.displayEl.style.display = '';
            el.style.display = 'none';
          }
        }
        if (editable) el.classList.remove('link-readonly');
        else el.classList.add('link-readonly');
      }
    } catch (e) { }
  }

  function registerLinkField(fieldKey, element, options) {
    if (!fieldKey || !element) return;
    if (element.__linkFieldSpec && element.__linkFieldSpec.key === fieldKey) return;
    element.dataset.linkField = fieldKey;
    const existing = linkFieldRegistry.get(fieldKey);
    if (existing) {
      cleanupLinkFieldSpec(existing);
    }
    const opts = options || {};
    const spec = {
      key: fieldKey,
      element,
      getValue: typeof opts.getValue === 'function' ? opts.getValue : () => {
        try { return element.value || ''; } catch (e) { return ''; }
      },
      onLinksUpdated: typeof opts.onLinksUpdated === 'function' ? opts.onLinksUpdated : null,
      onEditableChange: typeof opts.onEditableChange === 'function' ? opts.onEditableChange : null,
      selectionHandlers: [],
      inputHandlers: [],
      options: opts,
      displayEl: null,
      renderDisplay: null,
    };
    linkFieldRegistry.set(fieldKey, spec);
    element.__linkFieldSpec = spec;
    if (!opts.skipDisplay) {
      const view = document.createElement('div');
      view.className = 'link-field-display';
      view.style.display = 'none';
      view.dataset.linkField = fieldKey;
      view.tabIndex = 0;
      view.setAttribute('role', 'textbox');
      view.setAttribute('aria-readonly', 'true');
      if (element.classList.contains('pair-label')) view.classList.add('pair-label');
      if (element.classList.contains('pair-value')) view.classList.add('pair-value');
      element.insertAdjacentElement('afterend', view);
      spec.displayEl = view;
      spec.renderDisplay = () => renderFieldDisplay(spec);
      spec.renderDisplay();
    }
    if (!opts.skipSelectionListener) {
      const handler = (event) => handleFieldSelection(event, spec);
      ['mouseup', 'keyup', 'touchend'].forEach(type => {
        element.addEventListener(type, handler);
      });
      spec.selectionHandlers.push(handler);
    }
    if (!opts.skipInputListener) {
      const reindexHandler = () => reindexFieldLinks(fieldKey);
      element.addEventListener('input', reindexHandler);
      spec.inputHandlers.push(reindexHandler);
      if (!opts.skipDisplay) {
        const renderHandler = () => { try { if (typeof spec.renderDisplay === 'function') spec.renderDisplay(); } catch (e) { } };
        element.addEventListener('input', renderHandler);
        spec.inputHandlers.push(renderHandler);
      }
    }
    setFieldEditableState(spec, state.editable);
  }

  function initializeLinkFields(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-link-field]').forEach(el => {
      const key = el.dataset.linkField;
      if (key) registerLinkField(key, el);
    });
  }

  function notifyLinksUpdated(fieldKey) {
    const spec = getFieldSpec(fieldKey);
    if (spec) {
      if (typeof spec.onLinksUpdated === 'function') {
        try { spec.onLinksUpdated(); } catch (e) { }
      }
      try { if (typeof spec.renderDisplay === 'function') spec.renderDisplay(); } catch (e) { }
    }
  }

  function getFieldValue(fieldKey) {
    const spec = getFieldSpec(fieldKey);
    if (!spec) return '';
    try {
      return typeof spec.getValue === 'function' ? spec.getValue() : '';
    } catch (e) {
      return '';
    }
  }

  function findBestLinkPosition(text, snippet, approxStart) {
    if (!text || !snippet) return -1;
    const max = text.length;
    const approx = Math.min(max, Math.max(0, typeof approxStart === 'number' ? approxStart : parseInt(approxStart, 10) || 0));
    const baseRadius = Math.min(1024, Math.max(32, snippet.length * 2));
    const ranges = [];
    const localStart = Math.max(0, approx - baseRadius);
    const localEnd = Math.min(max, approx + baseRadius + snippet.length);
    ranges.push([localStart, localEnd]);
    const expandedStart = Math.max(0, approx - baseRadius * 4);
    const expandedEnd = Math.min(max, approx + baseRadius * 4 + snippet.length);
    if (expandedStart < localStart || expandedEnd > localEnd) {
      ranges.push([expandedStart, expandedEnd]);
    }
    if (localStart !== 0 || localEnd !== max) {
      ranges.push([0, max]);
    }
    const seen = new Set();
    for (const [startIdx, endIdx] of ranges) {
      if (endIdx <= startIdx) continue;
      const key = `${startIdx}:${endIdx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const segment = text.slice(startIdx, endIdx);
      let rel = segment.indexOf(snippet);
      if (rel === -1) continue;
      let best = startIdx + rel;
      let bestGap = Math.abs(best - approx);
      let offset = rel;
      while ((offset = segment.indexOf(snippet, offset + 1)) !== -1) {
        const candidate = startIdx + offset;
        const gap = Math.abs(candidate - approx);
        if (gap < bestGap) {
          bestGap = gap;
          best = candidate;
        }
      }
      return best;
    }
    return -1;
  }

  function reindexFieldLinks(fieldKey) {
    if (!fieldKey) return;
    const text = getFieldValue(fieldKey);
    const max = text.length;
    let changed = false;
    links = links.map(link => {
      if (!link || link.field !== fieldKey) return link;
      if (!link.text) {
        return link;
      }
      const snippet = link.text;
      const approxStart = link.start || 0;
      const best = findBestLinkPosition(text, snippet, approxStart);
      if (best === -1) {
        changed = true;
        return { ...link, _invalid: true };
      }
      const start = Math.max(0, best);
      const end = Math.min(max, start + snippet.length);
      if (end <= start) return { ...link, _invalid: true };
      const matchedText = text.slice(start, end);
      if (matchedText !== snippet) {
        changed = true;
        return { ...link, _invalid: true };
      }
      if (start !== link.start || end !== link.end) {
        changed = true;
        return { ...link, start, end };
      }
      return link;
    }).filter(link => !(link && link._invalid));
    if (changed) {
      syncLinksToState();
      notifyLinksUpdated(fieldKey);
    }
  }

  let linkDelegationInstalled = false;

  function handleDelegatedLinkClick(event) {
    const span = event.target.closest('span[data-link-index]');
    if (!span) return;
    if (formContainer && !formContainer.contains(span)) return;
    const linkIdx = parseInt(span.getAttribute('data-link-index') || '-1', 10);
    if (isNaN(linkIdx) || linkIdx < 0 || !links[linkIdx]) return;
    if (linkBrushActive) {
      event.preventDefault();
      editExistingLink(linkIdx);
      return;
    }
    if (!state.editable) {
      const info = links[linkIdx];
      if (info && info.targetId) {
        event.preventDefault();
        const url = `editor.html?id=${encodeURIComponent(info.targetId)}`;
        window.open(url, '_blank', 'noopener');
      }
    }
  }

  function handleDelegatedLinkContextMenu(event) {
    const span = event.target.closest('span[data-link-index]');
    if (!span) return;
    if (formContainer && !formContainer.contains(span)) return;
    if (state.editable) return;
    const linkIdx = parseInt(span.getAttribute('data-link-index') || '-1', 10);
    if (isNaN(linkIdx) || linkIdx < 0 || !links[linkIdx]) return;
    event.preventDefault();
    const info = links[linkIdx];
    const label = info.placeholder ? '空置' : (info.targetId || '');
    if (confirm(`移除与节点 ${label} 的链接？`)) {
      links.splice(linkIdx, 1);
      syncLinksToState();
      notifyLinksUpdated(info.field || 'content');
      persistLinks();
    }
  }

  function ensureLinkDelegation() {
    if (linkDelegationInstalled) return;
    linkDelegationInstalled = true;
    document.addEventListener('click', handleDelegatedLinkClick);
    document.addEventListener('contextmenu', handleDelegatedLinkContextMenu);
  }

  ensureLinkDelegation();

  function findSpanForNode(root, node) {
    while (node && node !== root) {
      if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('data-pos')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function offsetWithinSpan(span, container, offset) {
    if (container === span) {
      const len = parseInt(span.getAttribute('data-len') || '0', 10);
      return Math.max(0, Math.min(len, offset));
    }
    let acc = 0;
    const children = span.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === container) {
        if (child.nodeType === 3) {
          return acc + offset;
        }
        return acc;
      }
      if (child.nodeType === 3) {
        acc += child.textContent.length;
      } else if (child.nodeType === 1) {
        if (child.tagName === 'BR') acc += 1;
        else if (child.hasAttribute && child.hasAttribute('data-len')) acc += parseInt(child.getAttribute('data-len') || '0', 10);
        else acc += (child.textContent || '').length;
      }
    }
    return acc;
  }

  function renderFieldDisplay(spec) {
    if (!spec || !spec.displayEl) return;
    const text = getFieldValue(spec.key) || '';
    const display = spec.displayEl;
    display.innerHTML = '';
    display.classList.toggle('empty', text.length === 0);
    display.dataset.linkField = spec.key;
    if (text.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = '（空）';
      display.appendChild(empty);
      return;
    }
    const relevant = links.map((link, idx) => ({ link, idx })).filter(item => {
      const key = item.link ? (item.link.field || 'content') : 'content';
      return key === spec.key;
    }).sort((a, b) => a.link.start - b.link.start);
    const max = text.length;
    let cursor = 0;
    const frag = document.createDocumentFragment();
    const appendSegment = (start, end, linkRef) => {
      const clampedStart = Math.max(0, Math.min(max, start | 0));
      const clampedEnd = Math.max(clampedStart, Math.min(max, end | 0));
      if (clampedEnd <= clampedStart) return;
      const segment = text.slice(clampedStart, clampedEnd);
      const span = document.createElement('span');
      span.dataset.pos = String(clampedStart);
      span.dataset.len = String(clampedEnd - clampedStart);
      if (linkRef) {
        span.dataset.linkIndex = String(linkRef.idx);
        const info = linkRef.link;
        if (info && info.placeholder) span.classList.add('linked-placeholder');
        else span.classList.add('linked-chunk');
        if (info) {
          const tipParts = [];
          if (info.targetType) tipParts.push(info.targetType);
          if (info.targetId) tipParts.push(info.targetId);
          if (info.targetName) tipParts.push(info.targetName);
          span.title = info.placeholder ? '链接：空置' : (tipParts.length ? `链接：${tipParts.join('｜')}` : '链接');
        }
      }
      span.textContent = segment;
      frag.appendChild(span);
    };
    relevant.forEach(ref => {
      const s = Math.max(0, ref.link.start | 0);
      const e = Math.max(s, ref.link.end | 0);
      if (cursor < s) appendSegment(cursor, s, null);
      appendSegment(s, e, ref);
      cursor = Math.max(cursor, e);
    });
    if (cursor < max) appendSegment(cursor, max, null);
    display.appendChild(frag);
    ensureDisplaySelectionHandler(spec);
  }

  function ensureDisplaySelectionHandler(spec) {
    if (!spec || !spec.displayEl) return;
    if (spec.displayEl.__hasSelectionHandler) return;
    const handler = (evt) => {
      if (!linkBrushActive) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!spec.displayEl.contains(range.startContainer) || !spec.displayEl.contains(range.endContainer)) return;
      const startSpan = findSpanForNode(spec.displayEl, range.startContainer);
      const endSpan = findSpanForNode(spec.displayEl, range.endContainer);
      if (!startSpan || !endSpan) return;
      const startLinkIdx = parseInt(startSpan.getAttribute('data-link-index') || '-1', 10);
      const endLinkIdx = parseInt(endSpan.getAttribute('data-link-index') || '-1', 10);
      if (startLinkIdx >= 0 && startLinkIdx === endLinkIdx && links[startLinkIdx]) {
        handler.__selectionPending = false;
        editExistingLink(startLinkIdx);
        try { sel.removeAllRanges(); } catch (e) { }
        return;
      }
      const sBase = parseInt(startSpan.getAttribute('data-pos') || '0', 10);
      const eBase = parseInt(endSpan.getAttribute('data-pos') || '0', 10);
      const sOffset = offsetWithinSpan(startSpan, range.startContainer, range.startOffset);
      const eOffset = offsetWithinSpan(endSpan, range.endContainer, range.endOffset);
      const startPos = sBase + sOffset;
      const endPos = eBase + eOffset;
      if (isNaN(startPos) || isNaN(endPos) || endPos <= startPos) return;
      const text = getFieldValue(spec.key) || '';
      const snippet = text.slice(startPos, endPos);
      startLinkFlow(spec.key, startPos, endPos, snippet);
      try { sel.removeAllRanges(); } catch (e) { }
    };
    handler.__selectionPending = false;
    const markPending = () => { handler.__selectionPending = true; };
    const safeInvoke = (evt) => {
      if (!handler.__selectionPending) return;
      handler.__selectionPending = false;
      handler(evt);
    };
    spec.displayEl.addEventListener('mousedown', markPending);
    spec.displayEl.addEventListener('touchstart', markPending);
    spec.displayEl.addEventListener('mouseup', safeInvoke);
    spec.displayEl.addEventListener('touchend', safeInvoke);
    spec.displayEl.__markSelectionPending = markPending;
    spec.displayEl.__selectionHandler = handler;
    spec.displayEl.__hasSelectionHandler = true;
  }

  function upsertLink(link) {
    if (!link) return;
    const fieldKey = link.field || 'content';
    const text = getFieldValue(fieldKey);
    const max = text.length;
    const start = Math.max(0, Math.min(max, link.start | 0));
    const end = Math.max(0, Math.min(max, link.end | 0));
    if (end <= start) return;
    const next = {
      field: fieldKey,
      start,
      end,
      text: link.text && link.text.length ? link.text : text.slice(start, end),
      targetId: link.targetId || '',
      targetName: link.targetName || '',
      targetType: link.targetType || '',
      placeholder: !!link.placeholder,
    };
    links = links.filter(existing => {
      if (!existing) return false;
      if (existing.field !== fieldKey) return true;
      return !(Math.max(existing.start, next.start) < Math.min(existing.end, next.end));
    });
    links.push(next);
    links.sort((a, b) => {
      if (a.field === b.field) return a.start - b.start;
      return a.field > b.field ? 1 : -1;
    });
    syncLinksToState();
    notifyLinksUpdated(fieldKey);
  }

  function persistLinks() {
    syncLinksToState();
    if (!state.node || !state.node.id) return;
    linkSaveChain = linkSaveChain.then(async () => {
      if (typeof requestImmediateSave !== 'function') {
        Poem.toast('链接已更新，稍后请手动保存');
        return;
      }
      try {
        await requestImmediateSave({ silent: true, reason: 'link', skipToast: true });
        Poem.toast('链接已保存');
      } catch (err) {
        console.error(err);
        Poem.toast('保存链接失败，请稍后重试');
      }
    }).catch(() => { });
  }

  function startLinkFlow(fieldKey, start, end, sample) {
    const spec = getFieldSpec(fieldKey);
    if (!spec) {
      Poem.toast('当前字段暂不支持链接');
      return;
    }
    const text = getFieldValue(fieldKey) || '';
    const s = Math.max(0, start | 0);
    const e = Math.max(s, end | 0);
    if (e <= s) { Poem.toast('请选择要链接的文本'); return; }
    const snippet = sample || text.slice(s, e);
    if (!snippet.trim()) { Poem.toast('选中的文本为空'); return; }
    if (!state.node || !state.node.id) {
      Poem.toast('请先保存该节点后再添加链接');
      return;
    }
    Poem.openLinkPicker((item) => {
      upsertLink({
        field: fieldKey,
        start: s,
        end: e,
        text: snippet,
        targetId: item.id || '',
        targetName: item.name || '',
        targetType: item.type || '',
        placeholder: false,
      });
      persistLinks();
    }, {
      allowPlaceholder: true,
      onPlaceholder: () => {
        upsertLink({
          field: fieldKey,
          start: s,
          end: e,
          text: snippet,
          targetId: '',
          targetName: '',
          targetType: '',
          placeholder: true,
        });
        persistLinks();
      }
    });
  }

  function editExistingLink(index) {
    const current = links[index];
    if (!current) return;
    if (!state.node || !state.node.id) {
      Poem.toast('请先保存该节点后再修改链接');
      return;
    }
    Poem.openLinkPicker((item) => {
      links.splice(index, 1, {
        ...current,
        targetId: item.id || '',
        targetName: item.name || '',
        targetType: item.type || '',
        placeholder: false,
      });
      syncLinksToState();
      notifyLinksUpdated(current.field || 'content');
      persistLinks();
    }, {
      current,
      allowPlaceholder: true,
      onPlaceholder: () => {
        links.splice(index, 1, {
          ...current,
          targetId: '',
          targetName: '',
          targetType: '',
          placeholder: true,
        });
        syncLinksToState();
        notifyLinksUpdated(current.field || 'content');
        persistLinks();
      }
    });
  }

  function handleFieldSelection(event, spec) {
    if (!spec || !spec.element) return;
    if (state.editable) return;
    if (!linkBrushActive) return;
    const el = spec.element;
    let start;
    let end;
    try {
      start = el.selectionStart;
      end = el.selectionEnd;
    } catch (e) { return; }
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (end <= start) return;
    const text = getFieldValue(spec.key) || '';
    const snippet = text.slice(start, end);
    if (!snippet.trim()) return;
    const signature = `${start}:${end}:${snippet}`;
    const now = Date.now();
    if (el.__lastLinkSelection === signature && (now - (el.__lastLinkSelectionAt || 0)) < 600) return;
    el.__lastLinkSelection = signature;
    el.__lastLinkSelectionAt = now;
    startLinkFlow(spec.key, start, end, snippet);
    setTimeout(() => {
      try { el.setSelectionRange(end, end); } catch (e) { }
    }, 0);
  }

  function registerEditableWatcher(fn) {
    if (typeof fn !== 'function') return () => { };
    editableWatchers.push(fn);
    try { fn(state.editable); } catch (e) { }
    return () => {
      const idx = editableWatchers.indexOf(fn);
      if (idx >= 0) editableWatchers.splice(idx, 1);
    };
  }

  function registerLinkBrushHandler(fn) {
    if (typeof fn !== 'function') return () => { };
    linkBrushHandlers.push(fn);
    try { fn(linkBrushActive); } catch (e) { }
    return () => {
      const idx = linkBrushHandlers.indexOf(fn);
      if (idx >= 0) linkBrushHandlers.splice(idx, 1);
    };
  }

  function setLinkBrushActive(on) {
    let next = !!on;
    if (state.editable) next = false;
    if (linkBtn && linkBtn.disabled) next = false;
    if (linkBrushActive === next) return;
    linkBrushActive = next;
    if (linkBtn) {
      linkBtn.classList.toggle('active', linkBrushActive);
      linkBtn.setAttribute('aria-pressed', linkBrushActive ? 'true' : 'false');
      linkBtn.textContent = linkBrushActive ? '链接（开启）' : '链接（关闭）';
    }
    try { linkBrushHandlers.forEach(fn => { try { fn(linkBrushActive); } catch (e) { } }); } catch (e) { }
    if (linkBrushActive) Poem.toast('链接模式已开启：请选择文本后选择目标节点');
    else Poem.toast('链接模式已关闭');
  }

  if (linkBtn) {
    linkBtn.setAttribute('aria-pressed', 'false');
    linkBtn.addEventListener('click', () => {
      if (linkBtn.disabled) return;
      setLinkBrushActive(!linkBrushActive);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && linkBrushActive) {
      event.stopPropagation();
      setLinkBrushActive(false);
    }
  }, true);

  if (selfCheckBtn) {
    selfCheckBtn.addEventListener('click', () => {
      if (selfCheckBtn.disabled || !state.editable) return;
      runSelfCheck();
    });
  }

  createdAt.onclick = () => {
    if (!createdAt || createdAt.disabled) return;
    if (state.editable && isAdmin) {
      createdAt.value = Poem.today();
    }
  };
  if (reviewedAt) reviewedAt.onclick = null;

  function setEditable(on) {
    state.editable = !!on;
    // Restrict controls inside formContainer only
    if (formContainer) {
      formContainer.classList.toggle('poem-readonly', !state.editable);
      formContainer.querySelectorAll('input, textarea').forEach(el => {
        const key = el.dataset ? el.dataset.linkField : null;
        if (key && linkFieldRegistry.has(key)) {
          const spec = linkFieldRegistry.get(key);
          setFieldEditableState(spec, state.editable);
        } else {
          if ('readOnly' in el) el.readOnly = !on;
          if ('disabled' in el) el.disabled = !on;
        }
      });
      formContainer.querySelectorAll('select, button').forEach(el => {
        el.disabled = !on;
      });
    }
    try { linkFieldRegistry.forEach(spec => setFieldEditableState(spec, state.editable)); } catch (e) { }
    applyOrderedItemLayout();
    if (linkBtn) {
      linkBtn.disabled = state.editable;
      if (state.editable) setLinkBrushActive(false);
    }
    if (selfCheckBtn) {
      selfCheckBtn.disabled = !state.editable;
    }
    // After toggling editable, apply meta-specific permission rules (if defined)
    try { if (typeof applyMetaPermissions === 'function') applyMetaPermissions(); } catch (e) { }
    try { editableWatchers.forEach(fn => { try { fn(state.editable); } catch (e) { } }); } catch (e) { }
    refreshActionButtons();
    if (!state.editable) {
      clearSelfCheckIndicators();
    }
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // 自动调整textarea的大小以适应其内容（高度随内容增加而增长）
  function autosizeTextarea(el) {
    if (!el) return;
    try {
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight + 2) + 'px';
    } catch (e) { }
  }

  function toMultilineText(value) {
    if (Array.isArray(value)) {
      return value.map(v => (v === undefined || v === null) ? '' : String(v)).join('\n');
    }
    return typeof value === 'string' ? value : '';
  }

  function splitMultilineText(text) {
    if (!text) return [];
    return String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  const SELF_CHECK_FIELD_CLASS = 'self-check-field';
  const SELF_CHECK_MESSAGE_CLASS = 'self-check-message';
  const SELF_CHECK_SPACE_SNIPPET_LIMIT = 12;
  const SELF_CHECK_SPACE_CONTEXT = 8;
  const VALID_PARAGRAPH_ENDINGS = ['。', '！', '？'];
  const CN_ELLIPSIS = '……';
  const TRAILING_ENCLOSURE_REGEX = /[)\]\}>'"\u201d\u2019\u3009\u300b\u300d\u300f\uff09\uff3d\uff3f\uff60\u3011\u3015\u3017\u3019\uff5d]/;
  const PAIRED_SYMBOLS = [
    { open: '“', close: '”', label: '“”' },
    { open: '‘', close: '’', label: '‘’' },
    { open: '《', close: '》', label: '《》' },
    { open: '（', close: '）', label: '（）' },
  ];
  const ENGLISH_PUNCTUATION_MAP = {
    ',': '，',
    '.': '。',
    '?': '？',
    '!': '！',
    ';': '；',
    ':': '：',
    '(': '（',
    ')': '）',
    '<': '《',
    '>': '》'
  };
  const ILLEGAL_SYMBOLS = [
    { char: '「', label: '「' },
    { char: '」', label: '」' },
    { char: '『', label: '『' },
    { char: '』', label: '』' },
    { char: '【', label: '【' },
    { char: '】', label: '' },
    { char: '〔', label: '〔' },
    { char: '〕', label: '〕' },
    { char: '〈', label: '〈' },
    { char: '〉', label: '〉' },
    { char: '{', label: '{' },
    { char: '}', label: '}' }
  ];
  const ILLEGAL_SYMBOL_LOOKUP = ILLEGAL_SYMBOLS.reduce((acc, item) => {
    acc[item.char] = item;
    return acc;
  }, {});
  let selfCheckQueue = [];
  const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email']);
  function isInCommonMeta(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return !!el.closest('.common-meta');
  }

  function clearSelfCheckIndicators() {
    document.querySelectorAll('.self-check-wrapper').forEach(el => el.remove());
    document.querySelectorAll(`.${SELF_CHECK_FIELD_CLASS}`).forEach(el => el.classList.remove(SELF_CHECK_FIELD_CLASS));
    selfCheckQueue = [];
  }

  function getFieldLabel(el) {
    if (!el) return '未命名字段';
    const byFor = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
    if (byFor && byFor.textContent) return byFor.textContent.trim();
    const fieldWrap = el.closest('.field');
    if (fieldWrap) {
      const labelEl = fieldWrap.querySelector('label');
      if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
    }
    if (el.dataset && el.dataset.linkField) return el.dataset.linkField;
    if (el.name) return el.name;
    return el.id || '未命名字段';
  }

  function insertAfterField(target, node) {
    if (!target || !node) return;
    const anchorId = target.dataset ? target.dataset.selfCheckAnchor : '';
    if (anchorId) {
      const scope = target.closest('.field') || formContainer || document;
      const anchorEl = scope.querySelector(`#${anchorId}`) || document.getElementById(anchorId);
      if (anchorEl && anchorEl.parentNode) {
        anchorEl.parentNode.insertBefore(node, anchorEl);
        return;
      }
    }
    let anchor = target;
    let next = anchor.nextElementSibling;
    while (next && next.classList && next.classList.contains('link-field-display')) {
      anchor = next;
      next = anchor.nextElementSibling;
    }
    if (anchor && typeof anchor.insertAdjacentElement === 'function') {
      anchor.insertAdjacentElement('afterend', node);
    } else if (target.parentNode) {
      target.parentNode.appendChild(node);
    } else {
      document.body.appendChild(node);
    }
  }

  function queueSelfCheckMessage(target, type, payload) {
    if (!target) return;
    const entry = {
      target,
      kind: type === 'auto' ? 'auto' : 'manual',
      category: payload && payload.category ? payload.category : '',
      count: payload && typeof payload.count === 'number' ? payload.count : 0,
      detail: payload && payload.detail ? payload.detail : '',
    };
    selfCheckQueue.push(entry);
  }

  function summarizeIssues(entries, unit, includeTotal) {
    const counts = new Map();
    entries.forEach(entry => {
      const label = entry.category || '其他';
      const value = typeof entry.count === 'number' ? entry.count : 0;
      counts.set(label, (counts.get(label) || 0) + value);
    });
    const parts = [];
    counts.forEach((value, label) => {
      if (value > 0) parts.push(`${label} ${value} ${unit}`);
    });
    if (includeTotal && counts.size) {
      const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
      parts.push(`总共 ${total} 处`);
    }
    return parts.join('；');
  }

  function renderIssueGroups(entries) {
    const groups = new Map();
    entries.forEach(entry => {
      const key = entry.category || '其他';
      if (!groups.has(key)) groups.set(key, []);
      if (entry.detail) groups.get(key).push(entry.detail);
    });
    if (!groups.size) return null;
    const container = document.createElement('div');
    container.className = 'self-check-issue-groups';
    groups.forEach((details, label) => {
      const block = document.createElement('div');
      block.className = 'self-check-issue-group';
      const labelEl = document.createElement('div');
      labelEl.className = 'self-check-issue-label';
      labelEl.textContent = `${label}：`;
      block.appendChild(labelEl);
      if (details.length) {
        const detailEl = document.createElement('div');
        detailEl.className = 'self-check-issue-detail';
        detailEl.innerHTML = details.join('');
        block.appendChild(detailEl);
      }
      container.appendChild(block);
    });
    return container;
  }

  function createIssueBox(entries, options) {
    if (!entries.length) return null;
    const { title, className, unit, includeTotal } = options;
    const box = document.createElement('div');
    box.className = `self-check-group ${className}`;
    const summaryText = summarizeIssues(entries, unit, includeTotal);
    const summaryEl = document.createElement('div');
    summaryEl.className = 'self-check-group-summary';
    summaryEl.textContent = summaryText ? `${title}：${summaryText}` : `${title}：-`;
    box.appendChild(summaryEl);
    const groupEl = renderIssueGroups(entries);
    if (groupEl) box.appendChild(groupEl);
    return box;
  }

  function renderQueuedSelfCheckMessages() {
    if (!selfCheckQueue.length) return;
    const grouped = new Map();
    selfCheckQueue.forEach(entry => {
      if (!grouped.has(entry.target)) {
        grouped.set(entry.target, { auto: [], manual: [], target: entry.target });
      }
      grouped.get(entry.target)[entry.kind].push(entry);
    });
    grouped.forEach((bucket) => {
      const { target, auto, manual } = bucket;
      if (!auto.length && !manual.length) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'self-check-wrapper';
      const autoBox = createIssueBox(auto, { title: '自动修复', className: 'self-check-group-auto', unit: '处', includeTotal: false });
      if (autoBox) wrapper.appendChild(autoBox);
      const manualBox = createIssueBox(manual, { title: '人工处理', className: 'self-check-group-manual', unit: '处', includeTotal: true });
      if (manualBox) wrapper.appendChild(manualBox);
      insertAfterField(target, wrapper);
    });
    selfCheckQueue = [];
  }

  function renderSpaceSpan(ch) {
    if (ch === '\t') return '<span class="self-check-space-char" data-space-type="tab">[tab]</span>';
    if (ch === '\u3000') return '<span class="self-check-space-char" data-space-type="full">[全角空格]</span>';
    if (ch === '\u00a0') return '<span class="self-check-space-char" data-space-type="nbsp">[nbsp]</span>';
    return '<span class="self-check-space-char" data-space-type="space">&nbsp;</span>';
  }

  function highlightInputSpaces(el) {
    if (!el || typeof el.value !== 'string') return 0;
    const value = el.value;
    if (!value) return 0;
    let count = 0;
    const sanitizedParts = [];
    const snippets = [];
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      const isSpace = ch === ' ' || ch === '\t' || ch === '\u00a0' || ch === '\u3000';
      if (!isSpace && ch !== '\r') {
        sanitizedParts.push(ch);
      }
      if (isSpace) {
        count += 1;
        if (snippets.length < SELF_CHECK_SPACE_SNIPPET_LIMIT) {
          const { before, after } = getCharContext(value, i, SELF_CHECK_SPACE_CONTEXT);
          const snippet = `${escapeHtml(before)}${renderSpaceSpan(ch)}${escapeHtml(after)}`;
          snippets.push(`<div class="self-check-inline-snippet">${snippet}</div>`);
        }
      }
    }
    if (!count) return 0;
    const sanitizedValue = sanitizedParts.join('');
    if (sanitizedValue !== value) {
      el.value = sanitizedValue;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { }
    }
    const snippetList = snippets.join('');
    const moreHint = count > snippets.length ? `<div class="self-check-inline-note">仅展示前 ${snippets.length} 处，共 ${count} 处</div>` : '';
    const detail = `<div class="self-check-detail-block self-check-auto-block"><div class="self-check-auto-detail">${snippetList}${moreHint}</div></div>`;
    queueSelfCheckMessage(el, 'auto', { category: '空格', count, detail });
    el.classList.add(SELF_CHECK_FIELD_CLASS);
    return count;
  }

  function isTextLikeField(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    const type = (el.type || '').toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }

  function getCharContext(value, index, radius) {
    if (!value || typeof value !== 'string') return { before: '', after: '' };
    const size = typeof radius === 'number' ? radius : 6;
    const before = value.slice(Math.max(0, index - size), index);
    const after = value.slice(index + 1, Math.min(value.length, index + 1 + size));
    return { before, after };
  }

  function collectUnmatchedPairSymbols(value, pair) {
    const lonely = [];
    const stack = [];
    let line = 1;
    let column = 1;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (ch === '\n') {
        line += 1;
        column = 1;
        continue;
      }
      if (ch === '\r') continue;
      if (ch === pair.open) {
        stack.push({ index: i, line, column, char: pair.open });
      } else if (ch === pair.close) {
        if (stack.length) stack.pop();
        else lonely.push({ index: i, line, column, char: pair.close, role: 'close' });
      }
      column += 1;
    }
    while (stack.length) {
      const info = stack.pop();
      lonely.push({ index: info.index, line: info.line, column: info.column, char: info.char, role: 'open' });
    }
    return lonely.sort((a, b) => a.index - b.index);
  }

  function replaceEnglishPunctuation(el) {
    if (!isTextLikeField(el)) return 0;
    const value = typeof el.value === 'string' ? el.value : '';
    if (!value) return 0;
    let changed = false;
    let result = '';
    const replacements = [];
    const quoteState = { double: false, single: false };
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      let replacement;
      if (ch === '"') {
        replacement = quoteState.double ? '”' : '“';
        quoteState.double = !quoteState.double;
      } else if (ch === '\'') {
        replacement = quoteState.single ? '’' : '‘';
        quoteState.single = !quoteState.single;
      } else {
        replacement = ENGLISH_PUNCTUATION_MAP[ch];
      }
      if (replacement) {
        result += replacement;
        const before = value.slice(Math.max(0, i - 6), i);
        const after = value.slice(i + 1, Math.min(value.length, i + 7));
        replacements.push({ from: ch, to: replacement, before, after });
        changed = true;
      } else {
        result += ch;
      }
    }
    if (!changed) return 0;
    el.value = result;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { }
    const snippetRows = replacements.map(rep => {
      const snippet = `${escapeHtml(rep.before)}<span class="self-check-inline-change" data-original="${escapeHtml(rep.from)}" title="原字符：${escapeHtml(rep.from)}">${escapeHtml(rep.to)}</span>${escapeHtml(rep.after)}`;
      return `<div class="self-check-inline-snippet">${snippet}</div>`;
    }).join('');
    const detail = `<div class="self-check-detail-block self-check-auto-block">${snippetRows}</div>`;
    queueSelfCheckMessage(el, 'auto', { category: '半角符号', count: replacements.length, detail });
    el.classList.add(SELF_CHECK_FIELD_CLASS);
    return replacements.length;
  }

  function flagIllegalSymbols(el) {
    if (!isTextLikeField(el)) return 0;
    const value = typeof el.value === 'string' ? el.value : '';
    if (!value) return 0;
    const hits = [];
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (!ILLEGAL_SYMBOL_LOOKUP[ch]) continue;
      const before = value.slice(Math.max(0, i - 6), i);
      const after = value.slice(i + 1, Math.min(value.length, i + 7));
      hits.push({ char: ch, before, after });
    }
    if (!hits.length) return 0;
    const rows = hits.map(hit => {
      const snippet = `${escapeHtml(hit.before)}<span class="self-check-illegal-char">${escapeHtml(hit.char)}</span>${escapeHtml(hit.after)}`;
      return `<div class="self-check-illegal-item">${snippet}</div>`;
    }).join('');
    const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-illegal"><div class="self-check-illegal-list">${rows}</div></div>`;
    queueSelfCheckMessage(el, 'manual', { category: '禁用符号', count: hits.length, detail });
    el.classList.add(SELF_CHECK_FIELD_CLASS);
    return hits.length;
  }

  function checkPairedSymbols(el) {
    if (!isTextLikeField(el)) return 0;
    const value = typeof el.value === 'string' ? el.value : '';
    if (!value) return 0;
    const pairIssues = [];
    let totalLonely = 0;
    PAIRED_SYMBOLS.forEach(pair => {
      const unmatched = collectUnmatchedPairSymbols(value, pair);
      if (!unmatched.length) return;
      totalLonely += unmatched.length;
      pairIssues.push({ label: pair.label, unmatched });
    });
    if (!pairIssues.length) return 0;
    const rows = pairIssues.map(item => item.unmatched.map(info => {
      const { before, after } = getCharContext(value, info.index, 8);
      const snippet = `${escapeHtml(before)}<span class="self-check-pair-char" data-pair-role="${info.role || 'open'}">${escapeHtml(info.char)}</span>${escapeHtml(after)}`;
      const title = `第${info.line}行第${info.column}列 · ${item.label} 落单`;
      return `<div class="self-check-pair-item" title="${escapeHtml(title)}"><div class="self-check-inline-snippet">${snippet}</div></div>`;
    }).join('')).join('');
    const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-pairs"><div class="self-check-pair-list">${rows}</div></div>`;
    queueSelfCheckMessage(el, 'manual', { category: '成对符号', count: totalLonely, detail });
    el.classList.add(SELF_CHECK_FIELD_CLASS);
    return totalLonely;
  }

  function isAutosizeTextarea(el) {
    if (!el || el.tagName !== 'TEXTAREA') return false;
    if (typeof el.__autosizeHandler === 'function') return true;
    try {
      if (el.dataset && el.dataset.autosize === 'true') return true;
      if (el.style && (el.style.resize === 'none' || el.style.overflow === 'hidden')) return true;
      const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (cs && (cs.resize === 'none' || cs.overflowY === 'hidden')) return true;
    } catch (e) { }
    return false;
  }

  function stripTrailingClosers(text) {
    let result = text;
    while (result.length > 0) {
      const last = result[result.length - 1];
      if (TRAILING_ENCLOSURE_REGEX.test(last)) result = result.slice(0, -1);
      else break;
    }
    return result;
  }

  function hasValidParagraphEnding(text) {
    if (!text) return false;
    if (text.endsWith(CN_ELLIPSIS)) return true;
    const lastChar = text[text.length - 1];
    return VALID_PARAGRAPH_ENDINGS.includes(lastChar);
  }

  function collectParagraphs(value) {
    const lines = value.split(/\r?\n/);
    const paragraphs = lines.reduce((acc, line, idx) => {
      if (line.trim()) {
        acc.push({ text: line, lineNumber: idx + 1 });
      }
      return acc;
    }, []);
    return paragraphs;
  }

  function checkTextareaParagraphEnds(el) {
    if (!el || typeof el.value !== 'string') return 0;
    const value = el.value;
    if (!value || !value.trim()) return 0;
    const paragraphs = collectParagraphs(value);
    if (!paragraphs.length) return 0;
    const issues = [];
    paragraphs.forEach((para, idx) => {
      let content = para.text;
      if (!content) return;
      content = content.replace(/\s+$/, '');
      if (!content) return;
      const stripped = stripTrailingClosers(content);
      if (!stripped) return;
      if (!hasValidParagraphEnding(stripped)) {
        issues.push({ paragraph: idx + 1 });
      }
    });
    if (!issues.length) return 0;
    const rows = issues.map(item => `<div class="self-check-punct-item">第${item.paragraph}段</div>`).join('');
    const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-punctuation"><div class="self-check-punct-list">${rows}</div></div>`;
    queueSelfCheckMessage(el, 'manual', { category: '段尾符号', count: issues.length, detail });
    el.classList.add(SELF_CHECK_FIELD_CLASS);
    return issues.length;
  }

  function runSelfCheck() {
    clearSelfCheckIndicators();
    const selectors = [
      'input:not([type])',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="number"]',
      'input[type="url"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="date"]',
      'input[type="time"]',
      'input[type="datetime-local"]',
      'textarea'
    ];
    const fields = Array.from(document.querySelectorAll(selectors.join(', '))).filter(el => !isInCommonMeta(el));
    let spaceIssues = 0;
    let punctuationIssues = 0;
    let englishIssues = 0;
    let pairIssues = 0;
    let illegalSymbolIssues = 0;
    fields.forEach(el => {
      if (!el || el.classList.contains('skip-self-check')) return;
      if (!el || typeof el.value !== 'string') return;
      spaceIssues += highlightInputSpaces(el);
      if (isTextLikeField(el)) {
        englishIssues += replaceEnglishPunctuation(el);
        illegalSymbolIssues += flagIllegalSymbols(el);
        pairIssues += checkPairedSymbols(el);
      }
      const needsParagraphCheck = (el.tagName === 'TEXTAREA' && isAutosizeTextarea(el)) || (el.dataset && el.dataset.checkParagraph === 'true');
      if (needsParagraphCheck) {
        punctuationIssues += checkTextareaParagraphEnds(el);
      }
    });
    renderQueuedSelfCheckMessages();
    const hasIssues = spaceIssues || englishIssues || illegalSymbolIssues || pairIssues || punctuationIssues;
    if (hasIssues) Poem.toast('请及时修改');
    else Poem.toast('未发现问题');
  }

  function applyOrderedItemLayout() {
    if (!formContainer) return;
    const rows = formContainer.querySelectorAll('.ordered-item');
    rows.forEach(row => {
      const labelElems = row.querySelectorAll('.pair-label');
      const valueElems = row.querySelectorAll('.pair-value');
      labelElems.forEach(el => {
        if (state.editable) {
          el.style.flex = '';
          el.style.width = '';
          el.style.maxWidth = '';
        } else {
          el.style.flex = '0 0 20ch';
          el.style.width = '20ch';
          el.style.maxWidth = '20ch';
        }
      });
      valueElems.forEach(el => {
        if (state.editable) {
          el.style.flex = '';
          el.style.minWidth = '';
          if (el.dataset.editWidth) el.style.width = el.dataset.editWidth;
          else el.style.width = '';
          el.style.maxWidth = '100%';
        } else {
          el.style.flex = '1 1 auto';
          el.style.minWidth = '0';
          el.style.width = '100%';
          el.style.maxWidth = '100%';
        }
      });
    });
  }

  function renderInlineSingle(container, arr, placeholder, opts) {
    if (!container) return;
    opts = opts || {};
    const items = Array.isArray(arr) ? arr : [];
    const placeholderText = placeholder || '';
    const state = container.__inlineSingleState || { rows: [] };
    if (!container.__inlineSingleState) {
      container.__inlineSingleState = state;
      container.innerHTML = '';
    }
    state.items = items;
    state.opts = opts;
    const inputClass = opts.inputClass || 'mini-work';
    const inputWidth = opts.inputWidth || '220px';

    const ensureRowCount = () => {
      while (state.rows.length > items.length) {
        const row = state.rows.pop();
        if (!row) continue;
        detachLinkField(row.input);
        row.wrapper.remove();
      }
      while (state.rows.length < items.length) {
        const rowIndex = state.rows.length;
        const row = createRow(rowIndex);
        state.rows.push(row);
        container.appendChild(row.wrapper);
      }
    };

    const createRow = (index) => {
      const wrapper = document.createElement('div');
      wrapper.className = opts.wrapperClass || 'ordered-item';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn small move-btn';
      upBtn.textContent = '▲';
      upBtn.setAttribute('aria-hidden', 'true');
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'btn small move-btn';
      downBtn.textContent = '▼';
      downBtn.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.className = inputClass;
      input.classList.add('pair-value');
      input.placeholder = placeholderText;
      if (!opts.lockWidth) {
        input.style.width = inputWidth;
        input.style.maxWidth = '100%';
        input.dataset.editWidth = inputWidth;
      }
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn small del-row';
      delBtn.textContent = '删除';

      const getIndex = () => parseInt(wrapper.dataset.index || '-1', 10);

      upBtn.addEventListener('click', () => {
        const current = getIndex();
        const target = current - 1;
        if (target < 0) return;
        moveItem(current, target);
        container.__inlineSingleFocus = target;
        renderInlineSingle(container, items, placeholderText, opts);
      });

      downBtn.addEventListener('click', () => {
        const current = getIndex();
        const target = current + 1;
        if (target >= items.length) return;
        moveItem(current, target);
        container.__inlineSingleFocus = target;
        renderInlineSingle(container, items, placeholderText, opts);
      });

      const syncValue = () => {
        const idx = getIndex();
        if (idx < 0 || idx >= items.length) return;
        items[idx] = input.value;
        triggerChange();
      };
      input.addEventListener('input', syncValue);
      input.addEventListener('change', syncValue);

      delBtn.addEventListener('click', () => {
        const idx = getIndex();
        if (idx < 0 || idx >= items.length) return;
        items.splice(idx, 1);
        triggerChange();
        container.__inlineSingleFocus = Math.max(0, idx - 1);
        renderInlineSingle(container, items, placeholderText, opts);
      });

      wrapper.appendChild(upBtn);
      wrapper.appendChild(downBtn);
      wrapper.appendChild(input);
      wrapper.appendChild(delBtn);

      return { wrapper, upBtn, downBtn, input, delBtn };
    };

    const detachLinkField = (el) => {
      if (el && el.__linkFieldSpec) {
        cleanupLinkFieldSpec(el.__linkFieldSpec);
      }
    };

    const triggerChange = () => {
      if (typeof opts.onChange === 'function') {
        try { opts.onChange(items); } catch (e) { }
      }
    };

    const moveItem = (from, to) => {
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
      const [entry] = items.splice(from, 1);
      items.splice(to, 0, entry);
      triggerChange();
    };

    ensureRowCount();

    state.rows.forEach((row, idx) => {
      row.wrapper.dataset.index = String(idx);
      row.input.placeholder = placeholderText;
      const value = items[idx] || '';
      if (row.input.value !== value) row.input.value = value;
      row.upBtn.disabled = idx === 0;
      row.downBtn.disabled = idx >= items.length - 1;

      if (opts.linkFieldPrefix) {
        const newKey = `${opts.linkFieldPrefix}[${idx}]`;
        if (row.input.dataset.linkField !== newKey) {
          detachLinkField(row.input);
          row.input.dataset.linkField = newKey;
          registerLinkField(newKey, row.input);
        }
      } else if (row.input.dataset.linkField) {
        detachLinkField(row.input);
        row.input.removeAttribute('data-link-field');
      }
    });

    applyOrderedItemLayout();

    const focusIdx = container.__inlineSingleFocus;
    if (Number.isInteger(focusIdx) && focusIdx >= 0 && focusIdx < state.rows.length) {
      const row = state.rows[focusIdx];
      try { row.input.focus(); } catch (e) { }
    }
    delete container.__inlineSingleFocus;
  }

  // 对渲染器：支持任意属性名称作为键和单独的占位符文本
  // key1/key2: 数组对象中要读写的属性名称
  // ph1/ph2: 输入的占位符文本（可选，默认为键名称）
  // opts 可以设置 wrapperClass, inputClass1, inputClass2
  function renderInlinePairs(container, arr, key1, key2, ph1, ph2, opts) {
    opts = opts || {};
    const wrapperClass = opts.wrapperClass || 'ordered-item';
    const inputClass1 = opts.inputClass1 || '';
    const inputClass2 = opts.inputClass2 || '';
    const deckColumns = Number(opts.deckColumns) || 0;
    const useDeckLayout = deckColumns > 1;
    const placeholder1 = ph1 || key1 || '';
    const placeholder2 = ph2 || key2 || '';
    const containerClass = opts.containerClass || '';
    const paragraphCheck1 = !!opts.paragraphCheck1;
    const paragraphCheck2 = !!opts.paragraphCheck2;

    container.innerHTML = '';
    if (containerClass && useDeckLayout) container.classList.add(containerClass);
    else if (containerClass) container.classList.remove(containerClass);
    container.classList.toggle('pair-grid', useDeckLayout);
    if (useDeckLayout) container.dataset.pairGrid = String(deckColumns);
    else delete container.dataset.pairGrid;

    const items = Array.isArray(arr) ? arr : [];
    const triggerChange = () => {
      if (typeof opts.onChange === 'function') {
        try { opts.onChange(items); } catch (e) { }
      }
    };
    const focusAfterRender = (targetIdx) => {
      setTimeout(() => {
        const rows = container ? container.children : null;
        const targetRow = rows && rows[targetIdx] ? rows[targetIdx] : null;
        const focusEl = targetRow ? targetRow.querySelector('input') : null;
        if (focusEl) {
          try { focusEl.focus(); } catch (e) { }
        }
      }, 0);
    };

    items.forEach((row, idx) => {
      let current = row;
      if (!current || typeof current !== 'object') {
        current = {};
        if (Array.isArray(items)) items[idx] = current;
      }
      const moveTo = (from, to) => {
        if (to < 0 || to >= items.length) return;
        const [entry] = items.splice(from, 1);
        items.splice(to, 0, entry);
        triggerChange();
        renderInlinePairs(container, items, key1, key2, ph1, ph2, opts);
        focusAfterRender(to);
      };

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn small move-btn';
      upBtn.textContent = '▲';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => moveTo(idx, idx - 1));

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'btn small move-btn';
      downBtn.textContent = '▼';
      downBtn.disabled = idx >= items.length - 1;
      downBtn.addEventListener('click', () => moveTo(idx, idx + 1));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn small del-row';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        items.splice(idx, 1);
        triggerChange();
        renderInlinePairs(container, items, key1, key2, ph1, ph2, opts);
        focusAfterRender(Math.max(0, idx - 1));
      });

      const input1 = document.createElement('input');
      input1.placeholder = placeholder1;
      if (inputClass1) input1.classList.add(inputClass1);
      input1.classList.add('pair-label');
      input1.value = (current && (current[key1] !== undefined ? current[key1] : current[placeholder1])) || '';
      if (opts.linkFieldPrefix) {
        input1.dataset.linkField = `${opts.linkFieldPrefix}[${idx}].${key1}`;
      }
      if (paragraphCheck1) {
        input1.dataset.checkParagraph = 'true';
      }

      const input2 = document.createElement('input');
      input2.placeholder = placeholder2;
      if (inputClass2) input2.classList.add(inputClass2);
      input2.classList.add('pair-value');
      input2.value = (current && (current[key2] !== undefined ? current[key2] : current[placeholder2])) || '';
      if (opts.linkFieldPrefix) {
        input2.dataset.linkField = `${opts.linkFieldPrefix}[${idx}].${key2}`;
      }
      if (paragraphCheck2) {
        input2.dataset.checkParagraph = 'true';
      }

      const syncFirst = () => {
        const target = items[idx];
        if (target && typeof target === 'object') target[key1] = input1.value;
        triggerChange();
      };
      const syncSecond = () => {
        const target = items[idx];
        if (target && typeof target === 'object') target[key2] = input2.value;
        triggerChange();
      };
      input1.addEventListener('input', syncFirst);
      input1.addEventListener('change', syncFirst);
      input2.addEventListener('input', syncSecond);
      input2.addEventListener('change', syncSecond);

      const wrapper = document.createElement('div');
      wrapper.className = wrapperClass;
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '8px';
      wrapper.style.minWidth = '0';
      if (useDeckLayout) {
        wrapper.style.margin = '0';
      } else {
        wrapper.style.marginBottom = '8px';
      }
      wrapper.appendChild(upBtn);
      wrapper.appendChild(downBtn);
      wrapper.appendChild(input1);
      wrapper.appendChild(input2);
      wrapper.appendChild(del);

      container.appendChild(wrapper);
    });

    initializeLinkFields(container);
    applyOrderedItemLayout();
  }

  // renderers (try 风格)
  function renderPoem(node) {
    const name = node ? (node.fields?.title || node.fields?.name || '') : '';
    const author = node ? node.fields?.author || '' : '';
    const source = node ? node.fields?.origin || '' : '';
    const form = node ? node.fields?.form || '' : '';
    const sub = node ? node.fields?.sub || '' : '';
    const sub2 = node ? node.fields?.sub2 || '' : '';
    const rhyme = node ? node.fields?.rhyme || '' : '';
    const body = node ? node.content || '' : '';
    const translation = node ? node.extra?.translation || '' : '';
    const background = node ? node.extra?.background || '' : '';
    const comments = node ? node.extra?.evaluation || [] : [];

    formContainer.innerHTML = `
      <div class="grid-3">
        <div class="field"><label>作品</label><input id="f-name" type="text" data-link-field="fields.title" value="${escapeHtml(name)}"></div>
        <div class="field"><label>作者</label><input id="f-author" type="text" data-link-field="fields.author" value="${escapeHtml(author)}"></div>
        <div class="field"><label>出处</label><input id="f-source" type="text" data-link-field="fields.origin" value="${escapeHtml(source)}"></div>
      </div>
      <div class="field">
        <label style="display:inline-block;margin-bottom:6px">体例</label>
        <div class="form-subtype-row">
          <select id="f-form">
            <option value="">-- 请选择 --</option>
            <option value="古体">古体</option>
            <option value="近体">近体</option>
            <option value="词">词</option>
            <option value="散曲">散曲</option>
          </select>
          <div id="form-opts"></div>
        </div>
      </div>
      <div id="sub2-row" class="field" style="display:none;margin-top:8px"><label>曲牌</label><input id="f-sub2" type="text" value="${escapeHtml(sub2)}"></div>
      <div id="rhyme-row" class="field" style="display:none;margin-top:8px"><label>韵部</label><input id="f-rhyme" type="text" value="${escapeHtml(rhyme)}"></div>
    <div class="field"><label>正文</label><textarea id="f-body" rows="1" data-link-field="content" data-self-check-anchor="bodyLockControls" style="width:100%;resize:none;overflow:hidden">${escapeHtml(body)}</textarea>
      <div id="bodyLockControls" class="body-lock-controls" style="margin-top:8px"><button id="lock-body" class="btn small">🔒 锁定</button> <button id="unlock-body" class="btn small">✏️ 编辑</button></div>
        <div id="annotation-area" class="muted" style="margin-top:8px"></div>
      </div>
  <div class="field"><label>译文</label><textarea id="f-translation" rows="1" data-link-field="extra.translation" style="width:100%;resize:none;overflow:hidden">${escapeHtml(translation)}</textarea></div>
  <div class="field"><label>创作背景</label><textarea id="f-background" rows="1" data-link-field="extra.background" style="width:100%;resize:none;overflow:hidden">${escapeHtml(background)}</textarea></div>
      <div class="field"><label>评价 <button class="btn small add-row" id="add-comment">添加</button></label>
        <div id="comment-list" class="note-list"></div>
      </div>
    `;

    initializeLinkFields(formContainer);

    // set select
    const sel = formContainer.querySelector('#f-form'); if (form) sel.value = form;
    // comments (use generic pair renderer)
    const cl = formContainer.querySelector('#comment-list');
    const commentArr = (comments && comments.length) ? comments : [{ source: '', content: '' }];
    const commentRenderOpts = { wrapperClass: 'ordered-item note-item', inputClass1: 'c-source', inputClass2: 'c-content', linkFieldPrefix: 'extra.evaluation', onChange: (arr) => { /* no-op: collect reads DOM */ }, paragraphCheck2: true };
    renderInlinePairs(cl, commentArr, 'source', 'content', '出处', '内容', commentRenderOpts);
    const addCommentBtn = formContainer.querySelector('#add-comment');
    if (addCommentBtn) {
      addCommentBtn.addEventListener('click', () => { commentArr.push({ source: '', content: '' }); renderInlinePairs(cl, commentArr, 'source', 'content', '出处', '内容', commentRenderOpts); });
    }

    // autosize multiline fields so they grow with content (正文/译文/创作背景)
    ['f-body', 'f-translation', 'f-background'].forEach(id => {
      const ta = formContainer.querySelector('#' + id);
      if (!ta) return;
      try { ta.style.width = '100%'; ta.style.resize = 'none'; ta.style.overflow = 'hidden'; } catch (e) { }
      autosizeTextarea(ta);
      try { if (ta.__autosizeHandler) ta.removeEventListener('input', ta.__autosizeHandler); } catch (e) { }
      ta.__autosizeHandler = () => autosizeTextarea(ta);
      ta.addEventListener('input', ta.__autosizeHandler);
    });

    // lock/edit behavior
    const lockBtn = formContainer.querySelector('#lock-body');
    const unlockBtn = formContainer.querySelector('#unlock-body');
    const textarea = formContainer.querySelector('#f-body');
    const annoArea = formContainer.querySelector('#annotation-area');
    let annotations = Array.isArray(node?.annotations) ? node.annotations : [];

    let annotationKeySeed = 0;
    function ensureAnnotationKey(annotation) {
      if (!annotation || typeof annotation !== 'object') return '';
      if (typeof annotation.linkKey === 'string' && annotation.linkKey) return annotation.linkKey;
      if (typeof annotation.id === 'string' && annotation.id) {
        annotation.linkKey = `anno-${annotation.id}`;
        return annotation.linkKey;
      }
      const startPart = typeof annotation.start === 'number' ? annotation.start : '';
      const endPart = typeof annotation.end === 'number' ? annotation.end : '';
      const rangePart = startPart !== '' && endPart !== '' ? `${startPart}-${endPart}` : '';
      const uniqueTail = `${Date.now().toString(36)}${(annotationKeySeed++).toString(36)}`;
      annotation.linkKey = `anno-${rangePart ? `${rangePart}-` : ''}${uniqueTail}`;
      return annotation.linkKey;
    }
    function getAnnotationFieldKey(annotation) {
      const key = ensureAnnotationKey(annotation);
      return key ? `annotations.${key}.note` : '';
    }

    annotations.forEach(ensureAnnotationKey);

    links = Array.isArray(node?.links) ? node.links.map(normalizeLink).filter(Boolean) : [];
    syncLinksToState();

    // helper: render form suboptions based on selection
    const formSelect = formContainer.querySelector('#f-form');
    const formOpts = formContainer.querySelector('#form-opts');
    function renderFormOpts() {
      const v = formSelect.value;
      // Render inline sub-controls inside the form-opts container so they appear on the same row
      formOpts.innerHTML = '';
      const commonStyle = 'height:32px;padding:4px 12px;width:100%;box-sizing:border-box;';
      const wrappers = [];
      if (v === '古体') {
        wrappers.push(`<label class="form-subtype">子类 <select id="f-sub" style="${commonStyle}"><option value="">-- 请选择 --</option><option>诗经</option><option>楚辞</option><option>汉乐府</option><option>歌行体</option><option>柏梁体</option><option>其他</option></select></label>`);
      } else if (v === '近体') {
        wrappers.push(`<label class="form-subtype">子类 <select id="f-sub" style="${commonStyle}"><option value="">-- 请选择 --</option><option>五绝</option><option>七绝</option><option>五律</option><option>七律</option><option>排律</option></select></label>`);
        wrappers.push(`<label class="form-subtype">韵部 <input id="f-rhyme" type="text" data-link-field="fields.rhyme" style="${commonStyle}"></label>`);
      } else if (v === '词') {
        wrappers.push(`<label class="form-subtype">词牌 <input id="f-sub" type="text" data-link-field="fields.sub" style="${commonStyle}"></label>`);
        wrappers.push(`<label class="form-subtype">韵部 <input id="f-rhyme" type="text" data-link-field="fields.rhyme" style="${commonStyle}"></label>`);
      } else if (v === '散曲') {
        wrappers.push(`<label class="form-subtype">子类 <select id="f-sub" style="${commonStyle}"><option value="">-- 请选择 --</option><option>小令</option><option>套数</option></select></label>`);
        wrappers.push(`<label class="form-subtype">曲牌 <input id="f-sub2" type="text" data-link-field="fields.sub2" style="${commonStyle}"></label>`);
        wrappers.push(`<label class="form-subtype">韵部 <input id="f-rhyme" type="text" data-link-field="fields.rhyme" style="${commonStyle}"></label>`);
      }
      formOpts.innerHTML = wrappers.join('');
      // set values if existed on node
      if (node && node.fields) {
        const subEl = formOpts.querySelector('#f-sub'); if (subEl && node.fields.sub) subEl.value = node.fields.sub;
        const sub2El = formOpts.querySelector('#f-sub2'); if (sub2El && node.fields.sub2) sub2El.value = node.fields.sub2;
        const rhymeEl = formOpts.querySelector('#f-rhyme'); if (rhymeEl && node.fields.rhyme) rhymeEl.value = node.fields.rhyme;
      }
      initializeLinkFields(formOpts);
    }
    formSelect.addEventListener('change', renderFormOpts);
    if (form) formSelect.value = form; renderFormOpts();

    function computeDepths(list) {
      if (!Array.isArray(list) || list.length === 0) return [];
      const events = [];
      list.forEach((entry, idx) => {
        const start = typeof entry.start === 'number' ? entry.start : 0;
        const end = typeof entry.end === 'number' ? entry.end : start;
        events.push({ pos: start, type: 'start', idx });
        events.push({ pos: Math.max(end, start), type: 'end', idx });
      });
      events.sort((a, b) => {
        if (a.pos === b.pos) {
          if (a.type === b.type) return 0;
          return a.type === 'end' ? -1 : 1;
        }
        return a.pos - b.pos;
      });
      const depths = new Array(list.length).fill(0);
      let active = 0;
      events.forEach(event => {
        if (event.type === 'start') {
          depths[event.idx] = active;
          active += 1;
        } else {
          active = Math.max(0, active - 1);
        }
      });
      return depths;
    }

    function renderAnnotations() {
      const depths = computeDepths(annotations);
      const annotated = annotations.map((a, i) => ({ a, idx: i, depth: depths[i] || 0 }));
      annotated.forEach(item => ensureAnnotationKey(item.a));
      annotated.sort((x, y) => { const sx = (x.a.start | 0), sy = (y.a.start | 0); if (sx !== sy) return sx - sy; const ex = (x.a.end | 0), ey = (y.a.end | 0); return ex - ey; });
      const total = annotated.length;
      const shouldCollapse = !state.editable && total > MAX_VISIBLE_ANNOTATIONS;
      if (!shouldCollapse && showAllAnnotations) showAllAnnotations = false;
      const renderList = shouldCollapse && !showAllAnnotations ? annotated.slice(0, MAX_VISIBLE_ANNOTATIONS) : annotated;
      annoArea.textContent = '';
      if (!state.editable) {
        annoArea.style.display = 'none';
        return;
      }
      annoArea.style.display = '';
      annoArea.appendChild(document.createTextNode('注释：'));
      const list = document.createElement('div');
      list.className = 'anno-list';
      annoArea.appendChild(list);
      if (renderList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = '暂无注释';
        list.appendChild(empty);
      }
      renderList.forEach((item, dispIdx) => {
        const { a, idx, depth } = item;
        const depthClass = depth >= 2 ? 'annotation depth-3' : (depth >= 1 ? 'annotation depth-2' : 'annotation depth-1');
        const row = document.createElement('div');
        row.dataset.idx = String(idx);
        row.className = `anno-row ${depthClass}`;
        if (a.note) row.title = a.note;

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn small del-anno';
        delBtn.textContent = '删除';
        delBtn.disabled = !state.editable;
        delBtn.addEventListener('click', () => {
          if (!state.editable) return;
          const target = annotations[idx];
          if (!target) return;
          const fieldKey = getAnnotationFieldKey(target);
          const spec = fieldKey ? getFieldSpec(fieldKey) : null;
          annotations.splice(idx, 1);
          if (fieldKey) {
            if (spec) {
              cleanupLinkFieldSpec(spec);
              linkFieldRegistry.delete(fieldKey);
            }
            links = links.filter(link => (link.field || 'content') !== fieldKey);
          }
          syncLinksToState();
          renderAnnotations();
        });

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn small edit-anno';
        editBtn.textContent = '编辑';
        editBtn.disabled = !state.editable;
        editBtn.addEventListener('click', () => {
          if (!state.editable) return;
          const current = annotations[idx];
          if (current) showAnnotationEditor(current, idx);
        });

        const indexSpan = document.createElement('span');
        indexSpan.className = 'anno-index';
        indexSpan.textContent = `${dispIdx + 1}.`;

        const textSpan = document.createElement('span');
        textSpan.className = 'anno-target';
        textSpan.textContent = a.text || '';

        const noteDisplay = document.createElement('span');
        noteDisplay.className = 'anno-note-display';
        const fieldKey = getAnnotationFieldKey(a);
        if (fieldKey) noteDisplay.dataset.linkField = fieldKey;

        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'anno-actions';
        actionsWrap.appendChild(delBtn);
        actionsWrap.appendChild(editBtn);

        const mainWrap = document.createElement('div');
        mainWrap.className = 'anno-main';
        mainWrap.appendChild(indexSpan);
        mainWrap.appendChild(textSpan);

        const arrowEl = document.createElement('span');
        arrowEl.className = 'anno-arrow';
        arrowEl.textContent = '→';

        const noteWrap = document.createElement('div');
        noteWrap.className = 'anno-note';
        noteWrap.appendChild(noteDisplay);

        row.appendChild(actionsWrap);
        row.appendChild(mainWrap);
        row.appendChild(arrowEl);
        row.appendChild(noteWrap);
        list.appendChild(row);

        if (fieldKey) {
          const hidden = document.createElement('textarea');
          hidden.style.display = 'none';
          hidden.value = a.note || '';
          hidden.dataset.linkField = fieldKey;
          hidden.dataset.checkParagraph = 'true';
          row.appendChild(hidden);

          registerLinkField(fieldKey, hidden, {
            skipDisplay: true,
            skipSelectionListener: true,
            skipInputListener: true,
            getValue: () => {
              const current = annotations[idx];
              return current && typeof current.note === 'string' ? current.note : '';
            },
            onLinksUpdated: () => {
              const spec = getFieldSpec(fieldKey);
              if (spec && spec.renderDisplay) spec.renderDisplay();
            },
            onEditableChange: () => {
              hidden.style.display = 'none';
              noteDisplay.style.display = '';
            }
          });

          const spec = getFieldSpec(fieldKey);
          if (spec) {
            spec.displayEl = noteDisplay;
            spec.renderDisplay = () => { renderFieldDisplay(spec); };
            spec.renderDisplay();
          }
        } else {
          noteDisplay.textContent = a.note || '';
        }
      });
      if (shouldCollapse) {
        const overflowWrap = document.createElement('div');
        overflowWrap.className = 'anno-overflow';
        overflowWrap.style.display = 'flex';
        overflowWrap.style.alignItems = 'center';
        overflowWrap.style.gap = '8px';
        overflowWrap.style.marginTop = '8px';
        const hiddenCount = Math.max(0, total - MAX_VISIBLE_ANNOTATIONS);
        const info = document.createElement('span');
        info.className = 'muted';
        info.textContent = showAllAnnotations ? `共 ${total} 条注释` : `已隐藏 ${hiddenCount} 条注释`;
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn small';
        toggleBtn.textContent = showAllAnnotations ? '收起部分注释' : '展开全部';
        toggleBtn.addEventListener('click', () => {
          showAllAnnotations = !showAllAnnotations;
          renderAnnotations();
        });
        overflowWrap.appendChild(info);
        overflowWrap.appendChild(toggleBtn);
        list.appendChild(overflowWrap);
      }
      const renderDiv = formContainer.querySelector('#f-body-render'); if (renderDiv) renderAnnotatedBody();
    }
    renderAnnotations();
    registerEditableWatcher(() => renderAnnotations());

    function annotatedBodyClickHandler(event) {
      const renderDiv = event.currentTarget;
      const span = event.target.closest('span[data-pos]');
      if (!span || !renderDiv.contains(span)) return;
      if (!state.editable) {
        return;
      }
      if (linkBrushActive) {
        const idx = parseInt(span.getAttribute('data-link-index') || '-1', 10);
        if (idx >= 0) {
          event.preventDefault();
          editExistingLink(idx);
        }
        return;
      }
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (renderDiv.__lastSelectionAt && (Date.now() - renderDiv.__lastSelectionAt) < 600) {
        renderDiv.__lastSelectionAt = 0;
        return;
      }
      const pos = parseInt(span.getAttribute('data-pos') || '0', 10);
      if (isNaN(pos)) return;
      const idx = annotations.findIndex(a => a.start <= pos && pos < a.end);
      if (idx >= 0) showAnnotationEditor(annotations[idx], idx);
    }

    function ensureAnnotatedBodyClickHandler(renderDiv) {
      if (!renderDiv) return;
      if (renderDiv.__clickDelegationAttached) return;
      renderDiv.__clickDelegationAttached = true;
      renderDiv.addEventListener('click', annotatedBodyClickHandler);
    }

    function renderAnnotatedBody() {
      const text = textarea.value || '';
      const n = text.length;
      const annotationDepth = new Array(n).fill(0);
      const annotationSignature = new Array(n).fill('');
      if (n) {
        const annStarts = Object.create(null);
        const annEnds = Object.create(null);
        annotations.forEach((a, idx) => {
          if (!a) return;
          const s = Math.max(0, a.start | 0);
          const e = Math.min(n, a.end | 0);
          if (e <= s) return;
          if (!annStarts[s]) annStarts[s] = [];
          annStarts[s].push(idx);
          if (!annEnds[e]) annEnds[e] = [];
          annEnds[e].push(idx);
        });
        const active = new Set();
        const recomputeSignature = () => {
          if (!active.size) return '';
          const indices = Array.from(active);
          indices.sort((a, b) => a - b);
          return indices.join(',');
        };
        let currentSignature = '';
        for (let pos = 0; pos < n; pos++) {
          const starting = annStarts[pos];
          if (starting && starting.length) {
            starting.forEach(idx => active.add(idx));
            currentSignature = recomputeSignature();
          }
          annotationDepth[pos] = active.size;
          annotationSignature[pos] = currentSignature;
          const ending = annEnds[pos + 1];
          if (ending && ending.length) {
            ending.forEach(idx => active.delete(idx));
            currentSignature = recomputeSignature();
          }
        }
      }
      const linkCover = new Array(n).fill(-1);
      const contentLinks = links
        .map((link, idx) => ({ link, idx }))
        .filter(item => item.link && (item.link.field || 'content') === 'content');
      contentLinks.forEach(({ link, idx }) => {
        if (!link) return;
        const s = Math.max(0, link.start | 0);
        const e = Math.min(n, link.end | 0);
        if (e <= s) return;
        for (let i = s; i < e; i++) linkCover[i] = idx;
      });
      let html = '';
      let i = 0;
      while (i < n) {
        const depth = annotationDepth[i] || 0;
        const signature = annotationSignature[i] || '';
        const linkIdx = linkCover[i];
        let j = i + 1;
        while (j < n && (annotationDepth[j] || 0) === depth && linkCover[j] === linkIdx && (annotationSignature[j] || '') === signature) j++;
        const chunkRaw = text.slice(i, j);
        const chunk = escapeHtml(chunkRaw).replace(/\n/g, '<br>');
        const classes = [];
        if (depth > 0) { classes.push(depth >= 3 ? 'annotation depth-3' : (depth >= 2 ? 'annotation depth-2' : 'annotation depth-1')); }
        if (linkIdx >= 0) {
          const linkInfo = links[linkIdx];
          if (linkInfo && linkInfo.placeholder) classes.push('linked-placeholder');
          else classes.push('linked-chunk');
        }
        const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
        const linkAttr = linkIdx >= 0 ? ` data-link-index="${linkIdx}"` : '';
        const annoAttr = signature ? ` data-anno="${signature}"` : '';
        html += `<span data-pos="${i}" data-len="${j - i}"${linkAttr}${classAttr}${annoAttr}>${chunk}</span>`;
        i = j;
      }
      let renderDiv = formContainer.querySelector('#f-body-render');
      if (!renderDiv) {
        renderDiv = document.createElement('div');
        renderDiv.id = 'f-body-render';
        renderDiv.style.padding = '8px';
        renderDiv.style.border = '1px solid #ddd';
        renderDiv.style.borderRadius = '6px';
        renderDiv.style.marginTop = '8px';
        renderDiv.style.background = '#fff';
        const bodyField = formContainer.querySelector('#f-body');
        if (bodyField && bodyField.parentNode) { bodyField.parentNode.insertBefore(renderDiv, bodyField.nextSibling); }
        else { formContainer.appendChild(renderDiv); }
      }
      renderDiv.innerHTML = html || '<div class="muted">（空）</div>';
      renderDiv.querySelectorAll('span[data-pos]').forEach(sp => {
        const pos = +sp.dataset.pos;
        const tipParts = [];
        const overlapSig = sp.dataset.anno || annotationSignature[pos] || '';
        const overlapping = overlapSig ? overlapSig.split(',').map(idx => annotations[parseInt(idx, 10)]).filter(Boolean) : [];
        const annoTip = overlapping.map(a => a && a.note ? a.note : '').filter(t => t).join('\n');
        if (annoTip) tipParts.push(annoTip);
        const linkIdx = parseInt(sp.dataset.linkIndex || '-1', 10);
        if (linkIdx >= 0 && links[linkIdx]) {
          const info = links[linkIdx];
          const linkLabelParts = [];
          if (info.targetType) linkLabelParts.push(info.targetType);
          if (info.targetId) linkLabelParts.push(info.targetId);
          if (info.targetName) linkLabelParts.push(info.targetName);
          if (info.placeholder) {
            tipParts.push('链接：空置');
          } else if (linkLabelParts.length) {
            tipParts.push(`链接：${linkLabelParts.join('｜')}`);
          }
          sp.dataset.linkTarget = info.targetId || '';
        }
        if (tipParts.length) sp.title = tipParts.join('\n');
      });
      ensureAnnotatedBodyClickHandler(renderDiv);
      if (!renderDiv.__selectionHandler) {
        renderDiv.__selectionHandler = true;
        renderDiv.addEventListener('mouseup', () => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) return;
          const range = sel.getRangeAt(0);
          const startSpan = findSpanForNode(renderDiv, range.startContainer);
          const endSpan = findSpanForNode(renderDiv, range.endContainer);
          if (!startSpan || !endSpan) return;
          const sOffset = offsetWithinSpan(startSpan, range.startContainer, range.startOffset);
          const eOffset = offsetWithinSpan(endSpan, range.endContainer, range.endOffset);
          const sPos = parseInt(startSpan.getAttribute('data-pos') || 0) + sOffset;
          const ePos = parseInt(endSpan.getAttribute('data-pos') || 0) + eOffset;
          if (isNaN(sPos) || isNaN(ePos) || ePos <= sPos) return;
          const selText = textarea.value.slice(sPos, ePos);
          if (linkBrushActive) {
            sel.removeAllRanges();
            const container = renderDiv; if (container) container.__lastSelectionAt = Date.now();
            startLinkFlow('content', sPos, ePos, selText);
          } else if (state.editable) {
            sel.removeAllRanges();
            const container = renderDiv; if (container) container.__lastSelectionAt = Date.now();
            showAnnotationEditor({ start: sPos, end: ePos, text: selText }, -1);
          }
        });
      }
      return renderDiv;
    }

    function reindexAnnotationsForContentText(text) {
      if (!Array.isArray(annotations) || !annotations.length) return false;
      const body = typeof text === 'string' ? text : '';
      const limit = body.length;
      const nextList = [];
      let changed = false;
      for (let i = 0; i < annotations.length; i++) {
        const current = annotations[i];
        if (!current) continue;
        const approx = typeof current.start === 'number' ? current.start : 0;
        const snippet = typeof current.text === 'string' ? current.text : '';
        if (!snippet) {
          changed = true;
          continue;
        }
        const best = findBestLinkPosition(body, snippet, approx);
        if (best === -1) {
          changed = true;
          continue;
        }
        const start = Math.max(0, best);
        const end = Math.min(limit, start + snippet.length);
        if (end <= start) {
          changed = true;
          continue;
        }
        const actualText = body.slice(start, end);
        if (actualText !== snippet) {
          changed = true;
          continue;
        }
        const updated = { ...current, start, end, text: actualText };
        ensureAnnotationKey(updated);
        if (start !== current.start || end !== current.end || actualText !== current.text) {
          changed = true;
        }
        nextList.push(updated);
      }
      if (changed) {
        annotations = nextList;
      }
      return changed;
    }

    const existingContentSpec = getFieldSpec('content');
    if (existingContentSpec) {
      cleanupLinkFieldSpec(existingContentSpec);
      linkFieldRegistry.delete('content');
      try { delete textarea.__linkFieldSpec; } catch (e) { }
    }

    registerLinkField('content', textarea, {
      skipSelectionListener: true,
      skipDisplay: true,
      getValue: () => textarea ? textarea.value || '' : '',
      onLinksUpdated: renderAnnotatedBody,
      onEditableChange: editable => {
        if (!textarea) return;
        textarea.readOnly = !editable;
      }
    });

    if (textarea) {
      textarea.addEventListener('input', () => {
        reindexFieldLinks('content');
        const textValue = textarea.value || '';
        if (reindexAnnotationsForContentText(textValue)) {
          renderAnnotations();
          const renderDiv = formContainer.querySelector('#f-body-render');
          if (renderDiv && renderDiv.style.display !== 'none') {
            renderAnnotatedBody();
          }
        }
      });
    }

    registerLinkBrushHandler(active => {
      if (!lockBtn || !textarea) return;
      if (active) {
        lockBody();
      }
    });

    function lockBody() {
      if (!textarea) return;
      textarea.readOnly = true;
      textarea.style.display = 'none';
      const rv = renderAnnotatedBody();
      rv.style.display = 'block';
      if (lockBtn) lockBtn.disabled = true;
      if (unlockBtn) unlockBtn.disabled = state.editable ? false : true;
    }

    function unlockBody() {
      if (!textarea) return;
      if (linkBrushActive) {
        Poem.toast('链接模式下正文保持锁定，请先关闭链接模式');
        return;
      }
      textarea.readOnly = false;
      if (lockBtn) lockBtn.disabled = state.editable ? false : true;
      if (unlockBtn) unlockBtn.disabled = true;
      textarea.style.display = '';
      const rv = formContainer.querySelector('#f-body-render');
      if (rv) rv.style.display = 'none';
    }

    lockBtn.addEventListener('click', lockBody);
    unlockBtn.addEventListener('click', unlockBody);
    if (unlockBtn) unlockBtn.disabled = true;

    registerEditableWatcher(editable => {
      if (!editable) {
        lockBody();
        return;
      }
      const hasPersistedId = !!(state.node && state.node.id);
      if (hasPersistedId) {
        // Existing poems default to locked view until the user explicitly unlocks
        lockBody();
      } else {
        unlockBody();
      }
    });

    function showAnnotationEditor(annotation, index) {
      // Remove any existing annotation editor to ensure only one editor is displayed at a time
      annoArea.querySelectorAll('.anno-editor').forEach(ed => ed.remove());
      const editor = document.createElement('div'); editor.className = 'anno-editor';
      editor.style.display = 'grid'; editor.style.gridTemplateColumns = '1fr 1fr auto'; editor.style.gridTemplateRows = 'auto auto'; editor.style.gap = '8px'; editor.style.padding = '8px'; editor.style.border = '1px solid #ddd'; editor.style.background = '#fff'; editor.style.marginBottom = '8px';
      const leftTop = document.createElement('div'); leftTop.style.padding = '6px'; leftTop.style.border = '1px solid #f0f0f0'; leftTop.style.overflow = 'auto'; leftTop.style.maxHeight = '6em'; leftTop.textContent = annotation.text || '';
      const rightTop = document.createElement('div'); rightTop.style.gridColumn = '2 / 3'; rightTop.innerHTML = `<textarea class="anno-input" rows="1" data-check-paragraph="true" style="width:100%;resize:none;overflow:hidden">${escapeHtml(annotation.note || '')}</textarea>`;
      const btnCell = document.createElement('div'); btnCell.style.display = 'flex'; btnCell.style.flexDirection = 'row'; btnCell.style.gap = '8px'; btnCell.style.alignItems = 'center';
      const keep = document.createElement('button');
      keep.type = 'button';
      keep.className = 'btn small';
      keep.textContent = '保留';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn small';
      del.textContent = '删除';
      btnCell.appendChild(keep);
      btnCell.appendChild(del);
      const spacer = document.createElement('div'); spacer.style.gridColumn = '1 / 3'; editor.appendChild(leftTop); editor.appendChild(rightTop); editor.appendChild(btnCell); editor.appendChild(spacer);
      annoArea.prepend(editor);
      const noteInputEl = editor.querySelector('.anno-input');
      if (noteInputEl) {
        autosizeTextarea(noteInputEl);
        noteInputEl.addEventListener('input', () => autosizeTextarea(noteInputEl));
      }
      keep.addEventListener('click', () => {
        const input = editor.querySelector('.anno-input');
        const noteVal = input ? input.value : '';
        if (typeof index === 'number' && index >= 0) {
          annotations[index].note = noteVal;
          ensureAnnotationKey(annotations[index]);
          const key = getAnnotationFieldKey(annotations[index]);
          if (key) reindexFieldLinks(key);
        } else {
          const nextAnno = { start: annotation.start, end: annotation.end, text: annotation.text, note: noteVal };
          ensureAnnotationKey(nextAnno);
          annotations.push(nextAnno);
        }
        syncLinksToState();
        editor.remove();
        renderAnnotations();
      });
      del.addEventListener('click', () => { editor.remove(); if (typeof index === 'number' && index >= 0) { annotations.splice(index, 1); renderAnnotations(); } });
    }

    function refreshFromNode(nextNode) {
      if (!nextNode) return;
      annotations = Array.isArray(nextNode.annotations) ? nextNode.annotations.slice() : [];
      annotations.forEach(ensureAnnotationKey);
      links = Array.isArray(nextNode.links) ? nextNode.links.map(normalizeLink).filter(Boolean) : [];
      syncLinksToState();
      renderAnnotations();
      renderAnnotatedBody();
    }

    function collect() {
      const comments = Array.from(formContainer.querySelectorAll('#comment-list .note-item')).map(n => ({ source: n.querySelector('.c-source').value, content: n.querySelector('.c-content').value })).filter(c => c.source || c.content);
      const subEl = formContainer.querySelector('#f-sub');
      const sub2El = formContainer.querySelector('#f-sub2');
      return {
        fields: {
          title: formContainer.querySelector('#f-name').value,
          author: formContainer.querySelector('#f-author').value,
          origin: formContainer.querySelector('#f-source').value,
          form: formContainer.querySelector('#f-form').value,
          sub: subEl ? subEl.value : undefined,
          sub2: sub2El ? sub2El.value : undefined,
          rhyme: formContainer.querySelector('#f-rhyme').value
        },
        content: formContainer.querySelector('#f-body').value,
        annotations,
        links: links.map(l => ({
          start: l.start,
          end: l.end,
          text: l.text,
          targetId: l.targetId,
          targetName: l.targetName,
          targetType: l.targetType,
          placeholder: !!l.placeholder,
        })),
        extra: {
          translation: formContainer.querySelector('#f-translation').value,
          background: formContainer.querySelector('#f-background').value,
          evaluation: comments
        }
      };
    }
    return { collect, refresh: refreshFromNode };
  }
  function renderAnthology(node) {
    // 使用简单的字段布局（与诗词相同的样式）— 无部分卡片
    const name = node ? node.fields?.title || node.fields?.name || '' : '';
    const author = node ? node.fields?.author || '' : '';
    const worksText = Array.isArray(node?.fields?.works) ? node.fields.works.join('、') : (node?.fields?.works || '');
    const overview = node ? node.extra?.overview || '' : '';
    const background = node ? node.extra?.background || '' : '';
    // evaluation 是 {source, content} 的数组
    let evaluation = node ? node.extra?.evaluation || [] : [];
    if (isNew && (!Array.isArray(evaluation) || evaluation.length === 0)) evaluation = [{ source: '', content: '' }];

    formContainer.innerHTML = `
        <div class="grid-2">
          <div class="field"><label>文集</label><input id="f-name" type="text" data-link-field="fields.title" value="${escapeHtml(name)}"></div>
          <div class="field"><label>作者</label><input id="f-author" type="text" data-link-field="fields.author" value="${escapeHtml(author)}"></div>
        </div>
        <div class="field"><label>概述</label><textarea id="f-overview" rows="1" data-link-field="extra.overview" style="width:100%;resize:none;overflow:hidden">${escapeHtml(overview)}</textarea></div>
        <div class="field"><label>包含作品</label><input id="f-works" type="text" data-link-field="fields.works" value="${escapeHtml(worksText)}"></div>
        <div class="field"><label>创作背景</label><textarea id="f-background" rows="1" data-link-field="extra.background" style="width:100%;resize:none;overflow:hidden">${escapeHtml(background)}</textarea></div>
        <div class="field"><label>评价 <button id="addEval" class="btn small add-row">添加</button></label>
          <div id="evalList" class="note-list"></div>
        </div>
      `;

    initializeLinkFields(formContainer);

    const overviewEl = formContainer.querySelector('#f-overview');
    const worksInput = formContainer.querySelector('#f-works');
    const evalList = formContainer.querySelector('#evalList');
    const addEvalBtn = formContainer.querySelector('#addEval');

    const evalRenderOpts = { wrapperClass: 'ordered-item note-item', inputClass1: 'c-source', inputClass2: 'c-content', linkFieldPrefix: 'extra.evaluation', onChange: (arr) => { }, paragraphCheck2: true };
    const renderEvalsWrapper = () => {
      renderInlinePairs(evalList, evaluation, 'source', 'content', '出处', '内容', evalRenderOpts);
    };
    renderEvalsWrapper();
    addEvalBtn && addEvalBtn.addEventListener('click', () => { evaluation.push({ source: '', content: '' }); renderEvalsWrapper(); try { if (typeof addLinkButtons === 'function') addLinkButtons(); } catch (e) { } });

    // autosize anthology background textarea
    try {
      const autoResize = (el) => {
        if (!el) return;
        autosizeTextarea(el);
        try { if (el.__autosizeHandler) el.removeEventListener('input', el.__autosizeHandler); } catch (e) { }
        el.__autosizeHandler = () => autosizeTextarea(el);
        el.addEventListener('input', el.__autosizeHandler);
      };
      autoResize(overviewEl);
      autoResize(formContainer.querySelector('#f-background'));
    } catch (e) { }

    function collect() {
      const worksRaw = (worksInput?.value || '').replace(/[，,；;、]/g, '\n');
      const worksList = splitMultilineText(worksRaw);
      const fields = { title: (formContainer.querySelector('#f-name') || {}).value || '', author: (formContainer.querySelector('#f-author') || {}).value || '', works: worksList };
      const extra = {
        overview: (overviewEl || {}).value || '',
        background: (formContainer.querySelector('#f-background') || {}).value || '',
        evaluation: Array.from(evalList.querySelectorAll('.note-item')).map(div => { const s = div.querySelector('.c-source'); const c = div.querySelector('.c-content'); return { source: s ? s.value : '', content: c ? c.value : '' }; })
      };
      return { fields, extra };
    }
    return { collect };
  }


  function renderPerson(node) {
    // 简化的、基于表单的渲染器，以匹配renderPoem / renderAnthology风格
    const common = node ? node.fields?.common || '' : '';
    const name = node ? node.fields?.name || node.fields?.title || '' : '';
    const period = node ? node.fields?.period || '' : '';
    const life = node ? node.fields?.life || '' : '';
    const hometown = node ? node.fields?.hometown || '' : '';
    const courtesy = node ? node.fields?.courtesy || '' : '';
    const pseudonym = node ? node.fields?.pseudonym || '' : '';
    const posthumous = node ? node.fields?.posthumous || '' : '';
    const aliases = node ? node.fields?.aliases || '' : '';
    const school = node ? node.fields?.school || '' : '';
    // joint 可能是遗留字符串或对对象的数组；标准化为数组
    let joint = node ? (Array.isArray(node.fields?.joint) ? node.fields.joint : (node.fields?.joint ? [{ 合称: node.fields.joint, '其他人物': '' }] : [])) : [];
    const repWorksText = Array.isArray(node?.fields?.repWorks) ? node.fields.repWorks.join('、') : (node?.fields?.repWorks || '');
    const anthosText = Array.isArray(node?.fields?.anthos) ? node.fields.anthos.join('、') : (node?.fields?.anthos || '');
    // relations/chrono/evaluation/relatedE 是对列表结构；使用let以便修改它们
    let relations = node ? node.fields?.relations || [] : [];
    let chrono = node ? node.fields?.chrono || [] : [];
    const achievements = node ? node.extra?.achievements || '' : '';
    let evaluation = node ? node.extra?.evaluation || [] : [];
    let relatedE = node ? node.fields?.relatedE || [] : [];

    if (isNew) {
      if (!Array.isArray(joint) || joint.length === 0) joint = [{ 合称: '', '其他人物': '' }];
      if (!Array.isArray(relations) || relations.length === 0) relations = [{ 人物: '', 关系: '' }];
      if (!Array.isArray(chrono) || chrono.length === 0) chrono = [{ 纪年: '', 事件: '' }];
      if (!Array.isArray(evaluation) || evaluation.length === 0) evaluation = [{ 出处: '', 内容: '' }];
      if (!Array.isArray(relatedE) || relatedE.length === 0) relatedE = [{ 典故名: '', 内容: '' }];
    }

    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>通用名</label><input id="f-common" type="text" data-link-field="fields.common" value="${escapeHtml(common)}"></div>
        <div class="field"><label>姓（氏）名</label><input id="f-name" type="text" data-link-field="fields.name" value="${escapeHtml(name)}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>时期</label><input id="f-period" type="text" data-link-field="fields.period" value="${escapeHtml(period)}"></div>
        <div class="field"><label>籍贯</label><input id="f-hometown" type="text" data-link-field="fields.hometown" value="${escapeHtml(hometown)}"></div>
      </div>
      <div class="field"><label>生卒</label><input id="f-life" type="text" data-link-field="fields.life" value="${escapeHtml(life)}"></div>
      <div class="grid-3">
        <div class="field"><label>字</label><input id="f-courtesy" type="text" data-link-field="fields.courtesy" value="${escapeHtml(courtesy)}"></div>
        <div class="field"><label>号</label><input id="f-pseudonym" type="text" data-link-field="fields.pseudonym" value="${escapeHtml(pseudonym)}"></div>
        <div class="field"><label>谥号</label><input id="f-posthumous" type="text" data-link-field="fields.posthumous" value="${escapeHtml(posthumous)}"></div>
      </div>  
      <div class="field"><label>别称</label><input id="f-aliases" type="text" data-link-field="fields.aliases" value="${escapeHtml(aliases)}"></div>
      <div class="field"><label>合称 <button id="addJoint" class="btn small add-row">添加</button></label><div id="jointList" class="ordered-list"></div></div>
      <div class="grid-3">
        <div class="field"><label>流派</label><input id="f-school" type="text" data-link-field="fields.school" value="${escapeHtml(school)}"></div>
        <div class="field"><label>代表作</label><input id="f-repWorks" type="text" data-link-field="fields.repWorks" value="${escapeHtml(repWorksText)}"></div>
        <div class="field"><label>文集</label><input id="f-anthos" type="text" data-link-field="fields.anthos" value="${escapeHtml(anthosText)}"></div>
      </div>  
      <div class="field"><label>人物关系 <button id="addRel" class="btn small add-row">添加</button></label><div id="relations" class="ordered-list"></div></div>
      <div class="field"><label>大事年表 <button id="addChrono" class="btn small add-row">添加</button></label><div id="chrono" class="ordered-list"></div></div>
      <div class="field"><label>成就与影响</label><textarea id="f-achievements" rows="1" data-link-field="extra.achievements" style="width:100%;resize:none;overflow:hidden">${escapeHtml(achievements)}</textarea></div>
      <div class="field"><label>评价 <button id="addEval" class="btn small add-row">添加</button></label><div id="evalList" class="ordered-list"></div></div>
      <div class="field"><label>相关典故 <button id="addE" class="btn small add-row">添加</button></label><div id="relatedE" class="ordered-list"></div></div>
    `;

    initializeLinkFields(formContainer);

    const repWorksInput = formContainer.querySelector('#f-repWorks');
    const anthosInput = formContainer.querySelector('#f-anthos');
    const relationsEl = formContainer.querySelector('#relations');
    const chronoEl = formContainer.querySelector('#chrono');
    const jointEl = formContainer.querySelector('#jointList');
    const evalList = formContainer.querySelector('#evalList');
    const relatedEl = formContainer.querySelector('#relatedE');
    const addRelBtn = formContainer.querySelector('#addRel');
    const addChronoBtn = formContainer.querySelector('#addChrono');
    const addJointBtn = formContainer.querySelector('#addJoint');
    const addEvalBtn = formContainer.querySelector('#addEval');
    const addEBtn = formContainer.querySelector('#addE');

    // autosize multiline text areas (achievements)
    try {
      const target = formContainer.querySelector('#f-achievements');
      if (target) {
        autosizeTextarea(target);
        try { if (target.__autosizeHandler) target.removeEventListener('input', target.__autosizeHandler); } catch (e) { }
        target.__autosizeHandler = () => autosizeTextarea(target);
        target.addEventListener('input', target.__autosizeHandler);
      }
    } catch (e) { }

    // 为简单列表和对使用通用渲染器
    const renderRelations = () => renderInlinePairs(relationsEl, relations, '人物', '关系', '人物', '关系', {
      linkFieldPrefix: 'fields.relations',
      onChange: (arr) => { },
      deckColumns: 2,
      containerClass: 'relation-grid',
      wrapperClass: 'ordered-item relation-inline'
    });
    const renderChrono = () => renderInlinePairs(chronoEl, chrono, '纪年', '事件', '纪年', '事件', { linkFieldPrefix: 'fields.chrono', onChange: (arr) => { }, paragraphCheck2: true });
    const renderJoint = () => renderInlinePairs(jointEl, joint, '合称', '其他人物', '合称', '其他人物', {
      linkFieldPrefix: 'fields.joint',
      onChange: (arr) => { },
      deckColumns: 2,
      containerClass: 'relation-grid',
      wrapperClass: 'ordered-item relation-inline'
    });
    const renderEvalList = () => renderInlinePairs(evalList, evaluation, '出处', '内容', '出处', '内容', { linkFieldPrefix: 'extra.evaluation', onChange: (arr) => { }, paragraphCheck2: true });
    const renderRelated = () => renderInlinePairs(relatedEl, relatedE, '典故名', '内容', '典故', '内容', { linkFieldPrefix: 'fields.relatedE', onChange: (arr) => { }, paragraphCheck2: true });

    renderRelations();
    renderChrono();
    renderJoint();
    renderEvalList();
    renderRelated();

    addRelBtn && addRelBtn.addEventListener('click', () => { relations.push({ 人物: '', 关系: '' }); renderRelations(); });
    addChronoBtn && addChronoBtn.addEventListener('click', () => { chrono.push({ 纪年: '', 事件: '' }); renderChrono(); });
    addJointBtn && addJointBtn.addEventListener('click', () => { joint.push({ 合称: '', 其他人物: '' }); renderJoint(); });
    addEvalBtn && addEvalBtn.addEventListener('click', () => { evaluation.push({ 出处: '', 内容: '' }); renderEvalList(); });
    addEBtn && addEBtn.addEventListener('click', () => { relatedE.push({ 典故名: '', 内容: '' }); renderRelated(); });

    function collect() {
      const repWorksRaw = (repWorksInput?.value || '').replace(/[，,；;、]/g, '\n');
      const repWorksList = splitMultilineText(repWorksRaw);
      const anthosRaw = (anthosInput?.value || '').replace(/[，,；;、]/g, '\n');
      const anthosList = splitMultilineText(anthosRaw);
      const fields = {
        common: (formContainer.querySelector('#f-common') || {}).value || '',
        name: (formContainer.querySelector('#f-name') || {}).value || '',
        period: (formContainer.querySelector('#f-period') || {}).value || '',
        life: (formContainer.querySelector('#f-life') || {}).value || '',
        hometown: (formContainer.querySelector('#f-hometown') || {}).value || '',
        courtesy: (formContainer.querySelector('#f-courtesy') || {}).value || '',
        pseudonym: (formContainer.querySelector('#f-pseudonym') || {}).value || '',
        posthumous: (formContainer.querySelector('#f-posthumous') || {}).value || '',
        aliases: (formContainer.querySelector('#f-aliases') || {}).value || '',
        joint: Array.from((jointEl || { querySelectorAll: () => [] }).querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 合称: i[0].value, 其他人物: i[1].value }; }),
        school: (formContainer.querySelector('#f-school') || {}).value || '',
        repWorks: repWorksList,
        anthos: anthosList,
        relations: Array.from(relationsEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 人物: i[0].value, 关系: i[1].value }; }),
        chrono: Array.from(chronoEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 纪年: i[0].value, 事件: i[1].value }; }),
        relatedE: Array.from(relatedEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 典故名: i[0].value, 内容: i[1].value }; })
      };
      const extra = { achievements: (formContainer.querySelector('#f-achievements') || {}).value || '', evaluation: Array.from(evalList.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 出处: i[0].value, 内容: i[1].value }; }) };
      return { fields, extra };
    }
    return { collect };
  }

  function renderAllusion(node) {
    // 简洁布局（表述/解释/出处/涉及人物/示例）
    const statement = node ? node.fields?.statement || '' : '';
    const otherStatement = node ? (node.fields?.otherStatement || (Array.isArray(node.fields?.otherStatements) ? node.fields.otherStatements[0] : '')) : '';
    const explanation = node ? node.extra?.explanation || node.extra?.explain || '' : '';
    const usage = node ? node.extra?.usage || '' : '';
    const origin = node ? node.extra?.origin || '' : '';
    // 渲染器使用的persons/examples；使其可变（允许空数组）
    const personsText = Array.isArray(node?.fields?.persons) ? node.fields.persons.join('、') : (node?.fields?.persons || '');
    let examples = node ? node.fields?.examples || [] : [];
    if (isNew) {
      if (!Array.isArray(examples) || examples.length === 0) examples = [{ 出处: '', 内容: '' }];
    }

    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>表述</label><input id="f-statement" type="text" data-link-field="fields.statement" value="${escapeHtml(statement)}"></div>
        <div class="field"><label>其他表述</label><input id="f-other-statement" type="text" data-link-field="fields.otherStatement" value="${escapeHtml(otherStatement)}"></div>
      </div> 
      <div class="field"><label>解释</label><textarea id="f-explanation" rows="1" data-link-field="extra.explanation" style="width:100%;resize:none;overflow:hidden">${escapeHtml(explanation)}</textarea></div>
      <div class="field"><label>用法</label><textarea id="f-usage" rows="1" data-link-field="extra.usage" style="width:100%;resize:none;overflow:hidden">${escapeHtml(usage)}</textarea></div>
      <div class="field"><label>出处</label><textarea id="f-origin" rows="1" data-link-field="extra.origin" style="width:100%;resize:none;overflow:hidden">${escapeHtml(origin)}</textarea></div>
      <div class="field"><label>涉及人物</label><input id="f-persons" type="text" data-link-field="fields.persons" value="${escapeHtml(personsText)}"></div>
      <div class="field"><label>示例 <button id="addEx" class="btn small add-row">添加</button></label><div id="examples" class="ordered-list"></div></div>
    `;

    initializeLinkFields(formContainer);

    const usageInput = formContainer.querySelector('#f-usage');
    const personsInput = formContainer.querySelector('#f-persons');
    const examplesEl = formContainer.querySelector('#examples');
    const addExBtn = formContainer.querySelector('#addEx');
    const renderExamplesWrapper = () => renderInlinePairs(examplesEl, examples, '出处', '内容', '出处', '内容', { wrapperClass: 'ordered-item', linkFieldPrefix: 'fields.examples', onChange: (arr) => { }, paragraphCheck2: true });
    renderExamplesWrapper();
    // autosize explanation and origin textareas for allusion
    try { const exTa = formContainer.querySelector('#f-explanation'); if (exTa) { autosizeTextarea(exTa); try { if (exTa.__autosizeHandler) exTa.removeEventListener('input', exTa.__autosizeHandler); } catch (e) { } exTa.__autosizeHandler = () => autosizeTextarea(exTa); exTa.addEventListener('input', exTa.__autosizeHandler); } } catch (e) { }
    try { if (usageInput) { autosizeTextarea(usageInput); try { if (usageInput.__autosizeHandler) usageInput.removeEventListener('input', usageInput.__autosizeHandler); } catch (e) { } usageInput.__autosizeHandler = () => autosizeTextarea(usageInput); usageInput.addEventListener('input', usageInput.__autosizeHandler); } } catch (e) { }
    try { const oriTa = formContainer.querySelector('#f-origin'); if (oriTa) { autosizeTextarea(oriTa); try { if (oriTa.__autosizeHandler) oriTa.removeEventListener('input', oriTa.__autosizeHandler); } catch (e) { } oriTa.__autosizeHandler = () => autosizeTextarea(oriTa); oriTa.addEventListener('input', oriTa.__autosizeHandler); } } catch (e) { }
    addExBtn && addExBtn.addEventListener('click', () => { examples.push({ 出处: '', 内容: '' }); renderExamplesWrapper(); });


    function collect() {
      const personsRaw = (personsInput?.value || '').replace(/[，,；;]/g, '\n');
      const personsList = splitMultilineText(personsRaw);
      const fields = { statement: (formContainer.querySelector('#f-statement') || {}).value || '', otherStatement: (formContainer.querySelector('#f-other-statement') || {}).value || '', persons: personsList, examples: Array.from(examplesEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 出处: i[0].value, 内容: i[1].value }; }) };
      const extra = {
        explanation: (formContainer.querySelector('#f-explanation') || {}).value || '',
        usage: (formContainer.querySelector('#f-usage') || {}).value || '',
        origin: (formContainer.querySelector('#f-origin') || {}).value || ''
      };
      return { fields, extra };
    }
    return { collect };
  }

  function renderNatureEntry(node) {
    const commonName = node ? node.fields?.commonName || '' : '';
    const statement = node ? node.fields?.statement || '' : '';
    const scientificName = node ? node.fields?.scientificName || '' : '';
    const family = node ? node.fields?.family || '' : '';
    const genus = node ? node.fields?.genus || '' : '';
    let imagePath = node ? (node.extra?.image || '') : '';
    const basePath = (window.Poem && typeof window.Poem.base === 'function') ? window.Poem.base() : '';
    const toImageSrc = (path) => path ? `${basePath}${path}` : '';
    const introduction = node ? (node.extra?.introduction || node.extra?.explanation || '') : '';
    const sameImagery = node ? (node.extra?.sameImagery || '') : '';
    let examples = node ? node.fields?.examples || [] : [];
    if (!Array.isArray(examples) || examples.length === 0) examples = [{ 出处: '', 内容: '' }];

    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>通用名</label><input id="f-common-name" type="text" data-link-field="fields.commonName" value="${escapeHtml(commonName)}"></div>
        <div class="field"><label>表述</label><input id="f-statement" type="text" data-link-field="fields.statement" value="${escapeHtml(statement)}"></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>学名</label><input id="f-scientific-name" type="text" data-link-field="fields.scientificName" class="skip-self-check" value="${escapeHtml(scientificName)}"></div>
        <div class="field"><label>科</label><input id="f-family" type="text" data-link-field="fields.family" value="${escapeHtml(family)}"></div>
        <div class="field"><label>属</label><input id="f-genus" type="text" data-link-field="fields.genus" value="${escapeHtml(genus)}"></div>
      </div>
      <div class="field"><label>介绍</label><textarea id="f-introduction" rows="1" data-link-field="extra.introduction" style="width:100%;resize:none;overflow:hidden">${escapeHtml(introduction)}</textarea></div>
      <div class="field"><label>意象</label><textarea id="f-same-imagery" rows="1" data-link-field="extra.sameImagery" style="width:100%;resize:none;overflow:hidden">${escapeHtml(sameImagery)}</textarea></div>
      <div class="field nature-image-field">
        <div class="label-row">
          <label>图片</label>
          <div class="image-actions">
            <button id="uploadNatureImage" type="button" class="btn small">上传图片</button>
            <button id="clearNatureImage" type="button" class="btn small" ${imagePath ? '' : 'disabled'}>移除</button>
          </div>
        </div>
        <div class="image-note muted">备注：支持 PNG/JPG/WebP/GIF，最大 5MB</div>
        <div id="natureImageBlock" class="image-upload-block">
          <div id="natureImagePreview" class="image-preview">${imagePath ? `<img data-src="${escapeHtml(toImageSrc(imagePath))}" alt="图片预览" loading="lazy">` : '<div class="muted">暂无图片</div>'}</div>
          <input id="natureImageInput" type="file" accept="image/*" style="display:none">
        </div>
      </div>
      <div class="field"><label>示例 <button id="addEx" class="btn small add-row">添加</button></label><div id="examples" class="ordered-list"></div></div>
    `;

    initializeLinkFields(formContainer);

    const introInput = formContainer.querySelector('#f-introduction');
    const sameImageryInput = formContainer.querySelector('#f-same-imagery');
    const imageBlock = formContainer.querySelector('#natureImageBlock');
    const imagePreview = formContainer.querySelector('#natureImagePreview');
    const uploadBtn = formContainer.querySelector('#uploadNatureImage');
    const clearBtn = formContainer.querySelector('#clearNatureImage');
    const fileInput = formContainer.querySelector('#natureImageInput');
    const examplesEl = formContainer.querySelector('#examples');
    const addExBtn = formContainer.querySelector('#addEx');
    const renderExamplesWrapper = () => renderInlinePairs(examplesEl, examples, '出处', '内容', '出处', '内容', { wrapperClass: 'ordered-item', linkFieldPrefix: 'fields.examples', onChange: (arr) => { }, paragraphCheck2: true });
    renderExamplesWrapper();

    try {
      if (introInput) {
        autosizeTextarea(introInput);
        try { if (introInput.__autosizeHandler) introInput.removeEventListener('input', introInput.__autosizeHandler); } catch (e) { }
        introInput.__autosizeHandler = () => autosizeTextarea(introInput);
        introInput.addEventListener('input', introInput.__autosizeHandler);
      }
      if (sameImageryInput) {
        autosizeTextarea(sameImageryInput);
        try { if (sameImageryInput.__autosizeHandler) sameImageryInput.removeEventListener('input', sameImageryInput.__autosizeHandler); } catch (e) { }
        sameImageryInput.__autosizeHandler = () => autosizeTextarea(sameImageryInput);
        sameImageryInput.addEventListener('input', sameImageryInput.__autosizeHandler);
      }
    } catch (e) { }

    addExBtn && addExBtn.addEventListener('click', () => {
      examples.push({ 出处: '', 内容: '' });
      renderExamplesWrapper();
    });

    // 延迟加载图片：仅在预览节点可见时设置 img.src
    try {
      const previewImg = imagePreview && imagePreview.querySelector('img[data-src]');
      if (previewImg) {
        const setSrc = () => {
          if (!previewImg.getAttribute('src')) previewImg.setAttribute('src', previewImg.getAttribute('data-src'));
        };
        if ('IntersectionObserver' in window) {
          const io = new IntersectionObserver((entries) => {
            entries.forEach(en => { if (en.isIntersecting) { setSrc(); io.disconnect(); } });
          });
          io.observe(previewImg);
        } else {
          // 回退：如果不支持 IntersectionObserver，稍后设定 src
          window.requestAnimationFrame(setSrc);
        }
      }
    } catch (e) { }

    function updateImagePreview() {
      if (!imagePreview) return;
      if (imagePath) {
        imagePreview.innerHTML = `<img src="${escapeHtml(toImageSrc(imagePath))}" alt="图片预览">`;
      } else {
        imagePreview.innerHTML = '<div class="muted">暂无图片</div>';
      }
      if (clearBtn) clearBtn.disabled = !imagePath || !state.editable;
    }
    updateImagePreview();

    function ensureEditableStates() {
      const allowUpload = !!state.editable;
      if (uploadBtn) {
        uploadBtn.disabled = !allowUpload;
        uploadBtn.title = allowUpload ? '' : '当前处于只读模式';
      }
      if (clearBtn) clearBtn.disabled = !state.editable || !imagePath;
    }
    ensureEditableStates();

    uploadBtn && uploadBtn.addEventListener('click', () => {
      if (!state.editable) return;
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
    });

    clearBtn && clearBtn.addEventListener('click', () => {
      if (!state.editable) return;
      imagePath = '';
      if (state.node) {
        state.node.extra = state.node.extra || {};
        state.node.extra.image = '';
      }
      updateImagePreview();
      ensureEditableStates();
    });

    fileInput && fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        Poem.toast('图片大小需小于 5MB');
        fileInput.value = '';
        return;
      }
      uploadImageFile(file);
    });

    async function uploadImageFile(file) {
      if (!state.editable) {
        Poem.toast('当前为只读模式，无法上传');
        return;
      }
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';
      }
      try {
        const formData = new FormData();
        formData.append('image', file);
        if (state.node && state.node.id) formData.append('nodeId', state.node.id);
        const resp = await fetch(`${Poem.base()}/api/upload/image`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        if (!resp.ok) {
          let errText = '上传失败';
          try { const err = await resp.json(); if (err && err.error) errText = err.error; } catch (e) { }
          throw new Error(errText);
        }
        const data = await resp.json();
        imagePath = data.path || '';
        if (state.node) {
          state.node.extra = state.node.extra || {};
          state.node.extra.image = imagePath;
        }
        updateImagePreview();
        ensureEditableStates();
        Poem.toast('图片已上传，记得保存');
      } catch (err) {
        console.error(err);
        Poem.toast(err.message || '上传失败');
      } finally {
        if (uploadBtn) {
          uploadBtn.textContent = '上传图片';
        }
        ensureEditableStates();
      }
    }

    function collect() {
      const fields = {
        commonName: (formContainer.querySelector('#f-common-name') || {}).value || '',
        statement: (formContainer.querySelector('#f-statement') || {}).value || '',
        scientificName: (formContainer.querySelector('#f-scientific-name') || {}).value || '',
        family: (formContainer.querySelector('#f-family') || {}).value || '',
        genus: (formContainer.querySelector('#f-genus') || {}).value || '',
        examples: examplesEl ? Array.from(examplesEl.querySelectorAll('.ordered-item')).map(div => {
          const inputs = div.querySelectorAll('input');
          return { 出处: inputs[0]?.value || '', 内容: inputs[1]?.value || '' };
        }) : []
      };
      const extra = {
        introduction: (formContainer.querySelector('#f-introduction') || {}).value || '',
        sameImagery: (formContainer.querySelector('#f-same-imagery') || {}).value || '',
        image: imagePath || ''
      };
      return { fields, extra };
    }
    return { collect };
  }

  function commonMetaToNode(node) {
    // Persist common/meta-like values into node.extra so they are sent with payload
    node.extra = node.extra || {};
    // keep createdBy/createdAt in meta for display, but extra stores other fields
    node.meta = node.meta || {};
    node.meta.createdBy = createdBy.value || node.meta.createdBy || '';
    node.meta.createdAt = createdAt.value || node.meta.createdAt || Poem.today();
    const expectedEl = document.getElementById('metaExpectedDuration');
    const reviewDurationEl = document.getElementById('metaReviewDuration');
    const reviewStatusInputs = Array.from(document.querySelectorAll('input[name="metaReviewStatus"]'));
    const canEditReview = !isOwner && isReviewerOrAdmin;
    if (canEditReview) {
      node.meta.reviewedBy = reviewedBy.value || node.meta.reviewedBy || '';
      node.meta.reviewedAt = reviewedAt.value || node.meta.reviewedAt || '';
      node.extra.reviewDuration = (reviewDurationEl || {}).value || node.extra.reviewDuration || '';
      const rs = reviewStatusInputs.find(i => i.checked);
      node.extra.reviewStatus = rs ? rs.value : (node.extra.reviewStatus || 'pending');
    } else {
      node.meta.reviewedBy = node.meta.reviewedBy || '';
      node.meta.reviewedAt = node.meta.reviewedAt || '';
      node.extra.reviewDuration = node.extra.reviewDuration || '';
      node.extra.reviewStatus = node.extra.reviewStatus || 'pending';
      // keep form radios in sync even when read-only
      reviewStatusInputs.forEach(r => { r.checked = (r.value === (node.extra.reviewStatus || 'pending')); });
    }
    // Extra fields
    node.extra.expectedDuration = (expectedEl || {}).value || node.extra.expectedDuration || '';
    const rp = Array.from(document.querySelectorAll('input[name="metaRepairStatus"]')).find(i => i.checked);
    node.extra.repairStatus = rp ? rp.value : (node.extra.repairStatus || 'unfinished');
    const remarkInput = document.getElementById('metaRemark');
    if (remarkInput) {
      // Allow reviewers to clear the remark field; do not fall back to the old value when empty
      node.extra.remark = remarkInput.value;
    } else if (node.extra.remark === undefined) {
      node.extra.remark = '';
    }
  }

  function setCommonMeta(node) {
    // Show full creator string including 学号 (e.g. 姓名(学号))
    createdBy.value = node.meta?.createdBy || '';
    createdAt.value = node.meta?.createdAt || '';
    // Show full reviewer string as stored
    reviewedBy.value = node.meta?.reviewedBy || '';
    reviewedAt.value = node.meta?.reviewedAt || '';
    // extra fields
    const ex = node.extra || {};
    const expEl = document.getElementById('metaExpectedDuration'); if (expEl) expEl.value = ex.expectedDuration || '';
    const revDurEl = document.getElementById('metaReviewDuration'); if (revDurEl) revDurEl.value = ex.reviewDuration || '';
    const remarkEl = document.getElementById('metaRemark'); if (remarkEl) { remarkEl.value = ex.remark || ''; autosizeTextarea(remarkEl); try { remarkEl.removeEventListener('input', remarkEl.__autosizeHandler); } catch (e) { } remarkEl.__autosizeHandler = () => autosizeTextarea(remarkEl); remarkEl.addEventListener('input', remarkEl.__autosizeHandler); }
    // review status radios
    const status = ex.reviewStatus || 'pending';
    Array.from(document.querySelectorAll('input[name="metaReviewStatus"]')).forEach(r => { r.checked = (r.value === status); });
    // repair status
    const repair = ex.repairStatus || 'unfinished';
    Array.from(document.querySelectorAll('input[name="metaRepairStatus"]')).forEach(r => { r.checked = (r.value === repair); });
    // show/hide repair field depending on status
    try { const rf = document.getElementById('metaRepairField'); if (rf) rf.style.display = (status === 'rejected') ? 'block' : 'none'; } catch (e) { }

    // review status change: show/hide repair status
    Array.from(document.querySelectorAll('input[name="metaReviewStatus"]')).forEach(r => r.addEventListener('change', () => {
      const rf = document.getElementById('metaRepairField'); if (!rf) return;
      if (document.querySelector('input[name="metaReviewStatus"]:checked')?.value === 'rejected') rf.style.display = 'block'; else {
        rf.style.display = 'none';
      }
      // apply permission after state changes
      try { if (typeof applyMetaPermissions === 'function') applyMetaPermissions(); } catch (e) { }
    }));

    // apply meta-level permissions
    try { if (typeof applyMetaPermissions === 'function') applyMetaPermissions(); } catch (e) { }
  }

  // Apply permissions: only reviewer/admin can edit reviewed* fields, review status and review duration
  function applyMetaPermissions() {
    const editable = !!state.editable;
    const allow = !!isReviewerOrAdmin;
    const allowReview = editable && allow && !isOwner;
    // controls that require reviewer/admin and cannot be used by the creator
    const controlsReviewer = [document.getElementById('reviewedBy'), document.getElementById('reviewedAt'), document.getElementById('metaReviewDuration')];
    controlsReviewer.forEach(c => { if (c) c.disabled = !allowReview; });
    //期望时长仅创建者可编辑
    const expectedEl = document.getElementById('metaExpectedDuration');
    if (expectedEl) expectedEl.disabled = !(editable && !!isOwner);
    if (acceptExpectedBtn) acceptExpectedBtn.disabled = !allowReview;
    // review status radios (reviewer only)
    Array.from(document.querySelectorAll('input[name="metaReviewStatus"]')).forEach(r => { r.disabled = !allowReview; });
    // repair radios: when review status is 'rejected' the repair status should be editable
    // by any user in edit mode; otherwise follow reviewer/admin permission.
    try {
      const currentReview = document.querySelector('input[name="metaReviewStatus"]:checked')?.value;
      const repairAllowed = !!(editable && (currentReview === 'rejected' ? true : (allow && !isOwner)));
      Array.from(document.querySelectorAll('input[name="metaRepairStatus"]')).forEach(r => { r.disabled = !repairAllowed; });
    } catch (e) { }
    // remark should only be editable in edit mode
    try {
      const remarkEl = document.getElementById('metaRemark'); if (remarkEl) remarkEl.disabled = !editable;
    } catch (e) { }
    // created date can be overridden only by admins while editing
    try {
      if (createdAt) {
        const allowCreatedAt = editable && isAdmin;
        createdAt.disabled = !allowCreatedAt;
        if ('readOnly' in createdAt) createdAt.readOnly = !allowCreatedAt;
      }
    } catch (e) { }
  }

  async function init() {
    if (isNew && !TYPES.includes(type)) { Poem.toast('缺少类型参数'); return; }

    // Get current user info for auto-filling
    let me = await Poem.me();
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
      // Auto-fill creator info for new nodes
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
      links = [];
      syncLinksToState();
      // new node => current user is effectively the owner for permission checks
      isOwner = true;
      showAllAnnotations = false;
      if (linkBtn) linkBtn.style.display = 'inline-block';
      setEditable(true);
    }
    else {
      const node = await Poem.api(`/api/node/${id}`);
      state.node = node;
      if (!Array.isArray(state.node.links)) state.node.links = [];
      links = state.node.links.map(normalizeLink).filter(Boolean);
      syncLinksToState();
      nodeIdEl.textContent = node.id;
      showAllAnnotations = false;
      // Only owner or reviewer/admin can edit
      isOwner = (node.meta?.createdById && node.meta.createdById === me?.id) || (node.meta?.createdBy && (node.meta.createdBy === (me?.real_name || me?.username)));
      const canEditAll = me && (me.role === 'reviewer' || me.role === 'admin');
      editBtn.style.display = (isOwner || canEditAll) ? 'inline-block' : 'none';
      saveBtn.style.display = (isOwner || canEditAll) ? 'inline-block' : 'none';
      if (linkBtn) linkBtn.style.display = (isOwner || canEditAll) ? 'inline-block' : 'none';
      reviewBtn.style.display = 'none';
    }

    setCommonMeta(state.node);
    // Clicking reviewer/time autofills reviewer name+ID and timestamp (when editable)
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

    // Draft autosave key
    let draftKey = isNew ? `poem_draft_new_${type}` : `poem_draft_${state.node.id || id}`;
    // If a draft exists for this node/type, offer to restore
    try {
      const draft = (window.Poem && typeof Poem.loadDraft === 'function') ? Poem.loadDraft(draftKey) : null;
      if (draft) {
        try {
          if (confirm('检测到本地自动保存的草稿，是否恢复？（取消则保留当前内容）')) {
            // merge draft into state.node before rendering
            state.node.fields = { ...(state.node.fields || {}), ...(draft.fields || {}) };
            if (draft.content !== undefined) state.node.content = draft.content;
            if (Array.isArray(draft.annotations)) state.node.annotations = draft.annotations;
            if (Array.isArray(draft.links)) state.node.links = draft.links;
            state.node.extra = { ...(state.node.extra || {}), ...(draft.extra || {}) };
            links = Array.isArray(state.node.links) ? state.node.links.map(normalizeLink).filter(Boolean) : [];
            syncLinksToState();
          }
        } catch (e) { }
      }
    } catch (e) { }

    let renderer;
    const t = isNew ? type : state.node.type;
    const backListTarget = returnQuery ? `list.html?${returnQuery}` : `list.html${t ? `?type=${t}` : ''}`;
    const backAllTarget = (returnQuery && /(^|&)type=A(&|$)/.test(returnQuery)) ? `list.html?${returnQuery}` : 'list.html?type=A';
    if (t === 'W') renderer = renderPoem(state.node);
    else if (t === 'G') renderer = renderAnthology(state.node);
    else if (t === 'C') renderer = renderPerson(state.node);
    else if (t === 'E') renderer = renderAllusion(state.node);
    else if (t === 'S') renderer = renderNatureEntry(state.node);
    else { formContainer.innerHTML = '<div class="section-card">未知类型</div>'; }

    // Ensure editable state is applied after renderer populates the formContainer
    // (previously setEditable(false) was called before rendering which left inputs enabled)
    setEditable(isNew ? true : false);

    function saveNode(opts) {
      const options = opts || {};
      const silent = !!options.silent;
      const skipToast = !!options.skipToast;
      if (saveInFlight) {
        if (!silent && !skipToast) Poem.toast('正在保存，请稍候…');
        return currentSavePromise || Promise.resolve(false);
      }
      saveInFlight = true;
      refreshActionButtons();
      currentSavePromise = (async () => {
        try {
          const collected = renderer?.collect?.() || {};
          // collect common/meta inputs into node.extra, then merge into payload.extra
          try { commonMetaToNode(state.node); } catch (e) { }
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
          if (Object.keys(metaPayload).length) payload.meta = metaPayload;
          if (isNew) {
            const created = await Poem.api('/api/node', { method: 'POST', body: JSON.stringify({ type, data: payload }) });
            state.node = created;
            state.node.name = payloadName;
            nodeIdEl.textContent = created.id; setEditable(false);
            const previousDraftKey = draftKey;
            isNew = false;
            draftKey = `poem_draft_${created.id}`;
            if (!silent && !skipToast) Poem.toast('已保存');
            try { renderer?.refresh?.(state.node); } catch (e) { }
            const returnSuffix = returnQuery ? `&return=${encodeURIComponent(returnQuery)}` : '';
            history.replaceState(null, '', `editor.html?id=${created.id}${returnSuffix}`);
            try {
              if (window.Poem && typeof Poem.clearDraft === 'function') {
                if (previousDraftKey && previousDraftKey !== draftKey) Poem.clearDraft(previousDraftKey);
                Poem.clearDraft(draftKey);
              }
            } catch (e) { }
          } else {
            const wantsReview = !isOwner && isReviewerOrAdmin && !!(state.node.meta?.reviewedBy || state.node.meta?.reviewedAt);
            if (wantsReview) payload._review = true;
            const apiPath = `/api/node/${state.node.id}${wantsReview ? '?review=1' : ''}`;
            const updated = await Poem.api(apiPath, { method: 'PUT', body: JSON.stringify(payload) });
            state.node = updated;
            state.node.name = payloadName;
            setEditable(false);
            if (!silent && !skipToast) Poem.toast(wantsReview ? '已审核并保存' : '已保存');
            try { renderer?.refresh?.(state.node); } catch (e) { }
            // refresh meta fields shown on the form
            try { setCommonMeta(state.node); } catch (e) { }
            try { if (window.Poem && typeof Poem.clearDraft === 'function') Poem.clearDraft(draftKey); } catch (e) { }
          }
          return true;
        } catch (err) {
          console.error(err);
          Poem.toast('保存失败，请稍后重试');
          return false;
        } finally {
          saveInFlight = false;
          refreshActionButtons();
          currentSavePromise = null;
        }
      })();
      return currentSavePromise;
    }

    requestImmediateSave = async function (options) {
      const opts = options ? { ...options } : {};
      if (opts.silent === undefined) opts.silent = true;
      return saveNode(opts);
    };

    editBtn.onclick = () => setEditable(true);
    saveBtn.onclick = async () => { await saveNode(); };

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

    // Autosave: debounce input changes inside formContainer
    try {
      if (window.Poem && typeof Poem.saveDraft === 'function' && renderer && formContainer) {
        let autosaveTimer = null;
        const doSave = () => {
          try {
            const collected = renderer?.collect?.() || {};
            Poem.saveDraft(draftKey, collected);
          } catch (e) { }
        };
        formContainer.addEventListener('input', () => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(doSave, 800); });
        // also save on change events (selects)
        formContainer.addEventListener('change', () => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(doSave, 500); });
        window.addEventListener('beforeunload', doSave);
      }
    } catch (e) { }
  }

  init();
})();