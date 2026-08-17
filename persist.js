const KEY = "progress";

/** @param {typeof window.PG} pg */
export async function loadProgress(pg) {
  try {
    const raw = await pg.kv.get(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** @param {typeof window.PG} pg @param {Record<string, unknown>} data */
export async function saveProgress(pg, data) {
  await pg.kv.put(KEY, JSON.stringify(data));
  return data;
}
