// Text-to-speech cues using the Web Speech API.
// Speaks pattern guidance once on each phase change, and repeats warnings
// whenever they change or after an 8-second cooldown.

export class AudioCues {
  constructor() {
    this._synth     = window.speechSynthesis ?? null;
    this.muted      = false;
    this._lastPhase = null;
    this._lastWarn  = '';   // text of the last warning spoken
    this._warnTimer = 0;    // seconds until the same warning may repeat
  }

  // Call once per tick from the main loop.
  update(checker, dt) {
    this._warnTimer = Math.max(0, this._warnTimer - dt);

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
  }

  _speak(text, interrupt) {
    if (!this._synth) return;
    if (interrupt) this._synth.cancel();
    const utt   = new SpeechSynthesisUtterance(text);
    utt.rate    = 1.1;
    utt.pitch   = 1.0;
    this._synth.speak(utt);
  }
}
