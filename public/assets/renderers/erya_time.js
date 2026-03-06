// 尔雅-春秋岁时子类渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.S_erya_time = function renderEryaTime(ctx) {
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
    const sourceRaw = node?.fields?.source;
    const personsRaw = node?.fields?.persons;
    const sourceText = Array.isArray(sourceRaw)
      ? sourceRaw.join('、')
      : (sourceRaw || (Array.isArray(personsRaw) ? personsRaw.join('、') : (personsRaw || '')));
    const sameImagery = node ? (node.extra?.sameImagery || '') : '';
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
      <div class="field"><label>出处</label><input id="f-source" type="text" data-link-field="fields.source" value="${escapeHtml(sourceText)}"></div>
      <div class="field"><label>意象</label><textarea id="f-same-imagery" rows="1" data-link-field="extra.sameImagery" style="width:100%;resize:none;overflow:hidden">${escapeHtml(sameImagery)}</textarea></div>
      <div class="field field-sample-gap"><label>示例 <button id="addEx" class="btn small add-row">添加</button></label><div id="examples" class="note-list"></div></div>
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
    const sourceInput = formContainer.querySelector('#f-source');
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
    try { utils.bindAutoResize(formContainer, ['#f-introduction', '#f-same-imagery'], context); } catch (err) { }

    function collect() {
      const sourceRawValue = (sourceInput?.value || '').replace(/[，,；;]/g, '\n');
      const sourceList = splitMultilineText(sourceRawValue);
      const fields = {
        statement: (formContainer.querySelector('#f-statement') || {}).value || '',
        otherStatement: (formContainer.querySelector('#f-other-statement') || {}).value || '',
        source: sourceList,
        examples: Array.from(examplesEl.querySelectorAll('.ordered-item')).map(div => {
          const i = div.querySelectorAll('input');
          return { 出处: i[0].value, 内容: i[1].value };
        })
      };
      const extra = {
        introduction: (formContainer.querySelector('#f-introduction') || {}).value || '',
        sameImagery: (formContainer.querySelector('#f-same-imagery') || {}).value || ''
      };
      return { fields, extra };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
