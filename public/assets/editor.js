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
  const editableWatchers = [];
  let requestImmediateSave = null;
  let saveInFlight = false;
  let currentSavePromise = null;
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

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
        try { Poem.toast('当前为只读模式，请先点击“编辑”'); } catch (e) { }
        return;
      }
      try {
        runSelfCheck();
      } catch (err) {
        console.error(err);
        try { Poem.toast('自检执行失败，请稍后再试'); } catch (e) { }
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

  function registerEditableWatcher(fn) {
    if (typeof fn !== 'function') return () => { };
    editableWatchers.push(fn);
    try { fn(!!state.editable); } catch (e) { }
    return () => {
      const idx = editableWatchers.indexOf(fn);
      if (idx >= 0) editableWatchers.splice(idx, 1);
    };
  }

  function setEditable(nextEditable) {
    const editable = !!nextEditable;
    if (state.editable === editable) {
      refreshActionButtons();
      return;
    }
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
  }

  function refreshActionButtons() {
    const editable = !!state.editable;
    if (editBtn) editBtn.disabled = editable || saveInFlight;
    if (saveBtn) {
      saveBtn.disabled = !editable || saveInFlight;
      saveBtn.textContent = saveInFlight ? '保存中…' : '保存';
    }
    if (reviewBtn) reviewBtn.disabled = !editable || saveInFlight;
    if (selfCheckBtn) selfCheckBtn.disabled = !editable || saveInFlight;
    if (linkBtn) linkBtn.disabled = editable;
  }

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

  function splitMultilineText(raw) {
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

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
        delBtn.className = 'btn small del-row';
        delBtn.addEventListener('click', () => removeEntry(index));
        delWrap.appendChild(delBtn);
        wrapper.appendChild(delWrap);
      }
      container.appendChild(wrapper);
    });
    initializeLinkFields(container);
  }

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
    };
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
      replaceLinks([]);
      // new node => current user is effectively the owner for permission checks
      isOwner = true;
      if (linkBtn) linkBtn.style.display = 'inline-block';
      setEditable(true);
    }
    else {
      const node = await Poem.api(`/api/node/${id}`);
      state.node = node;
      if (!Array.isArray(state.node.links)) state.node.links = [];
      const loadedLinks = state.node.links.map(normalizeLink).filter(Boolean);
      replaceLinks(loadedLinks);
      nodeIdEl.textContent = node.id;
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
                try { Poem.toast('当前无法填写时长'); } catch (err) { }
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
            const draftLinks = Array.isArray(state.node.links) ? state.node.links.map(normalizeLink).filter(Boolean) : [];
            replaceLinks(draftLinks);
          }
        } catch (e) { }
      }
    } catch (e) { }

    let renderer;
    const t = isNew ? type : state.node.type;
    const backListTarget = returnQuery ? `list.html?${returnQuery}` : `list.html${t ? `?type=${t}` : ''}`;
    const backAllTarget = (returnQuery && /(^|&)type=A(&|$)/.test(returnQuery)) ? `list.html?${returnQuery}` : 'list.html?type=A';
    const rendererFactory = getRendererFactory(t);
    if (rendererFactory) {
      renderer = rendererFactory(buildRendererContext(state.node, t));
    } else {
      formContainer.innerHTML = '<div class="section-card">未知类型</div>';
    }

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

    setLinkingImmediateSave(requestImmediateSave);

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
        formContainer.addEventListener('change', () => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(doSave, 500); });
        window.addEventListener('beforeunload', doSave);
      }
    } catch (e) { }
  }

  init();
})();