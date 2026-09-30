(function () {
  var $ = function (id) { return document.getElementById(id); };

  var MOVES = ["rock", "paper", "scissors"];
  var ICONS = { rock: "✊", paper: "✋", scissors: "✌️" };
  var BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
  var KEYS = { r: "rock", p: "paper", s: "scissors" };
  var STORE = "rps-arena-v1";
  var STEP = 420; // ms per countdown word
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = { you: 0, cpu: 0, draw: 0, streak: 0, best: 0, history: [] };
  var target = 0;        // wins needed in a series (0 = endless)
  var sy = 0, sc = 0;    // series score
  var busy = false, soundOn = true, over = false;

  try {
    var saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && typeof saved.you === "number") state = saved;
  } catch (e) {}
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  /* ---------- Sound ---------- */
  var actx = null;
  function tone(freq, dur, type, delay, vol) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + (delay || 0);
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.07, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function sfx(kind) {
    if (kind === "win") [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.18, "triangle", i * 0.1); });
    else if (kind === "lose") { tone(220, 0.25, "sawtooth", 0, 0.06); tone(165, 0.35, "sawtooth", 0.2, 0.06); }
    else tone(330, 0.15, "triangle");
  }

  /* ---------- Confetti ---------- */
  var cv = $("fx"), cx = cv.getContext("2d"), parts = [], raf = 0;
  var COLORS = ["#ff7a3d", "#3ddc97", "#ffd166", "#6ec6ff", "#ff5d73"];
  function fit() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  window.addEventListener("resize", fit); fit();
  function burst(n) {
    if (reduce) return;
    for (var i = 0; i < n; i++) {
      parts.push({ x: cv.width / 2, y: cv.height * 0.42, vx: (Math.random() - 0.5) * 13,
        vy: -Math.random() * 12 - 3, s: Math.random() * 7 + 4, c: COLORS[i % COLORS.length],
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 1 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < cv.height + 20; });
    parts.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.r += p.vr; p.life -= 0.008;
      cx.save(); cx.globalAlpha = Math.max(p.life, 0); cx.translate(p.x, p.y); cx.rotate(p.r);
      cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore();
    });
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
  }

  /* ---------- Helpers ---------- */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function randomMove() { var a = new Uint32Array(1); crypto.getRandomValues(a); return MOVES[a[0] % 3]; }
  function outcome(y, c) { return y === c ? "draw" : BEATS[y] === c ? "win" : "lose"; }
  function setButtons(off) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-move]"), function (b) { b.disabled = off; });
  }
  function bump(id) {
    var el = $(id); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }

  /* ---------- Rendering ---------- */
  function renderScore() {
    $("s-you").textContent = state.you;
    $("s-cpu").textContent = state.cpu;
    $("s-draw").textContent = state.draw;
    $("best").textContent = state.best;
    $("streak-label").textContent = state.streak >= 2 ? "🔥 " + state.streak + " streak" : "";
  }
  function renderPips() {
    ["you", "cpu"].forEach(function (who) {
      var filled = who === "you" ? sy : sc, html = "";
      for (var i = 0; i < target; i++) html += '<i class="' + (i < filled ? "f" : "") + '"></i>';
      $("p-" + who).innerHTML = html;
    });
  }
  function renderHistory() {
    var list = $("history"); list.innerHTML = "";
    state.history.forEach(function (r) {
      var li = document.createElement("li");
      li.className = r.result;
      li.textContent = ICONS[r.you] + " vs " + ICONS[r.cpu];
      list.appendChild(li);
    });
  }

  /* ---------- Round flow ---------- */
  function play(you) {
    if (busy || over) return;
    busy = true; setButtons(true);
    var cpu = randomMove();
    var hy = $("h-you"), hc = $("h-cpu");
    hy.className = "hand shaking"; hc.className = "hand flip shaking";
    hy.textContent = hc.textContent = ICONS.rock;
    $("result").textContent = ""; $("result").className = "result";
    ["Rock", "Paper", "Scissors", "Shoot!"].forEach(function (w, i) {
      setTimeout(function () { $("call").textContent = w; tone(i === 3 ? 660 : 330, 0.1, "square"); }, i * STEP);
    });
    setTimeout(function () { reveal(you, cpu); }, 4 * STEP);
  }

  function reveal(you, cpu) {
    var result = outcome(you, cpu);
    var hy = $("h-you"), hc = $("h-cpu");
    hy.textContent = ICONS[you]; hc.textContent = ICONS[cpu];
    hy.className = "hand" + (result === "win" ? " win" : result === "lose" ? " lose" : "");
    hc.className = "hand flip" + (result === "lose" ? " win" : result === "win" ? " lose" : "");
    $("call").textContent = result === "draw" ? "Draw" : result === "win" ? "Win!" : "Lose";

    if (result === "win") {
      state.you++; state.streak++; sy++;
      if (state.streak > state.best) state.best = state.streak;
      bump("s-you"); burst(70); sfx("win");
    } else if (result === "lose") {
      state.cpu++; state.streak = 0; sc++;
      bump("s-cpu"); sfx("lose");
      if (!reduce) { document.body.classList.add("hit"); setTimeout(function () { document.body.classList.remove("hit"); }, 420); }
    } else { state.draw++; bump("s-draw"); sfx("draw"); }

    state.history.unshift({ you: you, cpu: cpu, result: result });
    state.history = state.history.slice(0, 6);

    var el = $("result");
    el.className = "result " + result;
    el.textContent = result === "win" ? cap(you) + " beats " + cpu + "!"
      : result === "lose" ? cap(cpu) + " beats " + you + "."
      : "Both chose " + you + ".";

    renderScore(); renderPips(); renderHistory(); save();

    if (target && (sy >= target || sc >= target)) {
      over = true;
      setTimeout(function () { endMatch(sy >= target); }, 900);
    } else { busy = false; setButtons(false); }
  }

  function endMatch(won) {
    $("over-title").textContent = won ? "You win the match!" : "Computer wins";
    $("over-text").textContent = "Final score " + sy + " - " + sc + ". " + (won ? "Nicely played." : "Ready for a rematch?");
    $("over").hidden = false;
    $("again").focus();
    if (won) { burst(140); sfx("win"); } else sfx("lose");
  }

  function newMatch() {
    sy = sc = 0; over = false; busy = false;
    $("over").hidden = true; setButtons(false); renderPips();
    $("h-you").className = "hand"; $("h-cpu").className = "hand flip";
    $("h-you").textContent = $("h-cpu").textContent = ICONS.rock;
    $("call").textContent = "Ready?";
    $("result").textContent = "Choose your move"; $("result").className = "result";
  }

  /* ---------- Events ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-move]"), function (b) {
    b.addEventListener("click", function () { play(b.getAttribute("data-move")); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-target]"), function (b) {
    b.addEventListener("click", function () {
      if (busy && !over) return;
      target = parseInt(b.getAttribute("data-target"), 10);
      Array.prototype.forEach.call(document.querySelectorAll("[data-target]"), function (x) { x.classList.toggle("on", x === b); });
      newMatch();
    });
  });
  $("again").addEventListener("click", newMatch);
  $("sound").addEventListener("click", function () {
    soundOn = !soundOn;
    this.textContent = soundOn ? "Sound on" : "Sound off";
    this.setAttribute("aria-pressed", String(soundOn));
  });
  $("reset").addEventListener("click", function () {
    if (busy && !over) return;
    state = { you: 0, cpu: 0, draw: 0, streak: 0, best: 0, history: [] };
    save(); renderScore(); renderHistory(); newMatch();
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var m = KEYS[e.key.toLowerCase()];
    if (m) play(m);
  });

  renderScore(); renderHistory(); renderPips();
})();