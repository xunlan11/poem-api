// 韵部渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  // 子类型
  const SUB_KEY = 'yunbu'; 
  const SUB_LABEL = '韵部'; 
  // 渲染韵部表单的主函数
  registry[`L_${SUB_KEY}`] = function renderLvYunbu(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || {};
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const splitMultilineText = context.splitMultilineText || (raw => raw ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []);
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const rhymeName = node.fields?.title || node.fields?.rhymeGroup || '';
    const rhymeBook = node.fields?.rhymeBook || '';
    const knownBooks = [
      { value: 'pingshui', label: '平水韵' },
      { value: 'cilin', label: '词林正韵' },
      { value: 'zhongyuan', label: '中原音韵' },
    ];
    const knownBookValues = new Set(knownBooks.map(b => b.value));
    const commonChars = Array.isArray(node.extra?.commonChars) ? node.extra.commonChars.join('\n') : (node.extra?.commonChars || '');
    const rareChars = Array.isArray(node.extra?.rareChars) ? node.extra.rareChars.join('\n') : (node.extra?.rareChars || '');
    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>韵部</label>
          <div class="field-row"><input id="lv-title" type="text" data-link-field="fields.title" value="${escapeHtml(rhymeName)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field">
          <label>韵书</label>
          <select id="lv-book" aria-label="韵书">
            <option value="">-- 请选择 --</option>
            ${(rhymeBook && !knownBookValues.has(rhymeBook)) ? `<option value="${escapeHtml(rhymeBook)}">${escapeHtml(rhymeBook)}</option>` : ''}
            ${knownBooks.map(b => `<option value="${b.value}">${b.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field"><label>常用字</label><textarea id="lv-common" rows="1" data-autosize-min="32" data-link-field="extra.commonChars" style="width:100%;resize:none;overflow:hidden">${escapeHtml(commonChars)}</textarea></div>
      <div class="field"><label>生僻字</label><textarea id="lv-rare" rows="1" data-autosize-min="32" data-link-field="extra.rareChars" style="width:100%;resize:none;overflow:hidden">${escapeHtml(rareChars)}</textarea></div>
    `;
    // 绑定自动调整大小
    utils.bindAutoResize(formContainer, ['#lv-common', '#lv-rare'], context);
    initializeLinkFields(formContainer);
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const titleVal = (formContainer.querySelector('#lv-title').value || '').trim();
        context.checkDuplicate(titleVal, 'L');
      });
    }

    try {
      const bookSelect = formContainer.querySelector('#lv-book');
      if (bookSelect && rhymeBook) bookSelect.value = rhymeBook;
    } catch (e) { }

    function collect() {
      const bookSelect = formContainer.querySelector('#lv-book');
      const fields = {
        sub: SUB_KEY,
        subLabel: SUB_LABEL,
        title: (formContainer.querySelector('#lv-title') || {}).value || '',
        rhymeBook: (bookSelect && typeof bookSelect.value === 'string') ? bookSelect.value : rhymeBook,
      };
      const extra = {
        commonChars: splitMultilineText(((formContainer.querySelector('#lv-common') || {}).value || '').replace(/[，,；;]/g, '\n')),
        rareChars: splitMultilineText(((formContainer.querySelector('#lv-rare') || {}).value || '').replace(/[，,；;]/g, '\n')),
      };
      return { fields, extra };
    }
    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
