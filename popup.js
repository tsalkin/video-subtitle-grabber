async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getActiveTab();
  const status = document.getElementById('status');

  // Get video count from content script
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getCount' });
    status.textContent = res.count > 0
      ? `Найдено видео: ${res.count}`
      : 'Видео не найдено на этой странице';
  } catch {
    status.textContent = 'Обновите страницу и откройте снова';
  }

  document.getElementById('btn-toggle').addEventListener('click', async () => {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    window.close();
  });
});
