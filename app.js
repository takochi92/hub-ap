// Claude 司令塔 ダッシュボード
(function () {
  var H = window.HubLog;
  var esc = H.esc;
  var $ = function (id) { return document.getElementById(id); };
  var SEEN_KEY = "claude-hub-seen";
  var STATUS = { active: "進行中", waiting: "たこさん待ち", auto: "自動", done: "完了", idea: "候補" };
  var STATUS_ORDER = ["active", "waiting", "auto", "idea", "done"];
  var log = null;
  var project = "all";

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 3500);
  }

  function countUp(el, to) {
    var start = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - start) / 900);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  function weekdayJa(date) {
    return "日月火水木金土".charAt(new Date(date + "T00:00:00Z").getUTCDay());
  }

  function proj(id) {
    return log.projects.find(function (p) { return p.id === id; }) || { id: id, name: id, color: "#888" };
  }

  function badge(id) {
    var p = proj(id);
    return '<span class="pbadge" style="--p:' + esc(p.color) + '">' + esc(p.name) + "</span>";
  }

  function inProject(x) { return project === "all" || x.project === project; }

  function copy(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text).then(function () { toast("コピーしました"); });
    var ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("コピーしました");
  }

  // ---------------------------------------------------------------- 描画

  function renderProjects() {
    var opts = [{ id: "all", name: "すべて", color: "" }].concat(log.projects);
    $("projects").innerHTML = opts.map(function (p) {
      return '<button class="chip" type="button" data-p="' + esc(p.id) + '" aria-pressed="' + (p.id === project) + '"' + (p.color ? ' style="--p:' + esc(p.color) + '"' : "") + ">" + esc(p.name) + "</button>";
    }).join("");
  }

  function renderHero() {
    var today = H.todayJst();
    var d = log.days.find(function (x) { return x.date === today; });
    var commits = d ? d.commits.filter(inProject) : [];
    var created = d ? d.created.filter(inProject) : [];
    var latest = null;
    log.days.some(function (x) { latest = x.commits.filter(inProject)[0]; return latest; });
    $("hero-date").textContent = "TODAY · " + today + " (" + weekdayJa(today) + ")";
    if (commits.length) {
      $("hero-title").innerHTML = '今日は <span class="grad">' + commits.length + "件</span> つくりました";
      $("hero-sub").textContent = "最新: " + commits[0].time + " [" + proj(commits[0].project).name + "] " + commits[0].title;
    } else {
      $("hero-title").innerHTML = '今日はまだ <span class="grad">おやすみ中</span>';
      $("hero-sub").textContent = latest ? "最後の作業: " + latest.date + " " + latest.time + " [" + proj(latest.project).name + "] " + latest.title : "";
    }
    countUp($("s-today"), commits.length);
    countUp($("s-created"), created.length);
    countUp($("s-tweets"), log.tweets.filter(function (t) { return t.status === "ready" && !isPosted(t) && inProject(t); }).length);
    countUp($("s-tasks"), log.tasks.filter(function (t) { return (t.status === "active" || t.status === "waiting") && inProject(t); }).length);
  }

  function renderTasks() {
    var groups = (project === "all" ? log.projects : [proj(project)]).map(function (p) {
      var list = log.tasks.filter(function (t) { return t.project === p.id; });
      list.sort(function (a, b) { return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status); });
      return { p: p, list: list };
    }).filter(function (g) { return g.list.length; });
    var total = 0;
    var done = 0;
    $("tasks").innerHTML = groups.map(function (g) {
      var gd = g.list.filter(function (t) { return t.status === "done" || t.status === "auto"; }).length;
      total += g.list.length;
      done += gd;
      return '<div class="tgroup" style="--p:' + esc(g.p.color) + '"><h3>' + esc(g.p.name) + '<span class="prog">' + gd + "/" + g.list.length + "</span></h3>" +
        '<div class="tbar"><i style="width:' + (gd / g.list.length * 100) + '%"></i></div><ul>' +
        g.list.map(function (t) {
          return '<li class="' + esc(t.status) + '"><span class="st st-' + esc(t.status) + '">' + (STATUS[t.status] || esc(t.status)) + '</span><span class="t">' + esc(t.title) +
            (t.done ? ' <small class="muted mono">' + esc(t.done.slice(5)) + "</small>" : "") + "</span></li>";
        }).join("") + "</ul></div>";
    }).join("") || '<div class="empty">タスクはまだありません</div>';
    $("tasks-count").textContent = done + " / " + total + " 完了・自動";
  }

  // ---------------------------------------------------------------- 投稿済みにする

  var HIDE_KEY = "hub-posted";
  var showPosted = false;
  function hiddenIds() {
    try { return JSON.parse(localStorage.getItem(HIDE_KEY) || "[]"); } catch (e) { return []; }
  }
  function hideLocal(id) {
    var a = hiddenIds();
    if (a.indexOf(id) < 0) a.push(id);
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(a.slice(-300))); } catch (e) {}
  }
  function isPosted(x) { return x.status === "posted" || hiddenIds().indexOf(x.id) >= 0; }

  function markPosted(item) {
    var name = item.title || item.text.split("\n")[0];
    if (!confirm("「" + name.slice(0, 40) + "」を投稿済みにして、一覧から消しますか？")) return;
    hideLocal(item.id);
    renderAll();
    var job = H.markPosted ? H.markPosted(item.file) : Promise.reject({ readonly: true });
    job.then(function () {
      toast("✅ 投稿済みにしました");
    }).catch(function (e) {
      toast(e && e.readonly
        ? "この端末の一覧から消しました（司令塔に記録するには、合い鍵を「書き込みも可」にしてください）"
        : "司令塔への記録に失敗しました（" + (e && e.message) + "）。この端末の一覧からは消しました");
    });
  }

  function postedToggle(n) {
    return n ? '<button class="linkish posted-toggle" type="button" data-toggle="1">' + (showPosted ? "投稿済みを隠す" : "投稿済み " + n + " 件を表示") + "</button>" : "";
  }

  function renderTweets() {
    var all = log.tweets.filter(inProject);
    var postedN = all.filter(isPosted).length;
    var list = all.filter(function (t) { return showPosted || !isPosted(t); });
    list.sort(function (a, b) { return (a.status === "ready" ? 0 : 1) - (b.status === "ready" ? 0 : 1) || (a.id < b.id ? 1 : -1); });
    $("tweets").innerHTML = list.map(function (t, i) {
      var over = t.length > 280;
      return '<article class="tweet ' + esc(t.status) + '">' +
        '<div class="tweet-top">' + badge(t.project) + '<span class="mono muted">' + esc(t.date) + "</span>" +
        '<span class="st st-' + (isPosted(t) ? "done" : t.status === "ready" ? "active" : "idea") + '">' + (isPosted(t) ? "投稿済み" : t.status === "ready" ? "投稿待ち" : "下書き") + "</span></div>" +
        (t.image ? '<img class="tweet-img" loading="lazy" src="' + esc(H.image(t.image)) + '" alt="">' : "") +
        '<p class="tweet-text">' + esc(t.text) + "</p>" +
        '<div class="tweet-foot"><span class="mono ' + (over ? "del" : "muted") + '">' + t.length + "/280</span>" +
        '<button class="pill-btn" type="button" data-copy="' + i + '">コピー</button>' +
        '<a class="pill-btn x" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + encodeURIComponent(t.text) + '">X で投稿</a>' +
        (isPosted(t) ? "" : '<button class="pill-btn done-btn" type="button" data-done="' + i + '">✅ 投稿した</button>') + "</div></article>";
    }).join("") + postedToggle(postedN) || '<div class="empty">ツイートはまだありません。Claude が作ると tweets/ に入ります</div>';
    if (!list.length && postedN) $("tweets").innerHTML = '<div class="empty">投稿待ちのツイートはありません</div>' + postedToggle(postedN);
    $("tweets").onclick = function (e) {
      var b = e.target.closest("[data-copy]");
      if (b) copy(list[Number(b.dataset.copy)].text);
      var d = e.target.closest("[data-done]");
      if (d) markPosted(list[Number(d.dataset.done)]);
      if (e.target.closest("[data-toggle]")) { showPosted = !showPosted; renderAll(); }
    };
    $("tweets-count").textContent = all.filter(function (t) { return t.status === "ready" && !isPosted(t); }).length + " 件 投稿待ち";
  }

  // ---------------------------------------------------------------- 予約投稿

  var PLAT = { instagram: ["📸", "Instagram", "https://www.instagram.com/"], x: ["🐦", "X", "https://x.com/"] };

  function countdown(unix) {
    var s = unix - Date.now() / 1000;
    if (s < -3600) return "時間を過ぎています";
    if (s <= 0) return "▶ 投稿時間です！";
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return "あと " + (d ? d + "日 " : "") + (d || h ? h + "時間 " : "") + m + "分";
  }

  function whenLabel(unix) {
    var d = new Date(unix * 1000 + 9 * 3600 * 1000);
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "(" + "日月火水木金土".charAt(d.getUTCDay()) + ") " + d.toISOString().slice(11, 16);
  }

  function fetchFiles(post) {
    if (post._files) return Promise.resolve(post._files);
    return Promise.all(post.images.map(function (url, i) {
      return fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
        return new File([b], post.id + "-" + String(i + 1).padStart(2, "0") + ".jpg", { type: b.type || "image/jpeg" });
      });
    })).then(function (files) { post._files = files; return files; });
  }

  function saveFiles(files) {
    files.forEach(function (f, i) {
      setTimeout(function () {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(f);
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 350);
    });
  }

  function renderPosts() {
    var list = (log.posts || []).filter(inProject);
    var upcoming = list.filter(function (p) { return p.status === "scheduled" && !isPosted(p); });
    var done = showPosted ? list.filter(isPosted) : [];
    var postedN = list.filter(isPosted).length;
    var next = upcoming.find(function (p) { return p.atUnix > Date.now() / 1000 - 3600; });
    $("posts").innerHTML = upcoming.concat(done).map(function (p, i) {
      var pl = PLAT[p.platform] || PLAT.instagram;
      return '<article class="post ' + (isPosted(p) ? "posted" : esc(p.status)) + (p === next ? " next" : "") + '" id="post-' + esc(p.id) + '" data-i="' + i + '">' +
        '<div class="post-top"><span class="post-when mono">' + esc(whenLabel(p.atUnix)) + "</span>" + badge(p.project) +
        '<span class="pbadge plat">' + pl[0] + " " + pl[1] + "</span>" +
        '<span class="post-cd mono" data-at="' + p.atUnix + '">' + (!isPosted(p) ? countdown(p.atUnix) : "投稿済み " + esc(p.posted || "")) + "</span></div>" +
        '<h3 class="post-title">' + esc(p.title || p.id) + "</h3>" +
        '<div class="post-imgs">' + p.images.map(function (u, j) {
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(u) + '" alt="' + (j + 1) + '枚目"><b>' + (j + 1) + "</b></a>";
        }).join("") + "</div>" +
        '<details class="post-text"><summary>キャプション（' + p.text.length + '文字）</summary><p>' + esc(p.text) + "</p></details>" +
        '<div class="post-btns">' +
        '<button class="pill-btn" type="button" data-act="copy">📋 キャプションをコピー</button>' +
        '<button class="pill-btn x" type="button" data-act="share">📤 ' + pl[1] + 'に送る</button>' +
        '<button class="pill-btn" type="button" data-act="save">💾 画像を保存</button>' +
        (isPosted(p) ? "" : '<button class="pill-btn done-btn" type="button" data-act="done">✅ 投稿した</button>') +
        "</div></article>";
    }).join("") || '<div class="empty">' + (postedN ? "予定の投稿はありません" : "予約投稿はまだありません。Claude に「◯日の◯時に投稿」と頼むと posts/ に入ります") + "</div>";
    $("posts").innerHTML += postedToggle(postedN);
    var all = upcoming.concat(done);
    $("posts").onclick = function (e) {
      if (e.target.closest("[data-toggle]")) { showPosted = !showPosted; return renderAll(); }
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var p = all[Number(b.closest(".post").dataset.i)];
      var act = b.dataset.act;
      if (act === "copy") return copy(p.text);
      if (act === "done") return markPosted(p);
      b.disabled = true;
      var label = b.textContent;
      b.textContent = "画像を準備中…";
      // 先にキャプションをコピーしておく（インスタは共有で文章を受け取らないので、貼り付けて使う）
      if (act === "share") copy(p.text);
      fetchFiles(p).then(function (files) {
        if (act === "share" && navigator.canShare && navigator.canShare({ files: files })) {
          toast("キャプションをコピーしました。次の画面で Instagram を選んでください");
          return navigator.share({ files: files, title: p.title }).catch(function (err) {
            if (err && err.name === "NotAllowedError") toast("画像の準備ができました。もう一度「送る」を押してください");
          });
        }
        saveFiles(files);
        toast(act === "share" ? "この端末は直接送れないので画像を保存しました。キャプションはコピー済みです" : "画像を " + files.length + " 枚保存します");
      }).catch(function () {
        toast("画像を読み込めませんでした");
      }).then(function () {
        b.disabled = false;
        b.textContent = label;
      });
    };
    $("posts-count").textContent = upcoming.length + " 件 予定" + (next ? " · 次 " + whenLabel(next.atUnix) : "");
    $("posts-card").hidden = !list.length && project !== "all";
  }

  // 通知から開いたとき（#post=…）はその投稿へ
  function focusPost() {
    var m = location.hash.match(/post=([^&]+)/);
    if (!m) return;
    var el = document.getElementById("post-" + decodeURIComponent(m[1]));
    if (!el) return;
    el.classList.add("focus");
    var d = el.querySelector("details");
    if (d) d.open = true;
    setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 400);
  }

  setInterval(function () {
    document.querySelectorAll(".post-cd[data-at]").forEach(function (el) {
      if (el.closest(".post.scheduled")) el.textContent = countdown(Number(el.dataset.at));
    });
  }, 30000);

  function renderHeat() {
    var days = H.series(log, 84, project === "all" ? null : project);
    var html = "";
    for (var i = 0; i < days[0].weekday; i++) html += '<i style="visibility:hidden"></i>';
    var today = H.todayJst();
    html += days.map(function (d) {
      var lv = d.count === 0 ? 0 : d.count <= 2 ? 1 : d.count <= 5 ? 2 : d.count <= 9 ? 3 : 4;
      return '<i data-l="' + lv + '"' + (d.date === today ? ' class="today"' : "") + ' title="' + d.date + "：" + d.count + '件"></i>';
    }).join("");
    $("heat").innerHTML = html;
    $("heat-from").textContent = days[0].date.slice(5).replace("-", "/");
  }

  function renderBars() {
    var by = log.totals.byProject || {};
    var max = Math.max.apply(null, log.projects.map(function (p) { return by[p.id] || 0; }).concat(1));
    $("bars").innerHTML = log.projects.map(function (p) {
      return '<div class="bar" style="--k:' + esc(p.color) + '"><span>' + esc(p.name) + '</span><div class="track"><div class="fill" data-w="' + ((by[p.id] || 0) / max * 100) + '"></div></div><span class="n">' + (by[p.id] || 0) + "</span></div>";
    }).join("") + '<div class="bar-note muted">ファイル ' + log.totals.created + " 個つくりました</div>";
    $("streak").textContent = "🔥 " + log.totals.streak + " 日連続";
    requestAnimationFrame(function () {
      document.querySelectorAll(".bar .fill").forEach(function (el) { el.style.width = el.dataset.w + "%"; });
    });
  }

  function fileChip(c, f, status) {
    var p = proj(c.project);
    var name = f.path.split("/").pop();
    var dir = f.path.slice(0, f.path.length - name.length);
    return '<a class="file ' + (status || f.status) + '" title="' + esc(f.path) + '" href="https://github.com/' + esc(p.repo) + "/blob/HEAD/" + esc(f.path) + '" target="_blank" rel="noopener">' +
      (dir ? "<b>" + esc(dir) + "</b>" : "") + esc(name) + "</a>";
  }

  function renderTimeline() {
    var seen = store(SEEN_KEY) || "";
    var today = H.todayJst();
    var shown = 0;
    var html = log.days.map(function (d) {
      var commits = d.commits.filter(inProject);
      if (!commits.length || shown >= 30) return "";
      shown++;
      var created = d.created.filter(inProject);
      var fresh = seen && commits.some(function (c) { return d.date + c.time > seen; });
      return '<article class="day' + (d.date === today ? " is-today" : "") + '" id="' + d.date + '">' +
        '<div class="day-head"><h3>' + d.date + " (" + weekdayJa(d.date) + ")</h3>" +
        '<span class="meta">' + commits.length + " 件 · 新しいファイル " + created.length + "</span>" +
        (fresh ? '<span class="new-badge">NEW</span>' : "") + "</div>" +
        commits.map(function (c) {
          var added = c.files.filter(function (f) { return f.status === "A"; });
          return '<div class="commit" style="--k:' + esc(proj(c.project).color) + '"><div class="commit-top"><span class="time">' + esc(c.time) + "</span>" + badge(c.project) +
            '<span class="title">' + esc(c.title) + '</span><span class="kind">' + esc(log.kinds[c.kind] || "") + "</span></div>" +
            (added.length ? '<div class="files">' + added.slice(0, 8).map(function (f) { return fileChip(c, f, "A"); }).join("") + (added.length > 8 ? '<span class="file">ほか ' + (added.length - 8) + "</span>" : "") + "</div>" : "") +
            '<details><summary>' + c.files.length + " files · " + esc(c.hash) + " · " + esc(c.branch) + "</summary>" +
            (c.body ? '<div class="body">' + esc(c.body) + "</div>" : "") +
            '<div class="files">' + c.files.slice(0, 60).map(function (f) { return fileChip(c, f); }).join("") + "</div>" +
            '<a class="mono muted" href="' + esc(c.url) + '" target="_blank" rel="noopener">GitHub で見る →</a></details></div>';
        }).join("") + "</article>";
    }).join("");
    $("timeline").innerHTML = html || '<div class="empty">まだ作業はありません</div>';
    $("tl-count").textContent = log.totals.commits + " commits · " + log.totals.days + " days";
  }

  function renderAll() {
    renderProjects();
    renderHero();
    renderTasks();
    renderPosts();
    renderTweets();
    renderHeat();
    renderBars();
    renderTimeline();
  }

  // ---------------------------------------------------------------- 起動

  $("projects").onclick = function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    project = b.dataset.p;
    store("claude-hub-project", project);
    renderAll();
  };

  H.load().then(function (data) {
    log = data;
    var saved = store("claude-hub-project");
    if (saved && (saved === "all" || log.projects.some(function (p) { return p.id === saved; }))) project = saved;
    renderAll();
    focusPost();
    window.addEventListener("hashchange", focusPost);
    $("updated").textContent = "更新 " + new Date(log.generatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    $("foot").textContent = log.hub + " · " + log.projects.map(function (p) { return p.name; }).join(" / ");

    // 前回見たときから増えた作業をお知らせ
    var latest = log.days[0] ? log.days[0].date + log.days[0].commits[0].time : "";
    var seen = store(SEEN_KEY);
    if (seen && latest > seen) {
      var n = 0;
      log.days.forEach(function (d) { d.commits.forEach(function (c) { if (d.date + c.time > seen) n++; }); });
      toast("✨ 前回から新しい作業が " + n + " 件あります");
    }
    setTimeout(function () { if (latest) store(SEEN_KEY, latest); }, 4000);
  }).catch(function (e) {
    $("hero-title").textContent = "データを読み込めませんでした";
    $("hero-sub").textContent = e.message + "（↻ 更新 でやり直し）";
  });
})();
