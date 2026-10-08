// 画面内ナビゲーション。常時動く背景や起動待ちを使わず、内容をすぐ表示する。
(function () {
  if (!("IntersectionObserver" in window)) return;
  var links = document.querySelectorAll(".section-nav a");
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      links.forEach(function (link) {
        var active = link.getAttribute("href") === "#" + entry.target.id;
        link.classList.toggle("current", active);
        if (active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
      });
    });
  }, {rootMargin: "-10% 0px -60% 0px"});
  links.forEach(function (link) { var section = document.querySelector(link.getAttribute("href")); if (section) observer.observe(section); });
})();
