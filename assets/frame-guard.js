// The pages that hold a team session must never run inside a frame, where
// another site could lay its own page over them and steer the clicks.
// GitHub Pages can't send frame-ancestors (or X-Frame-Options), and a <meta>
// CSP ignores frame-ancestors, so each such page loads this file first, as a
// plain script at the top of <head>: inside a frame it stops loading (nothing
// after this script is parsed or run) and blanks itself.
if (window.top !== window.self) {
  window.stop();
  document.documentElement.replaceChildren();
  throw new Error('This page does not run inside a frame.');
}
