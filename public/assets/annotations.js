(function (global) {
  const root = global;
  if (!root) return;
  root.PoemEditor = root.PoemEditor || {};
  root.PoemEditor.initAnnotations = function initAnnotations(options = {}) {
    const documentRef = options.document || root.document;
    const windowRef = options.window || root;
    const Poem = options.Poem || root.Poem;
    const state = options.state || { editable: true, node: null };
    const formContainer = options.formContainer || documentRef?.getElementById?.('formContainer') || null;
    const textarea = options.textarea || formContainer?.querySelector?.('#f-body') || null;
    const annoArea = options.annoArea || formContainer?.querySelector?.('#annotation-area') || null;
    const lockBtn = options.lockBtn || formContainer?.querySelector?.('#lock-body') || null;
    const unlockBtn = options.unlockBtn || formContainer?.querySelector?.('#unlock-body') || null;
    const escapeHtml = typeof options.escapeHtml === 'function' ? options.escapeHtml : (value => String(value || ''));
    const autosizeTextarea = typeof options.autosizeTextarea === 'function' ? options.autosizeTextarea : (() => { });
    const registerEditableWatcher = typeof options.registerEditableWatcher === 'function' ? options.registerEditableWatcher : (() => () => { });
    const registerLinkBrushHandler = typeof options.registerLinkBrushHandler === 'function' ? options.registerLinkBrushHandler : (() => () => { });
    const registerLinkField = options.linking && typeof options.linking.registerLinkField === 'function' ? options.linking.registerLinkField : (() => { });
    const reindexFieldLinks = options.linking && typeof options.linking.reindexFieldLinks === 'function' ? options.linking.reindexFieldLinks : (() => { });
    const renderFieldDisplay = options.linking && typeof options.linking.renderFieldDisplay === 'function' ? options.linking.renderFieldDisplay : (() => { });
    const getFieldSpec = options.linking && typeof options.linking.getFieldSpec === 'function' ? options.linking.getFieldSpec : (() => undefined);
    const cleanupLinkFieldSpec = options.linking && typeof options.linking.cleanupLinkFieldSpec === 'function' ? options.linking.cleanupLinkFieldSpec : (() => { });
    const startLinkFlow = options.linking && typeof options.linking.startLinkFlow === 'function' ? options.linking.startLinkFlow : (() => { });
    const editExistingLink = options.linking && typeof options.linking.editExistingLink === 'function' ? options.linking.editExistingLink : (() => { });
    const isLinkBrushActive = options.linking && typeof options.linking.isLinkBrushActive === 'function' ? options.linking.isLinkBrushActive : (() => false);
    const findSpanForNode = options.linking && typeof options.linking.findSpanForNode === 'function' ? options.linking.findSpanForNode : (() => null);
    const offsetWithinSpan = options.linking && typeof options.linking.offsetWithinSpan === 'function' ? options.linking.offsetWithinSpan : (() => 0);
    const syncLinksToState = options.linking && typeof options.linking.syncLinksToState === 'function' ? options.linking.syncLinksToState : (() => { });
    const replaceLinks = options.linking && typeof options.linking.replaceLinks === 'function' ? options.linking.replaceLinks : (() => { });
    const links = options.linking && Array.isArray(options.linking.links) ? options.linking.links : [];
    const MAX_VISIBLE = (typeof options.maxVisible === 'number' && options.maxVisible > 0) ? options.maxVisible : 5;
    const renderContainerId = options.renderContainerId || 'f-body-render';
    let annotationFieldMap = new Map();
    let annotations = [];

    function sanitizeAnnotations(list) {
      if (!Array.isArray(list)) return [];
      return list.filter(Boolean).map(item => {
        const next = {
          start: typeof item.start === 'number' ? item.start : 0,
          end: typeof item.end === 'number' ? item.end : (typeof item.start === 'number' ? item.start : 0),
          text: typeof item.text === 'string' ? item.text : '',
          note: typeof item.note === 'string' ? item.note : '',
          id: item.id,
          linkKey: item.linkKey,
        };
        if (item.meta) next.meta = item.meta;
        ensureAnnotationKey(next);
        return next;
      });
    }

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
      const rangePrefix = rangePart ? `${rangePart}-` : '';
      const uniqueTail = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      annotation.linkKey = `anno-${rangePrefix}${uniqueTail}`;
      return annotation.linkKey;
    }

    function getAnnotationFieldKey(annotation) {
      const key = ensureAnnotationKey(annotation);
      return key ? `annotations.${key}.note` : '';
    }

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
      if (!annoArea) return;
      annotationFieldMap = new Map();
      const depths = computeDepths(annotations);
      const annotated = annotations.map((a, i) => ({ a, idx: i, depth: depths[i] || 0 }));
      annotated.forEach(item => ensureAnnotationKey(item.a));
      annotated.sort((x, y) => {
        const sx = (x.a.start | 0);
        const sy = (y.a.start | 0);
        if (sx !== sy) return sx - sy;
        const ex = (x.a.end | 0);
        const ey = (y.a.end | 0);
        return ex - ey;
      });
      const total = annotated.length;
      const renderList = annotated;
      annoArea.textContent = '';
      annoArea.style.display = '';
      annoArea.appendChild(documentRef.createTextNode('注释：'));
      const list = documentRef.createElement('div');
      list.className = 'anno-list';
      annoArea.appendChild(list);
      if (renderList.length === 0) {
        const empty = documentRef.createElement('div');
        empty.className = 'muted';
        empty.textContent = '暂无注释';
        list.appendChild(empty);
      }
      renderList.forEach((item, dispIdx) => {
        const { a, idx, depth } = item;
        const depthClass = depth >= 2 ? 'annotation depth-3' : (depth >= 1 ? 'annotation depth-2' : 'annotation depth-1');
        const row = documentRef.createElement('div');
        row.dataset.idx = String(idx);
        row.className = `anno-row ${depthClass}`;
        if (a.note) row.title = a.note;
        const delBtn = documentRef.createElement('button');
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
            if (spec) cleanupLinkFieldSpec(spec);
            if (Array.isArray(links) && typeof replaceLinks === 'function') {
              const filtered = links.filter(link => (link.field || 'content') !== fieldKey);
              replaceLinks(filtered);
            }
          }
          renderAnnotations();
        });
        const editBtn = documentRef.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn small edit-anno';
        editBtn.textContent = '编辑';
        editBtn.disabled = !state.editable;
        editBtn.addEventListener('click', () => {
          if (!state.editable) return;
          const current = annotations[idx];
          if (current) showAnnotationEditor(current, idx);
        });
        const indexSpan = documentRef.createElement('span');
        indexSpan.className = 'anno-index';
        indexSpan.textContent = `${dispIdx + 1}.`;
        const actionsWrap = documentRef.createElement('div');
        actionsWrap.className = 'anno-actions';
        actionsWrap.appendChild(editBtn);
        actionsWrap.appendChild(delBtn);
        const textSpan = documentRef.createElement('span');
        textSpan.className = 'anno-text';
        textSpan.textContent = a.text || '';
        const noteDisplay = documentRef.createElement('div');
        noteDisplay.className = 'anno-note-display';
        noteDisplay.textContent = a.note || '';
        const mainWrap = documentRef.createElement('div');
        mainWrap.className = 'anno-main';
        mainWrap.appendChild(indexSpan);
        mainWrap.appendChild(textSpan);
        const arrowEl = documentRef.createElement('span');
        arrowEl.className = 'anno-arrow';
        arrowEl.textContent = '→';
        const noteWrap = documentRef.createElement('div');
        noteWrap.className = 'anno-note';
        noteWrap.appendChild(noteDisplay);
        row.appendChild(actionsWrap);
        row.appendChild(mainWrap);
        row.appendChild(arrowEl);
        row.appendChild(noteWrap);
        list.appendChild(row);
        const fieldKey = getAnnotationFieldKey(a);
        if (fieldKey && registerLinkField && documentRef) {
          const hidden = documentRef.createElement('textarea');
          hidden.style.display = 'none';
          hidden.value = a.note || '';
          hidden.dataset.linkField = fieldKey;
          hidden.dataset.checkParagraph = 'true';
          row.appendChild(hidden);
          annotationFieldMap.set(fieldKey, { hidden, noteDisplay });
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
        }
      });
      const renderDiv = formContainer ? formContainer.querySelector(`#${renderContainerId}`) : null;
      if (renderDiv) renderAnnotatedBody();
    }

    function findOrCreateRenderContainer() {
      if (!formContainer) return null;
      let renderDiv = formContainer.querySelector(`#${renderContainerId}`);
      if (!renderDiv) {
        renderDiv = documentRef.createElement('div');
        renderDiv.id = renderContainerId;
        renderDiv.style.padding = '8px';
        renderDiv.style.border = '1px solid #ddd';
        renderDiv.style.borderRadius = '6px';
        renderDiv.style.marginTop = '8px';
        renderDiv.style.background = '#fff';
        renderDiv.style.display = 'none';
        const bodyField = formContainer.querySelector('#f-body');
        if (bodyField && bodyField.parentNode) {
          bodyField.parentNode.insertBefore(renderDiv, bodyField.nextSibling);
        } else {
          formContainer.appendChild(renderDiv);
        }
      }
      return renderDiv;
    }

    function renderAnnotatedBody() {
      if (!textarea || !formContainer) return null;
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
        for (let pos = 0; pos < n; pos += 1) {
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
      const contentLinks = Array.isArray(links)
        ? links.map((link, idx) => ({ link, idx })).filter(item => item.link && (item.link.field || 'content') === 'content')
        : [];
      contentLinks.forEach(({ link, idx }) => {
        if (!link) return;
        const s = Math.max(0, link.start | 0);
        const e = Math.min(n, link.end | 0);
        if (e <= s) return;
        for (let i = s; i < e; i += 1) linkCover[i] = idx;
      });
      let html = '';
      let i = 0;
      while (i < n) {
        const depth = annotationDepth[i] || 0;
        const signature = annotationSignature[i] || '';
        const linkIdx = linkCover[i];
        let j = i + 1;
        while (j < n && (annotationDepth[j] || 0) === depth && linkCover[j] === linkIdx && (annotationSignature[j] || '') === signature) j += 1;
        const chunkRaw = text.slice(i, j);
        const chunk = escapeHtml(chunkRaw).replace(/\n/g, '<br>');
        const classes = [];
        if (depth > 0) {
          classes.push(depth >= 3 ? 'annotation depth-3' : (depth >= 2 ? 'annotation depth-2' : 'annotation depth-1'));
        }
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
      const renderDiv = findOrCreateRenderContainer();
      if (!renderDiv) return null;
      renderDiv.innerHTML = html || '<div class="muted">（空）</div>';
      renderDiv.querySelectorAll('span[data-pos]').forEach(sp => {
        const pos = +sp.dataset.pos;
        const tipParts = [];
        const overlapSig = sp.dataset.anno || annotationSignature[pos] || '';
        const overlapping = overlapSig ? overlapSig.split(',').map(idx => annotations[parseInt(idx, 10)]).filter(Boolean) : [];
        const annoTip = overlapping.map(a => a && a.note ? a.note : '').filter(t => t).join('\n');
        if (annoTip) tipParts.push(annoTip);
        const linkIdx = parseInt(sp.dataset.linkIndex || '-1', 10);
        if (Array.isArray(links) && linkIdx >= 0 && links[linkIdx]) {
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
      ensureAnnotatedBodyHandlers(renderDiv);
      return renderDiv;
    }

    function ensureAnnotatedBodyHandlers(renderDiv) {
      if (!renderDiv) return;
      if (!renderDiv.__clickDelegationAttached) {
        renderDiv.__clickDelegationAttached = true;
        renderDiv.addEventListener('click', annotatedBodyClickHandler);
      }
      if (!renderDiv.__selectionHandler) {
        renderDiv.__selectionHandler = true;
        renderDiv.addEventListener('mouseup', handleAnnotatedSelection);
      }
      if (!renderDiv.__contextMenuHandler) {
        renderDiv.__contextMenuHandler = true;
        renderDiv.addEventListener('contextmenu', annotatedBodyContextMenuHandler);
      }
    }

    function annotatedBodyClickHandler(event) {
      const renderDiv = event.currentTarget;
      const span = event.target.closest('span[data-pos]');
      if (!span || !renderDiv.contains(span)) return;
      if (!state.editable) return;
      if (isLinkBrushActive()) {
        const idx = parseInt(span.getAttribute('data-link-index') || '-1', 10);
        if (idx >= 0) {
          event.preventDefault();
          editExistingLink(idx);
        }
        return;
      }
      const sel = windowRef.getSelection ? windowRef.getSelection() : null;
      if (sel && !sel.isCollapsed) return;
      if (renderDiv.__lastSelectionAt && (Date.now() - renderDiv.__lastSelectionAt) < 600) {
        renderDiv.__lastSelectionAt = 0;
        return;
      }
      const pos = parseInt(span.getAttribute('data-pos') || '0', 10);
      if (Number.isNaN(pos)) return;
      const idx = annotations.findIndex(a => a.start <= pos && pos < a.end);
      if (idx >= 0) showAnnotationEditor(annotations[idx], idx);
    }

    function annotatedBodyContextMenuHandler(event) {
      const renderDiv = event.currentTarget;
      const span = event.target.closest('span[data-pos]');
      if (!span || !renderDiv.contains(span)) return;
      if (state.editable && textarea && !textarea.readOnly) return;
      const sig = span.getAttribute('data-anno') || '';
      if (!sig) return;
      const indices = sig.split(',').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n) && n >= 0);
      if (!indices.length) return;
      const targetIdx = indices[0];
      const target = annotations[targetIdx];
      if (!target) return;
      event.preventDefault();
      const label = target.text || target.note || '';
      if (root.confirm && root.confirm(`移除注释 ${label} ？`)) {
        const fieldKey = getAnnotationFieldKey(target);
        const spec = fieldKey ? getFieldSpec(fieldKey) : null;
        annotations.splice(targetIdx, 1);
        if (fieldKey) {
          if (spec) cleanupLinkFieldSpec(spec);
          if (Array.isArray(links) && typeof replaceLinks === 'function') {
            const filtered = links.filter(link => (link.field || 'content') !== fieldKey);
            replaceLinks(filtered);
          }
        }
        renderAnnotations();
      }
    }

    function handleAnnotatedSelection() {
      if (!state.editable || !textarea) return;
      const renderDiv = this;
      const sel = windowRef.getSelection ? windowRef.getSelection() : null;
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const startSpan = findSpanForNode(renderDiv, range.startContainer);
      const endSpan = findSpanForNode(renderDiv, range.endContainer);
      if (!startSpan || !endSpan) return;
      const sOffset = offsetWithinSpan(startSpan, range.startContainer, range.startOffset);
      const eOffset = offsetWithinSpan(endSpan, range.endContainer, range.endOffset);
      const sPos = parseInt(startSpan.getAttribute('data-pos') || 0, 10) + sOffset;
      const ePos = parseInt(endSpan.getAttribute('data-pos') || 0, 10) + eOffset;
      if (Number.isNaN(sPos) || Number.isNaN(ePos) || ePos <= sPos) return;
      const selText = textarea.value.slice(sPos, ePos);
      if (isLinkBrushActive()) {
        sel.removeAllRanges();
        renderDiv.__lastSelectionAt = Date.now();
        startLinkFlow('content', sPos, ePos, selText);
      } else if (state.editable) {
        sel.removeAllRanges();
        renderDiv.__lastSelectionAt = Date.now();
        showAnnotationEditor({ start: sPos, end: ePos, text: selText }, -1);
      }
    }

    function reindexAnnotationsForContentText(text) {
      if (!Array.isArray(annotations) || !annotations.length) return false;
      const body = typeof text === 'string' ? text : '';
      const limit = body.length;
      const nextList = [];
      let changed = false;
      annotations.forEach(current => {
        if (!current) return;
        const approx = typeof current.start === 'number' ? current.start : 0;
        const snippet = typeof current.text === 'string' ? current.text : '';
        if (!snippet) { changed = true; return; }
        const best = typeof options.findBestLinkPosition === 'function'
          ? options.findBestLinkPosition(body, snippet, approx)
          : body.indexOf(snippet);
        if (best === -1) { changed = true; return; }
        const start = Math.max(0, best);
        const end = Math.min(limit, start + snippet.length);
        if (end <= start) { changed = true; return; }
        const actualText = body.slice(start, end);
        if (actualText !== snippet) { changed = true; return; }
        const updated = { ...current, start, end, text: actualText };
        ensureAnnotationKey(updated);
        if (start !== current.start || end !== current.end || actualText !== current.text) changed = true;
        nextList.push(updated);
      });
      if (changed) annotations = nextList;
      return changed;
    }

    function handleTextareaInput() {
      if (!textarea) return;
      reindexFieldLinks('content');
      const textValue = textarea.value || '';
      if (reindexAnnotationsForContentText(textValue)) {
        renderAnnotations();
        const renderDiv = formContainer ? formContainer.querySelector(`#${renderContainerId}`) : null;
        if (renderDiv && renderDiv.style.display !== 'none') {
          renderAnnotatedBody();
        }
      }
    }

    function showAnnotationEditor(annotation, index) {
      if (!annoArea || !state.editable) return;
      annoArea.querySelectorAll('.anno-editor').forEach(ed => ed.remove());
      const editor = documentRef.createElement('div');
      editor.className = 'anno-editor';
      editor.style.display = 'grid';
      editor.style.gridTemplateColumns = '1fr 1fr auto';
      editor.style.gridTemplateRows = 'auto auto';
      editor.style.gap = '8px';
      editor.style.padding = '8px';
      editor.style.border = '1px solid #ddd';
      editor.style.background = '#fff';
      editor.style.marginBottom = '8px';
      const leftTop = documentRef.createElement('div');
      leftTop.style.padding = '6px';
      leftTop.style.border = '1px solid #f0f0f0';
      leftTop.style.overflow = 'auto';
      leftTop.style.maxHeight = '6em';
      leftTop.textContent = annotation.text || '';
      const rightTop = documentRef.createElement('div');
      rightTop.style.gridColumn = '2 / 3';
      rightTop.innerHTML = `<textarea class="anno-input" rows="1" data-check-paragraph="true" style="width:100%;resize:none;overflow:hidden">${escapeHtml(annotation.note || '')}</textarea>`;
      const btnCell = documentRef.createElement('div');
      btnCell.style.display = 'flex';
      btnCell.style.flexDirection = 'row';
      btnCell.style.gap = '8px';
      btnCell.style.alignItems = 'center';
      const keep = documentRef.createElement('button');
      keep.type = 'button';
      keep.className = 'btn small';
      keep.textContent = '保留';
      const del = documentRef.createElement('button');
      del.type = 'button';
      del.className = 'btn small';
      del.textContent = '删除';
      btnCell.appendChild(keep);
      btnCell.appendChild(del);
      const spacer = documentRef.createElement('div');
      spacer.style.gridColumn = '1 / 3';
      editor.appendChild(leftTop);
      editor.appendChild(rightTop);
      editor.appendChild(btnCell);
      editor.appendChild(spacer);
      annoArea.prepend(editor);
      const noteInputEl = editor.querySelector('.anno-input');
      if (noteInputEl) {
        const snippetLines = Math.max(1, (annotation.text || '').split(/\r?\n/).length);
        const preferredMin = Math.min(200, Math.max(24, snippetLines * 24));
        noteInputEl.dataset.autosizeMin = String(preferredMin);
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
      del.addEventListener('click', () => {
        editor.remove();
        if (typeof index === 'number' && index >= 0) {
          annotations.splice(index, 1);
          renderAnnotations();
        }
      });
    }

    function lockBody() {
      if (!textarea) return;
      textarea.readOnly = true;
      textarea.style.display = 'none';
      const rv = renderAnnotatedBody();
      if (rv) rv.style.display = 'block';
      if (lockBtn) lockBtn.disabled = true;
      if (unlockBtn) unlockBtn.disabled = state.editable ? false : true;
    }

    function unlockBody() {
      if (!textarea) return;
      if (isLinkBrushActive()) {
        return;
      }
      textarea.readOnly = false;
      if (lockBtn) lockBtn.disabled = state.editable ? false : true;
      if (unlockBtn) unlockBtn.disabled = true;
      textarea.style.display = '';
      try { autosizeTextarea(textarea); } catch (e) { }
      const rv = formContainer ? formContainer.querySelector(`#${renderContainerId}`) : null;
      if (rv) rv.style.display = 'none';
    }

    if (lockBtn) lockBtn.addEventListener('click', lockBody);
    if (unlockBtn) {
      unlockBtn.addEventListener('click', unlockBody);
      unlockBtn.disabled = true;
    }

    registerLinkBrushHandler(active => {
      if (!lockBtn || !textarea) return;
      if (active) {
        lockBody();
      }
    });

    registerEditableWatcher(editable => {
      if (!editable) {
        lockBody();
      } else {
        const hasPersistedId = !!(state.node && state.node.id);
        if (hasPersistedId) {
          lockBody();
        } else {
          unlockBody();
        }
      }
      renderAnnotations();
    });

    // 注释列表同步自检自动修复内容
    if (documentRef && typeof documentRef.addEventListener === 'function') {
      documentRef.addEventListener('poem:selfcheck:after', () => {
        annotations.forEach((anno) => {
          const key = getAnnotationFieldKey(anno);
          const refs = key ? annotationFieldMap.get(key) : null;
          if (!refs || !refs.hidden) return;
          const nextVal = typeof refs.hidden.value === 'string' ? refs.hidden.value : '';
          if (nextVal !== anno.note) {
            anno.note = nextVal;
            if (refs.noteDisplay) refs.noteDisplay.textContent = nextVal;
          }
        });
      });
    }
    if (textarea) {
      textarea.addEventListener('input', handleTextareaInput);
    }
    if (textarea && typeof registerLinkField === 'function') {
      const existingContentSpec = typeof getFieldSpec === 'function' ? getFieldSpec('content') : null;
      if (existingContentSpec) {
        cleanupLinkFieldSpec(existingContentSpec);
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
    }
    if (formContainer) {
      ['f-body', 'f-translation', 'f-background'].forEach(id => {
        const ta = formContainer.querySelector(`#${id}`);
        if (!ta) return;
        try {
          ta.style.width = '100%';
          ta.style.resize = 'none';
          ta.style.overflow = 'hidden';
        } catch (e) { }
        autosizeTextarea(ta);
        try { if (ta.__autosizeHandler) ta.removeEventListener('input', ta.__autosizeHandler); } catch (e) { }
        ta.__autosizeHandler = () => autosizeTextarea(ta);
        ta.addEventListener('input', ta.__autosizeHandler);
      });
    }

    function setAnnotations(nextList) {
      annotations = sanitizeAnnotations(nextList);
      showAllAnnotations = false;
      renderAnnotations();
      renderAnnotatedBody();
    }

    function getAnnotations() {
      return annotations.map(item => ({ ...item }));
    }

    return {
      setAnnotations,
      getAnnotations,
      renderAnnotatedBody,
      lockBody,
      unlockBody,
    };
  };
})(typeof window !== 'undefined' ? window : this);