import {
  MATCHES_PER_SEASON,
  QUESTIONS_PER_MATCH,
  WINS_TO_PASS,
  pickMatchQuestions,
} from "./questions.js";
import { opponentRating, rankForRating } from "./ranks.js";

export const BUZZ_MS = 4000;
export const ANSWER_MS = 6000;
export const REVEAL_MS = 1500;

/** @param {number} rating @param {number} opponent @param {boolean} win @param {number} [k] */
export function elo(rating, opponent, win, k = 32) {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(rating + k * ((win ? 1 : 0) - expected));
}

/** @param {boolean} correct @param {number} combo @param {number} msLeft */
export function scorePoints(correct, combo, msLeft) {
  if (!correct) return 0;
  const speed = Math.max(0, Math.floor(msLeft / 1000)) * 2;
  const streak = combo > 1 ? (combo - 1) * 2 : 0;
  return 10 + streak + speed;
}

/** @param {ReturnType<typeof createGame>} state */
export function aiBuzzChance(state) {
  const m = state.match;
  const q = state.questionIndex;
  return Math.min(0.88, 0.32 + m * 0.045 + q * 0.015);
}

/** @param {ReturnType<typeof createGame>} state */
export function aiAnswerCorrect(state) {
  const q = state.questions[state.questionIndex];
  const difficulty = Math.min(0.82, 0.38 + state.match * 0.04 + state.questionIndex * 0.02);
  const hash = (state.match * 17 + state.questionIndex * 11 + q.answer * 3) % 100;
  return hash / 100 < difficulty;
}

/** @param {ReturnType<typeof createGame>} state @param {number} deltaMs */
export function tick(state, deltaMs) {
  const next = structuredClone(state);
  if (next.outcome !== "playing") return next;

  if (next.phase === "buzz") {
    next.buzzMsLeft = Math.max(0, next.buzzMsLeft - deltaMs);
    if (next.buzzMsLeft === 0 && !next.buzzWinner) {
      const roll = ((next.match * 31 + next.questionIndex * 13 + next.tick) % 100) / 100;
      next.tick++;
      if (roll < aiBuzzChance(next)) {
        next.buzzWinner = "ai";
        next.phase = "ai_turn";
        next.msg = "對手搶答！";
        return resolveAiTurn(next);
      }
      next.phase = "reveal";
      next.msg = "無人搶答";
      next.lastCorrect = null;
      next.revealMsLeft = REVEAL_MS;
    }
    return next;
  }

  if (next.phase === "answer") {
    next.answerMsLeft = Math.max(0, next.answerMsLeft - deltaMs);
    if (next.answerMsLeft === 0) {
      return finishPlayerAnswer(next, null);
    }
    return next;
  }

  if (next.phase === "reveal") {
    next.revealMsLeft = Math.max(0, (next.revealMsLeft ?? REVEAL_MS) - deltaMs);
    if (next.revealMsLeft === 0) {
      return advanceAfterReveal(next);
    }
  }

  return next;
}

/** @param {ReturnType<typeof createGame>} state */
function resolveAiTurn(state) {
  const correct = aiAnswerCorrect(state);
  const q = state.questions[state.questionIndex];
  state.lastPick = correct ? q.answer : (q.answer + 1) % 4;
  state.lastCorrect = correct;
  state.aiScore += scorePoints(correct, 0, 0);
  state.combo = 0;
  state.msg = correct ? `對手答對：${q.choices[q.answer]}` : "對手答錯";
  state.phase = "reveal";
  state.revealMsLeft = REVEAL_MS;
  return state;
}

/** @param {{ rating?: number, seed?: number }} [opts] */
export function createGame(opts = {}) {
  const rating = opts.rating ?? 1200;
  const seed = opts.seed ?? 0;
  return {
    rating,
    match: 1,
    questionIndex: 0,
    playerScore: 0,
    aiScore: 0,
    seasonWins: 0,
    combo: 0,
    maxCombo: 0,
    phase: "buzz",
    buzzMsLeft: BUZZ_MS,
    answerMsLeft: ANSWER_MS,
    revealMsLeft: REVEAL_MS,
    questions: pickMatchQuestions(1, seed),
    buzzWinner: null,
    lastPick: null,
    lastCorrect: null,
    betweenMatches: false,
    outcome: "playing",
    msg: "賽季開幕！看題搶答，先按先答。",
    tick: 0,
    seed,
    meter: 0,
  };
}

/** @param {ReturnType<typeof createGame>} state */
export function currentQuestion(state) {
  return state.questions[Math.min(state.questionIndex, QUESTIONS_PER_MATCH - 1)];
}

/** @param {ReturnType<typeof createGame>} state */
export function playerBuzz(state) {
  if (state.outcome !== "playing" || state.phase !== "buzz" || state.buzzWinner) {
    return state;
  }
  const next = structuredClone(state);
  next.buzzWinner = "player";
  next.phase = "answer";
  next.answerMsLeft = ANSWER_MS;
  next.msg = "你搶到了！快選答案";
  return next;
}

/** @param {ReturnType<typeof createGame>} state @param {number|null} index */
function finishPlayerAnswer(state, index) {
  const q = state.questions[state.questionIndex];
  const picked = index ?? -1;
  const correct = picked === q.answer;
  state.lastPick = picked >= 0 ? picked : null;
  state.lastCorrect = correct;
  if (correct) {
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const pts = scorePoints(true, state.combo, state.answerMsLeft);
    state.playerScore += pts;
    state.msg = `答對 +${pts}（連擊 ${state.combo}）`;
  } else {
    state.combo = 0;
    state.msg =
      picked >= 0
        ? `答錯，正解：${q.choices[q.answer]}`
        : `時間到，正解：${q.choices[q.answer]}`;
  }
  state.phase = "reveal";
  state.revealMsLeft = REVEAL_MS;
  return state;
}

