// =============================================
// ⚡ GRIP TRAINER — Deep Dark Fantasy ♂ Edition
//    每组独立：做完一组自动结束
// =============================================

(function () {
  "use strict";

  const APP_KEY = "grip_trainer";
  const CIRC = 2 * Math.PI * 100;

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // =============================================
  //  STORAGE
  // =============================================
  function loadJSON(key, fallback) {
    try {
      const r = localStorage.getItem(key);
      return r ? JSON.parse(r) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // =============================================
  //  CONFIG
  // =============================================
  let config = loadJSON(APP_KEY + "_config", {
    sets: 5,
    reps: 5,
    workTime: 60,
    restTime: 10,
  });
  function saveConfig() {
    saveJSON(APP_KEY + "_config", config);
  }

  // =============================================
  //  HISTORY  { "2025-01-15": 25, ... }
  //  存的是「总次数」，一次 rep 就 +1
  // =============================================
  let hist = loadJSON(APP_KEY + "_history", {});
  function saveHist() {
    saveJSON(APP_KEY + "_history", hist);
  }

  function todayKey() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function getTodayCount() {
    return hist[todayKey()] || 0;
  }

  function addRep() {
    const k = todayKey();
    hist[k] = (hist[k] || 0) + 1;
    saveHist();
  }

  // =============================================
  //  TIMER STATE
  //  一组 = reps 次 (work+rest) 循环
  //  最后一次 work 结束后不进 rest，直接完成本组
  // =============================================
  let t = {
    running: false,
    paused: false,
    phase: "idle", // idle | work | rest | groupDone
    rep: 0, // 本组第几次 (1-based while running)
    seconds: 0,
    intervalId: null,
  };

  // =============================================
  //  DOM
  // =============================================
  const dom = {
    ring: $("ringProgress"),
    display: $("timerDisplay"),
    label: $("timerLabel"),
    phase: $("timerPhase"),
    todaySets: $("todaySets"),
    currentRep: $("currentRepNum"),
    todayTotal: $("todayTotal"),
    btnStart: $("btnStart"),
    btnReset: $("btnReset"),
    repDots: $("repDots"),
    repDotsLabel: $("repDotsLabel"),
    setBar: $("setProgressBar"),
    overviewText: $("overviewText"),
    toast: $("toast"),
    canvas: $("confettiCanvas"),
  };

  // =============================================
  //  AUDIO
  // =============================================
  function beep(freq, dur, vol) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq || 440;
      g.gain.value = vol || 0.3;
      o.start();
      o.stop(ctx.currentTime + (dur || 150) / 1000);
    } catch {}
  }
  const sfx = {
    work: () => beep(660, 200, 0.3),
    rest: () => beep(440, 300, 0.2),
    tick: () => beep(800, 80, 0.15),
    done: () => {
      beep(880, 100, 0.3);
      setTimeout(() => beep(1100, 100, 0.3), 120);
      setTimeout(() => beep(1320, 300, 0.3), 240);
    },
    allDone: () => {
      beep(523, 150, 0.3);
      setTimeout(() => beep(659, 150, 0.3), 160);
      setTimeout(() => beep(784, 150, 0.3), 320);
      setTimeout(() => beep(1047, 400, 0.35), 480);
    },
  };

  // =============================================
  //  TOAST
  // =============================================
  let toastTid = null;
  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add("show");
    clearTimeout(toastTid);
    toastTid = setTimeout(() => dom.toast.classList.remove("show"), 2500);
  }

  // =============================================
  //  CONFETTI
  // =============================================
  function launchConfetti() {
    const c = dom.canvas;
    const ctx = c.getContext("2d");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const colors = [
      "#e94560",
      "#f5c518",
      "#00e676",
      "#448aff",
      "#ff6f00",
      "#aa00ff",
    ];
    const ps = [];
    for (let i = 0; i < 120; i++) {
      ps.push({
        x: c.width / 2 + (Math.random() - 0.5) * 200,
        y: c.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -14 - 4,
        sz: Math.random() * 6 + 3,
        col: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * 360,
        rs: (Math.random() - 0.5) * 10,
        g: 0.25 + Math.random() * 0.1,
        a: 1,
      });
    }
    let f = 0;
    const mx = 120;
    (function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      f++;
      ps.forEach((p) => {
        p.x += p.vx;
        p.vy += p.g;
        p.y += p.vy;
        p.rot += p.rs;
        p.a = Math.max(0, 1 - f / mx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.6);
        ctx.restore();
      });
      if (f < mx) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }

  // =============================================
  //  COMPUTED HELPERS
  // =============================================
  function todayCompletedSets() {
    return Math.floor(getTodayCount() / config.reps);
  }

  function todayAllDone() {
    return getTodayCount() >= config.sets * config.reps;
  }

  // =============================================
  //  RENDER: Rep Dots (本组)
  // =============================================
  function renderRepDots() {
    let html = "";
    for (let i = 1; i <= config.reps; i++) {
      let cls = "";
      if (t.phase === "idle" || t.phase === "groupDone") {
        if (t.phase === "groupDone" && i <= config.reps) cls = "completed";
        else cls = "";
      } else {
        if (i < t.rep) cls = "completed";
        else if (i === t.rep)
          cls = t.phase === "work" ? "current" : "completed";
      }
      // 在 groupDone 时全部绿
      if (t.phase === "groupDone") cls = "completed";
      if (t.phase === "idle") cls = "";

      html += `<div class="rep-dot ${cls}">${i}</div>`;
    }
    dom.repDots.innerHTML = html;

    const setNum =
      todayCompletedSets() +
      (t.phase !== "idle" && t.phase !== "groupDone" ? 1 : 0);
    if (t.phase === "idle") {
      dom.repDotsLabel.textContent = todayAllDone()
        ? "今日训练已完成 🎉"
        : `下一组: 第 ${todayCompletedSets() + 1} 组`;
    } else if (t.phase === "groupDone") {
      dom.repDotsLabel.textContent = `第 ${todayCompletedSets()} 组 — 完成 ✅`;
    } else {
      dom.repDotsLabel.textContent = `第 ${setNum} 组`;
    }
  }

  // =============================================
  //  RENDER: Ring
  // =============================================
  function setRing(fraction, isRest) {
    const off = CIRC * (1 - Math.max(0, Math.min(1, fraction)));
    dom.ring.style.strokeDashoffset = off;
    dom.ring.classList.toggle("rest", !!isRest);
  }

  // =============================================
  //  RENDER: Today Overview (set progress bars)
  // =============================================
  function renderOverview() {
    const done = getTodayCount();
    const total = config.sets * config.reps;
    const completedSets = todayCompletedSets();

    // Set bar blocks
    let barHTML = "";
    for (let s = 1; s <= config.sets; s++) {
      const repsInSet = Math.max(
        0,
        Math.min(config.reps, done - (s - 1) * config.reps)
      );
      const pct = (repsInSet / config.reps) * 100;
      const full = repsInSet >= config.reps;
      barHTML += `
        <div class="set-block">
          <div class="set-block-bar">
            <div class="set-block-fill ${
              full ? "" : "partial"
            }" style="width:${pct}%"></div>
          </div>
          <div class="set-block-label">第${s}组</div>
        </div>`;
    }
    dom.setBar.innerHTML = barHTML;

    // Text
    if (done >= total) {
      dom.overviewText.innerHTML = `<span class="complete">🏆 今日全部完成! ${done}/${total} 次</span>`;
    } else {
      dom.overviewText.innerHTML = `已完成 <span class="highlight">${completedSets}</span> / ${config.sets} 组，共 <span class="highlight">${done}</span> / ${total} 次`;
    }
  }

  // =============================================
  //  RENDER: Main Update
  // =============================================
  function update() {
    dom.display.textContent = t.seconds;
    dom.todaySets.textContent = todayCompletedSets();
    dom.currentRep.textContent =
      t.phase === "work" || t.phase === "rest" ? t.rep : "-";
    dom.todayTotal.textContent = getTodayCount();

    switch (t.phase) {
      case "work":
        dom.label.textContent = "握紧!";
        dom.phase.className = "timer-phase work";
        dom.phase.textContent = "🔥 锻炼中";
        setRing(t.seconds / config.workTime, false);
        break;
      case "rest":
        dom.label.textContent = "休息";
        dom.phase.className = "timer-phase rest";
        dom.phase.textContent = "😮‍💨 休息中";
        setRing(t.seconds / config.restTime, true);
        break;
      case "groupDone":
        dom.label.textContent = "本组完成!";
        dom.phase.className = "timer-phase done";
        dom.phase.textContent = todayAllDone()
          ? "🏆 今日全部完成"
          : "✅ 本组结束";
        setRing(1, false);
        break;
      default:
        dom.label.textContent = "准备开始";
        dom.phase.className = "timer-phase work";
        dom.phase.textContent = "💪 待命";
        dom.display.textContent = config.workTime;
        setRing(1, false);
    }

    renderRepDots();
    renderOverview();
  }

  // =============================================
  //  TIMER CORE
  // =============================================
  function startGroup() {
    // 今日已全部完成
    if (todayAllDone()) {
      showToast("🏆 今日训练已全部完成! 明天再来♂");
      return;
    }

    // 正在运行 → 暂停
    if (t.running) {
      t.paused = true;
      t.running = false;
      clearInterval(t.intervalId);
      dom.btnStart.textContent = "▶️ 继续";
      return;
    }

    // 暂停中 → 恢复
    if (t.paused) {
      t.paused = false;
      t.running = true;
      dom.btnStart.textContent = "⏸️ 暂停";
      t.intervalId = setInterval(tick, 1000);
      return;
    }

    // 全新开始一组
    t.running = true;
    t.paused = false;
    t.phase = "work";
    t.rep = 1;
    t.seconds = config.workTime;

    dom.btnStart.textContent = "⏸️ 暂停";
    sfx.work();
    update();
    t.intervalId = setInterval(tick, 1000);
  }

  function tick() {
    t.seconds--;

    // 最后 3 秒提示音
    if (t.seconds <= 3 && t.seconds > 0) {
      sfx.tick();
    }

    if (t.seconds <= 0) {
      if (t.phase === "work") {
        // 本次锻炼完成 → 记录
        addRep();

        // 本组全部次数做完？
        if (t.rep >= config.reps) {
          finishGroup();
          return;
        }

        // 还有下一次 → 进入休息
        t.phase = "rest";
        t.seconds = config.restTime;
        sfx.rest();
      } else if (t.phase === "rest") {
        // 休息结束 → 下一次锻炼
        t.rep++;
        t.phase = "work";
        t.seconds = config.workTime;
        sfx.work();
      }
    }

    update();
  }

  function finishGroup() {
    clearInterval(t.intervalId);
    t.running = false;
    t.paused = false;
    t.phase = "groupDone";
    t.seconds = 0;
    dom.btnStart.textContent = "▶️ 开始本组";

    const setsNow = todayCompletedSets();

    if (todayAllDone()) {
      sfx.allDone();
      showToast(`🏆 今日 ${config.sets} 组全部完成! 感受到力量了吗♂`);
      launchConfetti();
    } else {
      sfx.done();
      showToast(`✅ 第 ${setsNow} 组完成! 还剩 ${config.sets - setsNow} 组`);
    }

    update();

    // 2秒后自动回到 idle 状态，准备下一组
    setTimeout(() => {
      if (t.phase === "groupDone") {
        t.phase = "idle";
        t.rep = 0;
        t.seconds = config.workTime;
        update();
        if (!todayAllDone()) {
          dom.btnStart.textContent = "▶️ 开始本组";
        } else {
          dom.btnStart.textContent = "🏆 已完成";
        }
      }
    }, 2000);
  }

  function resetGroup() {
    clearInterval(t.intervalId);
    t = {
      running: false,
      paused: false,
      phase: "idle",
      rep: 0,
      seconds: config.workTime,
      intervalId: null,
    };
    dom.btnStart.textContent = todayAllDone() ? "🏆 已完成" : "▶️ 开始本组";
    update();
  }

  // =============================================
  //  HISTORY: Calendar
  // =============================================
  function renderCalendar() {
    const el = $("calendarContainer");
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const monthNames = [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月",
    ];
    const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = now.getDate();
    const totalTarget = config.sets * config.reps;

    let html = `<div class="calendar-month-label">${year}年 ${monthNames[month]}</div>`;
    html += '<div class="calendar-grid">';

    dayNames.forEach((d) => {
      html += `<div class="calendar-day-header">${d}</div>`;
    });

    for (let i = 0; i < firstDay; i++) {
      html += '<div class="calendar-cell empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const key = `${year}-${mm}-${dd}`;
      const count = hist[key] || 0;
      const isToday = d === todayDate;

      let level = "";
      if (count > 0 && totalTarget > 0) {
        const ratio = count / totalTarget;
        if (ratio >= 1) level = "level-5";
        else if (ratio >= 0.8) level = "level-4";
        else if (ratio >= 0.6) level = "level-3";
        else if (ratio >= 0.3) level = "level-2";
        else level = "level-1";
      }

      html += `<div class="calendar-cell ${level} ${
        isToday ? "today" : ""
      }" title="${key}: ${count}次"></div>`;
    }

    html += "</div>";
    el.innerHTML = html;
  }

  // =============================================
  //  HISTORY: Streak
  // =============================================
  function calcStreak() {
    let streak = 0;
    const d = new Date();
    const target = config.sets * config.reps;

    while (true) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${d.getFullYear()}-${mm}-${dd}`;
      const count = hist[key] || 0;

      if (count >= target) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (streak === 0 && isSameDay(d, new Date())) {
        // 今天还没完成，看昨天
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // =============================================
  //  HISTORY: List
  // =============================================
  function renderHistoryList() {
    const el = $("historyList");
    const target = config.sets * config.reps;
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    const keys = Object.keys(hist)
      .filter((k) => hist[k] > 0)
      .sort((a, b) => b.localeCompare(a));

    if (keys.length === 0) {
      el.innerHTML =
        '<div style="text-align:center;color:var(--text-muted);padding:40px 0;">还没有训练记录<br>开始你的第一次训练吧 💪</div>';
      return;
    }

    let html = "";
    keys.forEach((key) => {
      const count = hist[key];
      const d = new Date(key + "T00:00:00");
      const weekday = weekdays[d.getDay()];
      const fullSets = Math.floor(count / config.reps);
      const remain = count % config.reps;
      const complete = count >= target;

      let info;
      if (complete) info = `${config.sets}组 × ${config.reps}次 ✅`;
      else if (fullSets > 0 && remain > 0) info = `${fullSets}组 + ${remain}次`;
      else if (fullSets > 0) info = `${fullSets}组`;
      else info = `${remain}次`;

      html += `
        <div class="history-item">
          <div>
            <div class="date">${key}</div>
            <div class="weekday">${weekday}</div>
          </div>
          <div class="stats">
            <div class="reps ${
              complete ? "full-complete" : ""
            }">${count} 次</div>
            <div class="sets-info">${info}</div>
          </div>
        </div>`;
    });

    el.innerHTML = html;
  }

  function renderHistory() {
    renderCalendar();
    renderHistoryList();
    $("streakBadge").textContent = `🔥 ${calcStreak()} 天连续`;
  }

  // =============================================
  //  TAB NAVIGATION
  // =============================================
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $("tab-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "history") renderHistory();
    });
  });

  // =============================================
  //  SETTINGS
  // =============================================
  function initSettings() {
    $("settingSets").value = config.sets;
    $("settingReps").value = config.reps;
    $("settingWorkTime").value = config.workTime;
    $("settingRestTime").value = config.restTime;
  }

  ["settingSets", "settingReps", "settingWorkTime", "settingRestTime"].forEach(
    (id) => {
      $(id).addEventListener("change", () => {
        config.sets = parseInt($("settingSets").value) || 5;
        config.reps = parseInt($("settingReps").value) || 5;
        config.workTime = parseInt($("settingWorkTime").value) || 60;
        config.restTime = parseInt($("settingRestTime").value) || 10;
        saveConfig();
        if (t.phase === "idle" || t.phase === "groupDone") resetGroup();
        showToast("⚙️ 设置已保存");
      });
    }
  );

  $("btnExport").addEventListener("click", () => {
    const data = JSON.stringify({ config, history: hist }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grip_trainer_${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("📤 数据已导出");
  });

  $("btnClearData").addEventListener("click", () => {
    if (confirm("⚠️ 确定要清除所有训练数据吗？此操作无法撤销!")) {
      hist = {};
      saveHist();
      resetGroup();
      showToast("🗑️ 数据已清除");
    }
  });

  // =============================================
  //  BUTTON BINDINGS
  // =============================================
  dom.btnStart.addEventListener("click", startGroup);

  dom.btnReset.addEventListener("click", () => {
    if (t.running || t.paused) {
      if (!confirm("确定要重置当前这组训练吗？")) return;
    }
    resetGroup();
    showToast("🔄 已重置");
  });

  // =============================================
  //  KEYBOARD SHORTCUTS
  // =============================================
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      startGroup();
    } else if (e.code === "KeyR") {
      resetGroup();
    }
  });

  // =============================================
  //  INIT
  // =============================================
  function init() {
    initSettings();
    t.seconds = config.workTime;
    dom.btnStart.textContent = todayAllDone() ? "🏆 已完成" : "▶️ 开始本组";
    update();
  }

  init();
})();
