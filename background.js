/*
 * Swarm Animation Player — background service worker (MV3)
 *
 * 页面代码一律通过 chrome.scripting.executeScript({ world: 'MAIN' }) 注入，
 * 这是扩展 API，不受页面 CSP 限制（页面 CSP 只拦截 <script> 等资源加载，
 * 拦不住 executeScript 注入的代码）。绝不用注入 <script src> 标签的方式。
 */

const DEFAULT_CONFIG = {
  agents: 28,
  mobileAgents: 10,
  speed: 1,
  tour: true,
  returnToTop: true,
  replayButton: false,
  once: false,
  targetSeconds: 15,
  maxSeconds: 40,
};

const DEFAULTS = {
  autoPlay: false,
  mode: 'blacklist', // 'blacklist' | 'whitelist'
  blacklist: [],
  whitelist: [],
  config: DEFAULT_CONFIG,
};

/* ---------------- settings ---------------- */

let settingsCache = null;

async function getSettings() {
  if (settingsCache) return settingsCache;
  const stored = await chrome.storage.sync.get(DEFAULTS);
  settingsCache = { ...DEFAULTS, ...stored };
  settingsCache.config = { ...DEFAULT_CONFIG, ...(stored.config || {}) };
  settingsCache.blacklist = Array.isArray(settingsCache.blacklist) ? settingsCache.blacklist : [];
  settingsCache.whitelist = Array.isArray(settingsCache.whitelist) ? settingsCache.whitelist : [];
  return settingsCache;
}

chrome.storage.onChanged.addListener(() => {
  settingsCache = null;
});

async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  if (patch.config) next.config = { ...cur.config, ...patch.config };
  await chrome.storage.sync.set(next);
  settingsCache = next;
  return next;
}

/* ---------------- url / list matching ---------------- */

function normalizeEntry(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // strip scheme
  s = s.replace(/^\*\./, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  s = s.replace(/^\.+|\.+$/g, '');
  s = s.replace(/^www\./, '');
  return s;
}

function isDomainLike(s) {
  return /^[a-z0-9.-]+$/.test(s) && s.includes('.');
}

function hostMatches(host, entry) {
  if (!host || !entry) return false;
  return host === entry || host.endsWith('.' + entry);
}

function isAllowed(url, settings) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  if (!host) return false;
  if (settings.mode === 'whitelist') {
    return settings.whitelist.some((e) => hostMatches(host, e));
  }
  return !settings.blacklist.some((e) => hostMatches(host, e));
}

// chrome://、edge://、商店页等无法注入
function isInjectable(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url);
}

/* ---------------- MAIN-world injection ---------------- */

// 仅在页面 MAIN world 中检查/注入库本体；页面导航后 MAIN world 重置，天然幂等
async function ensureLibrary(tabId) {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () =>
      typeof window.Swarm === 'object' &&
      window.Swarm !== null &&
      typeof window.Swarm.run === 'function',
  });
  if (probe && probe.result === true) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['vendor/swarm.js'],
  });
}

async function play(tabId, settings, { autoplay = false } = {}) {
  await ensureLibrary(tabId);
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (cfg, isAutoplay) => {
      // 与库内 auto-start 一致：等待字体、回到页顶后开始（动画按 tour 从顶部构建）
      const start = async () => {
        try {
          if (document.fonts && document.fonts.ready) {
            await Promise.race([
              document.fonts.ready,
              new Promise((r) => setTimeout(r, 800)),
            ]);
          }
          scrollTo({ top: 0, behavior: 'instant' });
          window.Swarm.run(cfg);
          return 'playing';
        } catch (e) {
          console.error('[swarm-ext] start failed', e);
          return 'error';
        }
      };
      if (
        isAutoplay &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return 'reduced-motion';
      }
      return start();
    },
    args: [settings.config, autoplay],
  });
  return (res && res.result) || 'playing';
}

async function stop(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if (window.Swarm) window.Swarm.skip();
      },
    });
  } catch {
    /* 页面不可注入（已卸载/受限页）视为已停止 */
  }
  return 'stopped';
}

async function isPlaying(tabId) {
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () =>
        !!(window.Swarm && typeof window.Swarm.state === 'function' && window.Swarm.state()),
    });
    return !!(probe && probe.result === true);
  } catch {
    return false;
  }
}

/* ---------------- autoplay ---------------- */

const autoplayTried = new Set(); // 每个 navigationId 只自动播一次

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const navKey = changeInfo.url || tab.url || '';
  const key = tabId + '|' + navKey + '|' + (tab.pendingUrl || '');
  if (autoplayTried.has(key)) return;
  autoplayTried.add(key);
  if (autoplayTried.size > 500) {
    // 服务worker长存时防止无限增长
    autoplayTried.clear();
  }
  maybeAutoPlay(tabId, tab.url);
});

async function maybeAutoPlay(tabId, url) {
  try {
    if (!isInjectable(url)) return;
    const settings = await getSettings();
    if (!settings.autoPlay) return;
    if (!isAllowed(url, settings)) return;
    await play(tabId, settings, { autoplay: true });
  } catch (e) {
    // 受限页面（chrome://、商店等）executeScript 会抛错，忽略
  }
}

/* ---------------- message router (popup <-> background) ---------------- */

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'GET_STATE': {
          const tab = await getActiveTab();
          const settings = await getSettings();
          const url = tab ? tab.url || '' : '';
          sendResponse({
            ok: true,
            settings,
            tabId: tab ? tab.id : null,
            tabUrl: url,
            tabTitle: tab ? tab.title || '' : '',
            injectable: isInjectable(url),
            allowed: isInjectable(url) && isAllowed(url, settings),
            playing: tab ? await isPlaying(tab.id) : false,
          });
          break;
        }
        case 'PLAY': {
          const tab = await getActiveTab();
          if (!tab || !isInjectable(tab.url)) {
            sendResponse({ ok: false, error: '此页面无法注入脚本（仅支持 http/https）' });
            break;
          }
          const settings = await getSettings();
          const result = await play(tab.id, settings, { autoplay: false });
          sendResponse({ ok: true, result, playing: result === 'playing' });
          break;
        }
        case 'STOP': {
          const tab = await getActiveTab();
          if (!tab) {
            sendResponse({ ok: false, error: '没有活动标签页' });
            break;
          }
          const result = await stop(tab.id);
          sendResponse({ ok: true, result, playing: false });
          break;
        }
        case 'SET_SETTINGS': {
          const settings = await saveSettings(msg.patch || {});
          sendResponse({ ok: true, settings });
          break;
        }
        case 'ADD_ENTRY': {
          const entry = normalizeEntry(msg.value);
          if (!isDomainLike(entry)) {
            sendResponse({ ok: false, error: '请输入有效域名，如 example.com' });
            break;
          }
          const settings = await getSettings();
          const list = msg.list === 'whitelist' ? 'whitelist' : 'blacklist';
          if (!settings[list].includes(entry)) {
            settings[list] = [...settings[list], entry];
          }
          const saved = await saveSettings({ [list]: settings[list] });
          sendResponse({ ok: true, settings: saved });
          break;
        }
        case 'REMOVE_ENTRY': {
          const settings = await getSettings();
          const list = msg.list === 'whitelist' ? 'whitelist' : 'blacklist';
          const next = settings[list].filter((e) => e !== msg.value);
          const saved = await saveSettings({ [list]: next });
          sendResponse({ ok: true, settings: saved });
          break;
        }
        default:
          sendResponse({ ok: false, error: '未知消息: ' + (msg && msg.type) });
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || String(e) });
    }
  })();
  return true; // 异步 sendResponse
});
