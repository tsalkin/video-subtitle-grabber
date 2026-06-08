// Video Subtitle Grabber — shared i18n, links, changelog data, version helpers.
// Loaded by panel.html and popup.html (both run in the extension origin → shared localStorage).
(function () {
  var GITHUB = 'https://github.com/tsalkin/video-subtitle-grabber';

  var STRINGS = {
    ru: {
      videos: 'Видео',
      all: 'Все',
      compact: '▭ Кратко',
      full: '▦ Полный',
      loading: 'Загружаю…',
      noSubs: 'Субтитры не найдены',
      emptyHint: 'Видео не найдено. Начните просмотр (нажмите Play) — и оно появится здесь.',
      ytHint: 'YouTube: используйте yt-dlp',
      error: 'Ошибка',
      close: 'Закрыть',
      about: 'ℹ О плагине',
      whatsNew: '🆕 Что нового',
      back: '← Назад',
      langName: 'EN',
      langSwitch: 'Switch to English',
      updateAvail: 'Доступна новая версия',
      upToDate: 'Установлена последняя версия',
      checkUpdate: 'Проверить обновления',
      checking: 'Проверяю…',
      checkFailed: 'Не удалось проверить',
      get: 'Получить',
      version: 'Версия',
      author: 'Автор',
      project: 'Проект',
      sourceHint: 'Исходный код и новые версии',
      popupToggle: 'Показать / скрыть панель',
      popupSearching: 'Поиск видео…',
      popupFound: 'Найдено видео',
      popupNone: 'Видео не найдено на этой странице',
      popupReload: 'Обновите страницу и откройте снова',
      aboutDesc: 'Утилита показывает медиа, встроенное в открытую веб-страницу, и помогает сохранить доступные текстовые дорожки (субтитры/титры), которые браузер уже загрузил. Назначение — личное использование: доступность, офлайн-чтение, перевод и изучение языков, конспектирование. Расширение не обходит технические средства защиты и не загружает само видео.',
      aboutDisclaimer: 'Ответственность за наличие прав на контент и соблюдение условий использования сервисов и законодательства об авторском праве несёт пользователь.'
    },
    en: {
      videos: 'Videos',
      all: 'All',
      compact: '▭ Compact',
      full: '▦ Full',
      loading: 'Loading…',
      noSubs: 'No subtitles found',
      emptyHint: 'No video found. Start playback (press Play) — it will then appear here.',
      ytHint: 'YouTube: use yt-dlp',
      error: 'Error',
      close: 'Close',
      about: 'ℹ About',
      whatsNew: '🆕 What’s new',
      back: '← Back',
      langName: 'RU',
      langSwitch: 'Переключить на русский',
      updateAvail: 'A new version is available',
      upToDate: 'You have the latest version',
      checkUpdate: 'Check for updates',
      checking: 'Checking…',
      checkFailed: 'Check failed',
      get: 'Get it',
      version: 'Version',
      author: 'Author',
      project: 'Project',
      sourceHint: 'Source code & new versions',
      popupToggle: 'Show / hide panel',
      popupSearching: 'Looking for videos…',
      popupFound: 'Videos found',
      popupNone: 'No videos found on this page',
      popupReload: 'Reload the page and open again',
      aboutDesc: 'This utility lists media embedded in the current web page and helps you save the available text tracks (subtitles/captions) your browser has already loaded. It is intended for personal use: accessibility, offline reading, translation and language learning, and note-taking. It does not circumvent technical protection measures and does not download the video itself.',
      aboutDisclaimer: 'You are responsible for holding the rights to the content and for complying with the services’ terms of use and applicable copyright law.'
    }
  };

  // Last few versions for the "What's new" view (newest first).
  var CHANGELOG = [
    {
      version: '2.5.0', date: '2026-06-08',
      ru: ['Поддержка HLS-субтитров (Circle.so / cdn-media.circle.so)', 'Парсинг дорожек из m3u8-плейлиста', 'Подсказка «начните просмотр», когда видео не найдено'],
      en: ['HLS subtitle support (Circle.so / cdn-media.circle.so)', 'Subtitle tracks parsed from the m3u8 playlist', '“Start playback” hint when no video is found']
    },
    {
      version: '2.4.0', date: '2026-06-08',
      ru: ['Английский язык + переключатель языка', 'Разделы «О плагине» и «Что нового»', 'Проверка новой версии на GitHub + уведомление', 'Новая иконка'],
      en: ['English language + language switcher', '“About” and “What’s new” sections', 'Update check via GitHub + notification', 'New icon']
    },
    {
      version: '2.3.0', date: '2026-06-08',
      ru: ['Превью теперь отображается (Vimeo oEmbed)', 'Превью в формате 16:9', 'Режим «Кратко / Полный»', 'Исправлена кнопка закрытия'],
      en: ['Thumbnails now display (Vimeo oEmbed)', '16:9 thumbnails', 'Compact / Full mode', 'Fixed the close button']
    },
    {
      version: '2.2.0', date: '2026-06-08',
      ru: ['Стабильная работа фонового процесса (keep-alive + повтор)'],
      en: ['Stable background worker (keep-alive + retry)']
    }
  ];

  function getLang() {
    try {
      var s = localStorage.getItem('vsg-lang');
      if (s === 'ru' || s === 'en') return s;
    } catch (e) {}
    return (navigator.language || 'en').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  }
  function setLang(l) { try { localStorage.setItem('vsg-lang', l); } catch (e) {} }
  function t(key) { var l = getLang(); return (STRINGS[l] && STRINGS[l][key]) || STRINGS.en[key] || key; }

  // Semver compare: returns >0 if a newer than b.
  function cmpVer(a, b) {
    var pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function version() {
    try { return chrome.runtime.getManifest().version; } catch (e) { return CHANGELOG[0].version; }
  }

  window.VSG = {
    GITHUB: GITHUB,
    RELEASES: GITHUB + '/releases',
    AUTHOR: '@tsalkin',
    STRINGS: STRINGS,
    CHANGELOG: CHANGELOG,
    getLang: getLang,
    setLang: setLang,
    t: t,
    cmpVer: cmpVer,
    version: version
  };
})();
