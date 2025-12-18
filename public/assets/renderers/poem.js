// 诗歌渲染器
(function (root) {
  if (!root) return;
  const utils = root.PoemRendererUtils;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  registry.W = registry.renderPoem = function renderPoem(ctx) {
    const context = ctx || {};
    const formContainer = context.formContainer;
    if (!formContainer) return null;
    const node = context.node || null;
    const escapeHtml = context.escapeHtml || (s => String(s || ''));
    const initializeLinkFields = context.initializeLinkFields || (() => { });
    const annotationsFactory = context.annotationsFactory;
    const state = context.state || {};
    const registerEditableWatcher = context.registerEditableWatcher || (() => () => { });
    const registerLinkBrushHandler = context.registerLinkBrushHandler || (() => () => { });
    const registerLinkField = context.registerLinkField || (() => { });
    const reindexFieldLinks = context.reindexFieldLinks || (() => { });
    const renderFieldDisplay = context.renderFieldDisplay || (() => { });
    const getFieldSpec = context.getFieldSpec || (() => undefined);
    const cleanupLinkFieldSpec = context.cleanupLinkFieldSpec || (() => { });
    const startLinkFlow = context.startLinkFlow || (() => { });
    const editExistingLink = context.editExistingLink || (() => { });
    const replaceLinks = context.replaceLinks || (() => { });
    const normalizeLink = context.normalizeLink || (value => value);
    const links = context.links || [];
    const findSpanForNode = context.findSpanForNode || (() => null);
    const offsetWithinSpan = context.offsetWithinSpan || (() => 0);
    const findBestLinkPosition = context.findBestLinkPosition || (() => null);
    const autosizeTextarea = context.autosizeTextarea || (() => { });
    const renderInlinePairs = context.renderInlinePairs || (() => { });
    const documentRef = context.document || root.document;
    const windowRef = context.window || root;
    const PoemRef = context.Poem || root.Poem;
    const name = node ? (node.fields?.title || node.fields?.name || '') : '';
    const otherNames = node ? node.fields?.otherNames || '' : '';
    const author = node ? node.fields?.author || '' : '';
    const source = node ? node.fields?.origin || '' : '';
    const form = node ? node.fields?.form || '' : '';
    const sub = node ? node.fields?.sub || '' : '';
    const sub2 = node ? node.fields?.sub2 || '' : '';
    const rhyme = node ? node.fields?.rhyme || '' : '';
    const body = node ? node.content || '' : '';
    const translation = node ? node.extra?.translation || '' : '';
    const background = node ? node.extra?.background || '' : '';
    const comments = node ? node.extra?.evaluation || [] : [];
    formContainer.innerHTML = `
      <div class="grid-4">
        <div class="field"><label>作品</label>
          <div class="field-row"><input id="f-name" type="text" data-link-field="fields.title" value="${escapeHtml(name)}"><button type="button" class="btn small check-dup-btn">查重</button></div>
        </div>
        <div class="field"><label>其他名称</label><input id="f-other" type="text" data-link-field="fields.otherNames" value="${escapeHtml(otherNames)}"></div>
        <div class="field"><label>作者</label><input id="f-author" type="text" data-link-field="fields.author" value="${escapeHtml(author)}"></div>
        <div class="field"><label>出处</label><input id="f-source" type="text" data-link-field="fields.origin" value="${escapeHtml(source)}"></div>
      </div>
      <div class="field">
        <label style="display:inline-block;margin-bottom:6px">体例</label>
        <div class="form-subtype-row">
          <select id="f-form">
            <option value="">-- 请选择 --</option>
            <option value="古体">古体</option>
            <option value="近体">近体</option>
            <option value="词">词</option>
            <option value="散曲">散曲</option>
          </select>
          <div id="form-opts"></div>
        </div>
      </div>
      <div id="sub2-row" class="field" style="display:none;margin-top:8px"><label>曲牌</label><input id="f-sub2" type="text" value="${escapeHtml(sub2)}"></div>
      <div id="rhyme-row" class="field" style="display:none;margin-top:8px"><label>韵部</label><input id="f-rhyme" type="text" value="${escapeHtml(rhyme)}"></div>
      <div class="field"><label>正文</label>
        <div class="body-area">
          <textarea id="f-body" rows="1" data-link-field="content" data-self-check-anchor="bodyLockControls" style="width:100%;resize:none;overflow:hidden;padding-bottom:32px">${escapeHtml(body)}</textarea>
          <div id="f-body-render" class="body-render" style="padding:8px 8px 32px 8px;border:1px solid #ddd;border-radius:6px;margin-top:8px;background:#fff;display:none"></div>
          <div id="body-word-count" class="body-word-count" aria-live="polite"></div>
        </div>
        <div id="bodyLockControls" class="body-lock-controls" style="margin-top:8px"><button id="lock-body" class="btn small">🔒 锁定</button> <button id="unlock-body" class="btn small">✏️ 编辑</button></div>
        <div id="annotation-area" class="muted" style="margin-top:8px"></div>
      </div>
      <div class="field"><label>译文</label><textarea id="f-translation" rows="1" data-link-field="extra.translation" data-autosize-min="32" style="width:100%;resize:none;overflow:hidden">${escapeHtml(translation)}</textarea></div>
      <div class="field"><label>创作背景</label><textarea id="f-background" rows="1" data-link-field="extra.background" data-autosize-min="32" style="width:100%;resize:none;overflow:hidden">${escapeHtml(background)}</textarea></div>
      <div class="field"><label>评价 <button class="btn small add-row" id="add-comment">添加</button></label>
        <div id="comment-list" class="note-list"></div>
      </div>
    `;
    initializeLinkFields(formContainer);
    // 自动调整大小
    utils.bindAutoResize(formContainer, ['#f-translation', '#f-background'], context);
    const checkDupBtn = formContainer.querySelector('.check-dup-btn');
    if (checkDupBtn && context.checkDuplicate) {
      checkDupBtn.addEventListener('click', () => {
        const nameVal = (formContainer.querySelector('#f-name').value || '').trim();
        const otherVal = (formContainer.querySelector('#f-other')?.value || '').trim();
        const combined = [nameVal, otherVal].filter(Boolean).join('、');
        context.checkDuplicate(combined, 'W');
      });
    }
    const sel = formContainer.querySelector('#f-form'); if (form) sel.value = form;
    const cl = formContainer.querySelector('#comment-list');
    const commentArr = (comments && comments.length) ? comments : [{ source: '', content: '' }];
    const commentRenderOpts = {
      wrapperClass: 'ordered-item note-item',
      inputClass1: 'c-source',
      inputClass2: 'c-content',
      linkFieldPrefix: 'extra.evaluation',
      onChange: () => { },
      paragraphCheck2: true,
    };
    renderInlinePairs(cl, commentArr, 'source', 'content', '出处', '内容', commentRenderOpts);
    const addCommentBtn = formContainer.querySelector('#add-comment');
    if (addCommentBtn) {
      addCommentBtn.addEventListener('click', () => {
        commentArr.push({ source: '', content: '' });
        renderInlinePairs(cl, commentArr, 'source', 'content', '出处', '内容', commentRenderOpts);
      });
    }
    const lockBtn = formContainer.querySelector('#lock-body');
    const unlockBtn = formContainer.querySelector('#unlock-body');
    const textarea = formContainer.querySelector('#f-body');
    const annoArea = formContainer.querySelector('#annotation-area');
    const annotationModule = typeof annotationsFactory === 'function'
      ? annotationsFactory({
        document: documentRef,
        window: windowRef,
        Poem: PoemRef,
        state,
        formContainer,
        textarea,
        annoArea,
        lockBtn,
        unlockBtn,
        escapeHtml,
        autosizeTextarea,
        registerEditableWatcher,
        registerLinkBrushHandler,
        linking: {
          registerLinkField,
          reindexFieldLinks,
          renderFieldDisplay,
          getFieldSpec,
          cleanupLinkFieldSpec,
          startLinkFlow,
          editExistingLink,
          isLinkBrushActive: context.isLinkBrushActive || (() => false),
          findSpanForNode,
          offsetWithinSpan,
          replaceLinks,
          links,
          syncLinksToState: context.syncLinksToState || (() => { }),
          findBestLinkPosition,
        }
      })
      : null;
    const initialAnnotations = Array.isArray(node?.annotations) ? node.annotations : [];
    if (annotationModule && typeof annotationModule.setAnnotations === 'function') {
      annotationModule.setAnnotations(initialAnnotations);
    }
    const initialLinks = Array.isArray(node?.links) ? node.links.map(normalizeLink).filter(Boolean) : [];
    replaceLinks(initialLinks);
    const formSelect = formContainer.querySelector('#f-form');
    const formOpts = formContainer.querySelector('#form-opts');
    // 渲染表单选项的函数
    function renderFormOpts() {
      const v = formSelect.value;
      formOpts.innerHTML = '';
      const commonStyle = 'height:32px;padding:4px 12px;width:100%;box-sizing:border-box;';
      const wrappers = [];
      if (v === '古体') {
        wrappers.push(`<label class="form-subtype">子类 <select id="f-sub" style="${commonStyle}"><option value="">-- 请选择 --</option><option>诗经</option><option>楚辞</option><option>汉乐府</option><option>歌行体</option><option>柏梁体</option><option>其他</option></select></label>`);
      } else if (v === '近体') {
        wrappers.push(`<label class="form-subtype">子类 <select id="f-sub" style="${commonStyle}"><option value="">-- 请选择 --</option><option>五绝</option><option>七绝</option><option>五律</option><option>七律</option><option>排律</option></select></label>`);
        wrappers.push(`<label class="form-subtype">韵部 <input id="f-rhyme" type="text" data-link-field="fields.rhyme" style="${commonStyle}"></label>`);
      } else if (v === '词') {
        wrappers.push(`<label class="form-subtype">词牌 <input id="f-sub" type="text" data-link-field="fields.sub" style="${commonStyle}"></label>`);
        wrappers.push(`<label class="form-subtype">韵部 <input id="f-rhyme" type="text" data-link-field="fields.rhyme" style="${commonStyle}"></label>`);
      } else if (v === '散曲') {
        wrappers.push(`<label class="form-subtype">子类 <select id="f-sub" style="${commonStyle}"><option value="">-- 请选择 --</option><option>小令</option><option>套数</option></select></label>`);
        wrappers.push(`<label class="form-subtype">曲牌 <input id="f-sub2" type="text" data-link-field="fields.sub2" style="${commonStyle}"></label>`);
        wrappers.push(`<label class="form-subtype">韵部 <input id="f-rhyme" type="text" data-link-field="fields.rhyme" style="${commonStyle}"></label>`);
      }
      formOpts.innerHTML = wrappers.join('');
      if (node && node.fields) {
        const subEl = formOpts.querySelector('#f-sub'); if (subEl && node.fields.sub) subEl.value = node.fields.sub;
        const sub2El = formOpts.querySelector('#f-sub2'); if (sub2El && node.fields.sub2) sub2El.value = node.fields.sub2;
        const rhymeEl = formOpts.querySelector('#f-rhyme'); if (rhymeEl && node.fields.rhyme) rhymeEl.value = node.fields.rhyme;
      }
      initializeLinkFields(formOpts);
    }
    formSelect.addEventListener('change', renderFormOpts);
    if (form) formSelect.value = form;
    renderFormOpts();

    // 从节点刷新数据的函数
    function refreshFromNode(nextNode) {
      if (!nextNode) return;
      const nextAnnotations = Array.isArray(nextNode.annotations) ? nextNode.annotations : [];
      if (annotationModule && typeof annotationModule.setAnnotations === 'function') {
        annotationModule.setAnnotations(nextAnnotations);
      }
      const refreshedLinks = Array.isArray(nextNode.links)
        ? nextNode.links.map(normalizeLink).filter(Boolean)
        : [];
      replaceLinks(refreshedLinks);
    }

    // 收集表单数据的函数
    function collect() {
      const commentsPayload = Array.from(formContainer.querySelectorAll('#comment-list .note-item')).map(n => ({
        source: n.querySelector('.c-source').value,
        content: n.querySelector('.c-content').value,
      })).filter(c => c.source || c.content);
      const subEl = formContainer.querySelector('#f-sub');
      const sub2El = formContainer.querySelector('#f-sub2');
      const annotationsPayload = (annotationModule && typeof annotationModule.getAnnotations === 'function')
        ? annotationModule.getAnnotations()
        : (Array.isArray(state.node?.annotations) ? state.node.annotations : []);
      return {
        fields: {
          title: formContainer.querySelector('#f-name').value,
          otherNames: formContainer.querySelector('#f-other').value,
          author: formContainer.querySelector('#f-author').value,
          origin: formContainer.querySelector('#f-source').value,
          form: formContainer.querySelector('#f-form').value,
          sub: subEl ? subEl.value : undefined,
          sub2: sub2El ? sub2El.value : undefined,
          rhyme: formContainer.querySelector('#f-rhyme').value,
        },
        content: formContainer.querySelector('#f-body').value,
        annotations: annotationsPayload,
        links: links.map(l => ({
          start: l.start,
          end: l.end,
          text: l.text,
          targetId: l.targetId,
          targetName: l.targetName,
          targetType: l.targetType,
          placeholder: !!l.placeholder,
        })),
        extra: {
          translation: formContainer.querySelector('#f-translation').value,
          background: formContainer.querySelector('#f-background').value,
          evaluation: commentsPayload,
        },
      };
    }
    return { collect, refresh: refreshFromNode };
  };
})(typeof window !== 'undefined' ? window : this);
