(function (root) {
  if (!root) return;
  const registry = root.PoemRenderers = root.PoemRenderers || {};
  const fallbackSubs = [
    { key: 'yunbu', label: '韵部' },
    { key: 'ciqupu', label: '词曲谱' }
  ];
  const resolveSubs = () => {
    const defined = root.Poem && Array.isArray(root.Poem.LV_SUB_TYPES) && root.Poem.LV_SUB_TYPES.length
      ? root.Poem.LV_SUB_TYPES
      : fallbackSubs;
    return defined;
  };
  const findSub = (subs, key) => subs.find(sub => sub.key === key);
  registry.L = function renderLv(ctx) {
    const context = ctx || {};
    const outer = context.formContainer;
    if (!outer) return null;
    let node = context.node || {};
    node.fields = node.fields || {};
    context.node = node;
    const subs = resolveSubs();
    outer.innerHTML = '';
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
        renderMessage('缺少格律子类信息，请返回列表重新创建。');
        activeRenderer = null;
        return false;
      }
      const factory = registry[`L_${def.key}`];
      if (typeof factory !== 'function') {
        activeSub = def.key;
        node.fields.sub = def.key;
        node.fields.subLabel = def.label;
        renderMessage('尚未加载对应子类的编辑器');
        activeRenderer = null;
        return false;
      }
      activeSub = def.key;
      node.fields.sub = def.key;
      node.fields.subLabel = node.fields.subLabel || def.label;
      outer.innerHTML = '';
      const renderTarget = document.createElement('div');
      renderTarget.className = 'lv-render-target';
      outer.appendChild(renderTarget);
      activeRenderer = factory({ ...context, formContainer: renderTarget, node });
      return true;
    };
    if (findSub(subs, activeSub)) {
      mountSubRenderer(activeSub);
    } else if (subs.length) {
      renderMessage('缺少格律子类信息，请返回列表重新创建。');
    } else {
      renderMessage('尚未配置格律子类');
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
})(typeof window !== 'undefined' ? window : this);
