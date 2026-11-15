// The match: buy phase, combat, round end and match end; the economy,
// the Pulse Core plant/defuse objective, side switching and every win
// condition. It owns no rendering — it emits events the HUD and audio read.
import { CFG } from './config.js';

export function createMatch(onEvent) {
  const state = {
    phase: 'menu', // menu | buy | combat | roundEnd | matchEnd
    round: 0,
    score: { wardens: 0, breachers: 0 },
    playerTeam: 'wardens',
    money: CFG.money.start,
    phaseT: 0,
    roundTimeLeft: CFG.round.combatSeconds,
    plantedSite: null,
    fuseLeft: 0,
    winner: null,
    winReason: '',
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0 },
  };

  function emit(type, data = {}) { onEvent({ type, ...data }); }

  function startMatch() {
    state.round = 0;
    state.score.wardens = 0; state.score.breachers = 0;
    state.playerTeam = 'wardens';
    state.money = CFG.money.start;
    state.winner = null; state.winReason = '';
    state.stats.kills = 0; state.stats.deaths = 0; state.stats.plants = 0; state.stats.defuses = 0;
    state.plantedSite = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    if (state.round === CFG.round.switchAfter + 1) {
      state.playerTeam = state.playerTeam === 'wardens' ? 'breachers' : 'wardens';
      emit('sideSwitch', { team: state.playerTeam });
    }
    state.phase = 'buy';
    state.phaseT = 0;
    state.roundTimeLeft = CFG.round.combatSeconds;
    state.plantedSite = null;
    state.fuseLeft = 0;
    emit('roundStart', { round: state.round, team: state.playerTeam });
  }

  function awardRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.score[winner] += 1;
    const loser = winner === 'wardens' ? 'breachers' : 'wardens';
    const playerWon = winner === state.playerTeam;
    state.money = Math.min(CFG.money.max, state.money + (playerWon ? CFG.money.win : CFG.money.loss));
    state.phase = 'roundEnd';
    state.phaseT = 0;
    state.winReason = reason;
    emit('roundWin', { winner, reason, score: { ...state.score }, playerWon });
    if (state.score[winner] >= CFG.round.winScore) {
      state.phase = 'matchEnd';
      state.winner = winner;
      emit('matchWin', { winner, score: { ...state.score } });
    }
  }

  function plant(site) {
    if (state.phase !== 'combat' || state.plantedSite) return false;
    state.plantedSite = site;
    state.fuseLeft = CFG.round.coreFuseSeconds;
    emit('plant', { site });
    return true;
  }

  function defuse() {
    if (!state.plantedSite) return false;
    const site = state.plantedSite;
    state.plantedSite = null;
    emit('defuse', { site });
    awardRound('wardens', 'Pulse Core defused');
    return true;
  }

  function explode() {
    const site = state.plantedSite;
    state.plantedSite = null;
    emit('explode', { site });
    awardRound('breachers', 'Pulse Core detonated');
  }

  // Called every fixed step. Returns nothing; round flow is event-driven.
  function update(dt, alive) {
    state.phaseT += dt;
    if (state.phase === 'buy') {
      if (state.phaseT >= CFG.round.buySeconds) {
        state.phase = 'combat';
        state.phaseT = 0;
        emit('combatStart', { round: state.round });
      }
      return;
    }
    if (state.phase === 'combat') {
      if (state.plantedSite) {
        state.fuseLeft -= dt;
        if (state.fuseLeft <= 0) { explode(); return; }
        // With a live core the round clock stops; the fuse decides it.
        if (alive.wardens === 0) return; // nobody left to defuse: wait for the blast
        return;
      }
      state.roundTimeLeft -= dt;
      if (state.roundTimeLeft <= 0) {
        awardRound('wardens', 'Time expired — cores held');
        return;
      }
      if (alive.breachers === 0) { awardRound('wardens', 'Breachers eliminated'); return; }
      if (alive.wardens === 0) { awardRound('breachers', 'Wardens eliminated'); return; }
      return;
    }
    if (state.phase === 'roundEnd') {
      if (state.phaseT >= 4) startRound();
      return;
    }
  }

  function addKillBonus() {
    state.money = Math.min(CFG.money.max, state.money + CFG.money.kill);
    state.stats.kills += 1;
  }
  function addPlantBonus() {
    state.money = Math.min(CFG.money.max, state.money + CFG.money.plant);
    state.stats.plants += 1;
  }
  function addDefuseBonus() {
    state.money = Math.min(CFG.money.max, state.money + CFG.money.defuse);
    state.stats.defuses += 1;
  }
  function spend(amount) {
    if (state.money < amount) return false;
    state.money -= amount;
    return true;
  }

  return {
    state, startMatch, startRound, awardRound, plant, defuse, explode,
    update, addKillBonus, addPlantBonus, addDefuseBonus, spend,
  };
}
