// 注释
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
    const bodyFieldKey = options.bodyFieldKey || 'content';
    const prefaceFieldKey = options.prefaceFieldKey || 'extra.preface';
    const textarea = options.textarea || formContainer?.querySelector?.('#f-body') || null;
    const prefaceTextarea = options.prefaceTextarea || formContainer?.querySelector?.('#f-preface') || null;
    const prefaceRow = options.prefaceRow || formContainer?.querySelector?.('#preface-row') || null;
    const annoArea = options.annoArea || formContainer?.querySelector?.('#annotation-area') || null;
    const lockBtn = options.lockBtn || formContainer?.querySelector?.('#body-lock-toggle') || null;
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
    const renderContainerId = options.renderContainerId || 'f-body-render';
    const prefaceRenderContainerId = options.prefaceRenderContainerId || 'f-preface-render';
    const wordCountEl = options.wordCountEl || formContainer?.querySelector?.('#body-word-count') || null;
    const prefaceWordCountEl = options.prefaceWordCountEl || formContainer?.querySelector?.('#preface-word-count') || null;
    let annotationFieldMap = new Map();
    let annotations = [];

    // 统计文本长度（忽略符号）
    const countTextLength = (() => {
      let useUnicodeProps = false;
      try {
        // 旧浏览器不支持 \p{..} 会直接抛异常
        // eslint-disable-next-line no-new
        new RegExp('[^\\p{L}\\p{N}]', 'u');
        useUnicodeProps = true;
      } catch (e) {
        useUnicodeProps = false;
      }
      return (text) => {
        if (!text) return 0;
        if (useUnicodeProps) {
          const normalized = text.replace(/[^\p{L}\p{N}]/gu, '');
          return normalized.length;
        }
        // 回退：仅保留中日韩统一表意文字 + 英数字
        const normalized = String(text).replace(/[^0-9A-Za-z\u4E00-\u9FFF]/g, '');
        return normalized.length;
      };
    })();

    function isPrefaceEnabled() {
      if (!prefaceRow) return false;
      // renderers/poem.js 通过 display 控制序开关
      const disp = (prefaceRow.style && typeof prefaceRow.style.display === 'string') ? prefaceRow.style.display : '';
      return disp !== 'none';
    }

    // 渲染字数显示（序/正文分开）
    const renderWordCounts = (bodyCount, prefaceCount) => {
      if (wordCountEl) wordCountEl.textContent = `正文${bodyCount}字`;
      if (!prefaceWordCountEl) return;
      const showPreface = isPrefaceEnabled();
      prefaceWordCountEl.style.display = showPreface ? '' : 'none';
      if (showPreface) prefaceWordCountEl.textContent = `序${prefaceCount}字`;
    };

    // 刷新字数（保留原函数名，便于复用已有调用点）
    const updateWordCountFromBody = () => {
      const bodyCount = textarea ? countTextLength(textarea.value || '') : 0;
      const prefaceCount = prefaceTextarea ? countTextLength(prefaceTextarea.value || '') : 0;
      renderWordCounts(bodyCount, prefaceCount);
    };

    // 清理注释列表
    function sanitizeAnnotations(list) {
      if (!Array.isArray(list)) return [];
      return list.filter(Boolean).map(item => {
        const next = {
          start: typeof item.start === 'number' ? item.start : 0,
          end: typeof item.end === 'number' ? item.end : (typeof item.start === 'number' ? item.start : 0),
          text: typeof item.text === 'string' ? item.text : '',
          note: typeof item.note === 'string' ? item.note : '',
          field: (typeof item.field === 'string' && item.field) ? item.field : bodyFieldKey,
          id: item.id,
          linkKey: item.linkKey,
        };
        if (item.meta) next.meta = item.meta;
        ensureAnnotationKey(next);
        return next;
      });
    }

    // 确保注释有唯一键
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

    // 获取注释字段键
    function getAnnotationFieldKey(annotation) {
      const key = ensureAnnotationKey(annotation);
      return key ? `annotations.${key}.note` : '';
    }

    // 计算注释深度
    function computeDepths(list) {
      if (!Array.isArray(list) || list.length === 0) return [];
      const depths = new Array(list.length).fill(0);
      const groups = new Map();
      list.forEach((entry, idx) => {
        if (!entry) return;
        const field = (typeof entry.field === 'string' && entry.field) ? entry.field : bodyFieldKey;
        if (!groups.has(field)) groups.set(field, []);
        groups.get(field).push({ entry, idx });
      });
      groups.forEach(items => {
        const events = [];
        items.forEach(({ entry, idx }) => {
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
        let active = 0;
        events.forEach(event => {
          if (event.type === 'start') {
            depths[event.idx] = active;
            active += 1;
          } else {
            active = Math.max(0, active - 1);
          }
        });
      });
      return depths;
    }

    // 渲染注释列表
    function renderAnnotations() {
      if (!annoArea) return;
      annotationFieldMap = new Map();
      const depths = computeDepths(annotations);
      const annotated = annotations.map((a, i) => ({ a, idx: i, depth: depths[i] || 0 }));
      annotated.forEach(item => ensureAnnotationKey(item.a));
      annotated.sort((x, y) => {
        const fx = (x.a && typeof x.a.field === 'string' && x.a.field) ? x.a.field : bodyFieldKey;
        const fy = (y.a && typeof y.a.field === 'string' && y.a.field) ? y.a.field : bodyFieldKey;
        const gx = fx === prefaceFieldKey ? 0 : 1;
        const gy = fy === prefaceFieldKey ? 0 : 1;
        if (gx !== gy) return gx - gy;
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
      const title = documentRef.createElement('span');
      title.className = 'anno-title';
      title.textContent = '注释：';
      annoArea.appendChild(title);
      const list = documentRef.createElement('div');
      list.className = 'anno-list';
      annoArea.appendChild(list);
      if (renderList.length === 0) {
        const empty = documentRef.createElement('div');
        empty.className = 'muted';
        empty.textContent = '暂无';
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
        delBtn.className = 'btn danger small del-anno';
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
      const prefaceRenderDiv = formContainer ? formContainer.querySelector(`#${prefaceRenderContainerId}`) : null;
      if (prefaceRenderDiv) renderAnnotatedPreface();
    }

    // 查找或创建渲染容器
    function findOrCreateRenderContainer() {
      if (!formContainer) return null;
      let renderDiv = formContainer.querySelector(`#${renderContainerId}`);
      if (!renderDiv) {
        renderDiv = documentRef.createElement('div');
        renderDiv.id = renderContainerId;
        const bodyField = formContainer.querySelector('#f-body');
        if (bodyField && bodyField.parentNode) bodyField.parentNode.insertBefore(renderDiv, bodyField.nextSibling);
        else formContainer.appendChild(renderDiv);
      }
      renderDiv.classList.add('body-render');
      if (!renderDiv.style.padding) renderDiv.style.padding = '8px';
      if (!renderDiv.style.paddingBottom) renderDiv.style.paddingBottom = '8px';
      if (!renderDiv.style.border) renderDiv.style.border = '1px solid #ddd';
      if (!renderDiv.style.borderRadius) renderDiv.style.borderRadius = '6px';
      if (!renderDiv.style.marginTop) renderDiv.style.marginTop = '8px';
      if (!renderDiv.style.background) renderDiv.style.background = '#fff';
      if (!renderDiv.style.display) renderDiv.style.display = 'none';
      return renderDiv;
    }

    // 查找或创建序的渲染容器
    function findOrCreatePrefaceRenderContainer() {
      if (!formContainer) return null;
      let renderDiv = formContainer.querySelector(`#${prefaceRenderContainerId}`);
      if (!renderDiv) {
        renderDiv = documentRef.createElement('div');
        renderDiv.id = prefaceRenderContainerId;
        const prefaceField = prefaceTextarea || formContainer.querySelector('#f-preface');
        if (prefaceField && prefaceField.parentNode) prefaceField.parentNode.insertBefore(renderDiv, prefaceField.nextSibling);
        else formContainer.appendChild(renderDiv);
      }
      renderDiv.classList.add('body-render');
      if (!renderDiv.style.padding) renderDiv.style.padding = '8px';
      if (!renderDiv.style.paddingBottom) renderDiv.style.paddingBottom = '8px';
      if (!renderDiv.style.border) renderDiv.style.border = '1px solid #ddd';
      if (!renderDiv.style.borderRadius) renderDiv.style.borderRadius = '6px';
      if (!renderDiv.style.marginTop) renderDiv.style.marginTop = '8px';
      if (!renderDiv.style.background) renderDiv.style.background = '#fff';
      if (!renderDiv.style.display) renderDiv.style.display = 'none';
      return renderDiv;
    }

    // 渲染注释正文
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
          const field = (typeof a.field === 'string' && a.field) ? a.field : bodyFieldKey;
          if (field !== bodyFieldKey) return;
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
        ? links.map((link, idx) => ({ link, idx })).filter(item => item.link && (item.link.field || bodyFieldKey) === bodyFieldKey)
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
      updateWordCountFromBody();
      return renderDiv;
    }

    // 渲染序（支持注释/链接高亮）
    function renderAnnotatedPreface() {
      if (!prefaceTextarea || !formContainer) return null;
      const text = prefaceTextarea.value || '';
      const n = text.length;
      const annotationDepth = new Array(n).fill(0);
      const annotationSignature = new Array(n).fill('');
      if (n) {
        const annStarts = Object.create(null);
        const annEnds = Object.create(null);
        annotations.forEach((a, idx) => {
          if (!a) return;
          const field = (typeof a.field === 'string' && a.field) ? a.field : bodyFieldKey;
          if (field !== prefaceFieldKey) return;
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
      const fieldLinks = Array.isArray(links)
        ? links.map((link, idx) => ({ link, idx })).filter(item => item.link && (item.link.field || bodyFieldKey) === prefaceFieldKey)
        : [];
      fieldLinks.forEach(({ link, idx }) => {
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
      const renderDiv = findOrCreatePrefaceRenderContainer();
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
      ensureAnnotatedPrefaceHandlers(renderDiv);
      return renderDiv;
    }

    // 注释正文的事件处理器
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

    function ensureAnnotatedPrefaceHandlers(renderDiv) {
      if (!renderDiv) return;
      if (!renderDiv.__clickDelegationAttached) {
        renderDiv.__clickDelegationAttached = true;
        renderDiv.addEventListener('click', annotatedPrefaceClickHandler);
      }
      if (!renderDiv.__selectionHandler) {
        renderDiv.__selectionHandler = true;
        renderDiv.addEventListener('mouseup', handleAnnotatedPrefaceSelection);
      }
      if (!renderDiv.__contextMenuHandler) {
        renderDiv.__contextMenuHandler = true;
        renderDiv.addEventListener('contextmenu', annotatedPrefaceContextMenuHandler);
      }
    }

    // 注释正文点击处理器
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
      const idx = annotations.findIndex(a => {
        if (!a) return false;
        const field = (typeof a.field === 'string' && a.field) ? a.field : bodyFieldKey;
        if (field !== bodyFieldKey) return false;
        return a.start <= pos && pos < a.end;
      });
      if (idx >= 0) showAnnotationEditor(annotations[idx], idx);
    }

    // 序渲染框点击处理器
    function annotatedPrefaceClickHandler(event) {
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
      const idx = annotations.findIndex(a => {
        if (!a) return false;
        const field = (typeof a.field === 'string' && a.field) ? a.field : bodyFieldKey;
        if (field !== prefaceFieldKey) return false;
        return a.start <= pos && pos < a.end;
      });
      if (idx >= 0) showAnnotationEditor(annotations[idx], idx);
    }

    // 注释正文右键处理器
    function annotatedBodyContextMenuHandler(event) {
      const renderDiv = event.currentTarget;
      const span = event.target.closest('span[data-pos]');
      if (!span || !renderDiv.contains(span)) return;
      if (state.editable && textarea && !textarea.readOnly) return;

      const canEditNode = state && state.canEditNode !== undefined ? !!state.canEditNode : true;
      if (!canEditNode) {
        event.preventDefault();
        try { if (Poem && typeof Poem.toast === 'function') Poem.toast('无权限'); } catch (e) { }
        return;
      }

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

    // 序渲染框右键处理器
    function annotatedPrefaceContextMenuHandler(event) {
      const renderDiv = event.currentTarget;
      const span = event.target.closest('span[data-pos]');
      if (!span || !renderDiv.contains(span)) return;
      if (state.editable && prefaceTextarea && !prefaceTextarea.readOnly) return;

      const canEditNode = state && state.canEditNode !== undefined ? !!state.canEditNode : true;
      if (!canEditNode) {
        event.preventDefault();
        try { if (Poem && typeof Poem.toast === 'function') Poem.toast('无权限'); } catch (e) { }
        return;
      }

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
            const filtered = links.filter(link => (link.field || bodyFieldKey) !== fieldKey);
            replaceLinks(filtered);
          }
        }
        renderAnnotations();
      }
    }

    // 注释正文选择
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
        startLinkFlow(bodyFieldKey, sPos, ePos, selText);
      } else if (state.editable) {
        sel.removeAllRanges();
        renderDiv.__lastSelectionAt = Date.now();
        showAnnotationEditor({ start: sPos, end: ePos, text: selText, field: bodyFieldKey }, -1);
      }
    }

    // 序渲染框选择
    function handleAnnotatedPrefaceSelection() {
      if (!state.editable || !prefaceTextarea) return;
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
      const selText = prefaceTextarea.value.slice(sPos, ePos);
      if (isLinkBrushActive()) {
        sel.removeAllRanges();
        renderDiv.__lastSelectionAt = Date.now();
        startLinkFlow(prefaceFieldKey, sPos, ePos, selText);
      } else if (state.editable) {
        sel.removeAllRanges();
        renderDiv.__lastSelectionAt = Date.now();
        showAnnotationEditor({ start: sPos, end: ePos, text: selText, field: prefaceFieldKey }, -1);
      }
    }

    // 为文本重新索引注释（按字段）
    function reindexAnnotationsForFieldText(fieldKey, text) {
      if (!Array.isArray(annotations) || !annotations.length) return false;
      const body = typeof text === 'string' ? text : '';
      const limit = body.length;
      const nextAll = [];
      let changed = false;
      annotations.forEach(current => {
        if (!current) return;
        const currentField = (typeof current.field === 'string' && current.field) ? current.field : bodyFieldKey;
        if (currentField !== fieldKey) {
          nextAll.push(current);
          return;
        }
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
        const updated = { ...current, start, end, text: actualText, field: currentField };
        ensureAnnotationKey(updated);
        if (start !== current.start || end !== current.end || actualText !== current.text) changed = true;
        nextAll.push(updated);
      });
      if (changed) annotations = nextAll;
      return changed;
    }

    // 处理文本区域输入
    function handleTextareaInput() {
      if (!textarea) return;
      reindexFieldLinks(bodyFieldKey);
      const textValue = textarea.value || '';
      updateWordCountFromBody();
      if (reindexAnnotationsForFieldText(bodyFieldKey, textValue)) {
        renderAnnotations();
        const renderDiv = formContainer ? formContainer.querySelector(`#${renderContainerId}`) : null;
        if (renderDiv && renderDiv.style.display !== 'none') {
          renderAnnotatedBody();
        }
      }
    }

    function handlePrefaceTextareaInput() {
      if (!prefaceTextarea) return;
      reindexFieldLinks(prefaceFieldKey);
      const textValue = prefaceTextarea.value || '';
      updateWordCountFromBody();
      if (reindexAnnotationsForFieldText(prefaceFieldKey, textValue)) {
        renderAnnotations();
        const renderDiv = formContainer ? formContainer.querySelector(`#${prefaceRenderContainerId}`) : null;
        if (renderDiv && renderDiv.style.display !== 'none') {
          renderAnnotatedPreface();
        }
      }
    }

    // 显示注释编辑器
    function showAnnotationEditor(annotation, index) {
      if (!annoArea || !state.editable) return;
      annoArea.querySelectorAll('.anno-editor').forEach(ed => ed.remove());
      const editor = documentRef.createElement('div');
      editor.className = 'anno-editor';
      editor.style.display = 'grid';
      editor.style.gridTemplateColumns = '1fr 1fr auto';
      editor.style.alignItems = 'start';
      editor.style.gap = '8px';
      editor.style.padding = '8px';
      editor.style.border = '1px solid #ddd';
      editor.style.background = '#fff';
      editor.style.marginBottom = '8px';
      const leftTop = documentRef.createElement('div');
      leftTop.style.alignSelf = 'start';
      leftTop.style.padding = '6px';
      leftTop.style.border = '1px solid #f0f0f0';
      leftTop.style.overflow = 'hidden';
      leftTop.style.whiteSpace = 'pre-wrap';
      leftTop.style.wordBreak = 'break-word';
      const leftText = annotation.text || '';
      leftTop.textContent = leftText;
      try {
        const adjust = () => {
          try {
            const cs = windowRef.getComputedStyle ? windowRef.getComputedStyle(leftTop) : null;
            const raw = leftTop.scrollHeight + 2;
            const cap = (windowRef.innerHeight || 800);
            const desired = Math.min(raw, cap);
            leftTop.style.height = `${desired}px`;
          } catch (e) { /* noop */ }
        };
        requestAnimationFrame(adjust);
      } catch (e) { /* noop */ }
      const rightTop = documentRef.createElement('div');
      rightTop.style.gridColumn = '2 / 3';
      rightTop.innerHTML = `<textarea class="anno-input" rows="1" data-check-paragraph="true" style="width:100%;resize:none;overflow:hidden">${escapeHtml(annotation.note || '')}</textarea>`;
      const btnCell = documentRef.createElement('div');
      btnCell.style.display = 'flex';
      btnCell.style.flexDirection = 'row';
      btnCell.style.gap = '8px';
      btnCell.style.alignItems = 'center';
      btnCell.style.alignSelf = 'center';
      const keep = documentRef.createElement('button');
      keep.type = 'button';
      keep.className = 'btn small';
      keep.textContent = '保留';
      const del = documentRef.createElement('button');
      del.type = 'button';
      del.className = 'btn danger small';
      del.textContent = '删除';
      btnCell.appendChild(keep);
      btnCell.appendChild(del);
      editor.appendChild(leftTop);
      editor.appendChild(rightTop);
      editor.appendChild(btnCell);
      annoArea.prepend(editor);
      const noteInputEl = editor.querySelector('.anno-input');
      if (noteInputEl) {
        const noteLines = Math.max(1, (annotation.note || '').split(/\r?\n/).length);
        const preferredMin = Math.min(200, Math.max(24, noteLines * 24));
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
          const nextAnno = {
            start: annotation.start,
            end: annotation.end,
            text: annotation.text,
            note: noteVal,
            field: (typeof annotation.field === 'string' && annotation.field) ? annotation.field : bodyFieldKey
          };
          ensureAnnotationKey(nextAnno);
          annotations.push(nextAnno);
        }
        syncLinksToState();
        editor.remove();
        renderAnnotations();
        updateWordCountFromBody();
      });
      del.addEventListener('click', () => {
        editor.remove();
        if (typeof index === 'number' && index >= 0) {
          annotations.splice(index, 1);
          renderAnnotations();
        }
        updateWordCountFromBody();
      });
    }

    // 锁定正文
    function setLockButtonState(isLocked, canToggle = true) {
      if (!lockBtn) return;
      lockBtn.textContent = isLocked ? '✏️ 编辑' : '🔒 锁定';
      lockBtn.dataset.locked = isLocked ? 'true' : 'false';
      lockBtn.disabled = !canToggle;
    }

    function lockBody() {
      if (!textarea) return;
      textarea.readOnly = true;
      textarea.style.display = 'none';
      const rv = renderAnnotatedBody();
      if (rv) rv.style.display = 'block';

      if (prefaceTextarea) {
        prefaceTextarea.readOnly = true;
        prefaceTextarea.style.display = 'none';
        if (prefaceRow && prefaceRow.style.display === 'none') {
          const pvHidden = formContainer ? formContainer.querySelector(`#${prefaceRenderContainerId}`) : null;
          if (pvHidden) pvHidden.style.display = 'none';
        } else {
          const pv = renderAnnotatedPreface();
          if (pv) pv.style.display = 'block';
        }
      }

      updateWordCountFromBody();
      setLockButtonState(true, !!state.editable);
    }

    // 解锁正文
    function unlockBody() {
      if (!textarea) return;
      if (isLinkBrushActive()) {
        return;
      }
      textarea.readOnly = false;
      setLockButtonState(false, !!state.editable);
      textarea.style.display = '';
      try { autosizeTextarea(textarea); } catch (e) { }
      const rv = formContainer ? formContainer.querySelector(`#${renderContainerId}`) : null;
      if (rv) rv.style.display = 'none';

      if (prefaceTextarea) {
        prefaceTextarea.readOnly = false;
        if (prefaceRow && prefaceRow.style.display === 'none') {
          prefaceTextarea.style.display = 'none';
        } else {
          prefaceTextarea.style.display = '';
          try { autosizeTextarea(prefaceTextarea); } catch (e) { }
        }
        const pv = formContainer ? formContainer.querySelector(`#${prefaceRenderContainerId}`) : null;
        if (pv) pv.style.display = 'none';
      }

      updateWordCountFromBody();
    }
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        if (!textarea) return;
        const isLocked = lockBtn.dataset.locked === 'true' || textarea.readOnly;
        if (!state.editable && isLocked) return;
        if (isLocked) {
          unlockBody();
        } else {
          lockBody();
        }
      });
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
    if (prefaceTextarea) {
      prefaceTextarea.addEventListener('input', handlePrefaceTextareaInput);
    }
    if (textarea && typeof registerLinkField === 'function') {
      const existingContentSpec = typeof getFieldSpec === 'function' ? getFieldSpec(bodyFieldKey) : null;
      if (existingContentSpec) {
        cleanupLinkFieldSpec(existingContentSpec);
        try { delete textarea.__linkFieldSpec; } catch (e) { }
      }
      registerLinkField(bodyFieldKey, textarea, {
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
    if (prefaceTextarea && typeof registerLinkField === 'function') {
      const existingPrefaceSpec = typeof getFieldSpec === 'function' ? getFieldSpec(prefaceFieldKey) : null;
      if (existingPrefaceSpec) {
        cleanupLinkFieldSpec(existingPrefaceSpec);
        try { delete prefaceTextarea.__linkFieldSpec; } catch (e) { }
      }
      registerLinkField(prefaceFieldKey, prefaceTextarea, {
        skipSelectionListener: true,
        skipDisplay: true,
        getValue: () => prefaceTextarea ? prefaceTextarea.value || '' : '',
        onLinksUpdated: renderAnnotatedPreface,
        onEditableChange: editable => {
          if (!prefaceTextarea) return;
          prefaceTextarea.readOnly = !editable;
        }
      });
    }
    if (formContainer) {
      ['f-body', 'f-preface', 'f-translation', 'f-background'].forEach(id => {
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

    updateWordCountFromBody();

    // 设置注释列表
    function setAnnotations(nextList) {
      annotations = sanitizeAnnotations(nextList);
      showAllAnnotations = false;
      renderAnnotations();
      renderAnnotatedBody();
      renderAnnotatedPreface();
    }

    // 获取注释列表
    function getAnnotations() {
      return annotations.map(item => ({ ...item }));
    }

    return {
      setAnnotations,
      getAnnotations,
      renderAnnotatedBody,
      renderAnnotatedPreface,
      lockBody,
      unlockBody,
      syncLock: () => {
        if (!textarea) return;
        const locked = (lockBtn && lockBtn.dataset.locked === 'true') || textarea.readOnly;
        if (locked) lockBody();
        else unlockBody();
      },
    };
  };
})(typeof window !== 'undefined' ? window : this);