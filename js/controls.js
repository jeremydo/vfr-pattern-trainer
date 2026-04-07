// Keyboard input
// Pitch up/down : Arrow Up / Down  (or W/S)
// Roll left/right: Arrow Left / Right (or A/D)
// Throttle up/dn : = / -  (hold to change continuously)
// Flaps down/up  : F / V
// Gear toggle    : G
// Brakes         : B
// Pause          : P or Escape

export class Controls {
  constructor() {
    this._keys       = new Set();
    this._justPressed = new Set();

    this.pitchInput = 0;    // -1 = pitch up, +1 = pitch down
    this.rollInput  = 0;    // -1 = roll left, +1 = roll right
    this.throttle   = 0.55; // 0–1, persists

    this.gearToggle  = false;
    this.flapsDown   = false;
    this.flapsUp     = false;
    this.pause       = false;
    this.braking     = false;
    this.guideToggle = false;

    window.addEventListener('keydown', e => {
      if (!this._keys.has(e.code)) this._justPressed.add(e.code);
      this._keys.add(e.code);
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this._keys.delete(e.code));
  }

  update(dt) {
    const k = this._keys;

    this.pitchInput = k.has('ArrowUp')   || k.has('KeyW') ? -1
                    : k.has('ArrowDown') || k.has('KeyS') ?  1 : 0;

    this.rollInput  = k.has('ArrowLeft') || k.has('KeyA') ?  1
                    : k.has('ArrowRight')|| k.has('KeyD') ? -1 : 0;

    if (k.has('Equal') || k.has('BracketRight') || k.has('PageUp'))
      this.throttle = Math.min(1,   this.throttle + 0.4 * dt);
    if (k.has('Minus') || k.has('BracketLeft')  || k.has('PageDown'))
      this.throttle = Math.max(0,   this.throttle - 0.4 * dt);

    this.braking    = k.has('KeyB');
    this.gearToggle = this._justPressed.has('KeyG');
    this.flapsDown  = this._justPressed.has('KeyF');
    this.flapsUp    = this._justPressed.has('KeyV');
    this.pause       = this._justPressed.has('Escape') || this._justPressed.has('KeyP');
    this.guideToggle = this._justPressed.has('KeyT');

    this._justPressed.clear();
  }
}
