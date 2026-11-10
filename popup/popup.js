/* Swarm Animation Player — popup logic */

const $ = (sel) => document.querySelector(sel);

const els = {
  statusChip: $('#statusChip'),
  siteHost: $('#siteHost'),
  playBtn: $('#playBtn'),
  playIcon: $('#playIcon'),
  playText: $('#playText'),
  pageHint: $('#pageHint'),
  autoPlayToggle: $('#autoPlayToggle'),
  modeGroup: $('#modeGroup'),
  quickListBtn: $('#quickListBtn'),
  listsCard: $('#listsCard'),
  listCounts: $('#listCounts'),
  listItems: $('#listItems'),
  entryInput: $('#entryInput'),
  addEntryBtn: $('#addEntryBtn'),
  agentsRange: $('#agentsRange'),
  agentsVal: $('#agentsVal'),
  speedRange: $('#speedRange'),
  speedVal: $('#speedVal'),
  toast: $('#toast'),
};

let state = {
  settings: null,
  tabUrl: '',
  host: '',
  injectable: false,
  playing: false,
  activeList: 'blacklist',
};

/* ---------------- helpers ---------------- */

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      void chrome.runtime.lastError;
      resolve(res || { ok: false, error: '后台无响应' });
    });
  });
}

let toastTimer = null;
function toast(text, isErr = false) {
  els.toast.textContent = text;
  els.toast.classList.toggle('err', isErr);
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2200);
}

function currentHost() {
  try {
    return new URL(state.tabUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function entryMatchesHost(entry, host) {
  return host === entry || host.endsWith('.' + entry);
}

/* ---------------- render ---------------- */

function render() {
  const s = state.settings;
  if (!s) return;

  // site + play button
  els.siteHost.textContent = state.host || '—';
  const canPlay = state.injectable;
  els.playBtn.disabled = !canPlay;
  els.playBtn.classList.toggle('playing', state.playing);
  els.playText.textContent = state.playing ? '停止动画' : '播放动画';

  els.pageHint.classList.add('hidden');
  // status chip
  if (!state.injectable) {
    els.statusChip.textContent = '不可用页面';
    els.statusChip.className = 'chip blocked';
    els.pageHint.textContent = '此页面不是 http/https，无法注入动画（如浏览器设置页、商店页）。';
    els.pageHint.classList.remove('hidden');
  } else if (state.playing) {
    els.statusChip.textContent = '播放中';
    els.statusChip.className = 'chip playing';
  } else {
    els.statusChip.textContent = '就绪';
    els.statusChip.className = 'chip idle';
  }

  // autoplay + mode
  els.autoPlayToggle.checked = !!s.autoPlay;
  els.modeGroup.querySelectorAll('.seg').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === s.mode);
    b.setAttribute('aria-checked', String(b.dataset.mode === s.mode));
  });

  // quick list button
  const listName = s.mode === 'whitelist' ? '白名单' : '黑名单';
  const list = s.mode === 'whitelist' ? s.whitelist : s.blacklist;
  const host = state.host;
  const inList = host && list.some((e) => entryMatchesHost(e, host));
  if (!state.injectable) {
    els.quickListBtn.disabled = true;
    els.quickListBtn.textContent = '当前页面无法管理名单';
  } else if (inList) {
    els.quickListBtn.disabled = false;
    els.quickListBtn.textContent = `✓ ${host} 已在${listName} · 点击移除`;
  } else {
    els.quickListBtn.disabled = false;
    els.quickListBtn.textContent = `＋ 将 ${host || '当前网站'} 加入${listName}`;
  }

  // counts
  els.listCounts.textContent = `黑 ${s.blacklist.length} · 白 ${s.whitelist.length}`;

  // sliders
  els.agentsRange.value = s.config.agents;
  els.agentsVal.textContent = s.config.agents;
  els.speedRange.value = s.config.speed;
  els.speedVal.textContent = Number(s.config.speed).toFixed(2).replace(/\.?0+$/, '') + 'x';

  renderList();
}

