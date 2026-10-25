// Back from the site's 404 page (assets/site/app-redirect.js): a reload or a
// link deep in the app arrives as /app/?p=/s/<id>. Put the path back in the
// address bar before the app starts, so it opens the right page.
(function () {
  var p = new URLSearchParams(location.search).get('p');
  if (!p || p.charAt(0) !== '/' || p.charAt(1) === '/') return;
  history.replaceState(null, '', '/app' + p);
})();
