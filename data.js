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
  function get(file, ref) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(API + file + "?ref=" + (ref || "data") + "&t=" + Date.now(), {
      signal: ctrl ? ctrl.signal : undefined,
      headers: { Accept: "application/vnd.github.raw+json", Authorization: "Bearer " + getToken() }
    }).catch(function (e) {
      throw new Error("GitHub につながりませんでした（" + (e.name === "AbortError" ? "20秒たっても返事なし" : e.message) + "）。電波や広告ブロックを確かめてください");
    }).then(function (r) {
      clearTimeout(timer);
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        var t = getToken();
        var hint = t.indexOf("github_pat_") === 0 && t.length !== 93
          ? "読み取れた合い鍵が " + t.length + " 文字でした（正しくは93文字）。コピーのときに途中で切れたか、余分な文字が入っています"
          : "GitHub に断られました（" + r.status + "）。合い鍵の期限切れ・まちがい、または claude-hub を選んでいない可能性があります";
        var e = new Error("合い鍵が使えませんでした。" + hint);
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

  // ---------------------------------------------------------------- 投稿済みにする（claude-hub のファイルを書き換える）
  function b64decode(b) {
    var bin = atob(String(b).replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }
  function b64encode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function apiErr(r, step) {
    var e = new Error(step + " " + r.status);
    // 合い鍵が「見るだけ」だと書き込みで 403/404 になる
    if (step === "書き込み" && (r.status === 403 || r.status === 404)) e.readonly = true;
    return e;
  }

  function markPosted(file) {
    var url = API + file.split("/").map(encodeURIComponent).join("/");
    var headers = { Accept: "application/vnd.github+json", Authorization: "Bearer " + getToken() };
    return fetch(url + "?ref=main&t=" + Date.now(), { headers: headers }).then(function (r) {
      if (!r.ok) throw apiErr(r, "読み込み");
      return r.json();
    }).then(function (j) {
      var text = b64decode(j.content);
      var fm = text.match(/^---\n([\s\S]*?)\n---/);
      if (!fm) throw new Error("ファイルの形が違います");
      var head = fm[1];
      var today = todayJst();
      head = /^status:/m.test(head) ? head.replace(/^status:.*$/m, "status: posted") : head + "\nstatus: posted";
      head = /^posted:/m.test(head) ? head.replace(/^posted:.*$/m, "posted: " + today) : head + "\nposted: " + today;
      var out = text.replace(fm[0], "---\n" + head + "\n---");
      return fetch(url, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify({ message: "投稿済み: " + file, content: b64encode(out), sha: j.sha, branch: "main" })
      });
    }).then(function (r) {
      if (!r.ok) throw apiErr(r, "書き込み");
    });
  }

  window.HubLog = {
    loadBTC: function () { if (!getToken()) return Promise.reject(new Error("先に司令塔の合い鍵を設定してください")); return get("btc.json", "btc-data"); },
    markPosted: markPosted,
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

