import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'players.json');

const emptyStats = () => ({
  wins: 0,
  losses: 0,
  kills: 0,
  deaths: 0,
  headshots: 0,
  matches: 0,
  createdAt: Date.now(),
  lastSeen: Date.now(),
});

export class Store {
  constructor() {
    this.players = new Map();
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [name, stats] of Object.entries(parsed.players || {})) {
        this.players.set(name, { ...emptyStats(), ...stats });
      }
    } catch {
      // First run or corrupted file: start fresh.
    }
  }

  save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const payload = { players: Object.fromEntries(this.players) };
      const tmp = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error('[store] failed to save players:', err.message);
    }
  }

  ensure(name) {
    let stats = this.players.get(name);
    if (!stats) {
      stats = emptyStats();
      this.players.set(name, stats);
    }
    stats.lastSeen = Date.now();
    return stats;
  }

  profile(name) {
    const stats = this.ensure(name);
    const kd = stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills;
    return { ...stats, kd: Math.round(kd * 100) / 100 };
  }

  recordMatch({ winner, players }) {
    for (const p of players) {
      const stats = this.ensure(p.name);
      stats.kills += p.kills || 0;
      stats.deaths += p.deaths || 0;
      stats.headshots += p.headshots || 0;
      stats.matches += 1;
      if (winner) {
        if (p.name === winner) stats.wins += 1;
        else stats.losses += 1;
      }
      stats.lastSeen = Date.now();
    }
    this.save();
  }

  leaderboard(limit = 10) {
    return [...this.players.entries()]
      .map(([name, s]) => ({
        name,
        wins: s.wins,
        losses: s.losses,
        kills: s.kills,
        deaths: s.deaths,
        matches: s.matches,
        kd: s.deaths > 0 ? Math.round((s.kills / s.deaths) * 100) / 100 : s.kills,
      }))
      .sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.deaths - b.deaths)
      .slice(0, limit);
  }
}
