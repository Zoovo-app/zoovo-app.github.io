// Picks the page language before the page paints: ?lang=nl|en first (and
// remembered), then the visitor's saved choice, then the browser's first
// language, like report-bug/ does. Dutch pages stay hidden until site.js has
// swapped the text in; the timeout shows the page anyway if it never does.
(function () {
  var KEY = 'zoovo-lang';
  var lang = null;
  try {
    var asked = new URLSearchParams(location.search).get('lang');
    if (asked === 'nl' || asked === 'en') {
      lang = asked;
      localStorage.setItem(KEY, asked);
    }
  } catch (e) { /* storage blocked: fall through */ }
  if (!lang) {
    try { lang = localStorage.getItem(KEY); } catch (e) { lang = null; }
  }
  if (lang !== 'nl' && lang !== 'en') {
    var first = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    lang = first.toLowerCase().indexOf('nl') === 0 ? 'nl' : 'en';
  }
  window.zoovoLang = lang;
  if (lang === 'nl') {
    var root = document.documentElement;
    root.lang = 'nl';
    root.classList.add('i18n-wait');
    setTimeout(function () { root.classList.remove('i18n-wait'); }, 1500);
  }
})();
