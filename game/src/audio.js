// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files and makes no network request. The context is created
// on the first user gesture (browsers block audio before one).
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
      // One shared white-noise buffer for gunshots, impacts and footsteps.
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) { return false; }
    return true;
  }

  function noise(dur, filterType, freq, gain, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  const shots = {
    pistol: () => { noise(0.09, 'lowpass', 2600, 0.9); tone(190, 0.08, 'square', 0.25, 60); },
    smg: () => { noise(0.07, 'bandpass', 1800, 0.7); tone(220, 0.06, 'square', 0.2, 70); },
    rifle: () => { noise(0.12, 'lowpass', 1800, 1.0); tone(150, 0.11, 'square', 0.3, 45); },
    sniper: () => { noise(0.28, 'lowpass', 1200, 1.0); tone(110, 0.25, 'sawtooth', 0.3, 35); },
    distant: () => { noise(0.14, 'lowpass', 700, 0.28); },
  };

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    shot(kind, distant = false) {
      if (!ensure()) return;
      if (distant) { shots.distant(); return; }
      (shots[kind] || shots.rifle)();
    },
    dryClick() { if (ensure()) tone(1400, 0.03, 'square', 0.12); },
    reload() {
      if (!ensure()) return;
      tone(900, 0.04, 'square', 0.12); tone(620, 0.04, 'square', 0.12, 0, 0.12); tone(1100, 0.05, 'square', 0.14, 0, 0.3);
    },
    hitmarker(kill) {
      if (!ensure()) return;
      tone(kill ? 1500 : 1150, 0.06, 'sine', 0.22);
      if (kill) tone(1900, 0.09, 'sine', 0.2, 0, 0.06);
    },
    hurt() { if (ensure()) { noise(0.1, 'lowpass', 500, 0.5); tone(90, 0.12, 'sine', 0.3, 55); } },
    step() { if (ensure()) noise(0.05, 'lowpass', 320, 0.07); },
    plantBeep(final) { if (ensure()) tone(final ? 1700 : 1250, final ? 0.3 : 0.07, 'sine', 0.2); },
    plantStart() { if (ensure()) { tone(880, 0.08, 'sine', 0.18); tone(1320, 0.08, 'sine', 0.18, 0, 0.1); } },
    explosion() {
      if (!ensure()) return;
      noise(1.4, 'lowpass', 420, 1.0);
      tone(70, 1.1, 'sine', 0.6, 28);
      noise(0.5, 'bandpass', 900, 0.5, 0.05);
    },
    roundWin() { if (ensure()) { tone(523, 0.14, 'sine', 0.22); tone(659, 0.14, 'sine', 0.22, 0, 0.13); tone(784, 0.24, 'sine', 0.24, 0, 0.26); } },
    roundLose() { if (ensure()) { tone(392, 0.16, 'sine', 0.2); tone(311, 0.16, 'sine', 0.2, 0, 0.15); tone(233, 0.3, 'sine', 0.22, 0, 0.3); } },
    buy() { if (ensure()) { tone(980, 0.05, 'sine', 0.16); tone(1470, 0.07, 'sine', 0.16, 0, 0.05); } },
    denied() { if (ensure()) tone(180, 0.12, 'square', 0.16); },
    flash() { if (ensure()) { tone(2400, 0.35, 'sine', 0.18, 900); noise(0.2, 'highpass', 3000, 0.1); } },
    smoke() { if (ensure()) noise(0.7, 'lowpass', 900, 0.25); },
  };
}
