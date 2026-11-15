// The HUD: every DOM element the player sees, updated only when its value
// changes. The buy menu is keyboard-driven (1-8) and clickable; the
// overlays carry the menu, pause, round and match screens.
import { WEAPONS, WEAPON_ORDER, GEAR, CFG } from './config.js';

export function createHud(onBuy) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    health: $('health-num'), healthBar: $('health-bar'), armor: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), money: $('money'),
    timer: $('timer'), scoreW: $('score-w'), scoreB: $('score-b'),
    round: $('round'), objective: $('objective'), feed: $('killfeed'),
    vignette: $('vignette'), flash: $('flash'), damageDir: $('damage-dir'),
    progress: $('progress'), progressLabel: $('progress-label'), progressFill: $('progress-fill'),
    banner: $('banner'), buy: $('buy-menu'), buyList: $('buy-list'),
    scoreboard: $('scoreboard'), scoreRows: $('score-rows'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    playBtn: $('play'), teamTag: $('team-tag'),
  };
  const last = { hp: -1, armor: -1, mag: -1, reserve: -1, money: -1, timer: '', score: '', round: '' };
  let hitTimer = null;
  let bannerTimer = null;

  function setHealth(hp, armor) {
    if (hp === last.hp && armor === last.armor) return;
    last.hp = hp; last.armor = armor;
    el.health.textContent = Math.ceil(hp);
    el.healthBar.style.width = `${Math.max(0, hp)}%`;
    el.healthBar.style.background = hp > 50 ? '#e8e6df' : hp > 25 ? '#ff9a3c' : '#ff4a3c';
    el.armor.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
  }
  function setAmmo(mag, reserve) {
    if (mag === last.mag && reserve === last.reserve) return;
    last.mag = mag; last.reserve = reserve;
    el.ammoMag.textContent = mag;
    el.ammoReserve.textContent = `/ ${reserve}`;
    el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
  }
  function setMoney(m) {
    if (m === last.money) return;
    last.money = m;
    el.money.textContent = `$${m.toLocaleString('en-US')}`;
  }
  function setTimer(seconds, planted, fuse) {
    const text = planted ? `CHARGE ${Math.ceil(fuse)}s` : fmtTime(seconds);
    if (text === last.timer) return;
    last.timer = text;
    el.timer.textContent = text;
    el.timer.classList.toggle('danger', planted || seconds < 15);
  }
  function fmtTime(s) {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
  function setScore(w, b, round, playerTeam) {
    const key = `${w}-${b}-${round}-${playerTeam}`;
    if (key === last.score) return;
    last.score = key;
    el.scoreW.textContent = w;
    el.scoreB.textContent = b;
    el.round.textContent = `ROUND ${round}`;
    el.teamTag.textContent = playerTeam === 'wardens' ? 'WARDENS — DEFEND' : 'BREACHERS — ATTACK';
    el.teamTag.className = `team-tag ${playerTeam}`;
  }
  function setObjective(text) { el.objective.textContent = text; }
  function setCrosshair(gapPx) {
    el.crosshair.style.setProperty('--gap', `${gapPx}px`);
  }
  function hitMarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', kill);
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), 110);
  }
  function damageFlash(dirYaw) {
    el.vignette.style.opacity = '0.85';
    setTimeout(() => { el.vignette.style.opacity = '0'; }, 130);
    // A red arc pointing at the shooter's direction, relative to the view.
    el.damageDir.style.transform = `translate(-50%,-50%) rotate(${dirYaw}rad)`;
    el.damageDir.style.opacity = '0.9';
    setTimeout(() => { el.damageDir.style.opacity = '0'; }, 450);
  }
  function flashWhite(strength) {
    el.flash.style.opacity = String(Math.min(1, strength));
  }
  function showProgress(label, frac) {
    el.progress.hidden = false;
    el.progressLabel.textContent = label;
    el.progressFill.style.width = `${Math.round(frac * 100)}%`;
  }
  function hideProgress() { el.progress.hidden = true; }
  function banner(text, sub = '') {
    el.banner.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2600);
  }
  function hideBanner() {
    clearTimeout(bannerTimer);
    el.banner.classList.remove('show');
  }
  function killFeed(killer, victim, head, killerTeam) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = `<span class="${killerTeam}">${killer}</span><i>${head ? '◉' : '✕'}</i><span>${victim}</span>`;
    el.feed.prepend(row);
    while (el.feed.children.length > 5) el.feed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }
  // Factual callouts from real events: the push, a dropped charge, a
  // plant, a defuse. Short, and gone in a few seconds.
  function callout(text) {
    const box = $('callouts');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'callout-row';
    row.textContent = text;
    box.prepend(row);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => row.remove(), 5000);
  }

  // --- Buy menu ---
  function renderBuy(money, owned, grenades, armor, helmet, kit, team, lossStreak = 0) {
    const rows = [];
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const has = !!owned[id];
      rows.push(`<button data-buy="${id}" ${has ? 'disabled' : ''} ${money < w.price ? 'class="poor"' : ''}>
        <b>[${WEAPON_ORDER.indexOf(id) + 1}] ${w.name}</b><span>$${w.price.toLocaleString('en-US')}</span>
        <em>${w.damage} dmg · ${w.mag} rnd · ${w.auto ? 'auto' : 'semi'}</em>${has ? '<i>OWNED</i>' : ''}</button>`);
    }
    const gear = [
      ['armor', '5', GEAR.armor.name, GEAR.armor.price, armor > 0],
      ['helmet', '', GEAR.helmet.name, GEAR.helmet.price, helmet],
      ['smoke', '6', GEAR.smoke.name, GEAR.smoke.price, false],
      ['flash', '7', GEAR.flash.name, GEAR.flash.price, false],
    ];
    if (team === 'wardens') gear.push(['kit', '8', GEAR.kit.name, GEAR.kit.price, kit]);
    for (const [id, key, name, price, has] of gear) {
      rows.push(`<button data-buy="${id}" ${has ? 'disabled' : ''} ${money < price ? 'class="poor"' : ''}>
        <b>${key ? `[${key}] ` : ''}${name}</b><span>$${price.toLocaleString('en-US')}</span>
        <em>${id === 'smoke' ? 'blocks vision' : id === 'flash' ? 'blinds on pop' : id === 'kit' ? 'defuse in 2.5s' : 'damage cover'}</em>${has ? '<i>OWNED</i>' : ''}</button>`);
    }
    el.buyList.innerHTML = rows.join('');
    el.buyList.querySelectorAll('button[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => onBuy(btn.dataset.buy));
    });
    el.buy.querySelector('.buy-money').textContent = `$${money.toLocaleString('en-US')}`;
    el.buy.querySelector('.buy-grenades').textContent = `Smoke ×${grenades.smoke} · Flash ×${grenades.flash}`;
    const streak = el.buy.querySelector('.buy-streak');
    if (streak) {
      const next = CFG.money.lossStreak[Math.min(lossStreak, CFG.money.lossStreak.length - 1)];
      streak.textContent = lossStreak > 0
        ? `Loss streak ${lossStreak} — lose again for $${next.toLocaleString('en-US')}: save, or force a buy?`
        : 'Win pays $3,250 · a loss pays $1,900, more on a streak';
    }
  }
  function showBuy(show) { el.buy.hidden = !show; }
  function buyVisible() { return !el.buy.hidden; }

  // --- Scoreboard ---
  function showScoreboard(rows) {
    el.scoreRows.innerHTML = rows.map((r) => `<tr class="${r.team} ${r.alive ? '' : 'dead'}">
      <td>${r.name}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.alive ? '●' : '✕'}</td></tr>`).join('');
    el.scoreboard.hidden = false;
  }
  function hideScoreboard() { el.scoreboard.hidden = true; }

  // --- Overlays ---
  function showOverlay(kind, data = {}) {
    el.overlay.hidden = false;
    if (kind === 'start') {
      el.overlayTitle.textContent = 'OPERATION ZERO';
      el.overlayCopy.innerHTML = `A tactical round-based FPS in Blackwater Foundry.<br>
        <b class="cyan">Wardens</b> defend the sites. <b class="amber">Breachers</b> plant the Demolition Charge.<br>
        First to 8 rounds takes the match — sides switch after round 7. Buy between rounds, hold angles, stop to aim.`;
      el.playBtn.textContent = 'Click to deploy';
    } else if (kind === 'paused') {
      el.overlayTitle.textContent = 'PAUSED';
      el.overlayCopy.textContent = 'Pointer released. Click to return to the fight.';
      el.playBtn.textContent = 'Resume';
    } else if (kind === 'roundEnd') {
      el.overlayTitle.textContent = data.playerWon ? 'ROUND WON' : 'ROUND LOST';
      el.overlayCopy.textContent = `${data.reason} — Wardens ${data.score.wardens} · Breachers ${data.score.breachers}`;
      el.playBtn.textContent = 'Next round';
    } else if (kind === 'matchEnd') {
      el.overlayTitle.textContent = data.playerWon ? 'OPERATION COMPLETE' : 'OPERATION FAILED';
      el.overlayCopy.textContent = `Final score — Wardens ${data.score.wardens} · Breachers ${data.score.breachers}. Kills ${data.kills} · Deaths ${data.deaths}.`;
      el.playBtn.textContent = 'Play again';
    }
  }
  function hideOverlay() { el.overlay.hidden = true; }
  function overlayVisible() { return !el.overlay.hidden; }

  return {
    setHealth, setAmmo, setMoney, setTimer, setScore, setObjective, setCrosshair,
    hitMarker, damageFlash, flashWhite, showProgress, hideProgress, banner, killFeed, callout,
    renderBuy, showBuy, buyVisible, showScoreboard, hideScoreboard,
    showOverlay, hideOverlay, overlayVisible, hideBanner,
    onPlay(cb) { el.playBtn.addEventListener('click', cb); },
  };
}
