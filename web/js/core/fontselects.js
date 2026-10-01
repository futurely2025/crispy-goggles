/* Puts the user's fonts (and favourites first, and «⚙ إدارة الخطوط») into every font list of the page (5.4).
 * Loaded right after the lists and before the page script, so a saved custom font can be selected at start-up. */
(function () {
  'use strict';
  if (!window.UserFonts) return;
  ['arFontSel', 'font', 'fontInp'].forEach(function (id) {
    var s = document.getElementById(id);
    if (s && s.tagName === 'SELECT' && s.querySelector('option[value="Amiri"]')) UserFonts.fill(s);
  });
})();
