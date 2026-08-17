import {
  createGame,
  tick,
  playerBuzz,
  selectAnswer,
  advance,
  restartSeason,
  summarize,
  getOutcome,
  canBuzz,
  canAnswer,
  canContinue,
  BUZZ_MS,
  ANSWER_MS,
} from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, saveProgress } from "./persist.js";

await window.PG.ready;

const $ = (sel) => document.querySelector(sel);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const audio = new GameAudio();
let state = createGame();
let progress = {};
let recorded = false;
let raf = 0;
let lastTs = 0;
let running = false;
let toastTimer = 0;

const els = {
  lobby: $("#lobby"),
  game: $("#game"),
  hud: $("#hud"),
  question: $("#question-text"),
  timer: $("#timer"),
  timerLabel: $("#timer-label"),
  choices: $("#choices"),
  buzz: $("#buzz"),
  status: $("#status"),
  progressBar: $("#progress"),
  toast: $("#toast"),
  rankBadge: $("#rank-badge"),
  endPanel: $("#end-panel"),
  endTitle: $("#end-title"),
  endBody: $("#end-body"),
};

function showToast(msg, ms = 3200) {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

function timerPct(left, total) {
  return Math.max(0, Math.min(100, (left / total) * 100));
}

function renderHud(view) {
  els.hud.innerHTML = `
    <div><span>場次</span><strong>${esc(view.match)}</strong></div>
    <div><span>題目</span><strong>${esc(view.question)}</strong></div>
    <div><span>你 : AI</span><strong>${view.playerScore} : ${view.aiScore}</strong></div>
    <div><span>連擊</span><strong>${view.combo}</strong></div>
  `;
  els.rankBadge.textContent = view.rank;
  els.rankBadge.style.borderColor = view.rankColor;
  els.rankBadge.style.color = view.rankColor;
  els.progressBar.style.width = `${view.meter}%`;
}

function choiceClass(i, view) {
  if (view.phase !== "reveal" && view.phase !== "ended") return "";
  const q = view.choices;
  const correct = state.questions[state.questionIndex]?.answer;
  if (view.lastPick === i && view.lastCorrect === false) return "wrong";
  if (i === correct) return "correct";
  if (view.lastPick === i && view.lastCorrect) return "correct";
  return "";
}

function renderChoices(view) {
  const letters = ["A", "B", "C", "D"];
  els.choices.innerHTML = "";
  view.choices.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `choice ${choiceClass(i, view)}`;
    btn.dataset.index = String(i);
    btn.innerHTML = `<span class="letter">${letters[i]}</span><span class="label">${esc(text)}</span>`;
    btn.disabled = !canAnswer(state);
    btn.addEventListener("click", () => pick(i));
    els.choices.append(btn);
  });
}

function renderTimer(view) {
  let left = 0;
  let total = BUZZ_MS;
  let label = "搶答";
  if (view.phase === "buzz") {
    left = view.buzzMsLeft;
    total = BUZZ_MS;
    label = "搶答";
  } else if (view.phase === "answer") {
    left = view.answerMsLeft;
    total = ANSWER_MS;
    label = "作答";
  } else if (view.phase === "ai_turn") {
    left = 0;
    label = "對手";
  } else if (view.phase === "reveal") {
    left = state.revealMsLeft ?? 0;
    total = 1500;
    label = "揭曉";
  } else {
    label = view.phase === "intermission" ? "休整" : "";
  }
  els.timer.style.setProperty("--pct", `${timerPct(left, total)}%`);
  els.timerLabel.textContent = label;
}

function renderBuzz(view) {
  const show = canBuzz(state);
  els.buzz.hidden = !show;
  els.buzz.disabled = !show;
  els.buzz.setAttribute("aria-hidden", String(!show));
}

function renderStatus(view) {
  els.status.textContent = view.msg || "";
  els.question.textContent = view.questionText || "準備中…";
}

function renderEnd(view) {
  const outcome = getOutcome(state);
  const show = outcome !== "playing";
  els.endPanel.hidden = !show;
  if (!show) return;
  els.endTitle.textContent = outcome === "won" ? "賽季晉級！" : "賽季結束";
  els.endBody.innerHTML = `
    <p>戰績 <strong>${view.record}</strong> · 最高連擊 <strong>${view.maxCombo}</strong></p>
    <p>Elo <strong>${view.rating}</strong> · 段位 <strong style="color:${view.rankColor}">${esc(view.rank)}</strong></p>
  `;
}

function render() {
  const view = summarize(state);
  renderHud(view);
  renderStatus(view);
  renderChoices(view);
  renderTimer(view);
  renderBuzz(view);
  renderEnd(view);

  const cont = $("#continue");
  if (cont) {
    const showContinue = state.phase === "intermission";
    cont.hidden = !showContinue;
    cont.disabled = !showContinue;
  }
}

function pick(index) {
  if (!canAnswer(state)) return;
  audio.play("click");
  state = selectAnswer(state, index);
  audio.play(state.lastCorrect ? "coin" : "soft");
  render();
}

