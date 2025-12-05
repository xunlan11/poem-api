(function (root) {
  if (!root) return;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  const SUB_KEY = 'yunbu';
  const SUB_LABEL = '韵部';

  registry[`L_${SUB_KEY}`] = function renderLvYunbu(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || {};
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const autosizeTextarea = context.autosizeTextarea || (() => { });
    const splitMultilineText = context.splitMultilineText || (raw => raw ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []);
    const initializeLinkFields = context.initializeLinkFields || (() => { });

    const rhymeName = node.fields?.title || node.fields?.rhymeGroup || '';
    const rhymeBook = node.fields?.rhymeBook || 'pingshui';
    const commonChars = Array.isArray(node.fields?.commonChars) ? node.fields.commonChars.join('\n') : (node.fields?.commonChars || node.extra?.commonChars || '');
    const rareChars = Array.isArray(node.fields?.rareChars) ? node.fields.rareChars.join('\n') : (node.fields?.rareChars || node.extra?.rareChars || '');

    formContainer.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>韵部 <button type="button" class="btn small check-dup-btn">查重</button></label><input id="lv-title" type="text" data-link-field="fields.title" value="${escapeHtml(rhymeName)}"></div>
        <div class="field">
          <label>韵书</label>
          <div class="radio-row" id="lv-book">
            <label><input type="radio" name="lvBook" value="pingshui" ${rhymeBook === 'pingshui' ? 'checked' : ''}> 平水韵</label>
            <label><input type="radio" name="lvBook" value="cilin" ${rhymeBook === 'cilin' ? 'checked' : ''}> 词林正韵</label>
            <label><input type="radio" name="lvBook" value="zhongyuan" ${rhymeBook === 'zhongyuan' ? 'checked' : ''}> 中原音韵</label>
          </div>
        </div>
      </div>
      <div class="field"><label>常用字</label><textarea id="lv-common" rows="1" data-autosize-min="32" data-link-field="fields.commonChars" style="width:100%;resize:none;overflow:hidden">${escapeHtml(commonChars)}</textarea></div>
      <div class="field"><label>生僻字</label><textarea id="lv-rare" rows="1" data-autosize-min="32" data-link-field="fields.rareChars" style="width:100%;resize:none;overflow:hidden">${escapeHtml(rareChars)}</textarea></div>
    `;

    const bindAutosize = (selector) => {
      const target = formContainer.querySelector(selector);
      if (!target) return;
      autosizeTextarea(target);
      target.addEventListener('input', () => autosizeTextarea(target));
    };
    ['#lv-common', '#lv-rare'].forEach(bindAutosize);

    initializeLinkFields(formContainer);

    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const titleVal = (formContainer.querySelector('#lv-title').value || '').trim();
        context.checkDuplicate(titleVal, 'L');
      });
    }

    function collect() {
      const bookInput = formContainer.querySelector('input[name="lvBook"]:checked');
      const fields = {
        sub: SUB_KEY,
        subLabel: SUB_LABEL,
        title: (formContainer.querySelector('#lv-title') || {}).value || '',
        rhymeBook: bookInput ? bookInput.value : rhymeBook,
        commonChars: splitMultilineText(((formContainer.querySelector('#lv-common') || {}).value || '').replace(/[，,；;]/g, '\n')),
        rareChars: splitMultilineText(((formContainer.querySelector('#lv-rare') || {}).value || '').replace(/[，,；;]/g, '\n')),
      };
      return { fields, extra: {} };
    }

    return { collect };
  };
})(typeof window !== 'undefined' ? window : this);
