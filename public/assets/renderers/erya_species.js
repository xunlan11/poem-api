// 尔雅-鸟兽草木子类渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.renderNatureEntry = function renderNatureEntry(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || null;
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const renderInlinePairs = context.renderInlinePairs || (() => { });
    const state = context.state || {};
    const Poem = context.Poem || root.Poem || {};
    const windowRef = context.window || root;
    const commonName = node ? node.fields?.commonName || '' : '';
    const statement = node ? node.fields?.statement || '' : '';
    const scientificName = node ? node.fields?.scientificName || '' : '';
    const family = node ? node.fields?.family || '' : '';
    const genus = node ? node.fields?.genus || '' : '';
    const aliases = node ? node.fields?.aliases || '' : '';
    let imagePath = node ? (node.extra?.image || '') : '';
    const basePath = typeof Poem.base === 'function' ? Poem.base() : '';
    const toImageSrc = (path) => path ? `${basePath}${path}` : '';
    const introduction = node ? (node.extra?.introduction || node.extra?.explanation || '') : '';
    const sameImagery = node ? (node.extra?.sameImagery || '') : '';
    let examples = node ? node.fields?.examples || [] : [];
    if (!Array.isArray(examples) || examples.length === 0) examples = [{ 出处: '', 内容: '' }];
    formContainer.innerHTML = `
      <div class="grid-3">
        <div class="field"><label>通用名</label>
          <div class="field-row"><input id="f-common-name" type="text" data-link-field="fields.commonName" value="${escapeHtml(commonName)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field"><label>表述</label><input id="f-statement" type="text" data-link-field="fields.statement" value="${escapeHtml(statement)}"></div>
        <div class="field"><label>别称</label><input id="f-aliases" type="text" data-link-field="fields.aliases" value="${escapeHtml(aliases)}"></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>学名</label><input id="f-scientific-name" type="text" data-link-field="fields.scientificName" class="skip-self-check" value="${escapeHtml(scientificName)}"></div>
        <div class="field"><label>科</label><input id="f-family" type="text" data-link-field="fields.family" value="${escapeHtml(family)}"></div>
        <div class="field"><label>属</label><input id="f-genus" type="text" data-link-field="fields.genus" value="${escapeHtml(genus)}"></div>
      </div>
      ${utils.renderNatureRow({ introduction, sameImagery, imagePath, escapeHtml, toImageSrc })}
      ${utils.renderNoteListField({ label: '示例', addId: 'addEx', listId: 'examples' })}
    `;
    initializeLinkFields(formContainer);
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const commonVal = (formContainer.querySelector('#f-common-name').value || '').trim();
        const stmtVal = (formContainer.querySelector('#f-statement').value || '').trim();
        const aliasVal = (formContainer.querySelector('#f-aliases').value || '').trim();
        const q = [commonVal, stmtVal, aliasVal].filter(Boolean).join(' ');
        context.checkDuplicate(q, 'S');
      });
    }
    const introInput = formContainer.querySelector('#f-introduction');
    const sameImageryInput = formContainer.querySelector('#f-same-imagery');
    const imagePreview = formContainer.querySelector('#natureImagePreview');
    const imageActionBtn = formContainer.querySelector('#natureImageAction');
    const fileInput = formContainer.querySelector('#natureImageInput');
    const examplesEl = formContainer.querySelector('#examples');
    const addExBtn = formContainer.querySelector('#addEx');
    utils.bindExampleList({
      examplesEl,
      addExBtn,
      renderInlinePairs,
      linkFieldPrefix: 'fields.examples',
      examplesList: examples
    });

    // 自动调整大小
    try {
      utils.bindAutoResize(formContainer, [introInput, sameImageryInput], context);
    } catch (err) { }

    utils.bindNatureImage({
      state,
      Poem,
      windowRef,
      imagePreview,
      imageActionBtn,
      fileInput,
      escapeHtml,
      toImageSrc,
      getImagePath: () => imagePath,
      setImagePath: (val) => { imagePath = val || ''; },
      syncNode: (val) => {
        if (state.node) {
          state.node.extra = state.node.extra || {};
          state.node.extra.image = val || '';
        }
      }
    });

    // 收集表单数据的函数
    function collect() {
      const fields = {
        commonName: (formContainer.querySelector('#f-common-name') || {}).value || '',
        statement: (formContainer.querySelector('#f-statement') || {}).value || '',
        scientificName: (formContainer.querySelector('#f-scientific-name') || {}).value || '',
        family: (formContainer.querySelector('#f-family') || {}).value || '',
        genus: (formContainer.querySelector('#f-genus') || {}).value || '',
        aliases: (formContainer.querySelector('#f-aliases') || {}).value || '',
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
  registry.S_niaoshoucao = registry.renderNatureEntry;
})(typeof window !== 'undefined' ? window : this);
