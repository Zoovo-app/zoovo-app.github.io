// Swaps the page between English (written in the HTML) and Dutch (nl.js),
// and runs the EN | NL toggle. The Dutch strings are our own static text, so
// they go in as HTML: some carry <strong> or a link.
//   data-t="key"       element content
//   data-t-alt="key"   alt text
//   data-t-aria="key"  aria-label
// The page's <title> and description use "<page>.title" and "<page>.desc".
(function () {
  var KEY = 'zoovo-lang';
  var root = document.documentElement;
  var NL = window.ZOOVO_NL || {};
  var page = document.body.getAttribute('data-page') || '';
  var desc = document.querySelector('meta[name=description]');
  var titleEn = document.title;
  var descEn = desc ? desc.getAttribute('content') : '';
  var english = new Map(); // element -> its English, per attribute, to switch back
  var dutch = false;

  function englishOf(el, attr) {
    var name = attr || 'html';
    var saved = english.get(el) || {};
    if (!(name in saved)) saved[name] = attr ? el.getAttribute(attr) : el.innerHTML;
    english.set(el, saved);
    return saved[name];
  }

  function swap(selector, keyAttr, attr) {
    document.querySelectorAll(selector).forEach(function (el) {
      var en = englishOf(el, attr);
      var nl = dutch ? NL[el.getAttribute(keyAttr)] : null;
      var value = nl != null ? nl : en;
      if (attr) el.setAttribute(attr, value); else el.innerHTML = value;
    });
  }

  function apply(lang) {
    dutch = lang === 'nl';
    root.lang = lang;
    swap('[data-t]', 'data-t');
    swap('[data-t-alt]', 'data-t-alt', 'alt');
    swap('[data-t-aria]', 'data-t-aria', 'aria-label');
    document.title = (dutch && NL[page + '.title']) || titleEn;
    if (desc) desc.setAttribute('content', (dutch && NL[page + '.desc']) || descEn);
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
    });
  }

  document.querySelectorAll('.lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      var lang = b.getAttribute('data-lang');
      try { localStorage.setItem(KEY, lang); } catch (e) { /* not saved, still switches */ }
      apply(lang);
    });
  });

  try {
    apply(window.zoovoLang === 'nl' ? 'nl' : 'en');
  } finally {
    root.classList.remove('i18n-wait');
  }
})();