/** @param {ReturnType<typeof createGame>} state @param {number} index */
export function selectAnswer(state, index) {
  if (state.outcome !== "playing" || state.phase !== "answer") return state;
  if (!Number.isInteger(index) || index < 0 || index > 3) return state;
  const next = structuredClone(state);
  return finishPlayerAnswer(next, index);
}

/** @param {ReturnType<typeof createGame>} state */
function advanceAfterReveal(state) {
  const next = structuredClone(state);
  next.questionIndex += 1;
  next.buzzWinner = null;
  next.lastPick = null;
  next.lastCorrect = null;
  next.buzzMsLeft = BUZZ_MS;
  next.answerMsLeft = ANSWER_MS;

  if (next.questionIndex >= QUESTIONS_PER_MATCH) {
    const won = next.playerScore > next.aiScore;
    const tied = next.playerScore === next.aiScore;
    const matchWin = won || (tied && next.playerScore >= next.aiScore);
    if (matchWin && !won && tied) {
      /* tie goes to higher buzz count — use player score tiebreak already equal */
    }
    const didWin = next.playerScore >= next.aiScore;
    next.seasonWins += didWin ? 1 : 0;
    next.rating = elo(next.rating, opponentRating(next.match), didWin);
    if (next.match >= MATCHES_PER_SEASON) {
      next.outcome = next.seasonWins >= WINS_TO_PASS ? "won" : "lost";
      next.phase = "ended";
      next.msg = `賽季結束 · ${next.seasonWins} 勝 · Elo ${next.rating}`;
      next.meter = 100;
      return next;
    }
    next.betweenMatches = true;
    next.phase = "intermission";
    next.msg = `第 ${next.match} 場${didWin ? "勝" : "敗"} ${next.playerScore}:${next.aiScore} · Elo ${next.rating}`;
    next.meter = next.match * 10;
    return next;
  }

  next.phase = "buzz";
  next.msg = `第 ${next.questionIndex + 1} 題 · 搶答！`;
  next.meter = ((next.match - 1) * 10 + next.questionIndex) * (100 / (MATCHES_PER_SEASON * QUESTIONS_PER_MATCH));
  return next;
}

/** @param {ReturnType<typeof createGame>} state */
export function advance(state) {
  if (state.phase === "reveal" && (state.revealMsLeft ?? 0) <= 0) {
    return advanceAfterReveal(state);
  }
  if (state.phase === "intermission" && state.betweenMatches) {
    return startNextMatch(state);
  }
  if (state.phase === "reveal") {
    const next = structuredClone(state);
    next.revealMsLeft = 0;
    return advanceAfterReveal(next);
  }
  return state;
}

/** @param {ReturnType<typeof createGame>} state */
export function startNextMatch(state) {
  if (!state.betweenMatches) return state;
  const next = structuredClone(state);
  next.match += 1;
  next.questionIndex = 0;
  next.playerScore = 0;
  next.aiScore = 0;
  next.combo = 0;
  next.betweenMatches = false;
  next.phase = "buzz";
  next.buzzMsLeft = BUZZ_MS;
  next.questions = pickMatchQuestions(next.match, next.seed);
  next.msg = `第 ${next.match} 場 · 對手 Elo ${opponentRating(next.match)}`;
  return next;
}

/** @param {ReturnType<typeof createGame>} state @param {number} [rating] */
export function restartSeason(state, rating = state.rating) {
  return createGame({ rating, seed: (state.seed + 1) % 9973 });
}

/** @param {ReturnType<typeof createGame>} state */
export function summarize(state) {
  const q = currentQuestion(state);
  const rank = rankForRating(state.rating);
  return {
    match: `${state.match}/${MATCHES_PER_SEASON}`,
    question: `${Math.min(state.questionIndex + 1, QUESTIONS_PER_MATCH)}/${QUESTIONS_PER_MATCH}`,
    rating: state.rating,
    rank: rank.label,
    rankColor: rank.color,
    record: `${state.seasonWins} 勝`,
    playerScore: state.playerScore,
    aiScore: state.aiScore,
    combo: state.combo,
    maxCombo: state.maxCombo,
    phase: state.phase,
    buzzMsLeft: state.buzzMsLeft,
    answerMsLeft: state.answerMsLeft,
    meter: state.meter ?? 0,
    msg: state.msg,
    questionText: q?.text ?? "",
    choices: q?.choices ?? [],
    buzzWinner: state.buzzWinner,
    lastPick: state.lastPick,
    lastCorrect: state.lastCorrect,
    opponentElo: opponentRating(state.match),
    outcome: state.outcome,
  };
}

/** @param {ReturnType<typeof createGame>} state */
export function getOutcome(state) {
  return state.outcome;
}

/** @param {ReturnType<typeof createGame>} state */
export function canBuzz(state) {
  return state.outcome === "playing" && state.phase === "buzz" && !state.buzzWinner;
}

/** @param {ReturnType<typeof createGame>} state */
export function canAnswer(state) {
  return state.outcome === "playing" && state.phase === "answer";
}

/** @param {ReturnType<typeof createGame>} state */
export function canContinue(state) {
  return (
    state.outcome !== "playing" ||
    state.phase === "intermission" ||
    (state.phase === "reveal" && (state.revealMsLeft ?? 0) <= 0)
  );
}

export { rankForRating, opponentRating, pickMatchQuestions, QUESTIONS_PER_MATCH, MATCHES_PER_SEASON, WINS_TO_PASS };
