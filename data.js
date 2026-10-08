// 司令塔アプリのデータ読み込み
// このページ（公開）にはデータも合い鍵も入っていない。
// 合い鍵（GitHub トークン・見るだけ）はこのスマホのブラウザにだけ保存し、非公開の claude-hub から直接読む。
(function () {
  var HUB = "takochi92/claude-hub";
  var API = "https://api.github.com/repos/" + HUB + "/contents/";
  var KEY = "hub-token";
  var images = {};

  function todayJst() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function getToken() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) {}
  }

  function get(file) {
    return fetch(API + file + "?ref=data&t=" + Date.now(), {
      cache: "no-store",
      headers: { Accept: "application/vnd.github.raw+json", Authorization: "Bearer " + getToken() }
    }).then(function (r) {
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        var e = new Error("合い鍵が使えませんでした（期限切れ・まちがい・権限なし）");
        e.auth = true;
        throw e;
      }
      if (!r.ok) throw new Error("GitHub " + r.status);
      return r.json();
    });
  }

  // 合い鍵の入力画面
  function askToken(message) {
    return new Promise(function (resolve) {
      var box = document.getElementById("token-box");
      document.getElementById("token-msg").textContent = message || "";
      box.hidden = false;
      document.getElementById("token-form").onsubmit = function (e) {
        e.preventDefault();
        var v = document.getElementById("token-input").value.trim();
        if (!v) return;
        setToken(v);
        document.getElementById("token-input").value = "";
        box.hidden = true;
        resolve();
      };
    });
  }

  function loadWithToken() {
    var ready = getToken() ? Promise.resolve() : askToken();
    return ready.then(function () {
      return Promise.all([get("log.json"), get("images.json").catch(function () { return {}; })]);
    }).then(function (res) {
      images = res[1] || {};
      return res[0];
    }).catch(function (e) {
      if (!e.auth) throw e;
      setToken("");
      return askToken(e.message).then(loadWithToken);
    });
  }

  window.HubLog = {
    todayJst: todayJst,
    load: loadWithToken,
    image: function (p) { return images[p] || ""; },
    forget: function () { setToken(""); location.reload(); },
    series: function (log, n, project) {
      var map = {};
      log.days.forEach(function (d) {
        map[d.date] = project ? (d.byProject[project] || 0) : d.commits.length;
      });
      var out = [];
      var base = new Date(todayJst() + "T00:00:00Z");
      for (var i = n - 1; i >= 0; i--) {
        var d = new Date(base);
        d.setUTCDate(d.getUTCDate() - i);
        var key = d.toISOString().slice(0, 10);
        out.push({ date: key, count: map[key] || 0, weekday: d.getUTCDay() });
      }
      return out;
    },
    esc: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
  };
})();
