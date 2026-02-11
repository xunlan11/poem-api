// 尔雅-合称子类渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.S_hecheng = function renderHecheng(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || null;
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const renderInlinePairs = context.renderInlinePairs || (() => { });
    const splitMultilineText = context.splitMultilineText || ((raw) => raw ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []);
    const isNew = !!context.isNew;
    const statement = node ? node.fields?.statement || '' : '';
    const otherStatement = node ? (node.fields?.otherStatement || (Array.isArray(node.fields?.otherStatements) ? node.fields.otherStatements[0] : '')) : '';
    const introduction = node ? (node.extra?.introduction || node.extra?.explanation || '') : '';
    const personsText = Array.isArray(node?.fields?.persons) ? node.fields.persons.join('、') : (node?.fields?.persons || '');
    let examples = node ? node.fields?.examples || [] : [];
    if (isNew) {
      if (!Array.isArray(examples) || examples.length === 0) examples = [{ 出处: '', 内容: '' }];
    }
    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>表述</label>
          <div class="field-row"><input id="f-statement" type="text" data-link-field="fields.statement" value="${escapeHtml(statement)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field"><label>其他表述</label><input id="f-other-statement" type="text" data-link-field="fields.otherStatement" value="${escapeHtml(otherStatement)}"></div>
      </div> 
      <div class="field"><label>介绍</label><textarea id="f-introduction" rows="1" data-link-field="extra.introduction" style="width:100%;resize:none;overflow:hidden">${escapeHtml(introduction)}</textarea></div>
      <div class="field"><label>涉及主体</label><input id="f-persons" type="text" data-link-field="fields.persons" value="${escapeHtml(personsText)}"></div>
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
    const personsInput = formContainer.querySelector('#f-persons');
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
    try { utils.bindAutoResize(formContainer, ['#f-introduction'], context); } catch (err) { }

    function collect() {
      const personsRaw = (personsInput?.value || '').replace(/[，,；;]/g, '\n');
      const personsList = splitMultilineText(personsRaw);
      const fields = {
        statement: (formContainer.querySelector('#f-statement') || {}).value || '',
        otherStatement: (formContainer.querySelector('#f-other-statement') || {}).value || '',
        persons: personsList,
        examples: Array.from(examplesEl.querySelectorAll('.ordered-item')).map(div => {
          const i = div.querySelectorAll('input');
          return { 出处: i[0].value, 内容: i[1].value };
        })
      };
      const extra = {
        introduction: (formContainer.querySelector('#f-introduction') || {}).value || ''
      };
      return { fields, extra };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
