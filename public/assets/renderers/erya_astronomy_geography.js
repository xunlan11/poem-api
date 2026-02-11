// 尔雅-乾坤风物子类渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.S_qiankunfengwu = function renderQiankunFengwu(ctx) {
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
    const isNew = !!context.isNew;
    const statement = node ? node.fields?.statement || '' : '';
    const otherStatement = node ? (node.fields?.otherStatement || (Array.isArray(node.fields?.otherStatements) ? node.fields.otherStatements[0] : '')) : '';
    const correspond = node ? node.extra?.correspond || '' : '';
    const introduction = node ? (node.extra?.introduction || node.extra?.explanation || '') : '';
    const sameImagery = node ? (node.extra?.sameImagery || '') : '';
    let imagePath = node ? (node.extra?.image || '') : '';
    const basePath = typeof Poem.base === 'function' ? Poem.base() : '';
    const toImageSrc = (path) => path ? `${basePath}${path}` : '';
    let examples = node ? node.fields?.examples || [] : [];
    if (isNew) {
      if (!Array.isArray(examples) || examples.length === 0) examples = [{ 出处: '', 内容: '' }];
    }
    formContainer.innerHTML = `
      <div class="grid-3">
        <div class="field"><label>表述</label>
          <div class="field-row"><input id="f-statement" type="text" data-link-field="fields.statement" value="${escapeHtml(statement)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field"><label>其他表述</label><input id="f-other-statement" type="text" data-link-field="fields.otherStatement" value="${escapeHtml(otherStatement)}"></div>
        <div class="field"><label>对应</label><input id="f-correspond" type="text" data-link-field="extra.correspond" value="${escapeHtml(correspond)}"></div>
      </div> 
      <div class="nature-row">
        <div class="nature-intro">
          <div class="field"><label>介绍</label><textarea id="f-introduction" rows="1" data-link-field="extra.introduction" style="width:100%;resize:none;overflow:hidden">${escapeHtml(introduction)}</textarea></div>
          <div class="field"><label>意象</label><textarea id="f-same-imagery" rows="1" data-link-field="extra.sameImagery" style="width:100%;resize:none;overflow:hidden">${escapeHtml(sameImagery)}</textarea></div>
        </div>
        <div class="field nature-image-field">
          <div class="label-row">
            <label>图片</label><div class="image-note muted">PNG/JPG/WebP/GIF<br>最大 5MB</div>
            <div class="image-actions">
              <button id="natureImageAction" type="button" class="btn small">${imagePath ? '移除' : '上传'}</button>
            </div>
          </div>
          <div id="natureImageBlock" class="image-upload-block">
            <div id="natureImagePreview" class="image-preview">${imagePath ? `<img data-src="${escapeHtml(toImageSrc(imagePath))}" alt="图片预览" loading="lazy">` : '<div class="muted">暂无图片</div>'}</div>
            <input id="natureImageInput" type="file" accept="image/*" style="display:none">
          </div>
        </div>
      </div>
      <div class="field"><label>示例 <button id="addEx" class="btn small add-row">添加</button></label><div id="examples" class="note-list"></div></div>
    `;
    initializeLinkFields(formContainer);
    // 查重
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const stmtVal = (formContainer.querySelector('#f-statement').value || '').trim();
        const otherVal = (formContainer.querySelector('#f-other-statement').value || '').trim();
        const correspondVal = (formContainer.querySelector('#f-correspond').value || '').trim();
        const q = [stmtVal, otherVal, correspondVal].filter(Boolean).join(' ');
        context.checkDuplicate(q, 'S');
      });
    }
    const introInput = formContainer.querySelector('#f-introduction');
    const sameImageryInput = formContainer.querySelector('#f-same-imagery');
    const imageBlock = formContainer.querySelector('#natureImageBlock');
    const imagePreview = formContainer.querySelector('#natureImagePreview');
    const imageActionBtn = formContainer.querySelector('#natureImageAction');
    const fileInput = formContainer.querySelector('#natureImageInput');
    const examplesEl = formContainer.querySelector('#examples');
    const addExBtn = formContainer.querySelector('#addEx');
    // 示例列表
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
    addExBtn && addExBtn.addEventListener('click', () => { examples.push({ 出处: '', 内容: '' }); renderExamplesWrapper(); });
    // 自动调整大小
    try { utils.bindAutoResize(formContainer, ['#f-introduction', '#f-same-imagery'], context); } catch (err) { }

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
    }
    updateImagePreview();

    function ensureEditableStates() {
      if (!imageActionBtn) return;
      imageActionBtn.disabled = !state.editable;
      imageActionBtn.textContent = imagePath ? '移除' : '上传';
    }
    ensureEditableStates();
    imageActionBtn && imageActionBtn.addEventListener('click', () => {
      if (!state.editable) return;
      if (imagePath) {
        imagePath = '';
        if (state.node) {
          state.node.extra = state.node.extra || {};
          state.node.extra.image = '';
        }
        updateImagePreview();
        ensureEditableStates();
        return;
      }
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
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
      if (imageActionBtn) {
        imageActionBtn.disabled = true;
        imageActionBtn.textContent = '上传中...';
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
        ensureEditableStates();
      }
    }

    function collect() {
      const fields = {
        statement: (formContainer.querySelector('#f-statement') || {}).value || '',
        otherStatement: (formContainer.querySelector('#f-other-statement') || {}).value || '',
        examples: Array.from(examplesEl.querySelectorAll('.ordered-item')).map(div => {
          const i = div.querySelectorAll('input');
          return { 出处: i[0].value, 内容: i[1].value };
        })
      };
      const extra = {
        correspond: (formContainer.querySelector('#f-correspond') || {}).value || '',
        introduction: (formContainer.querySelector('#f-introduction') || {}).value || '',
        sameImagery: (formContainer.querySelector('#f-same-imagery') || {}).value || '',
        image: imagePath || ''
      };
      return { fields, extra };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