function renderList() {
  const s = state.settings;
  const list = state.activeList === 'whitelist' ? s.whitelist : s.blacklist;
  els.listItems.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = state.activeList === 'whitelist' ? '白名单为空：仅手动播放' : '黑名单为空：全部自动播放';
    els.listItems.appendChild(li);
    return;
  }
  for (const entry of list) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = entry;
    const del = document.createElement('button');
    del.className = 'del-btn';
    del.title = '移除';
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      const res = await sendMessage({ type: 'REMOVE_ENTRY', list: state.activeList, value: entry });
      if (res.ok) { state.settings = res.settings; render(); }
      else toast(res.error, true);
    });
    li.append(name, del);
    els.listItems.appendChild(li);
  }
}

/* ---------------- events ---------------- */

els.playBtn.addEventListener('click', async () => {
  if (state.playing) {
    const res = await sendMessage({ type: 'STOP' });
    if (res.ok) { state.playing = false; render(); toast('已停止'); }
    else toast(res.error, true);
  } else {
    els.playBtn.disabled = true;
    const res = await sendMessage({ type: 'PLAY' });
    els.playBtn.disabled = !state.injectable;
    if (res.ok) {
      state.playing = res.playing !== false;
      render();
      toast(res.result === 'reduced-motion' ? '系统开启了减弱动效，已跳过自动播放' : '开始播放');
    } else {
      toast(res.error, true);
    }
  }
});

els.autoPlayToggle.addEventListener('change', async () => {
  const res = await sendMessage({ type: 'SET_SETTINGS', patch: { autoPlay: els.autoPlayToggle.checked } });
  if (res.ok) { state.settings = res.settings; render(); toast(els.autoPlayToggle.checked ? '新网页自动播放已开启' : '自动播放已关闭'); }
  else { els.autoPlayToggle.checked = !els.autoPlayToggle.checked; toast(res.error, true); }
});

els.modeGroup.addEventListener('click', async (e) => {
  const btn = e.target.closest('.seg');
  if (!btn) return;
  const res = await sendMessage({ type: 'SET_SETTINGS', patch: { mode: btn.dataset.mode } });
  if (res.ok) { state.settings = res.settings; render(); }
  else toast(res.error, true);
});

els.quickListBtn.addEventListener('click', async () => {
  const s = state.settings;
  const host = state.host;
  if (!host) return;
  const listName = s.mode === 'whitelist' ? 'whitelist' : 'blacklist';
  const list = s.mode === 'whitelist' ? s.whitelist : s.blacklist;
  const inList = list.some((e) => entryMatchesHost(e, host));
  const type = inList ? 'REMOVE_ENTRY' : 'ADD_ENTRY';
  const res = await sendMessage({ type, list: listName, value: host });
  if (res.ok) { state.settings = res.settings; render(); toast(inList ? `已从${listName === 'whitelist' ? '白' : '黑'}名单移除` : `已加入${listName === 'whitelist' ? '白' : '黑'}名单`); }
  else toast(res.error, true);
});

els.listsCard.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  els.listsCard.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  state.activeList = tab.dataset.tab;
  renderList();
});

async function addEntry() {
  const raw = els.entryInput.value.trim();
  if (!raw) return;
  const res = await sendMessage({ type: 'ADD_ENTRY', list: state.activeList, value: raw });
  if (res.ok) {
    els.entryInput.value = '';
    state.settings = res.settings;
    render();
    toast('已添加');
  } else {
    toast(res.error, true);
  }
}

els.addEntryBtn.addEventListener('click', addEntry);
els.entryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addEntry();
});

let sliderTimer = null;
function onSliderChange() {
  els.agentsVal.textContent = els.agentsRange.value;
  const sp = Number(els.speedRange.value);
  els.speedVal.textContent = String(sp).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1') + 'x';
  clearTimeout(sliderTimer);
  sliderTimer = setTimeout(async () => {
    const res = await sendMessage({
      type: 'SET_SETTINGS',
      patch: { config: { agents: Number(els.agentsRange.value), speed: Number(els.speedRange.value) } },
    });
    if (res.ok) state.settings = res.settings;
  }, 350);
}
els.agentsRange.addEventListener('input', onSliderChange);
els.speedRange.addEventListener('input', onSliderChange);

/* ---------------- init ---------------- */

(async function init() {
  const res = await sendMessage({ type: 'GET_STATE' });
  if (!res.ok) {
    toast(res.error || '初始化失败', true);
    return;
  }
  state.settings = res.settings;
  state.tabUrl = res.tabUrl;
  state.injectable = res.injectable;
  state.playing = res.playing;
  state.host = currentHost();
  render();
})();
