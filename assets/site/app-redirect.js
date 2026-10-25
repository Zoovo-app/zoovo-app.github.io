// The web app (/app/) has paths of its own (/app/s/<id>, /app/services…)
// that are no files here, so GitHub Pages answers them with this 404 page.
// Send them to the app with the path in ?p=; the app puts it back in the
// address bar before it starts (app/restore-path.js). Any other path stays
// on the not-found page.
(function () {
  var path = location.pathname;
  if (path.indexOf('/app/') !== 0) return;
  var rest = path.slice('/app'.length) + location.search + location.hash;
  location.replace('/app/?p=' + encodeURIComponent(rest));
})();
