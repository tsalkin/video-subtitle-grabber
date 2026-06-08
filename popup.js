var t = VSG.t;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('ver').textContent = 'v' + VSG.version();
  document.getElementById('btn-toggle').textContent = t('popupToggle');
  const status = document.getElementById('status');
  status.textContent = t('popupSearching');

  const tab = await getActiveTab();

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getCount' });
    status.textContent = res.count > 0
      ? `${t('popupFound')}: ${res.count}`
      : t('popupNone');
  } catch {
    status.textContent = t('popupReload');
  }

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
