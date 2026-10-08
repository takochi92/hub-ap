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
    countUp($("s-tweets"), log.tweets.filter(function (t) { return t.status === "ready" && inProject(t); }).length);
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

  function renderTweets() {
    var list = log.tweets.filter(inProject);
    list.sort(function (a, b) { return (a.status === "ready" ? 0 : 1) - (b.status === "ready" ? 0 : 1) || (a.id < b.id ? 1 : -1); });
    $("tweets").innerHTML = list.map(function (t, i) {
      var over = t.length > 280;
      return '<article class="tweet ' + esc(t.status) + '">' +
        '<div class="tweet-top">' + badge(t.project) + '<span class="mono muted">' + esc(t.date) + "</span>" +
        '<span class="st st-' + (t.status === "ready" ? "active" : "done") + '">' + (t.status === "ready" ? "投稿待ち" : t.status === "posted" ? "投稿済み" : "下書き") + "</span></div>" +
        (t.image ? '<img class="tweet-img" loading="lazy" src="' + esc(H.image(t.image)) + '" alt="">' : "") +
        '<p class="tweet-text">' + esc(t.text) + "</p>" +
        '<div class="tweet-foot"><span class="mono ' + (over ? "del" : "muted") + '">' + t.length + "/280</span>" +
        '<button class="pill-btn" type="button" data-copy="' + i + '">コピー</button>' +
        '<a class="pill-btn x" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + encodeURIComponent(t.text) + '">X で投稿</a></div></article>';
    }).join("") || '<div class="empty">ツイートはまだありません。Claude が作ると tweets/ に入ります</div>';
    $("tweets").onclick = function (e) {
      var b = e.target.closest("[data-copy]");
      if (b) copy(list[Number(b.dataset.copy)].text);
    };
    $("tweets-count").textContent = list.filter(function (t) { return t.status === "ready"; }).length + " 件 投稿待ち";
  }

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
    $("hero-sub").textContent = e.message;
  });
})();
