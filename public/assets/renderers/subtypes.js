// 子类渲染器
(function (root) {
  if (!root) return;
  const registry = root.PoemRenderers = root.PoemRenderers || {};

  function registerSubtypeRenderer(config) {
    const cfg = config || {};
    const typeKey = cfg.typeKey;
    const renderTargetClass = cfg.renderTargetClass || '';
    const fallbackSubs = Array.isArray(cfg.fallbackSubs) ? cfg.fallbackSubs : [];
    const subsProvider = typeof cfg.subsProvider === 'function' ? cfg.subsProvider : () => [];

    if (!typeKey) return;

    const resolveSubs = () => {
      const defined = subsProvider();
      if (Array.isArray(defined) && defined.length) return defined;
      return fallbackSubs;
    };

    const findSub = (list, key) => list.find(sub => sub.key === key);

    registry[typeKey] = function renderWithSubtypes(ctx) {
      const context = ctx || {};
      const outer = context.formContainer;
      if (!outer) return null;
      let node = context.node || {};
      node.fields = node.fields || {};
      context.node = node;
      outer.innerHTML = '';

      const subs = resolveSubs();
      let activeSub = typeof node.fields.sub === 'string' ? node.fields.sub : '';
      const querySub = (context.Poem && typeof context.Poem.qs === 'function') ? context.Poem.qs('sub') : '';
      if (!findSub(subs, activeSub) && findSub(subs, querySub)) activeSub = querySub;
      let activeRenderer = null;

      const renderMessage = (text) => {
        outer.innerHTML = `<div class="section-card"><div class="muted">${text}</div></div>`;
      };

      const mountSubRenderer = (subKey) => {
        const def = findSub(subs, subKey);
        if (!def) {
          activeSub = '';
          renderMessage('缺少子类信息。');
          activeRenderer = null;
          return false;
        }
        const factory = registry[`${typeKey}_${def.key}`];
        if (typeof factory !== 'function') {
          activeSub = def.key;
          node.fields.sub = def.key;
          node.fields.subLabel = def.label;
          renderMessage('尚未加载子类编辑器');
          activeRenderer = null;
          return false;
        }
        activeSub = def.key;
        node.fields.sub = def.key;
        node.fields.subLabel = node.fields.subLabel || def.label;
        outer.innerHTML = '';
        const renderTarget = document.createElement('div');
        if (renderTargetClass) renderTarget.className = renderTargetClass;
        outer.appendChild(renderTarget);
        activeRenderer = factory({ ...context, formContainer: renderTarget, node });
        return true;
      };

      if (findSub(subs, activeSub)) {
        mountSubRenderer(activeSub);
      } else if (subs.length) {
        renderMessage('缺少子类信息。');
      } else {
        renderMessage('尚未配置子类');
      }

      return {
        collect() {
          const base = activeRenderer && typeof activeRenderer.collect === 'function'
            ? activeRenderer.collect()
            : { fields: {}, extra: {} };
          base.fields = base.fields || {};
          base.extra = base.extra || {};
          if (activeSub) {
            base.fields.sub = activeSub;
            const def = findSub(subs, activeSub);
            if (def && !base.fields.subLabel) base.fields.subLabel = def.label;
          }
          return base;
        },
        refresh(nextNode) {
          if (!nextNode) return;
          node = nextNode;
          node.fields = node.fields || {};
          context.node = node;
          const candidate = node.fields.sub && findSub(subs, node.fields.sub) ? node.fields.sub : activeSub;
          if (candidate && candidate !== activeSub) {
            mountSubRenderer(candidate);
            return;
          }
          if (activeRenderer && typeof activeRenderer.refresh === 'function') {
            activeRenderer.refresh(node);
          }
        }
      };
    };
  }

  registerSubtypeRenderer({
    typeKey: 'S',
    renderTargetClass: 'erya-render-target',
    fallbackSubs: [{ key: 'niaoshoucao', label: '鸟兽草木' }],
    subsProvider: () => (root.Poem && Array.isArray(root.Poem.ERYA_SUB_TYPES) && root.Poem.ERYA_SUB_TYPES.length
      ? root.Poem.ERYA_SUB_TYPES
      : [])
  });

  registerSubtypeRenderer({
    typeKey: 'L',
    renderTargetClass: 'lv-render-target',
    fallbackSubs: [
      { key: 'yunbu', label: '韵部' },
      { key: 'ciqupu', label: '词曲谱' }
    ],
    subsProvider: () => (root.Poem && Array.isArray(root.Poem.LV_SUB_TYPES) && root.Poem.LV_SUB_TYPES.length
      ? root.Poem.LV_SUB_TYPES
      : [])
  });
})(typeof window !== 'undefined' ? window : this);
