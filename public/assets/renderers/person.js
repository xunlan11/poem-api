(function (root) {
  if (!root) return;
  const registry = root.PoemRenderers = root.PoemRenderers || {};

  registry.C = registry.renderPerson = function renderPerson(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || null;
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const renderInlinePairs = context.renderInlinePairs || (() => { });
    const splitMultilineText = context.splitMultilineText || ((raw) => raw ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []);
    const autosizeTextarea = context.autosizeTextarea || (() => { });
    const isNew = !!context.isNew;

    const common = node ? node.fields?.common || '' : '';
    const name = node ? node.fields?.name || node.fields?.title || '' : '';
    const period = node ? node.fields?.period || '' : '';
    const life = node ? node.fields?.life || '' : '';
    const hometown = node ? node.fields?.hometown || '' : '';
    const courtesy = node ? node.fields?.courtesy || '' : '';
    const pseudonym = node ? node.fields?.pseudonym || '' : '';
    const posthumous = node ? node.fields?.posthumous || '' : '';
    const aliases = node ? node.fields?.aliases || '' : '';
    const school = node ? node.fields?.school || '' : '';
    let joint = node ? (Array.isArray(node.fields?.joint) ? node.fields.joint : (node.fields?.joint ? [{ 合称: node.fields.joint, '其他人物': '' }] : [])) : [];
    const repWorksText = Array.isArray(node?.fields?.repWorks) ? node.fields.repWorks.join('、') : (node?.fields?.repWorks || '');
    const anthosText = Array.isArray(node?.fields?.anthos) ? node.fields.anthos.join('、') : (node?.fields?.anthos || '');
    let relations = node ? node.fields?.relations || [] : [];
    let chrono = node ? node.fields?.chrono || [] : [];
    const achievements = node ? node.extra?.achievements || '' : '';
    let evaluation = node ? node.extra?.evaluation || [] : [];
    let relatedE = node ? node.fields?.relatedE || [] : [];

    if (isNew) {
      if (!Array.isArray(joint) || joint.length === 0) joint = [{ 合称: '', '其他人物': '' }];
      if (!Array.isArray(relations) || relations.length === 0) relations = [{ 人物: '', 关系: '' }];
      if (!Array.isArray(chrono) || chrono.length === 0) chrono = [{ 纪年: '', 事件: '' }];
      if (!Array.isArray(evaluation) || evaluation.length === 0) evaluation = [{ 出处: '', 内容: '' }];
      if (!Array.isArray(relatedE) || relatedE.length === 0) relatedE = [{ 典故名: '', 内容: '' }];
    }

    formContainer.innerHTML = `
      <div class="grid-3">
        <div class="field"><label>通用名</label>
          <div class="field-row"><input id="f-common" type="text" data-link-field="fields.common" value="${escapeHtml(common)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field"><label>姓（氏）名</label><input id="f-name" type="text" data-link-field="fields.name" value="${escapeHtml(name)}"></div>
        <div class="field"><label>籍贯</label><input id="f-hometown" type="text" data-link-field="fields.hometown" value="${escapeHtml(hometown)}"></div>
      </div>
      <div class="grid-1-2">
        <div class="field"><label>时期</label><input id="f-period" type="text" data-link-field="fields.period" value="${escapeHtml(period)}"></div>
        <div class="field"><label>生卒</label><input id="f-life" type="text" data-link-field="fields.life" value="${escapeHtml(life)}"></div>
      </div>
      <div class="grid-4">
        <div class="field"><label>字</label><input id="f-courtesy" type="text" data-link-field="fields.courtesy" value="${escapeHtml(courtesy)}"></div>
        <div class="field"><label>号</label><input id="f-pseudonym" type="text" data-link-field="fields.pseudonym" value="${escapeHtml(pseudonym)}"></div>
        <div class="field"><label>谥号</label><input id="f-posthumous" type="text" data-link-field="fields.posthumous" value="${escapeHtml(posthumous)}"></div>
        <div class="field"><label>别称</label><input id="f-aliases" type="text" data-link-field="fields.aliases" value="${escapeHtml(aliases)}"></div>
      </div>  
      <div class="field"><label>合称 <button id="addJoint" class="btn small add-row">添加</button></label><div id="jointList" class="ordered-list"></div></div>
      <div class="field"><label>人际关系 <button id="addRel" class="btn small add-row">添加</button></label><div id="relations" class="ordered-list"></div></div>
      <div class="grid-3">
        <div class="field"><label>流派</label><input id="f-school" type="text" data-link-field="fields.school" value="${escapeHtml(school)}"></div>
        <div class="field"><label>代表作</label><input id="f-repWorks" type="text" data-link-field="fields.repWorks" value="${escapeHtml(repWorksText)}"></div>
        <div class="field"><label>文集</label><input id="f-anthos" type="text" data-link-field="fields.anthos" value="${escapeHtml(anthosText)}"></div>
      </div>  
      <div class="field"><label>大事年表 <button id="addChrono" class="btn small add-row">添加</button></label><div id="chrono" class="note-list"></div></div>
      <div class="field"><label>成就与影响</label><textarea id="f-achievements" rows="1" data-link-field="extra.achievements" style="width:100%;resize:none;overflow:hidden">${escapeHtml(achievements)}</textarea></div>
      <div class="field"><label>评价 <button id="addEval" class="btn small add-row">添加</button></label><div id="evalList" class="note-list"></div></div>
      <div class="field"><label>相关典故 <button id="addE" class="btn small add-row">添加</button></label><div id="relatedE" class="note-list"></div></div>
    `;

    initializeLinkFields(formContainer);

    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const commonVal = (formContainer.querySelector('#f-common').value || '').trim();
        const nameVal = (formContainer.querySelector('#f-name').value || '').trim();
        const q = [commonVal, nameVal].filter(Boolean).join(' ');
        context.checkDuplicate(q, 'C');
      });
    }

    const repWorksInput = formContainer.querySelector('#f-repWorks');
    const anthosInput = formContainer.querySelector('#f-anthos');
    const relationsEl = formContainer.querySelector('#relations');
    const chronoEl = formContainer.querySelector('#chrono');
    const jointEl = formContainer.querySelector('#jointList');
    const evalList = formContainer.querySelector('#evalList');
    const relatedEl = formContainer.querySelector('#relatedE');
    const addRelBtn = formContainer.querySelector('#addRel');
    const addChronoBtn = formContainer.querySelector('#addChrono');
    const addJointBtn = formContainer.querySelector('#addJoint');
    const addEvalBtn = formContainer.querySelector('#addEval');
    const addEBtn = formContainer.querySelector('#addE');

    try {
      const target = formContainer.querySelector('#f-achievements');
      if (target) {
        autosizeTextarea(target);
        try { if (target.__autosizeHandler) target.removeEventListener('input', target.__autosizeHandler); } catch (err) { }
        target.__autosizeHandler = () => autosizeTextarea(target);
        target.addEventListener('input', target.__autosizeHandler);
      }
    } catch (err) { }

    const renderRelations = () => renderInlinePairs(relationsEl, relations, '人物', '关系', '人物', '关系', {
      linkFieldPrefix: 'fields.relations',
      onChange: (arr) => { },
      deckColumns: 2,
      containerClass: 'relation-grid pair-grid',
      wrapperClass: 'ordered-item relation-inline'
    });
    const renderChrono = () => renderInlinePairs(chronoEl, chrono, '纪年', '事件', '纪年', '事件', {
      linkFieldPrefix: 'fields.chrono',
      onChange: (arr) => { },
      containerClass: 'note-list',
      wrapperClass: 'ordered-item note-item',
      inputClass1: 'c-source',
      inputClass2: 'c-content',
      paragraphCheck2: true,
    });
    const renderJoint = () => renderInlinePairs(jointEl, joint, '合称', '其他人物', '合称', '其他人物', {
      linkFieldPrefix: 'fields.joint',
      onChange: (arr) => { },
      deckColumns: 2,
      containerClass: 'relation-grid pair-grid',
      wrapperClass: 'ordered-item relation-inline'
    });
    const renderEvalList = () => renderInlinePairs(evalList, evaluation, '出处', '内容', '出处', '内容', {
      linkFieldPrefix: 'extra.evaluation',
      onChange: (arr) => { },
      containerClass: 'note-list',
      wrapperClass: 'ordered-item note-item',
      inputClass1: 'c-source',
      inputClass2: 'c-content',
      paragraphCheck2: true,
    });
    const renderRelated = () => renderInlinePairs(relatedEl, relatedE, '典故名', '内容', '典故', '内容', {
      linkFieldPrefix: 'fields.relatedE',
      onChange: (arr) => { },
      containerClass: 'note-list',
      wrapperClass: 'ordered-item note-item',
      inputClass1: 'c-source',
      inputClass2: 'c-content',
      paragraphCheck2: true,
    });

    renderRelations();
    renderChrono();
    renderJoint();
    renderEvalList();
    renderRelated();

    addRelBtn && addRelBtn.addEventListener('click', () => { relations.push({ 人物: '', 关系: '' }); renderRelations(); });
    addChronoBtn && addChronoBtn.addEventListener('click', () => { chrono.push({ 纪年: '', 事件: '' }); renderChrono(); });
    addJointBtn && addJointBtn.addEventListener('click', () => { joint.push({ 合称: '', 其他人物: '' }); renderJoint(); });
    addEvalBtn && addEvalBtn.addEventListener('click', () => { evaluation.push({ 出处: '', 内容: '' }); renderEvalList(); });
    addEBtn && addEBtn.addEventListener('click', () => { relatedE.push({ 典故名: '', 内容: '' }); renderRelated(); });

    function collect() {
      const repWorksRaw = (repWorksInput?.value || '').replace(/[，,；;、]/g, '\n');
      const repWorksList = splitMultilineText(repWorksRaw);
      const anthosRaw = (anthosInput?.value || '').replace(/[，,；;、]/g, '\n');
      const anthosList = splitMultilineText(anthosRaw);
      const fields = {
        common: (formContainer.querySelector('#f-common') || {}).value || '',
        name: (formContainer.querySelector('#f-name') || {}).value || '',
        period: (formContainer.querySelector('#f-period') || {}).value || '',
        life: (formContainer.querySelector('#f-life') || {}).value || '',
        hometown: (formContainer.querySelector('#f-hometown') || {}).value || '',
        courtesy: (formContainer.querySelector('#f-courtesy') || {}).value || '',
        pseudonym: (formContainer.querySelector('#f-pseudonym') || {}).value || '',
        posthumous: (formContainer.querySelector('#f-posthumous') || {}).value || '',
        aliases: (formContainer.querySelector('#f-aliases') || {}).value || '',
        joint: Array.from((jointEl || { querySelectorAll: () => [] }).querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 合称: i[0].value, 其他人物: i[1].value }; }),
        school: (formContainer.querySelector('#f-school') || {}).value || '',
        repWorks: repWorksList,
        anthos: anthosList,
        relations: Array.from(relationsEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 人物: i[0].value, 关系: i[1].value }; }),
        chrono: Array.from(chronoEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 纪年: i[0].value, 事件: i[1].value }; }),
        relatedE: Array.from(relatedEl.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 典故名: i[0].value, 内容: i[1].value }; })
      };
      const extra = { achievements: (formContainer.querySelector('#f-achievements') || {}).value || '', evaluation: Array.from(evalList.querySelectorAll('.ordered-item')).map(div => { const i = div.querySelectorAll('input'); return { 出处: i[0].value, 内容: i[1].value }; }) };
      return { fields, extra };
    }

    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
