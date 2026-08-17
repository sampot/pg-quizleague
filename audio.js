const BASE = "./assets/audio/";

export class GameAudio {
  constructor() {
    this.enabled = false;
    this.started = false;
    this.music = Object.assign(new Audio(`${BASE}music.ogg`), { loop: true, volume: 0.2 });
    this.fx = {
      click: Object.assign(new Audio(`${BASE}click.ogg`), { volume: 0.35 }),
      ok: Object.assign(new Audio(`${BASE}ok.ogg`), { volume: 0.42 }),
      buzz: Object.assign(new Audio(`${BASE}buzz.ogg`), { volume: 0.5 }),
      hit: Object.assign(new Audio(`${BASE}hit.ogg`), { volume: 0.48 }),
      soft: Object.assign(new Audio(`${BASE}soft.ogg`), { volume: 0.32 }),
      coin: Object.assign(new Audio(`${BASE}coin.ogg`), { volume: 0.4 }),
      win: Object.assign(new Audio(`${BASE}win.ogg`), { volume: 0.45 }),
    };
  }

  async start() {
    this.started = true;
    if (!this.enabled) return;
    try {
      await this.music.play();
    } catch {
      /* autoplay policy */
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.music.pause();
    else if (this.started) void this.start();
  }

  suspend() {
    this.music.pause();
    for (const a of Object.values(this.fx)) a.pause();
  }

  resume() {
    if (this.enabled && this.started) void this.start();
  }

  play(name) {
    if (!this.enabled || !this.fx[name]) return;
    const a = this.fx[name];
    a.currentTime = 0;
    void a.play().catch(() => {});
  }
}
