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
  // 貼り付けた文字から合い鍵の部分だけを取り出す（前後の空白・日本語・見えない文字を除く）
  function clean(t) {
    var m = String(t || "").match(/github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+/);
    return m ? m[0] : "";
  }
  function getToken() {
    try { return clean(localStorage.getItem(KEY)); } catch (e) { return ""; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (e) {}
  }

  function status(msg) {
    var el = document.getElementById("hero-sub");
    if (el) el.textContent = msg;
  }

  // 20秒で返事がなければあきらめてエラーを出す
  function get(file) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(API + file + "?ref=data&t=" + Date.now(), {
      signal: ctrl ? ctrl.signal : undefined,
      headers: { Accept: "application/vnd.github.raw+json", Authorization: "Bearer " + getToken() }
    }).catch(function (e) {
      throw new Error("GitHub につながりませんでした（" + (e.name === "AbortError" ? "20秒たっても返事なし" : e.message) + "）。電波や広告ブロックを確かめてください");
    }).then(function (r) {
      clearTimeout(timer);
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
        var v = clean(document.getElementById("token-input").value);
        if (!v) {
          document.getElementById("token-msg").textContent = "github_pat_ で始まる合い鍵が見つかりませんでした。もう一度コピーして貼り付けてください";
          return;
        }
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
      status("claude-hub からデータを読み込み中…");
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
