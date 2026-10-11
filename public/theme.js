// Applies the saved theme and language before first paint (no flash of the wrong theme).
// A file, not an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
  var theme = JSON.parse(localStorage.getItem('hms:theme'));
  if (theme === 'dark' || theme === 'contrast') document.documentElement.dataset.theme = theme;
  var lang = JSON.parse(localStorage.getItem('hms:lang'));
  if (lang === 'hi') document.documentElement.lang = 'hi';
} catch {
  // Storage blocked (private window): keep the defaults.
}
