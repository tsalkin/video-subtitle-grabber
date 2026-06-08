var t = VSG.t;
var state = { count: null, statusKey: 'popupSearching' };

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function applyTexts() {
  document.getElementById('ver').textContent = 'v' + VSG.version();
  document.getElementById('btn-toggle').textContent = t('popupToggle');
  const langBtn = document.getElementById('btn-lang');
  langBtn.textContent = '🌐 ' + t('langName');
  langBtn.title = t('langSwitch');
  const status = document.getElementById('status');
  if (state.count == null) status.textContent = t(state.statusKey);
  else status.textContent = state.count > 0 ? `${t('popupFound')}: ${state.count}` : t('popupNone');
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTexts();

  document.getElementById('btn-lang').addEventListener('click', () => {
    VSG.setLang(VSG.getLang() === 'ru' ? 'en' : 'ru');
    applyTexts();
  });

  const tab = await getActiveTab();

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getCount' });
    state.count = res.count;
  } catch {
    state.statusKey = 'popupReload';
  }
  applyTexts();

  document.getElementById('btn-toggle').addEventListener('click', async () => {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    window.close();
  });

  // Update check (non-blocking)
  chrome.runtime.sendMessage({ action: 'checkUpdate' }, (r) => {
    if (chrome.runtime.lastError || !r || !r.hasUpdate) return;
    const u = document.getElementById('update');
    u.innerHTML = '🔔 ' + t('updateAvail') + ' <b>v' + r.latest + '</b><br>'
      + '<a href="' + VSG.RELEASES + '" target="_blank" style="color:#7fd1ff">' + t('get') + ' →</a>';
  });
});
