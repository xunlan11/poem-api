(function (root) {
  if (!root) return;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.S = registry.renderNatureEntry = function renderNatureEntry(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || null;
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const renderInlinePairs = context.renderInlinePairs || (() => { });
    const autosizeTextarea = context.autosizeTextarea || (() => { });
    const state = context.state || {};
    const Poem = context.Poem || root.Poem || {};
    const windowRef = context.window || root;
    const commonName = node ? node.fields?.commonName || '' : '';
    const statement = node ? node.fields?.statement || '' : '';
    const scientificName = node ? node.fields?.scientificName || '' : '';
    const family = node ? node.fields?.family || '' : '';
    const genus = node ? node.fields?.genus || '' : '';
    let imagePath = node ? (node.extra?.image || '') : '';
    const basePath = typeof Poem.base === 'function' ? Poem.base() : '';
    const toImageSrc = (path) => path ? `${basePath}${path}` : '';
    const introduction = node ? (node.extra?.introduction || node.extra?.explanation || '') : '';
    const sameImagery = node ? (node.extra?.sameImagery || '') : '';
    let examples = node ? node.fields?.examples || [] : [];
    if (!Array.isArray(examples) || examples.length === 0) examples = [{ 出处: '', 内容: '' }];
    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>通用名</label>
          <div class="field-row"><input id="f-common-name" type="text" data-link-field="fields.commonName" value="${escapeHtml(commonName)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
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
      <div class="field"><label>示例 <button id="addEx" class="btn small add-row">添加</button></label><div id="examples" class="note-list"></div></div>
    `;
    initializeLinkFields(formContainer);
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const commonVal = (formContainer.querySelector('#f-common-name').value || '').trim();
        const sciVal = (formContainer.querySelector('#f-scientific-name').value || '').trim();
        const q = [commonVal, sciVal].filter(Boolean).join(' ');
        context.checkDuplicate(q, 'S');
      });
    }
    const introInput = formContainer.querySelector('#f-introduction');
    const sameImageryInput = formContainer.querySelector('#f-same-imagery');
    const imageBlock = formContainer.querySelector('#natureImageBlock');
    const imagePreview = formContainer.querySelector('#natureImagePreview');
    const uploadBtn = formContainer.querySelector('#uploadNatureImage');
    const clearBtn = formContainer.querySelector('#clearNatureImage');
    const fileInput = formContainer.querySelector('#natureImageInput');
    const examplesEl = formContainer.querySelector('#examples');
    const addExBtn = formContainer.querySelector('#addEx');
    const renderExamplesWrapper = () => renderInlinePairs(examplesEl, examples, '出处', '内容', '出处', '内容', {
      containerClass: 'note-list',
      wrapperClass: 'ordered-item note-item',
      inputClass1: 'c-source',
      inputClass2: 'c-content',
      linkFieldPrefix: 'fields.examples',
      onChange: (arr) => { },
      paragraphCheck2: true,
    });
    renderExamplesWrapper();

    try {
      if (introInput) {
        autosizeTextarea(introInput);
        try { if (introInput.__autosizeHandler) introInput.removeEventListener('input', introInput.__autosizeHandler); } catch (err) { }
        introInput.__autosizeHandler = () => autosizeTextarea(introInput);
        introInput.addEventListener('input', introInput.__autosizeHandler);
      }
      if (sameImageryInput) {
        autosizeTextarea(sameImageryInput);
        try { if (sameImageryInput.__autosizeHandler) sameImageryInput.removeEventListener('input', sameImageryInput.__autosizeHandler); } catch (err) { }
        sameImageryInput.__autosizeHandler = () => autosizeTextarea(sameImageryInput);
        sameImageryInput.addEventListener('input', sameImageryInput.__autosizeHandler);
      }
    } catch (err) { }

    addExBtn && addExBtn.addEventListener('click', () => {
      examples.push({ 出处: '', 内容: '' });
      renderExamplesWrapper();
    });

    try {
      const previewImg = imagePreview && imagePreview.querySelector('img[data-src]');
      if (previewImg) {
        const setSrc = () => {
          if (!previewImg.getAttribute('src')) previewImg.setAttribute('src', previewImg.getAttribute('data-src'));
        };
        if ('IntersectionObserver' in windowRef) {
          const io = new windowRef.IntersectionObserver((entries) => {
            entries.forEach(en => { if (en.isIntersecting) { setSrc(); io.disconnect(); } });
          });
          io.observe(previewImg);
        } else {
          windowRef.requestAnimationFrame?.(setSrc);
        }
      }
    } catch (err) { }

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
        Poem.toast?.('图片需小于5MB');
        fileInput.value = '';
        return;
      }
      uploadImageFile(file);
    });

    async function uploadImageFile(file) {
      if (!state.editable) {
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
        const resp = await fetch(`${typeof Poem.base === 'function' ? Poem.base() : ''}/api/upload/image`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        if (!resp.ok) {
          let errText = '上传失败';
          try { const err = await resp.json(); if (err && err.error) errText = err.error; } catch (error) { }
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
      } catch (err) {
        console.error(err);
        Poem.toast?.(err.message || '上传失败');
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
  };
})(typeof window !== 'undefined' ? window : this);
