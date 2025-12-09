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

})(typeof window !== 'undefined' ? window : this);