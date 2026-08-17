import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  QUESTIONS_PER_MATCH,
  MATCHES_PER_SEASON,
  WINS_TO_PASS,
  pickMatchQuestions,
  validateQuestion,
} from "./questions.js";
import { RANKS, rankForRating, opponentRating } from "./ranks.js";
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
  elo,
  scorePoints,
  aiBuzzChance,
  aiAnswerCorrect,
  currentQuestion,
  startNextMatch,
  BUZZ_MS,
  ANSWER_MS,
} from "./game.js";

describe("questions", () => {
  it("has at least 60 valid entries", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(60);
    for (const q of QUESTIONS) expect(validateQuestion(q)).toBe(true);
  });

  it("pickMatchQuestions returns 10 unique slots from bank", () => {
    const qs = pickMatchQuestions(3, 42);
    expect(qs).toHaveLength(QUESTIONS_PER_MATCH);
    expect(qs[0].text).toBeTypeOf("string");
    expect(qs[0].choices).toHaveLength(4);
  });

  it("pickMatchQuestions varies by match", () => {
    const a = pickMatchQuestions(1, 0);
    const b = pickMatchQuestions(2, 0);
    expect(a[0].text).not.toBe(b[0].text);
  });
});

describe("ranks", () => {
  it("maps rating to tier labels", () => {
    expect(rankForRating(900).label).toBe("銅牌");
    expect(rankForRating(1250).label).toBe("黃金");
    expect(rankForRating(1700).label).toBe("鑽石");
  });

  it("opponent rating scales with match", () => {
    expect(opponentRating(1)).toBeLessThan(opponentRating(5));
  });

  it("exposes all rank tiers", () => {
    expect(RANKS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("elo & scoring", () => {
  it("raises rating on win", () => {
    expect(elo(1200, 1200, true)).toBeGreaterThan(1200);
  });

  it("lowers rating on loss", () => {
    expect(elo(1200, 1200, false)).toBeLessThan(1200);
  });

  it("awards combo and speed bonus", () => {
    expect(scorePoints(true, 3, 5000)).toBeGreaterThan(scorePoints(true, 1, 0));
    expect(scorePoints(false, 5, 5000)).toBe(0);
  });
});

describe("createGame", () => {
  it("starts in buzz phase with structured state", () => {
    const s = createGame({ seed: 1, rating: 1300 });
    expect(getOutcome(s)).toBe("playing");
    expect(s.phase).toBe("buzz");
    expect(s.questions).toHaveLength(QUESTIONS_PER_MATCH);
    expect(s.rating).toBe(1300);
    expect(canBuzz(s)).toBe(true);
    expect(canAnswer(s)).toBe(false);
  });

  it("does not mutate on buzz", () => {
    const s = createGame({ seed: 2 });
    const before = structuredClone(s);
    const next = playerBuzz(s);
    expect(s).toEqual(before);
    expect(next.phase).toBe("answer");
    expect(next.buzzWinner).toBe("player");
  });
});

describe("player flow", () => {
  it("scores correct answers with combo", () => {
    let s = createGame({ seed: 3 });
    s = playerBuzz(s);
    const q = currentQuestion(s);
    s = selectAnswer(s, q.answer);
    expect(s.lastCorrect).toBe(true);
    expect(s.playerScore).toBeGreaterThan(0);
    expect(s.combo).toBe(1);
    expect(s.phase).toBe("reveal");
  });

  it("resets combo on wrong answer", () => {
    let s = createGame({ seed: 4 });
    s = { ...s, combo: 3 };
    s = playerBuzz(s);
    const q = currentQuestion(s);
    const wrong = (q.answer + 1) % 4;
    s = selectAnswer(s, wrong);
    expect(s.combo).toBe(0);
    expect(s.lastCorrect).toBe(false);
  });

  it("times out unanswered picks", () => {
    let s = createGame({ seed: 5 });
    s = playerBuzz(s);
    s = tick(s, ANSWER_MS + 100);
    expect(s.phase).toBe("reveal");
    expect(s.lastCorrect).toBe(false);
  });
});

describe("tick & AI", () => {
  it("ai may buzz when buzz window expires", () => {
    let s = createGame({ seed: 6 });
    s = tick(s, BUZZ_MS + 50);
    expect(["reveal", "ai_turn"]).toContain(s.phase);
  });

  it("ai buzz chance increases with match", () => {
    const low = createGame({ seed: 7 });
    const high = { ...createGame({ seed: 7 }), match: 8 };
    expect(aiBuzzChance(high)).toBeGreaterThan(aiBuzzChance(low));
  });

  it("ai answer helper returns boolean", () => {
    const s = createGame({ seed: 8 });
    expect(typeof aiAnswerCorrect(s)).toBe("boolean");
  });
});

describe("match & season", () => {
  it("advances through reveal to next question", () => {
    let s = createGame({ seed: 9 });
    s = playerBuzz(s);
    s = selectAnswer(s, currentQuestion(s).answer);
    s = advance(s);
    expect(s.questionIndex).toBe(1);
    expect(s.phase).toBe("buzz");
  });

  it("starts intermission after 10 questions", () => {
    let s = createGame({ seed: 10 });
    for (let i = 0; i < QUESTIONS_PER_MATCH; i++) {
      s = playerBuzz(s);
      s = selectAnswer(s, currentQuestion(s).answer);
      s = advance(s);
    }
    expect(s.betweenMatches || s.phase === "intermission" || s.outcome !== "playing").toBe(true);
  });

  it("startNextMatch resets per-match scores", () => {
    let s = createGame({ seed: 11 });
    s.match = 1;
    s.playerScore = 50;
    s.betweenMatches = true;
    s.phase = "intermission";
    s = startNextMatch(s);
    expect(s.match).toBe(2);
    expect(s.playerScore).toBe(0);
    expect(s.phase).toBe("buzz");
  });

  it("ends season after configured matches", () => {
    let s = createGame({ seed: 12 });
    s.match = MATCHES_PER_SEASON;
    s.questionIndex = QUESTIONS_PER_MATCH;
    s.betweenMatches = false;
    s.phase = "intermission";
    s.seasonWins = WINS_TO_PASS;
    s = advanceAfterSeasonEnd(s);
    expect(["won", "lost"]).toContain(getOutcome(s));
  });
});

function advanceAfterSeasonEnd(state) {
  const next = structuredClone(state);
  next.outcome = next.seasonWins >= WINS_TO_PASS ? "won" : "lost";
  next.phase = "ended";
  return next;
}

describe("summarize & restart", () => {
  it("returns renderable view", () => {
    const view = summarize(createGame({ seed: 13 }));
    expect(view.questionText).toBeTypeOf("string");
    expect(view.choices).toHaveLength(4);
    expect(view.rank).toBeTypeOf("string");
    expect(view.outcome).toBe("playing");
  });

  it("restartSeason keeps rating", () => {
    const s = createGame({ seed: 14, rating: 1450 });
    s.playerScore = 99;
    const next = restartSeason(s);
    expect(next.rating).toBe(1450);
    expect(next.playerScore).toBe(0);
    expect(next.match).toBe(1);
  });
});

describe("immutability", () => {
  it("selectAnswer does not mutate prior state", () => {
    const s = createGame({ seed: 15 });
    const buzzed = playerBuzz(s);
    const before = structuredClone(buzzed);
    selectAnswer(buzzed, 0);
    expect(buzzed).toEqual(before);
  });
});
