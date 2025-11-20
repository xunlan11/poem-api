(function(){
  function bindRow(type){
    const searchInput = document.getElementById(`search-${type}`);
    const resultsEl = document.getElementById(`results-${type}`);
    const addBtn = document.querySelector(`.btn.add[data-type='${type}']`);
    const viewBtn = document.querySelector(`.btn.view[data-type='${type}']`);
    const searchBtn = document.getElementById(`searchBtn-${type}`);

    // addBtn may not exist for some types (e.g. 汇总)，so only attach when present
    if (addBtn) {
      addBtn.onclick = async ()=>{ const ok = await Poem.requireProfile(); if (ok) location.href = `editor.html?type=${type}&new=1`; };
    }
    if (viewBtn) viewBtn.onclick = ()=>{ location.href = `list.html?type=${type}`; };

    function render(items){
      const list = document.createElement('div');
      items.forEach(item=>{
        const div = document.createElement('div');
        div.className='result-item';
        div.innerHTML = `<div>${item.id}｜${item.name || '（未命名）'}</div><div class="small">${item.creator || ''}｜${item.createdAt || ''}</div>`;
        div.onclick = ()=> location.href = `editor.html?id=${item.id}`;
        list.appendChild(div);
      });
      resultsEl.innerHTML='';
      resultsEl.appendChild(list);
    }

    async function search(){
      const q = (searchInput.value || '').trim();
      // On homepage, empty query should return no results
      if (!q) { resultsEl.innerHTML = ''; return; }
      const { data } = await Poem.api(`/api/nodes?type=${type}&search=${encodeURIComponent(q)}`);
      render(data.slice(0,8));
    }
    searchInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ search(); } });
    if (searchBtn) searchBtn.addEventListener('click', ()=>{ search(); });
  }

  // include 'A' for 汇总 (no 新建 button)
  ['W','G','C','E','S','A'].forEach(bindRow);
  
  async function initUserBar(){
    const bar = document.getElementById('userBar');
    const adminEntry = document.getElementById('adminEntry');
    if (!bar || !adminEntry) return;
    try {
      const me = await Poem.me();
      if (me){
        bar.innerHTML = `${me.real_name || me.username}（${me.role}）｜<a class="link" id="logout">退出</a>`;
        const logout = document.getElementById('logout');
        if (logout) {
          logout.onclick = async ()=>{
            await Poem.api('/api/auth/logout', { method:'POST' });
            window.__poem_me = undefined;
            location.reload();
          };
        }
        if (me.role === 'admin') adminEntry.style.display = 'block';
      } else {
        bar.innerHTML = `<a class="link" href="login.html">登录</a>`;
      }
    } catch(e){
      bar.textContent='';
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserBar, { once: true });
  } else {
    initUserBar();
  }
})();