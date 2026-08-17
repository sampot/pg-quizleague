/** @typedef {{ id: string, label: string, min: number, color: string }} RankTier */

/** @type {RankTier[]} */
export const RANKS = [
  { id: "bronze", label: "銅牌", min: 0, color: "#c47a4a" },
  { id: "silver", label: "白銀", min: 1000, color: "#b8c4d0" },
  { id: "gold", label: "黃金", min: 1200, color: "#f0c14b" },
  { id: "platinum", label: "白金", min: 1400, color: "#8fd3ff" },
  { id: "diamond", label: "鑽石", min: 1600, color: "#7ee787" },
];

/** @param {number} rating */
export function rankForRating(rating) {
  let tier = RANKS[0];
  for (const r of RANKS) {
    if (rating >= r.min) tier = r;
  }
  const next = RANKS[RANKS.indexOf(tier) + 1];
  return {
    ...tier,
    rating,
    nextMin: next?.min ?? null,
    progress: next ? (rating - tier.min) / (next.min - tier.min) : 1,
  };
}

/** @param {number} match */
export function opponentRating(match) {
  return 1180 + match * 12;
}
