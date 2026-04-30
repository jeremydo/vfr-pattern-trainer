// Text-to-speech cues using the Web Speech API.
// Speaks pattern guidance once on each phase change, and repeats warnings
// whenever they change or after an 8-second cooldown.

export class AudioCues {
  constructor() {
    this._synth      = window.speechSynthesis ?? null;
    this._audioCtx   = null;
    this.muted       = false;
    this._lastPhase  = null;
    this._lastWarn   = '';   // text of the last warning spoken
    this._warnTimer  = 0;    // seconds until the same warning may repeat
    this._ringCount  = 0;    // how many rings have played so far this flight
  }

  // Two-note ascending chime played via Web Audio API.
  ping() {
    if (this.muted) return;
    try {
      if (!this._audioCtx)
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      for (const [freq, delay] of [[523.25, 0], [659.25, 0.13]]) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.22, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.38);
        osc.start(now + delay);
        osc.stop(now + delay + 0.4);
      }
    } catch (_) {}
  }

  // Call once per tick from the main loop.
  update(checker, dt) {
    this._warnTimer = Math.max(0, this._warnTimer - dt);

    // Ring feedback: one ring per 25 points accumulated (Sonic-style)
    const dueRings = Math.floor((checker.liveScore ?? 0) / 25);
    if (dueRings > this._ringCount) {
      this._ringCount = dueRings;
      if (!this.muted) this._ring();
    }

    if (!this._synth) return;

    const topWarn = checker.warnings[0] ?? '';

    if (topWarn) {
      const isNew = topWarn !== this._lastWarn;
      if (isNew) {
        // Different warning — interrupt and speak immediately
        if (!this.muted) this._speak(topWarn, true);
        this._lastWarn  = topWarn;
        this._warnTimer = 8;
      } else if (this._warnTimer === 0) {
        // Same warning still active — repeat on cooldown
        if (!this.muted) this._speak(topWarn, false);
        this._warnTimer = 8;
      }
    } else {
      // No active warning — reset so the next one fires immediately
      this._lastWarn  = '';
      this._warnTimer = 0;
    }

    // Guidance fires once on each phase change (only when no warning is active)
    if (checker.phase !== this._lastPhase) {
      this._lastPhase = checker.phase;
      if (!topWarn && checker.guidance && !this.muted) {
        this._speak(checker.guidance, false);
      }
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this._synth?.cancel();
    return this.muted;
  }

  // Call when starting a new flight so stale state doesn't carry over.
  reset() {
    this._synth?.cancel();
    this._lastPhase = null;
    this._lastWarn  = '';
    this._warnTimer = 0;
    this._ringCount = 0;
  }

  // Short bright ring — plays on every 25 pts accumulated.
  // Two sine partials (fundamental + fifth) for a metallic "ting" quality.
  _ring() {
    try {
      if (!this._audioCtx)
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      for (const [freq, vol] of [[1047, 0.18], [1568, 0.09]]) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (_) {}
  }

  _speak(text, interrupt) {
    if (!this._synth) return;
    if (interrupt) this._synth.cancel();
    const utt   = new SpeechSynthesisUtterance(this._sanitize(text));
    utt.rate    = 1.1;
    utt.pitch   = 1.0;
    this._synth.speak(utt);
  }

  _rwyDigits(num) {
    const words = { '0':'zero','1':'one','2':'two','3':'three','4':'four',
                    '5':'five','6':'six','7':'seven','8':'eight','9':'niner' };
    return [...num].map(d => words[d] ?? d).join(' ');
  }

  _sanitize(text) {
    return text
      .replace(/RW(\d+)/g, (_, n) => 'runway ' + this._rwyDigits(n))  // RW13 → runway one three
      .replace(/(\d+)\s*kts/gi,    '$1 knots')        // 90 kts → 90 knots
      .replace(/(\d+)\s*ft\b/gi,   '$1 feet')         // 2500 ft → 2500 feet
      .replace(/\bMSL\b/g,         '')                // drop MSL
      .replace(/\bAGL\b/g,         '')                // drop AGL
      .replace(/°/g,               ' degrees')        // ° → degrees
      .replace(/\([A-Z]\)/g,       '')                // remove key hints like (B)
      .replace(/\s{2,}/g,          ' ')               // collapse extra spaces
      .trim();
  }
}
