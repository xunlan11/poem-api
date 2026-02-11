// 尔雅-金石丝竹子类渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.S_jinshisizhu = function renderJinShiSiZhu(ctx) {
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
    const isNew = !!context.isNew;
    const statement = node ? node.fields?.statement || '' : '';
    const otherStatement = node ? (node.fields?.otherStatement || (Array.isArray(node.fields?.otherStatements) ? node.fields.otherStatements[0] : '')) : '';
    const material = node ? node.fields?.material || '' : '';
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
        <div class="field"><label>八音</label>
          <select id="f-material" data-link-field="fields.material">
            <option value="">-- 请选择 --</option>
            <option value="金">金</option>
            <option value="石">石</option>
            <option value="土">土</option>
            <option value="革">革</option>
            <option value="丝">丝</option>
            <option value="木">木</option>
            <option value="匏">匏</option>
            <option value="竹">竹</option>
          </select>
        </div>
      </div> 
      ${utils.renderNatureRow({ introduction, sameImagery, imagePath, escapeHtml, toImageSrc })}
      ${utils.renderNoteListField({ label: '示例', addId: 'addEx', listId: 'examples' })}
    `;
    initializeLinkFields(formContainer);
    // 查重
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const stmtVal = (formContainer.querySelector('#f-statement').value || '').trim();
        const otherVal = (formContainer.querySelector('#f-other-statement').value || '').trim();
        const q = [stmtVal, otherVal].filter(Boolean).join(' ');
        context.checkDuplicate(q, 'S');
      });
    }
    const introInput = formContainer.querySelector('#f-introduction');
    const sameImageryInput = formContainer.querySelector('#f-same-imagery');
    const imagePreview = formContainer.querySelector('#natureImagePreview');
    const imageActionBtn = formContainer.querySelector('#natureImageAction');
    const fileInput = formContainer.querySelector('#natureImageInput');
    const materialSelect = formContainer.querySelector('#f-material');
    const examplesEl = formContainer.querySelector('#examples');
    const addExBtn = formContainer.querySelector('#addEx');
    utils.bindExampleList({
      examplesEl,
      addExBtn,
      renderInlinePairs,
      linkFieldPrefix: 'fields.examples',
      examplesList: examples
    });
    if (materialSelect && material) materialSelect.value = material;
    // 自动调整大小
    try { utils.bindAutoResize(formContainer, ['#f-introduction', '#f-same-imagery'], context); } catch (err) { }
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

    function collect() {
      const fields = {
        statement: (formContainer.querySelector('#f-statement') || {}).value || '',
        otherStatement: (formContainer.querySelector('#f-other-statement') || {}).value || '',
        material: (formContainer.querySelector('#f-material') || {}).value || '',
        examples: Array.from(examplesEl.querySelectorAll('.ordered-item')).map(div => {
          const i = div.querySelectorAll('input');
          return { 出处: i[0].value, 内容: i[1].value };
        })
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
