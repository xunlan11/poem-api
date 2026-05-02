// 词曲谱渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  // 子类型
  const SUB_KEY = 'ciqupu'; 
  const SUB_LABEL = '词曲谱'; 
  // 标记类型的CSS类映射
  const MARK_CLASS_MAP = {
    fixed: 'locked-char--fixed',
    rhyme: 'locked-char--rhyme'
  }; // 标记类型CSS类映射
  // 默认标记模式
  const DEFAULT_MARK_MODE = 'variable'; // 默认平仄标记模式

  // 计算可渲染字符数的函数（排除换行符）
  function countRenderableChars(text) {
    if (!text) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '\n') count += 1;
    }
    return count;
  }

  function decodePingzeMarks(marks) {
    if (Array.isArray(marks)) return marks;
    if (typeof marks !== 'string') return [];
    const decoded = [];
    for (let i = 0; i < marks.length; i += 1) {
      const ch = marks[i];
      if (ch === 'F') decoded.push('fixed');
      else if (ch === 'R') decoded.push('rhyme');
      else decoded.push(null);
    }
    return decoded;
  }

  function encodePingzeMarks(marks) {
    if (!Array.isArray(marks) || !marks.length) return '';
    let packed = '';
    for (let i = 0; i < marks.length; i += 1) {
      const mark = marks[i];
      if (mark === 'fixed') packed += 'F';
      else if (mark === 'rhyme') packed += 'R';
      else packed += '.';
    }
    return packed;
  }

  // 标准化平仄标记以匹配文本长度的函数
  function normalizePingzeMarksForText(text, marks) {
    const total = countRenderableChars(text);
    const source = decodePingzeMarks(marks);
    const normalized = [];
    for (let i = 0; i < total; i += 1) {
      normalized[i] = source[i] || null;
    }
    return normalized;
  }

  // 渲染词曲谱表单的主函数
  registry[`L_${SUB_KEY}`] = function renderLvCiqupu(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || {};
    const documentRef = context.document || root.document;
    let editable = context.state ? !!context.state.editable : true;
    // 从上下文获取辅助函数
    const registerEditableWatcher = typeof context.registerEditableWatcher === 'function' ? context.registerEditableWatcher : () => () => { };
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    // 提取节点字段数据
    const title = node.fields?.title || '';
    const otherNames = node.fields?.otherNames || '';
    const overview = node.extra?.overview || '';
    const mode = node.fields?.mode || 'single';
    const gongdiao = node.fields?.gongdiao || '';

    // 创建变体名称的函数
    function createVariantName(index) {
      if (index === 0) return '正体';
      return `变体${index}`;
    }

    // 标准化变体列表的函数
    function normalizeVariants(list) {
      if (!Array.isArray(list) || !list.length) {
        return [{ name: '正体', cipai: '', author: '', origin: '', sample: '', pingze: '', pingzeMarks: [], locked: false }];
      }
      return list.map((item, idx) => ({
        name: item?.name || createVariantName(idx),
        cipai: item?.cipai || '',
        author: item?.author || '',
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
    // 生成表单HTML结构
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
      <div class="field" style="margin-bottom:12px"><label>概述</label><textarea id="lv-overview" rows="1" data-link-field="extra.overview" style="width:100%;resize:none;overflow:hidden">${escapeHtml(overview)}</textarea></div>
      <div class="field">
        <div class="label-row">
          <label>共 <span id="lv-variant-count">${variants.length}</span> 体</label>
          <button type="button" class="btn small" id="lv-add-variant">新增变体</button>
        </div>
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
    // 确保状态数组长度的函数
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
    // 确保变体标记的函数
    const ensureVariantMarks = (variant, text) => {
      if (!variant) return [];
      const normalized = normalizePingzeMarksForText(text, variant.pingzeMarks);
      variant.pingzeMarks = normalized;
      return normalized;
    };

    // 渲染锁定文本的函数
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

    // 渲染变体列表的函数
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
          <div class="field"><label>起源</label><textarea rows="1" data-autosize-min="32" data-field="origin" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.origin || '')}</textarea></div>
          <div class="grid-2">
            <div class="field variant-sample-field">
              <div class="label-row">
                <label>例词</label>
                <div class="body-lock-controls variant-lock-controls">
                  <button type="button" class="btn small" data-act="toggle-lock">🔒 锁定</button>
                </div>
              </div>
              <div class="input-wrapper sample-input-wrapper">
                <textarea rows="1" data-autosize-min="32" data-field="sample" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.sample || '')}</textarea>
              </div>
              <div class="locked-text sample-lock-view" style="display:none"></div>
              <div class="self-check-anchor" id="ciqupu-sample-anchor-${index}"></div>
            </div>
            <div class="field variant-pingze-field">
              <div class="label-row">
                <label>平仄</label>
                <div class="pingze-mark-buttons">
                  <button type="button" class="btn small" data-mode="variable">可变</button>
                  <button type="button" class="btn small" data-mode="fixed">固定</button>
                  <button type="button" class="btn small" data-mode="rhyme">韵脚</button>
                </div>
              </div>
              <div class="input-wrapper pingze-input-wrapper">
                <textarea rows="1" data-autosize-min="32" data-field="pingze" style="width:100%;resize:none;overflow:hidden">${escapeHtml(variant.pingze || '')}</textarea>
              </div>
              <div class="locked-text pingze-lock-view" style="display:none"></div>
              <div class="self-check-anchor" id="ciqupu-pingze-anchor-${index}"></div>
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
          if (input.tagName === 'TEXTAREA') utils.autoResizeTextarea(input, context);
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
        try {
          if (sampleTextarea && sampleTextarea.dataset) sampleTextarea.dataset.selfCheckAnchor = `ciqupu-sample-anchor-${index}`;
          if (pingzeTextarea && pingzeTextarea.dataset) pingzeTextarea.dataset.selfCheckAnchor = `ciqupu-pingze-anchor-${index}`;
        } catch (e) { }
        const sampleInputWrapper = wrapper.querySelector('.sample-input-wrapper');
        const pingzeInputWrapper = wrapper.querySelector('.pingze-input-wrapper');
        const lockControls = wrapper.querySelector('.variant-lock-controls');
        const toggleLockBtn = lockControls?.querySelector('[data-act="toggle-lock"]');
        const sampleLockView = wrapper.querySelector('.sample-lock-view');
        const pingzeLockView = wrapper.querySelector('.pingze-lock-view');
        const pingzeMarkButtons = Array.from(wrapper.querySelectorAll('.pingze-mark-buttons .btn'));
        const pingzeMarkButtonsWrap = wrapper.querySelector('.pingze-mark-buttons');
        if (lockControls) {
          lockControls.style.display = editable ? '' : 'none';
        }
        if (pingzeMarkButtonsWrap) pingzeMarkButtonsWrap.style.display = editable ? '' : 'none';
        // 高亮匹配字符的函数
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
        // 附加悬停事件的函数
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
        // 获取当前标记模式的函数
        const getCurrentMode = () => pingzeModeStates[index] || DEFAULT_MARK_MODE;
        // 更新标记控件状态的函数
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
        // 解析字符跨度的函数
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
        // 应用标记到范围的函数
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
        // 处理平仄选择的函数
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
        // 应用锁定状态的函数
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
          if (toggleLockBtn) {
            toggleLockBtn.disabled = !editable;
            toggleLockBtn.textContent = locked ? '✏️ 编辑' : '🔒 锁定';
          }
          updateMarkControls();
        };
        if (toggleLockBtn) {
          toggleLockBtn.addEventListener('click', () => {
            if (!editable) return;
            lockStates[index] = !lockStates[index];
            applyLockState();
          });
        }
        applyLockState();
      });
      initializeLinkFields(variantListEl);
    }
    renderVariants();

    // 自检自动修正可能会修改隐藏的 textarea 值；锁定视图需同步刷新
    try {
      if (formContainer.__ciqupuSelfcheckHandler && documentRef?.removeEventListener) {
        documentRef.removeEventListener('poem:selfcheck:after', formContainer.__ciqupuSelfcheckHandler);
      }
    } catch (e) { }
    const handleSelfCheckAfter = () => {
      try {
        const cards = Array.from(variantListEl.querySelectorAll('.variant-card'));
        cards.forEach((card, idx) => {
          const isLocked = !!lockStates[idx] || !editable;
          if (!isLocked) return;
          const sampleTextarea = card.querySelector('textarea[data-field="sample"]');
          const pingzeTextarea = card.querySelector('textarea[data-field="pingze"]');
          const sampleLockView = card.querySelector('.sample-lock-view');
          const pingzeLockView = card.querySelector('.pingze-lock-view');
          if (sampleLockView && sampleTextarea) {
            renderLockedText(sampleTextarea.value || '', sampleLockView);
          }
          if (pingzeLockView && pingzeTextarea) {
            const marks = normalizePingzeMarksForText(pingzeTextarea.value || '', variants[idx]?.pingzeMarks);
            if (variants[idx]) variants[idx].pingzeMarks = marks;
            renderLockedText(pingzeTextarea.value || '', pingzeLockView, { marks, classMap: MARK_CLASS_MAP });
          }
        });
      } catch (e) { }
    };
    try {
      if (documentRef?.addEventListener) {
        documentRef.addEventListener('poem:selfcheck:after', handleSelfCheckAfter);
        formContainer.__ciqupuSelfcheckHandler = handleSelfCheckAfter;
      }
    } catch (e) { }

    // 同步添加按钮显示状态的函数
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

    // 收集表单数据的函数
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
        const packedMarks = encodePingzeMarks(pingzeMarks);
        if (variants[idx]) {
          variants[idx].pingzeMarks = pingzeMarks;
          variants[idx].locked = true;
        }
        return {
          name: label,
          cipai: fetchVal('input[data-field="cipai"]'),
          author: fetchVal('input[data-field="author"]'),
          origin: fetchVal('textarea[data-field="origin"]'),
          sample: fetchVal('textarea[data-field="sample"]'),
          pingze: pingzeValue,
          pingzeMarks: packedMarks,
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
      return { fields, extra: { overview: (formContainer.querySelector('#lv-overview') || {}).value || '' } };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
