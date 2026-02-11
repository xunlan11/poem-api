// 渲染器通用函数库
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils = root.PoemRendererUtils || {};

  // 自动调整文本区域大小
  utils.autoResizeTextarea = function(el, context) {
    if (!el || !context) return;
    const autosizeTextarea = context.autosizeTextarea || (() => {});
    autosizeTextarea(el);
    try {
      if (el.__autosizeHandler) el.removeEventListener('input', el.__autosizeHandler);
    } catch (err) {}
    el.__autosizeHandler = () => autosizeTextarea(el);
    el.addEventListener('input', el.__autosizeHandler);
  };

  // 批量应用autoResizeTextarea
  utils.bindAutoResize = function(container, selectors, context) {
    if (!container || !selectors || !context) return;
    if (typeof selectors === 'string') {
      selectors = [selectors];
    }
    if (!Array.isArray(selectors)) {
      selectors = [selectors];
    }
    selectors.forEach(selector => {
      let el;
      if (typeof selector === 'string') {
        el = container.querySelector(selector);
      } else {
        el = selector; 
      }
      if (el) {
        utils.autoResizeTextarea(el, context);
      }
    });
  };

  // 生成带“添加”按钮的列表区域模板
  utils.renderNoteListField = function(options) {
    const opts = options || {};
    const label = typeof opts.label === 'string' ? opts.label : '示例';
    const addId = typeof opts.addId === 'string' ? opts.addId : 'addEx';
    const listId = typeof opts.listId === 'string' ? opts.listId : 'examples';
    const buttonText = typeof opts.buttonText === 'string' ? opts.buttonText : '添加';
    const listClass = typeof opts.listClass === 'string' ? opts.listClass : 'note-list';
    const buttonClass = typeof opts.buttonClass === 'string' ? opts.buttonClass : 'btn small add-row';
    return `
      <div class="field"><label>${label} <button id="${addId}" class="${buttonClass}">${buttonText}</button></label><div id="${listId}" class="${listClass}"></div></div>
    `;
  };

  // 生成“介绍/意象 + 图片上传”复合模板
  utils.renderNatureRow = function(options) {
    const opts = options || {};
    const escapeHtml = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : (s => String(s || ''));
    const introduction = typeof opts.introduction === 'string' ? opts.introduction : '';
    const sameImagery = typeof opts.sameImagery === 'string' ? opts.sameImagery : '';
    const imagePath = typeof opts.imagePath === 'string' ? opts.imagePath : '';
    const toImageSrc = typeof opts.toImageSrc === 'function' ? opts.toImageSrc : (path => path || '');
    const imageActionText = imagePath ? '移除' : '上传';
    const imagePreview = imagePath
      ? `<img data-src="${escapeHtml(toImageSrc(imagePath))}" alt="图片预览" loading="lazy">`
      : '<div class="muted">暂无图片</div>';
    return `
      <div class="nature-row">
        <div class="nature-intro">
          <div class="field"><label>介绍</label><textarea id="f-introduction" rows="1" data-link-field="extra.introduction" style="width:100%;resize:none;overflow:hidden">${escapeHtml(introduction)}</textarea></div>
          <div class="field"><label>意象</label><textarea id="f-same-imagery" rows="1" data-link-field="extra.sameImagery" style="width:100%;resize:none;overflow:hidden">${escapeHtml(sameImagery)}</textarea></div>
        </div>
        <div class="field nature-image-field">
          <div class="label-row">
            <label>图片</label><div class="image-note muted">PNG/JPG/WebP/GIF<br>最大 5MB</div>
            <div class="image-actions">
              <button id="natureImageAction" type="button" class="btn small">${imageActionText}</button>
            </div>
          </div>
          <div id="natureImageBlock" class="image-upload-block">
            <div id="natureImagePreview" class="image-preview">${imagePreview}</div>
            <input id="natureImageInput" type="file" accept="image/*" style="display:none">
          </div>
        </div>
      </div>
    `;
  };

  // 绑定尔雅图片上传与预览逻辑
  utils.bindNatureImage = function(options) {
    const opts = options || {};
    const state = opts.state || {};
    const Poem = opts.Poem || {};
    const windowRef = opts.windowRef || (typeof window !== 'undefined' ? window : null);
    const imagePreview = opts.imagePreview || null;
    const imageActionBtn = opts.imageActionBtn || null;
    const fileInput = opts.fileInput || null;
    const escapeHtml = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : (s => String(s || ''));
    const toImageSrc = typeof opts.toImageSrc === 'function' ? opts.toImageSrc : (path => path || '');
    const getImagePath = typeof opts.getImagePath === 'function' ? opts.getImagePath : () => '';
    const setImagePath = typeof opts.setImagePath === 'function' ? opts.setImagePath : () => { };
    const syncNode = typeof opts.syncNode === 'function' ? opts.syncNode : () => { };

    function updateImagePreview() {
      if (!imagePreview) return;
      const imagePath = getImagePath();
      if (imagePath) {
        imagePreview.innerHTML = `<img src="${escapeHtml(toImageSrc(imagePath))}" alt="图片预览">`;
      } else {
        imagePreview.innerHTML = '<div class="muted">暂无图片</div>';
      }
    }

    function ensureEditableStates() {
      if (!imageActionBtn) return;
      const imagePath = getImagePath();
      imageActionBtn.disabled = !state.editable;
      imageActionBtn.textContent = imagePath ? '移除' : '上传';
    }

    try {
      const previewImg = imagePreview && imagePreview.querySelector('img[data-src]');
      if (previewImg) {
        const setSrc = () => {
          if (!previewImg.getAttribute('src')) {
            previewImg.setAttribute('src', previewImg.getAttribute('data-src'));
          }
        };
        if (windowRef && 'IntersectionObserver' in windowRef) {
          const io = new windowRef.IntersectionObserver((entries) => {
            entries.forEach(en => { if (en.isIntersecting) { setSrc(); io.disconnect(); } });
          });
          io.observe(previewImg);
        } else if (windowRef && windowRef.requestAnimationFrame) {
          windowRef.requestAnimationFrame(setSrc);
        } else {
          setSrc();
        }
      }
    } catch (err) { }

    updateImagePreview();
    ensureEditableStates();

    if (imageActionBtn) {
      imageActionBtn.addEventListener('click', () => {
        if (!state.editable) return;
        const imagePath = getImagePath();
        if (imagePath) {
          setImagePath('');
          syncNode('');
          updateImagePreview();
          ensureEditableStates();
          return;
        }
        if (fileInput) {
          fileInput.value = '';
          fileInput.click();
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          if (Poem.toast) Poem.toast('图片需小于5MB');
          fileInput.value = '';
          return;
        }
        uploadImageFile(file);
      });
    }

    async function uploadImageFile(file) {
      if (!state.editable) return;
      if (imageActionBtn) {
        imageActionBtn.disabled = true;
        imageActionBtn.textContent = '上传中...';
      }
      try {
        const formData = new FormData();
        formData.append('image', file);
        if (state.node && state.node.id) formData.append('nodeId', state.node.id);
        const base = typeof Poem.base === 'function' ? Poem.base() : '';
        const resp = await fetch(`${base}/api/upload/image`, {
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
        const nextPath = data.path || '';
        setImagePath(nextPath);
        syncNode(nextPath);
        updateImagePreview();
        ensureEditableStates();
      } catch (err) {
        console.error(err);
        if (Poem.toast) Poem.toast(err.message || '上传失败');
      } finally {
        ensureEditableStates();
      }
    }

    return { updateImagePreview, ensureEditableStates };
  };

  // 绑定“示例”列表的渲染与添加逻辑
  utils.bindExampleList = function(options) {
    const opts = options || {};
    const examplesEl = opts.examplesEl || null;
    const addExBtn = opts.addExBtn || null;
    const renderInlinePairs = typeof opts.renderInlinePairs === 'function' ? opts.renderInlinePairs : () => { };
    const linkFieldPrefix = opts.linkFieldPrefix || 'fields.examples';
    const listRef = opts.examplesList;
    const list = Array.isArray(listRef) ? listRef : [];
    const renderExamples = () => renderInlinePairs(examplesEl, list, '出处', '内容', '出处', '内容', {
      containerClass: 'note-list',
      wrapperClass: 'ordered-item note-item',
      inputClass1: 'c-source',
      inputClass2: 'c-content',
      linkFieldPrefix,
      onChange: () => { },
      paragraphCheck2: true,
    });
    renderExamples();
    if (addExBtn) {
      addExBtn.addEventListener('click', () => {
        list.push({ 出处: '', 内容: '' });
        renderExamples();
      });
    }
    return list;
  };

})(typeof window !== 'undefined' ? window : this);