function buzz() {
  if (!canBuzz(state)) return;
  audio.play("buzz");
  state = playerBuzz(state);
  render();
}

function continueFlow() {
  if (getOutcome(state) !== "playing" && getOutcome(state) !== undefined) {
    restart();
    return;
  }
  if (state.phase === "reveal") {
    state = advance(state);
  } else if (state.phase === "intermission") {
    state = advance(state);
    audio.play("ok");
  }
  render();
}

function restart() {
  state = restartSeason(state, state.rating);
  recorded = false;
  audio.play("ok");
  render();
}

async function recordOutcome(view, outcome) {
  progress = {
    ...progress,
    rating: state.rating,
    bestRating: Math.max(progress.bestRating || 0, state.rating),
    seasonsWon: (progress.seasonsWon || 0) + (outcome === "won" ? 1 : 0),
    totalMatches: (progress.totalMatches || 0) + state.match,
    lastPlayed: new Date().toISOString(),
  };
  $("#best-rating").textContent = String(progress.bestRating || state.rating);
  try {
    await saveProgress(window.PG, progress);
  } catch {
    showToast("進度同步失敗，本機仍可繼續玩");
  }
}

function loop(ts) {
  if (!running) return;
  if (document.visibilityState === "hidden") {
    lastTs = ts;
    raf = requestAnimationFrame(loop);
    return;
  }
  const delta = lastTs ? Math.min(100, ts - lastTs) : 0;
  lastTs = ts;
  if (delta > 0 && getOutcome(state) === "playing") {
    const before = state.phase + state.buzzMsLeft + state.answerMsLeft;
    state = tick(state, delta);
    const after = state.phase + state.buzzMsLeft + state.answerMsLeft;
    if (before !== after) {
      if (state.phase === "ai_turn" || (state.phase === "reveal" && state.buzzWinner === "ai")) {
        audio.play(state.lastCorrect ? "hit" : "soft");
      }
      if (state.phase === "intermission" || getOutcome(state) !== "playing") {
        if (!recorded) {
          recorded = true;
          const view = summarize(state);
          const outcome = getOutcome(state);
          if (outcome !== "playing") audio.play(outcome === "won" ? "win" : "soft");
          void recordOutcome(view, outcome);
        }
      }
      render();
    } else {
      renderTimer(summarize(state));
    }
  }
  raf = requestAnimationFrame(loop);
}

function startLoop() {
  if (running) return;
  running = true;
  lastTs = 0;
  raf = requestAnimationFrame(loop);
}

function stopLoop() {
  running = false;
  cancelAnimationFrame(raf);
}

function suspend() {
  stopLoop();
  audio.suspend();
}

function resume() {
  if (!$("#game").hidden) startLoop();
  audio.resume();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") suspend();
  else resume();
});
window.addEventListener("pagehide", suspend);

$("#start").addEventListener("click", async () => {
  await audio.start();
  audio.play("ok");
  els.lobby.hidden = true;
  els.game.hidden = false;
  state = createGame({ rating: progress.rating || 1200, seed: Date.now() % 9973 });
  recorded = false;
  render();
  startLoop();
});

$("#sound").addEventListener("click", async () => {
  const btn = $("#sound");
  const on = btn.getAttribute("aria-pressed") !== "true";
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "音樂：開" : "音樂：關";
  audio.setEnabled(on);
  if (on) await audio.start();
});

$("#help").addEventListener("click", () => {
  $("#sheet-body").innerHTML = `<ol>
    <li>每題先搶答：按「搶答」或空白鍵。</li>
    <li>搶到後在限時內點選／按 1–4 或 A–D 作答。</li>
    <li>答對得 10 分＋連擊獎勵＋速度加成；對手也會搶答。</li>
    <li>每場 10 題比總分；賽季 10 場需 6 勝晉級。</li>
    <li>Elo 與段位會存到 PG.kv。</li>
  </ol>`;
  $("#sheet").hidden = false;
  $("#sheet-close").focus();
});

$("#sheet-close").addEventListener("click", () => {
  $("#sheet").hidden = true;
  $("#help").focus();
});

els.buzz.addEventListener("click", buzz);
$("#continue").addEventListener("click", continueFlow);
$("#restart").addEventListener("click", restart);

document.addEventListener("keydown", (e) => {
  if (els.game.hidden) return;
  if (e.code === "Space" && canBuzz(state)) {
    e.preventDefault();
    buzz();
    return;
  }
  const keyMap = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
  const idx = keyMap[e.key.toLowerCase()];
  if (idx !== undefined && canAnswer(state)) {
    e.preventDefault();
    pick(idx);
    return;
  }
  if (e.key === "Enter" && canContinue(state)) {
    e.preventDefault();
    continueFlow();
  }
});

try {
  progress = await loadProgress(window.PG);
} catch {
  showToast("讀取進度失敗");
}
if (progress.rating) state.rating = progress.rating;
$("#best-rating").textContent = String(progress.bestRating || progress.rating || 1200);
