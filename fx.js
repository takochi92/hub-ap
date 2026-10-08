// サイバー風の動き：文字の雨（背景）、起動画面、タイトルのグリッチ、スクロールで出てくるカード
(function () {
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- 起動画面（タブを開いた最初の1回だけ）
  var seen = false;
  try { seen = sessionStorage.getItem("hub-booted") === "1"; sessionStorage.setItem("hub-booted", "1"); } catch (e) {}
  if (!reduce && !seen) {
    var boot = document.createElement("div");
    boot.className = "boot";
    boot.innerHTML = "<pre></pre>";
    document.body.appendChild(boot);
    var lines = [
      "<b>CLAUDE//HUB</b> v2.6 boot sequence",
      "> link: takochi92/claude-hub .... <i>OK</i>",
      "> decrypt task matrix ........... <i>OK</i>",
      "> sync kaigo-navi / teilog ...... <i>OK</i>",
      "> neural feed online_"
    ];
    var pre = boot.firstChild;
    var i = 0;
    (function next() {
      if (i < lines.length) {
        pre.innerHTML = lines.slice(0, ++i).join("\n") + '<span class="cursor"></span>';
        setTimeout(next, 140 + Math.random() * 120);
      } else {
        setTimeout(function () { boot.classList.add("done"); setTimeout(function () { boot.remove(); }, 600); }, 260);
      }
    })();
  }

  // ---------------------------------------------------------------- 文字の雨
  if (!reduce) {
    var cv = document.createElement("canvas");
    cv.id = "fx";
    cv.setAttribute("aria-hidden", "true");
    document.body.prepend(cv);
    var ctx = cv.getContext("2d");
    var chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/{}#$%";
    var size = 16;
    var cols = 0;
    var drops = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(innerWidth / size);
      drops = [];
      for (var c = 0; c < cols; c++) drops.push(Math.random() < 0.35 ? Math.random() * -60 : -9999);
    }
    resize();
    addEventListener("resize", resize);
    var last = 0;
    (function frame(t) {
      requestAnimationFrame(frame);
      if (document.hidden || t - last < 60) return; // 約16コマ/秒で軽く
      last = t;
      ctx.fillStyle = "rgba(4, 5, 10, 0.18)";
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = size + "px 'Share Tech Mono', monospace";
      for (var c = 0; c < cols; c++) {
        if (drops[c] < -1000) { if (Math.random() < 0.002) drops[c] = 0; continue; }
        var y = drops[c] * size;
        ctx.fillStyle = Math.random() < 0.06 ? "#ff2bd6" : "rgba(0, 240, 255, 0.75)";
        ctx.fillText(chars.charAt((Math.random() * chars.length) | 0), c * size, y);
        drops[c] += 1;
        if (y > innerHeight && Math.random() > 0.96) drops[c] = Math.random() < 0.6 ? 0 : -9999;
      }
    })(0);
  }

  // ---------------------------------------------------------------- グリッチ（数秒おきに見出しがずれる）
  function glitchOnce() {
    var h = document.getElementById("hero-title");
    if (!h) return;
    h.classList.add("glitch");
    h.setAttribute("data-text", h.textContent);
    h.classList.add("on");
    setTimeout(function () { h.classList.remove("on"); }, 380);
  }
  if (!reduce) {
    setTimeout(glitchOnce, 1800);
    setInterval(function () { if (!document.hidden && Math.random() < 0.6) glitchOnce(); }, 4200);
  }

  // ---------------------------------------------------------------- スクロールで出てくる
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    var watch = function () {
      document.querySelectorAll(".card, .tgroup, .tweet, .day").forEach(function (el) {
        if (el.dataset.rv) return;
        el.dataset.rv = "1";
        el.classList.add("reveal");
        io.observe(el);
      });
    };
    watch();
    new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  }
})();
