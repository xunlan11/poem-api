(function (global) {
  const root = global;
  if (!root) return;
  root.PoemEditor = root.PoemEditor || {};

  root.PoemEditor.initLinking = function initLinking(options = {}) {
    const documentRef = options.document || root.document;
    const windowRef = options.window || root;
    const Poem = options.Poem || root.Poem;
    const formContainer = options.formContainer || documentRef?.getElementById?.('formContainer') || null;
    const linkBtn = options.linkBtn || documentRef?.getElementById?.('linkBtn') || null;
    const state = options.state || { editable: true, node: null };

    const links = Array.isArray(options.initialLinks) ? options.initialLinks.slice() : [];
    const linkFieldRegistry = new Map();
    const linkBrushHandlers = [];
    const editableWatchers = [];
    let linkBrushActive = false;
    let linkSaveChain = Promise.resolve();
    let requestImmediateSave = typeof options.requestImmediateSave === 'function' ? options.requestImmediateSave : null;
    let linkDelegationInstalled = false;

    function setRequestImmediateSave(fn) {
      requestImmediateSave = typeof fn === 'function' ? fn : null;
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
      try {
        linkFieldRegistry.forEach(spec => {
          if (typeof spec.renderDisplay === 'function') spec.renderDisplay();
        });
      } catch (e) { }
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
        const view = documentRef.createElement('div');
        view.className = 'link-field-display';
        view.style.display = 'none';
        view.dataset.linkField = fieldKey;
        view.tabIndex = 0;
        view.setAttribute('role', 'textbox');
        view.setAttribute('aria-readonly', 'true');
        if (element.classList.contains('pair-label')) view.classList.add('pair-label');
        if (element.classList.contains('pair-value')) view.classList.add('pair-value');
        if (element.classList && element.classList.length) {
          Array.from(element.classList).forEach(cls => {
            if (!cls || cls === 'read-mode' || cls === 'link-readonly') return;
            view.classList.add(cls);
          });
        }
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
      for (let i = links.length - 1; i >= 0; i -= 1) {
        const link = links[i];
        if (!link || link.field !== fieldKey) continue;
        if (!link.text) continue;
        const snippet = link.text;
        const approxStart = link.start || 0;
        const best = findBestLinkPosition(text, snippet, approxStart);
        if (best === -1) {
          links.splice(i, 1);
          changed = true;
          continue;
        }
        const start = Math.max(0, best);
        const end = Math.min(max, start + snippet.length);
        if (end <= start) {
          links.splice(i, 1);
          changed = true;
          continue;
        }
        const matchedText = text.slice(start, end);
        if (matchedText !== snippet) {
          links.splice(i, 1);
          changed = true;
          continue;
        }
        if (start !== link.start || end !== link.end) {
          link.start = start;
          link.end = end;
          changed = true;
        }
      }
      if (changed) {
        syncLinksToState();
        notifyLinksUpdated(fieldKey);
      }
    }

    function handleDelegatedLinkClick(event) {
      const span = event.target.closest('span[data-link-index]');
      if (!span) return;
      if (formContainer && !formContainer.contains(span)) return;
      const linkIdx = parseInt(span.getAttribute('data-link-index') || '-1', 10);
      if (Number.isNaN(linkIdx) || linkIdx < 0 || !links[linkIdx]) return;
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
          windowRef.open(url, '_blank', 'noopener');
        }
      }
    }

    function handleDelegatedLinkContextMenu(event) {
      const span = event.target.closest('span[data-link-index]');
      if (!span) return;
      if (formContainer && !formContainer.contains(span)) return;
      if (state.editable) return;
      const linkIdx = parseInt(span.getAttribute('data-link-index') || '-1', 10);
      if (Number.isNaN(linkIdx) || linkIdx < 0 || !links[linkIdx]) return;
      event.preventDefault();
      const info = links[linkIdx];
      const label = info.placeholder ? '空置' : (info.targetId || '');
      if (root.confirm && root.confirm(`移除与节点 ${label} 的链接？`)) {
        links.splice(linkIdx, 1);
        syncLinksToState();
        notifyLinksUpdated(info.field || 'content');
        persistLinks();
      }
    }

    function ensureLinkDelegation() {
      if (linkDelegationInstalled) return;
      linkDelegationInstalled = true;
      documentRef.addEventListener('click', handleDelegatedLinkClick);
      documentRef.addEventListener('contextmenu', handleDelegatedLinkContextMenu);
    }

    function findSpanForNode(rootNode, node) {
      let current = node;
      while (current && current !== rootNode) {
        if (current.nodeType === 1 && current.hasAttribute && current.hasAttribute('data-pos')) return current;
        current = current.parentNode;
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
      for (let i = 0; i < children.length; i += 1) {
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
        const empty = documentRef.createElement('span');
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
      const frag = documentRef.createDocumentFragment();
      const appendSegment = (start, end, linkRef) => {
        const clampedStart = Math.max(0, Math.min(max, start | 0));
        const clampedEnd = Math.max(clampedStart, Math.min(max, end | 0));
        if (clampedEnd <= clampedStart) return;
        const segment = text.slice(clampedStart, clampedEnd);
        const span = documentRef.createElement('span');
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
        const sel = windowRef.getSelection ? windowRef.getSelection() : null;
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
        if (Number.isNaN(startPos) || Number.isNaN(endPos) || endPos <= startPos) return;
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
      for (let i = links.length - 1; i >= 0; i -= 1) {
        const existing = links[i];
        if (!existing) {
          links.splice(i, 1);
          continue;
        }
        if (existing.field !== fieldKey) continue;
        if (Math.max(existing.start, next.start) < Math.min(existing.end, next.end)) {
          links.splice(i, 1);
        }
      }
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
          return;
        }
        try {
          await requestImmediateSave({ silent: true, reason: 'link', skipToast: true });
          if (Poem && typeof Poem.toast === 'function') Poem.toast('链接已保存');
        } catch (err) {
          console.error(err);
          if (Poem && typeof Poem.toast === 'function') Poem.toast('保存链接失败，请稍后重试');
        }
      }).catch(() => { });
    }

    function startLinkFlow(fieldKey, start, end, sample) {
      const spec = getFieldSpec(fieldKey);
      if (!spec) {
        if (Poem && typeof Poem.toast === 'function') Poem.toast('当前字段暂不支持链接');
        return;
      }
      const text = getFieldValue(fieldKey) || '';
      const s = Math.max(0, start | 0);
      const e = Math.max(s, end | 0);
      if (e <= s) {
        if (Poem && typeof Poem.toast === 'function') Poem.toast('请选择要链接的文本');
        return;
      }
      const snippet = sample || text.slice(s, e);
      if (!snippet.trim()) {
        if (Poem && typeof Poem.toast === 'function') Poem.toast('选中的文本为空');
        return;
      }
      if (!state.node || !state.node.id) {
        if (Poem && typeof Poem.toast === 'function') Poem.toast('请先保存该节点后再添加链接');
        return;
      }
      const picker = Poem && typeof Poem.openLinkPicker === 'function' ? Poem.openLinkPicker : null;
      if (!picker) return;
      picker((item) => {
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
        if (Poem && typeof Poem.toast === 'function') Poem.toast('请先保存该节点后再修改链接');
        return;
      }
      const picker = Poem && typeof Poem.openLinkPicker === 'function' ? Poem.openLinkPicker : null;
      if (!picker) return;
      picker((item) => {
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
      try {
        linkBrushHandlers.forEach(fn => { try { fn(linkBrushActive); } catch (e) { } });
      } catch (e) { }
      if (Poem && typeof Poem.toast === 'function') {
        Poem.toast(linkBrushActive ? '链接模式已开启：请选择文本后选择目标节点' : '链接模式已关闭');
      }
    }

    function applyEditableState(editable) {
      try { linkFieldRegistry.forEach(spec => setFieldEditableState(spec, editable)); } catch (e) { }
      if (linkBtn) {
        linkBtn.disabled = editable;
        if (editable) setLinkBrushActive(false);
      }
      try {
        editableWatchers.forEach(fn => { try { fn(editable); } catch (e) { } });
      } catch (e) { }
    }

    function replaceLinks(nextList) {
      links.length = 0;
      if (Array.isArray(nextList)) {
        nextList.forEach(item => {
          if (item) links.push(item);
        });
      }
      syncLinksToState();
    }

    if (linkBtn) {
      linkBtn.setAttribute('aria-pressed', 'false');
      linkBtn.addEventListener('click', () => {
        if (linkBtn.disabled) return;
        setLinkBrushActive(!linkBrushActive);
      });
    }

    documentRef.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && linkBrushActive) {
        event.stopPropagation();
        setLinkBrushActive(false);
      }
    }, true);

    ensureLinkDelegation();

    return {
      links,
      normalizeLink,
      syncLinksToState,
      registerLinkField,
      initializeLinkFields,
      notifyLinksUpdated,
      getFieldSpec,
      getFieldValue,
      cleanupLinkFieldSpec,
      setFieldEditableState,
      registerEditableWatcher,
      registerLinkBrushHandler,
      setLinkBrushActive,
      reindexFieldLinks,
      renderFieldDisplay,
      startLinkFlow,
      editExistingLink,
      persistLinks,
      replaceLinks,
      applyEditableState,
      setRequestImmediateSave,
      isLinkBrushActive: () => linkBrushActive,
      findSpanForNode,
      findBestLinkPosition,
      offsetWithinSpan,
    };
  };
})(typeof window !== 'undefined' ? window : this);
