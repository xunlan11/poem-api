// 文集渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.G = registry.renderAnthology = function renderAnthology(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || null;
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const splitMultilineText = context.splitMultilineText || ((raw) => raw ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []);
    const renderInlinePairs = context.renderInlinePairs || (() => { });
    const isNew = !!context.isNew;
    const name = node ? node.fields?.title || node.fields?.name || '' : '';
    const author = node ? node.fields?.author || '' : '';
    const worksText = Array.isArray(node?.fields?.works) ? node.fields.works.join('、') : (node?.fields?.works || '');
    const overview = node ? node.extra?.overview || '' : '';
    const background = node ? node.extra?.background || '' : '';
    let evaluation = node ? node.extra?.evaluation || [] : [];
    if (isNew && (!Array.isArray(evaluation) || evaluation.length === 0)) evaluation = [{ 出处: '', 内容: '' }];
    formContainer.innerHTML = `
        <div class="grid-2">
          <div class="field"><label>文集</label>
            <div class="field-row"><input id="f-name" type="text" data-link-field="fields.title" value="${escapeHtml(name)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
          </div>
          <div class="field"><label>作者</label><input id="f-author" type="text" data-link-field="fields.author" value="${escapeHtml(author)}"></div>
        </div>
        <div class="field"><label>概述</label><textarea id="f-overview" rows="1" data-link-field="extra.overview" style="width:100%;resize:none;overflow:hidden">${escapeHtml(overview)}</textarea></div>
        <div class="field"><label>包含作品</label><input id="f-works" type="text" data-link-field="fields.works" value="${escapeHtml(worksText)}"></div>
        <div class="field"><label>创作背景</label><textarea id="f-background" rows="1" data-link-field="extra.background" style="width:100%;resize:none;overflow:hidden">${escapeHtml(background)}</textarea></div>
        ${utils.renderNoteListField({ label: '评价', addId: 'addEval', listId: 'evalList' })}
      `;
    initializeLinkFields(formContainer);
    // 查重
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const nameVal = (formContainer.querySelector('#f-name').value || '').trim();
        context.checkDuplicate(nameVal, 'G');
      });
    }
    const overviewEl = formContainer.querySelector('#f-overview');
    const worksInput = formContainer.querySelector('#f-works');
    const evalList = formContainer.querySelector('#evalList');
    const addEvalBtn = formContainer.querySelector('#addEval');
    const evalRenderOpts = { wrapperClass: 'ordered-item note-item', inputClass1: 'c-source', inputClass2: 'c-content', linkFieldPrefix: 'extra.evaluation', onChange: (arr) => { }, paragraphCheck2: true };
    // 评价列表
    const renderEvalsWrapper = () => {renderInlinePairs(evalList, evaluation, '出处', '内容', '出处', '内容', evalRenderOpts);};
    renderEvalsWrapper();
    addEvalBtn && addEvalBtn.addEventListener('click', () => { evaluation.push({ 出处: '', 内容: '' }); renderEvalsWrapper(); });
    // 自动调整大小
    try { utils.bindAutoResize(formContainer, [overviewEl, '#f-background'], context); } catch (err) { }

    function collect() {
      const worksRaw = (worksInput?.value || '').replace(/[，,；;、]/g, '\n');
      const worksList = splitMultilineText(worksRaw);
      const fields = { title: (formContainer.querySelector('#f-name') || {}).value || '', author: (formContainer.querySelector('#f-author') || {}).value || '', works: worksList };
      const extra = {
        overview: (overviewEl || {}).value || '',
        background: (formContainer.querySelector('#f-background') || {}).value || '',
        evaluation: Array.from(evalList.querySelectorAll('.note-item')).map(div => { const s = div.querySelector('.c-source'); const c = div.querySelector('.c-content'); return { 出处: s ? s.value : '', 内容: c ? c.value : '' }; })
      };
      return { fields, extra };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
