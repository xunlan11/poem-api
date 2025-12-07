(function (root) {
  if (!root) return;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  const SUB_KEY = 'ciqupu';
  const SUB_LABEL = '词曲谱';
  const MARK_MODE_LABELS = {
    variable: '可变',
    fixed: '固定',
    rhyme: '韵脚'
  };
  const MARK_CLASS_MAP = {
    fixed: 'locked-char--fixed',
    rhyme: 'locked-char--rhyme'
  };
  const DEFAULT_MARK_MODE = 'variable';

  function countRenderableChars(text) {
    if (!text) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '\n') count += 1;
    }
    return count;
  }

  function normalizePingzeMarksForText(text, marks) {
    const total = countRenderableChars(text);
    const source = Array.isArray(marks) ? marks : [];
    const normalized = [];
    for (let i = 0; i < total; i += 1) {
      normalized[i] = source[i] || null;
    }
    return normalized;
  }

  registry[`L_${SUB_KEY}`] = function renderLvCiqupu(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || {};
    let editable = context.state ? !!context.state.editable : true;
    const registerEditableWatcher = typeof context.registerEditableWatcher === 'function' ? context.registerEditableWatcher : () => () => { };
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const autosizeTextarea = context.autosizeTextarea || (() => { });
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const title = node.fields?.title || '';
    const otherNames = node.fields?.otherNames || '';
    const mode = node.fields?.mode || 'single';
    const gongdiao = node.fields?.gongdiao || '';

    function createVariantName(index) {
      if (index === 0) return '正体';
      return `变体${index}`;
    }

    function normalizeVariants(list) {
      if (!Array.isArray(list) || !list.length) {
        return [{ name: '正体', cipai: '', author: '', summary: '', origin: '', sample: '', pingze: '', pingzeMarks: [], locked: false }];
      }
      return list.map((item, idx) => ({
        name: item?.name || createVariantName(idx),
        cipai: item?.cipai || '',
        author: item?.author || '',
        summary: item?.summary || '',
        origin: item?.origin || '',
        sample: item?.sample || '',
        pingze: item?.pingze || '',
        pingzeMarks: normalizePingzeMarksForText(item?.pingze || '', item?.pingzeMarks),
        locked: item.locked !== false
      }));
    }

    let variants = normalizeVariants(node.fields?.variants);
    let lockStates = variants.map(v => !!v.locked);
    let pingzeModeStates = variants.map(() => DEFAULT_MARK_MODE);
    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>词曲谱</label>
          <div class="field-row"><input id="lv-title" type="text" data-link-field="fields.title" value="${escapeHtml(title)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field"><label>其他名称</label><input id="lv-other" type="text" data-link-field="fields.otherNames" value="${escapeHtml(otherNames)}"></div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label>单双调</label>
          <div class="radio-row" id="lv-mode">
            <label><input type="radio" name="lvMode" value="single" ${mode === 'single' ? 'checked' : ''}> 单调</label>
            <label><input type="radio" name="lvMode" value="double" ${mode === 'double' ? 'checked' : ''}> 双调</label>
          </div>
        </div>
        <div class="field"><label>宫调</label><input id="lv-gongdiao" type="text" data-link-field="fields.gongdiao" value="${escapeHtml(gongdiao)}"></div>
      </div>
      <div class="field">
        <label>共 <span id="lv-variant-count">${variants.length}</span> 体 <button type="button" class="btn small" id="lv-add-variant">新增变体</button></label>
        <div id="lv-variant-list" class="variant-list"></div>
      </div>
    `;
    const variantListEl = formContainer.querySelector('#lv-variant-list');
    const variantCountEl = formContainer.querySelector('#lv-variant-count');
    const addVariantBtn = formContainer.querySelector('#lv-add-variant');
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const titleVal = (formContainer.querySelector('#lv-title').value || '').trim();
        const otherVal = (formContainer.querySelector('#lv-other').value || '').trim();
        const q = [titleVal, otherVal].filter(Boolean).join(' ');
        context.checkDuplicate(q, 'L');
      });
    }
    const ensureStateLengths = () => {
      if (lockStates.length > variants.length) {
        lockStates.length = variants.length;
      }
      while (lockStates.length < variants.length) {
        lockStates.push(false);
      }
      if (pingzeModeStates.length > variants.length) {
        pingzeModeStates.length = variants.length;
      }
      while (pingzeModeStates.length < variants.length) {
        pingzeModeStates.push(DEFAULT_MARK_MODE);
      }
    };
    const ensureVariantMarks = (variant, text) => {
      if (!variant) return [];
      const normalized = normalizePingzeMarksForText(text, variant.pingzeMarks);
      variant.pingzeMarks = normalized;
      return normalized;
    };
    const getModeLabel = (mode) => MARK_MODE_LABELS[mode] || MARK_MODE_LABELS[DEFAULT_MARK_MODE];

    function renderLockedText(text, target, options) {
      if (!target) return;
      const fragment = document.createDocumentFragment();
      const content = typeof text === 'string' ? text : '';
      const marks = options?.marks;
      const classMap = options?.classMap || {};
      let idx = 0;
      for (let i = 0; i < content.length; i += 1) {
        const ch = content[i];
        if (ch === '\n') {
          fragment.appendChild(document.createElement('br'));
          continue;
        }
        const span = document.createElement('span');
        span.className = 'locked-char';
        span.dataset.index = String(idx);
        const markType = marks && marks[idx];
        if (markType) {
          span.dataset.markType = markType;
          const appliedClass = classMap[markType];
          if (appliedClass) span.classList.add(appliedClass);
        }
        span.textContent = ch;
        fragment.appendChild(span);
        idx += 1;
      }
      if (!content.length) {
        const placeholder = document.createElement('span');
        placeholder.className = 'locked-char locked-char--empty';
        placeholder.textContent = '（空）';
        fragment.appendChild(placeholder);
      }
      target.innerHTML = '';
      target.appendChild(fragment);
    }

    function autosizeAndBind(el) {
      if (!el) return;
      autosizeTextarea(el);
      el.addEventListener('input', () => autosizeTextarea(el));
    }

    function renderVariants() {
      ensureStateLengths();
      variantListEl.innerHTML = '';
      if (variantCountEl) variantCountEl.textContent = String(variants.length);
      variants.forEach((variant, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'variant-card';
        const titleLabel = variant.name || createVariantName(index);
        variants[index].name = titleLabel;
        wrapper.innerHTML = `
          <div class="variant-card__head">
            <strong>${escapeHtml(titleLabel)}</strong>
            ${(index > 0) ? '<button type="button" class="btn small danger" data-act="remove">删除</button>' : ''}
          </div>
          <div class="grid-2">
            <div class="field"><label>词曲谱</label><input type="text" data-field="cipai" value="${escapeHtml(variant.cipai || '')}"></div>
            <div class="field"><label>作者</label><input type="text" data-field="author" value="${escapeHtml(variant.author || '')}"></div>
          </div>
          <div class="field"><label>概述</label><textarea rows="1" data-autosize-min="32" data-field="summary" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.summary || '')}</textarea></div>
          <div class="field"><label>起源</label><textarea rows="1" data-autosize-min="32" data-field="origin" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.origin || '')}</textarea></div>
          <div class="grid-2">
            <div class="field variant-sample-field">
              <label>例词</label>
              <div class="input-wrapper sample-input-wrapper">
                <textarea rows="1" data-autosize-min="32" data-field="sample" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.sample || '')}</textarea>
              </div>
              <div class="locked-text sample-lock-view" style="display:none"></div>
              <div class="body-lock-controls variant-lock-controls">
                <button type="button" class="btn small" data-act="lock">🔒 锁定</button>
                <button type="button" class="btn small" data-act="unlock">✏️ 编辑</button>
              </div>
            </div>
            <div class="field variant-pingze-field">
              <label class="pingze-label">
                平仄
                <span class="pingze-legend">
                  <span><span class="legend-swatch legend-swatch-variable"></span>可变</span>
                  <span><span class="legend-swatch legend-swatch-fixed"></span>固定</span>
                  <span><span class="legend-swatch legend-swatch-rhyme"></span>韵脚</span>
                </span>
              </label>
              <div class="input-wrapper pingze-input-wrapper">
                <textarea rows="1" data-autosize-min="32" data-field="pingze" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.pingze || '')}</textarea>
              </div>
              <div class="locked-text pingze-lock-view" style="display:none"></div>
              <div class="pingze-mark-toolbar">
                <div class="pingze-mark-buttons">
                  <button type="button" class="btn small" data-mode="variable">可变</button>
                  <button type="button" class="btn small" data-mode="fixed">固定</button>
                  <button type="button" class="btn small" data-mode="rhyme">韵脚</button>
                </div>
              </div>
            </div>
          </div>
        `;
        variantListEl.appendChild(wrapper);
        const removeBtn = wrapper.querySelector('[data-act="remove"]');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            if (!editable) return;
            variants.splice(index, 1);
            lockStates.splice(index, 1);
            pingzeModeStates.splice(index, 1);
            if (!variants.length) {
              variants = normalizeVariants([]);
              lockStates = variants.map(() => false);
              pingzeModeStates = variants.map(() => DEFAULT_MARK_MODE);
            }
            renderVariants();
          });
          removeBtn.style.display = editable ? '' : 'none';
        }
        const assignLinkField = (el, fieldName) => {
          if (!el || !fieldName) return;
          el.dataset.linkField = `fields.variants[${index}].${fieldName}`;
        };
        wrapper.querySelectorAll('input[data-field], textarea[data-field]').forEach(input => {
          const field = input.dataset.field;
          if (!field) return;
          if (input.tagName === 'TEXTAREA') autosizeAndBind(input);
          assignLinkField(input, field);
          input.addEventListener('input', () => {
            variants[index][field] = input.value;
            if (field === 'pingze') {
              variants[index].pingzeMarks = normalizePingzeMarksForText(input.value, variants[index].pingzeMarks);
            }
          });
        });
        const sampleTextarea = wrapper.querySelector('textarea[data-field="sample"]');
        const pingzeTextarea = wrapper.querySelector('textarea[data-field="pingze"]');
        const sampleInputWrapper = wrapper.querySelector('.sample-input-wrapper');
        const pingzeInputWrapper = wrapper.querySelector('.pingze-input-wrapper');
        const lockControls = wrapper.querySelector('.variant-lock-controls');
        const lockBtn = lockControls?.querySelector('[data-act="lock"]');
        const unlockBtn = lockControls?.querySelector('[data-act="unlock"]');
        const sampleLockView = wrapper.querySelector('.sample-lock-view');
        const pingzeLockView = wrapper.querySelector('.pingze-lock-view');
        const pingzeMarkButtons = Array.from(wrapper.querySelectorAll('.pingze-mark-buttons .btn'));
        const pingzeMarkStatus = wrapper.querySelector('.pingze-mark-status');
        const pingzeMarkToolbar = wrapper.querySelector('.pingze-mark-toolbar');
        if (lockControls) {
          lockControls.style.display = editable ? '' : 'none';
        }
        if (pingzeMarkToolbar) {
          pingzeMarkToolbar.style.display = editable ? '' : 'none';
        }
        const highlightMatches = (charIdx) => {
          const apply = (view) => {
            if (!view) return;
            view.querySelectorAll('.locked-char').forEach(span => {
              span.classList.toggle('locked-char--active', charIdx !== null && span.dataset.index === charIdx);
            });
          };
          apply(sampleLockView);
          apply(pingzeLockView);
        };
        const attachHover = (view) => {
          if (!view) return;
          view.addEventListener('mouseover', (event) => {
            const span = event.target.closest('.locked-char');
            if (!span || !span.dataset.index) return;
            highlightMatches(span.dataset.index);
          });
          view.addEventListener('mouseout', () => highlightMatches(null));
        };
        attachHover(sampleLockView);
        attachHover(pingzeLockView);
        const getCurrentMode = () => pingzeModeStates[index] || DEFAULT_MARK_MODE;
        const updateMarkControls = () => {
          const locked = !!lockStates[index];
          pingzeMarkButtons.forEach(btn => {
            const btnMode = btn.dataset.mode || DEFAULT_MARK_MODE;
            btn.disabled = !locked || !editable;
            btn.classList.toggle('active', locked && getCurrentMode() === btnMode);
          });
        };
        pingzeMarkButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            if (!editable || !lockStates[index]) return;
            const nextMode = btn.dataset.mode || DEFAULT_MARK_MODE;
            pingzeModeStates[index] = nextMode;
            updateMarkControls();
          });
        });
        const resolveCharSpan = (node) => {
          if (!node) return null;
          if (node.nodeType === 1 && node.classList && node.classList.contains('locked-char')) {
            return node;
          }
          if (node.parentElement) {
            return node.parentElement.closest('.locked-char');
          }
          return null;
        };
        const applyMarksToRange = (from, to) => {
          const marks = ensureVariantMarks(variants[index], pingzeTextarea?.value || '');
          const mode = getCurrentMode();
          for (let i = from; i <= to; i += 1) {
            marks[i] = mode === 'variable' ? null : mode;
          }
          variants[index].pingzeMarks = marks;
          renderLockedText(pingzeTextarea?.value || '', pingzeLockView, { marks, classMap: MARK_CLASS_MAP });
          highlightMatches(null);
        };
        const handlePingzeSelection = () => {
          if (!editable || !lockStates[index]) return;
          if (!pingzeLockView) return;
          const selection = window.getSelection ? window.getSelection() : null;
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
          const range = selection.getRangeAt(0);
          if (!pingzeLockView.contains(range.commonAncestorContainer)) return;
          const anchorSpan = resolveCharSpan(selection.anchorNode);
          const focusSpan = resolveCharSpan(selection.focusNode);
          if (!anchorSpan || !focusSpan) return;
          if (!pingzeLockView.contains(anchorSpan) || !pingzeLockView.contains(focusSpan)) return;
          const startIdx = parseInt(anchorSpan.dataset.index, 10);
          const endIdx = parseInt(focusSpan.dataset.index, 10);
          if (Number.isNaN(startIdx) || Number.isNaN(endIdx)) return;
          const from = Math.min(startIdx, endIdx);
          const to = Math.max(startIdx, endIdx);
          applyMarksToRange(from, to);
          if (selection.removeAllRanges) selection.removeAllRanges();
        };
        if (pingzeLockView) {
          pingzeLockView.addEventListener('mouseup', handlePingzeSelection);
        }
        const applyLockState = () => {
          const locked = !!lockStates[index] || !editable;
          const setDisplay = (el, show) => {
            if (!el) return;
            el.style.setProperty('display', show ? '' : 'none', show ? '' : 'important');
          };
          setDisplay(sampleInputWrapper, !locked);
          setDisplay(pingzeInputWrapper, !locked);
          setDisplay(sampleLockView, locked);
          setDisplay(pingzeLockView, locked);
          if (locked) {
            renderLockedText(sampleTextarea?.value || '', sampleLockView);
            const marks = ensureVariantMarks(variants[index], pingzeTextarea?.value || '');
            renderLockedText(pingzeTextarea?.value || '', pingzeLockView, { marks, classMap: MARK_CLASS_MAP });
          } else {
            highlightMatches(null);
          }
          if (lockBtn) lockBtn.disabled = !editable || locked;
          if (unlockBtn) unlockBtn.disabled = !editable || !locked;
          updateMarkControls();
        };
        if (lockBtn) {
          lockBtn.addEventListener('click', () => {
            if (!editable || lockStates[index]) return;
            lockStates[index] = true;
            applyLockState();
          });
        }
        if (unlockBtn) {
          unlockBtn.addEventListener('click', () => {
            if (!editable || !lockStates[index]) return;
            lockStates[index] = false;
            applyLockState();
          });
        }
        applyLockState();
      });
      initializeLinkFields(variantListEl);
    }
    renderVariants();

    function syncAddButton() {
      if (!addVariantBtn) return;
      addVariantBtn.style.display = editable ? '' : 'none';
    }

    if (addVariantBtn) {
      addVariantBtn.addEventListener('click', () => {
        if (!editable) return;
        const nextIndex = variants.length;
        const base = variants[0] || {};
        const baseMarks = normalizePingzeMarksForText(base.pingze || '', base.pingzeMarks);
        variants.push({
          name: createVariantName(nextIndex),
          cipai: base.cipai || '',
          author: '',
          summary: '',
          origin: '',
          sample: '',
          pingze: base.pingze || '',
          pingzeMarks: baseMarks.slice(),
          locked: false
        });
        lockStates.push(false);
        pingzeModeStates.push(DEFAULT_MARK_MODE);
        renderVariants();
      });
      syncAddButton();
    }

    registerEditableWatcher((nextEditable) => {
      editable = !!nextEditable;
      syncAddButton();
      renderVariants();
    });
    initializeLinkFields(formContainer);

    function collect() {
      const modeInput = formContainer.querySelector('input[name="lvMode"]:checked');
      if (lockStates) lockStates.fill(true);
      const collectedVariants = Array.from(variantListEl.querySelectorAll('.variant-card')).map((card, idx) => {
        const fetchVal = (sel) => {
          const el = card.querySelector(sel);
          return el ? el.value : '';
        };
        const label = createVariantName(idx);
        const pingzeValue = fetchVal('textarea[data-field="pingze"]');
        const pingzeMarks = normalizePingzeMarksForText(pingzeValue, variants[idx]?.pingzeMarks);
        if (variants[idx]) {
          variants[idx].pingzeMarks = pingzeMarks;
          variants[idx].locked = true;
        }
        return {
          name: label,
          cipai: fetchVal('input[data-field="cipai"]'),
          author: fetchVal('input[data-field="author"]'),
          summary: fetchVal('textarea[data-field="summary"]'),
          origin: fetchVal('textarea[data-field="origin"]'),
          sample: fetchVal('textarea[data-field="sample"]'),
          pingze: pingzeValue,
          pingzeMarks,
          locked: true
        };
      });
      const fields = {
        sub: SUB_KEY,
        subLabel: SUB_LABEL,
        title: (formContainer.querySelector('#lv-title') || {}).value || '',
        otherNames: (formContainer.querySelector('#lv-other') || {}).value || '',
        mode: modeInput ? modeInput.value : mode,
        gongdiao: (formContainer.querySelector('#lv-gongdiao') || {}).value || '',
        variants: collectedVariants,
      };
      return { fields, extra: {} };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
