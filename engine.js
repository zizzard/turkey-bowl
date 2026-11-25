/* Turkey Bowl VBD engine: projections, live VBD, pick advice, draft-slot simulation. */
(function (root) {
  const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const SLOTS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 };
  const ROSTER = Object.values(SLOTS).reduce((a, b) => a + b, 0);
  // Shrink small samples toward a modest positional prior (1 game of weight).
  const PRIOR = { QB: 14, RB: 6, WR: 6, TE: 5, K: 7, DST: 5 };
  const PRIOR_WEIGHT = 1;
  const LEAGUE_AVG = 23; // average NFL team points per game
  const DAMP = { QB: 0.8, RB: 0.75, WR: 0.75, TE: 0.75, K: 0.6, DST: 1.0 };

  // Fox Sports lines, Thanksgiving 2026
  const DEFAULT_LINES = [
    { id: 'g1', away: 'CHI', home: 'DET', fav: 'CHI', spread: 2.5, total: 55.5, time: '12:30 PM ET' },
    { id: 'g2', away: 'PHI', home: 'DAL', fav: 'DAL', spread: 8.5, total: 47.5, time: '4:30 PM ET' },
    { id: 'g3', away: 'KC', home: 'BUF', fav: 'BUF', spread: 3, total: 50.5, time: '8:15 PM ET' },
  ];
  DEFAULT_LINES[0].time = '1:00 PM ET';

  const TEAM_NAMES = { CHI: 'Bears', DET: 'Lions', PHI: 'Eagles', DAL: 'Cowboys', KC: 'Chiefs', BUF: 'Bills' };

  // [pos, name, team, games, PPR PPG]  (ppg null = no games played)
  const RAW = [
    ['QB', 'Josh Allen', 'BUF', 9, 24.8], ['QB', 'Dak Prescott', 'DAL', 10, 20.2], ['QB', 'Patrick Mahomes', 'KC', 9, 19.7],
    ['QB', 'Jared Goff', 'DET', 9, 18.6], ['QB', 'Caleb Williams', 'CHI', 6, 18.4], ['QB', 'Jalen Hurts', 'PHI', 5, 16.0],
    ['QB', 'Joe Milton III', 'PHI', 1, 13.2], ['QB', 'Case Keenum', 'CHI', 2, 12.6], ['QB', 'Tanner McKee', 'PHI', 3, 10.0],
    ['QB', 'Tyson Bagent', 'CHI', 3, 4.1],
    ['RB', 'Jahmyr Gibbs', 'DET', 9, 28.2], ['RB', 'Kenneth Walker III', 'KC', 8, 24.5], ['RB', 'James Cook', 'BUF', 9, 18.9],
    ['RB', "D'Andre Swift", 'CHI', 9, 17.1], ['RB', 'Javonte Williams', 'DAL', 10, 16.7], ['RB', 'Kyle Monangai', 'CHI', 4, 14.8],
    ['RB', 'Emmett Johnson', 'KC', 9, 10.7], ['RB', 'Dameon Pierce', 'PHI', 3, 10.0], ['RB', 'Saquon Barkley', 'PHI', 7, 8.4],
    ['RB', 'Elijah Mitchell', 'PHI', 3, 6.6], ['RB', 'Ty Johnson', 'BUF', 7, 5.8], ['RB', 'Roschon Johnson', 'CHI', 7, 4.6],
    ['RB', 'Tank Bigsby', 'PHI', 4, 4.3], ['RB', 'Will Shipley', 'PHI', 5, 4.0], ['RB', 'Tyler Goodson', 'DAL', 6, 3.8],
    ['RB', 'Sione Vaki', 'DET', 9, 3.6], ['RB', 'Ray Davis', 'BUF', 8, 1.5], ['RB', 'Hunter Luepke', 'DAL', 8, 1.2],
    ['WR', 'CeeDee Lamb', 'DAL', 10, 22.2], ['WR', 'Amon-Ra St. Brown', 'DET', 9, 20.4], ['WR', 'DeVonta Smith', 'PHI', 4, 17.3],
    ['WR', 'George Pickens', 'DAL', 9, 16.4], ['WR', 'Luther Burden III', 'CHI', 9, 15.1], ['WR', 'Rashee Rice', 'KC', 6, 13.2],
    ['WR', 'Jameson Williams', 'DET', 9, 12.7], ['WR', 'DJ Moore', 'BUF', 7, 11.3], ['WR', 'Tyquan Thornton', 'KC', 4, 11.2],
    ['WR', 'Ryan Flournoy', 'DAL', 10, 10.3], ['WR', 'Rome Odunze', 'CHI', 9, 9.9], ['WR', 'Khalil Shakir', 'BUF', 9, 9.3],
    ['WR', 'Josh Downs', 'KC', 10, 9.0], ['WR', 'Dontayvion Wicks', 'PHI', 6, 8.9], ['WR', 'Keon Coleman', 'BUF', 9, 8.2],
    ['WR', 'Makai Lemon', 'PHI', 9, 8.2], ['WR', 'Kalif Raymond', 'CHI', 9, 7.9], ['WR', 'Xavier Worthy', 'KC', 9, 7.4],
    ['WR', 'Darius Cooper', 'PHI', 9, 6.3], ['WR', 'Josh Palmer', 'BUF', 5, 5.5], ['WR', 'Isaac TeSlaa', 'DET', 8, 5.2],
    ['WR', 'Cyrus Allen', 'KC', 7, 3.4], ['WR', 'Marquise Brown', 'PHI', 4, 3.1], ['WR', 'KaVontae Turpin', 'DAL', 7, 2.5],
    ['WR', 'Jalen Royals', 'KC', 9, 2.3], ['WR', 'Elijah Moore', 'PHI', 3, 1.9], ['WR', 'Zavion Thomas', 'CHI', 8, 1.7],
    ['WR', 'Jonathan Mingo', 'DAL', 7, 1.3], ['WR', 'Jahdae Walker', 'CHI', 6, 1.2],
    ['TE', 'Travis Kelce', 'KC', 9, 11.6], ['TE', 'Dallas Goedert', 'PHI', 7, 10.6], ['TE', 'Sam LaPorta', 'DET', 9, 10.6],
    ['TE', 'Dalton Kincaid', 'BUF', 9, 10.3], ['TE', 'Colston Loveland', 'CHI', 9, 9.3], ['TE', 'Jake Ferguson', 'DAL', 8, 6.8],
    ['TE', 'Noah Gray', 'KC', 9, 4.6], ['TE', 'Cole Kmet', 'CHI', 7, 3.5], ['TE', 'Brevyn Spann-Ford', 'DAL', 10, 3.2],
    ['TE', 'Brock Wright', 'DET', 0, null], ['TE', 'Dawson Knox', 'BUF', 0, null],
    ['K', 'Tyler Bass', 'BUF', 9, 10.9], ['K', 'Brandon Aubrey', 'DAL', 10, 9.6], ['K', 'Jake Bates', 'DET', 9, 9.4],
    ['K', 'Cairo Santos', 'CHI', 9, 9.2], ['K', 'Harrison Butker', 'KC', 9, 7.9], ['K', 'Jake Elliott', 'PHI', 9, 5.0],
    ['DST', 'Bears D/ST', 'CHI', 9, 7.8], ['DST', 'Chiefs D/ST', 'KC', 9, 7.2], ['DST', 'Bills D/ST', 'BUF', 9, 6.9],
    ['DST', 'Lions D/ST', 'DET', 9, 6.2], ['DST', 'Cowboys D/ST', 'DAL', 9, 3.3], ['DST', 'Eagles D/ST', 'PHI', 9, 3.0],
  ];

  const PLAYERS = RAW.map((r, i) => ({ id: i, pos: r[0], name: r[1], team: r[2], games: r[3], ppg: r[4] }));
  // Default "out": reported done for the season.
  const DEFAULT_OUT = ['Jalen Hurts'];

  function impliedTotals(lines) {
    const out = {};
    for (const g of lines) {
      const favPts = (g.total + g.spread) / 2, dogPts = (g.total - g.spread) / 2;
      const dog = g.fav === g.home ? g.away : g.home;
      out[g.fav] = favPts; out[dog] = dogPts;
    }
    return out;
  }
  function opponents(lines) {
    const o = {};
    for (const g of lines) { o[g.home] = g.away; o[g.away] = g.home; }
    return o;
  }

  function baseline(p) {
    if (p.ppg == null || !p.games) return PRIOR[p.pos] * 0.35;
    return (p.ppg * p.games + PRIOR[p.pos] * PRIOR_WEIGHT) / (p.games + PRIOR_WEIGHT);
  }

  function project(lines, overrides) {
    const imp = impliedTotals(lines), opp = opponents(lines);
    return PLAYERS.map(p => {
      const base = baseline(p);
      let f = p.pos === 'DST' ? 1 + (LEAGUE_AVG - imp[opp[p.team]]) / LEAGUE_AVG : imp[p.team] / LEAGUE_AVG;
      const mult = 1 + DAMP[p.pos] * (f - 1);
      const proj = overrides && overrides[p.id] != null ? overrides[p.id] : base * mult;
      return { ...p, base, mult, implied: imp[p.team], oppImplied: imp[opp[p.team]], opp: opp[p.team], proj };
    });
  }

  // Draft order helpers (snake)
  function teamForPick(i, T) { const r = Math.floor(i / T), k = i % T; return r % 2 === 0 ? k : T - 1 - k; }
  function nextPickFor(team, from, T, total) { for (let i = from; i < total; i++) if (teamForPick(i, T) === team) return i; return -1; }

  function emptyNeeds(T) { return Array.from({ length: T }, () => ({ ...SLOTS })); }

  // Replacement = proj of the n-th best remaining player at each position, n = open slots league-wide.
  // If fewer players than open slots remain, replacement is 0 (someone gets nothing).
  function replacement(availByPos, needs) {
    const rep = {};
    for (const pos of POS) {
      const n = needs.reduce((a, t) => a + t[pos], 0);
      const list = availByPos[pos];
      rep[pos] = n === 0 ? null : list.length >= n ? list[n - 1].proj : 0;
    }
    return rep;
  }

  function byPos(avail) {
    const m = {}; for (const pos of POS) m[pos] = [];
    for (const p of avail) m[p.pos].push(p);
    for (const pos of POS) m[pos].sort((a, b) => b.proj - a.proj);
    return m;
  }

  function liveVBD(avail, needs) {
    const bp = byPos(avail), rep = replacement(bp, needs);
    const vbd = new Map();
    for (const p of avail) vbd.set(p.id, rep[p.pos] == null ? null : p.proj - rep[p.pos]);
    return { vbd, rep, bp };
  }

  // Greedy pick by live VBD among positions the team still needs (optional noise).
  function greedyPick(avail, needs, team, noise, rng) {
    const { vbd } = liveVBD(avail, needs);
    let best = null, bestV = -Infinity;
    for (const p of avail) {
      if (needs[team][p.pos] <= 0) continue;
      let v = vbd.get(p.id);
      if (noise) v += noise * gauss(rng);
      if (v > bestV) { bestV = v; best = p; }
    }
    return best;
  }

  function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Pick advice for the team on the clock: how much each position drops off if you wait until your next turn.
  function advise(projected, draftedIds, T, outIds) {
    const total = T * ROSTER;
    const pickNo = draftedIds.length;
    if (pickNo >= total) return null;
    const team = teamForPick(pickNo, T);
    const { avail, needs } = stateFrom(projected, draftedIds, T, outIds);
    const { vbd, rep, bp } = liveVBD(avail, needs);
    const next = nextPickFor(team, pickNo + 1, T, total);
    // simulate others until my next pick
    let simAvail = avail.slice(); const simNeeds = needs.map(n => ({ ...n }));
    if (next !== -1) {
      for (let i = pickNo + 1; i < next; i++) {
        const t = teamForPick(i, T); const p = greedyPick(simAvail, simNeeds, t, 0);
        if (!p) continue; simNeeds[t][p.pos]--; simAvail = simAvail.filter(x => x.id !== p.id);
      }
    }
    const simBp = byPos(simAvail);
    const options = [];
    for (const pos of POS) {
      if (needs[team][pos] <= 0 || !bp[pos].length) continue;
      const now = bp[pos][0];
      const later = next === -1 ? null : simBp[pos][0] || null;
      const dropoff = now.proj - (later ? later.proj : 0);
      options.push({ pos, now, later, dropoff, vbd: vbd.get(now.id) });
    }
    options.sort((a, b) => (b.dropoff - a.dropoff) || (b.vbd - a.vbd));
    return { team, pickNo, nextPick: next, picksUntilNext: next === -1 ? null : next - pickNo, options, rep, vbd };
  }

  function stateFrom(projected, draftedIds, T, outIds) {
    const needs = emptyNeeds(T); const rosters = Array.from({ length: T }, () => []);
    const drafted = new Set(draftedIds);
    draftedIds.forEach((id, i) => { const t = teamForPick(i, T); const p = projected[id]; needs[t][p.pos]--; rosters[t].push(p); });
    const out = new Set(outIds || []);
    const avail = projected.filter(p => !drafted.has(p.id) && !out.has(p.id));
    return { needs, rosters, avail };
  }

  // Monte Carlo: every team drafts by live VBD with noise; returns mean projected lineup total per slot.
  function simulateSlots(projected, T, outIds, sims, noise, seed) {
    const rng = mulberry(seed || 7);
    const total = T * ROSTER; const sums = new Array(T).fill(0); const sq = new Array(T).fill(0);
    const firstPick = Array.from({ length: T }, () => ({}));
    const out = new Set(outIds || []);
    const base = projected.filter(p => !out.has(p.id));
    for (let s = 0; s < sims; s++) {
      let avail = base.slice(); const needs = emptyNeeds(T); const pts = new Array(T).fill(0);
      for (let i = 0; i < total; i++) {
        const t = teamForPick(i, T); const p = greedyPick(avail, needs, t, noise, rng);
        if (!p) continue; needs[t][p.pos]--; pts[t] += p.proj; avail = avail.filter(x => x.id !== p.id);
        if (i < T) firstPick[t][p.name] = (firstPick[t][p.name] || 0) + 1;
      }
      for (let t = 0; t < T; t++) { sums[t] += pts[t]; sq[t] += pts[t] * pts[t]; }
    }
    return sums.map((s, t) => {
      const mean = s / sims; const sd = Math.sqrt(Math.max(0, sq[t] / sims - mean * mean));
      const fp = Object.entries(firstPick[t]).sort((a, b) => b[1] - a[1])[0];
      return { slot: t + 1, mean, sd, topFirst: fp ? fp[0] : null, topFirstPct: fp ? fp[1] / sims : 0 };
    });
  }

  const api = { POS, SLOTS, ROSTER, PLAYERS, DEFAULT_LINES, DEFAULT_OUT, TEAM_NAMES, impliedTotals, project, teamForPick, nextPickFor, liveVBD, advise, stateFrom, simulateSlots, emptyNeeds, byPos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VBD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
