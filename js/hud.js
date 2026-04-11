// G1000-style PFD — compact top-strip overlay
// 3D view is the main display; instruments sit in a semi-opaque strip at the top.

import { vref } from './data/aircraft_data.js';
import { gustAddition } from './data/scenarios.js';

const C = {
  white:   '#FFFFFF',  black:   '#000000',
  tape:    'rgba(18,20,30,0.88)',
  center:  'rgba(18,20,30,0.72)',
  border:  'rgba(90,90,100,0.6)',
  green:   '#00C832',  cyan:    '#00E5FF',
  magenta: '#FF00CC',  yellow:  '#FFE000',
  orange:  '#FF8800',  red:     '#FF3030',
  gray:    '#888888',
};

export class HUD {
  constructor() { this._cvs = null; this._ctx = null; this._W = 0; this._H = 0; }

  _init() {
    if (this._cvs) return;
    this._cvs = document.getElementById('pfd-canvas');
    this._ctx  = this._cvs.getContext('2d');
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    if (!this._cvs) return;
    const W = this._cvs.offsetWidth, H = this._cvs.offsetHeight;
    if (W !== this._W || H !== this._H) {
      this._cvs.width = this._W = W;
      this._cvs.height = this._H = H;
    }
  }

  show() { this._init(); this._resize(); this._cvs.style.display = 'block'; }
  hide() { if (this._cvs) this._cvs.style.display = 'none'; }

  update(aircraft, appState, checker, scenario, guideVisible = false, turbo = false) {
    if (!this._cvs || this._cvs.style.display === 'none') return;
    this._resize();
    const ctx = this._ctx, W = this._W, H = this._H;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    const elev   = appState.selectedAirport.elevation;
    const vr     = vref(aircraft.data) + gustAddition(scenario);
    const patAlt = elev + (aircraft.data.type === 'turbine'
      ? appState.selectedAirport.turbinePatternAGL
      : appState.selectedAirport.patternAGL);

    // Strip: 30% of screen width, centred at top
    const SW     = Math.round(W * 0.30);
    const SX     = Math.round((W - SW) / 2);        // left edge of strip
    const SH     = Math.min(220, Math.round(H * 0.28));
    const tapeW  = Math.max(58, Math.min(74, SW * 0.22));
    const vsiW   = 20;
    const hdgH   = 32;
    const aiH    = SH - hdgH;
    const aiX    = SX + tapeW;
    const aiW    = SW - tapeW * 2 - vsiW;

    // Draw strip panels
    this._speedTape(ctx,  SX,              0,   tapeW,  SH,   aircraft, vr);
    this._altTape(ctx,    aiX + aiW,       0,   tapeW,  SH,   aircraft, patAlt, elev);
    this._vsi(ctx,        aiX+aiW+tapeW,   0,   vsiW,   SH,   aircraft);
    this._aiOverlay(ctx,  aiX,             0,   aiW,    aiH,  aircraft);
    this._hdgTape(ctx,    aiX,             aiH, aiW,    hdgH, aircraft, scenario, checker);
    this._topBar(ctx,     SX, SW,          SH,  checker, aircraft, guideVisible, turbo);

    // Guidance + warnings below the strip
    this._overlays(ctx, W, SH, checker);

    const sf = document.getElementById('stall-flash');
    if (sf) sf.style.display =
      aircraft.airspeed < aircraft.data.vs0 + 5 && !aircraft.onGround ? 'flex' : 'none';
  }

  // ── AI overlay — circular G1000-style attitude indicator ──────────
  _aiOverlay(ctx, x, y, w, h, ac) {
    const cx = x + w / 2, cy = y + h / 2;
    const r   = Math.min(w, h) / 2 - 3;   // circle radius
    const ppd = r / 22;                    // pixels per degree (±22° to rim)
    const pitchPx = ac.pitch * ppd;
    const bankRad = ac.bank * Math.PI / 180;

    // ── 1. Circular clip: sky/ground fill + pitch ladder ─────────────
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();

    // Ground fill (entire area), then sky half rotated over it
    ctx.fillStyle = '#7A4820'; ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.translate(cx, cy + pitchPx); ctx.rotate(-bankRad);
    ctx.fillStyle = '#2878C0'; ctx.fillRect(-r*3, -r*4, r*6, r*4);
    ctx.restore();

    // Pitch ladder in bank-rotated frame
    ctx.save();
    ctx.translate(cx, cy + pitchPx); ctx.rotate(-bankRad);
    const fs = Math.max(9, Math.round(r * 0.12));
    ctx.font = `bold ${fs}px monospace`;

    for (let deg = -30; deg <= 30; deg += 5) {
      if (deg === 0) continue;
      const py  = -deg * ppd;
      const maj = deg % 10 === 0;
      const len = maj ? r * 0.36 : r * 0.20;
      // shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.50)'; ctx.lineWidth = maj ? 3.5 : 2;
      ctx.beginPath(); ctx.moveTo(-len, py); ctx.lineTo(len, py); ctx.stroke();
      // line
      ctx.strokeStyle = C.white; ctx.lineWidth = maj ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(-len, py); ctx.lineTo(len, py); ctx.stroke();
      if (maj) {
        ctx.fillStyle = C.white; ctx.textBaseline = 'middle';
        ctx.textAlign = 'right'; ctx.fillText(Math.abs(deg), -len - 4, py);
        ctx.textAlign = 'left';  ctx.fillText(Math.abs(deg),  len + 4, py);
      }
    }

    // Horizon line (gold)
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0); ctx.stroke();
    ctx.restore();

    // Bezel ring drawn last inside clip so it covers ragged edges
    ctx.strokeStyle = 'rgba(15,18,26,0.96)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    ctx.restore(); // ── end circular clip ──

    // Thin highlight ring just inside bezel
    ctx.strokeStyle = 'rgba(90,95,115,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();

    // ── 2. Bank arc (outside clip, across the top) ───────────────────
    const arcR = r + 11;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, arcR, (-90-58)*Math.PI/180, (-90+58)*Math.PI/180);
    ctx.stroke();

    for (const a of [10, 20, 30, 45, 60]) {
      for (const s of [-1, 1]) {
        const rad = (s*a - 90) * Math.PI / 180;
        const tl  = a % 30 === 0 ? 10 : 6;
        ctx.strokeStyle = C.white; ctx.lineWidth = a % 30 === 0 ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rad)*arcR,       Math.sin(rad)*arcR);
        ctx.lineTo(Math.cos(rad)*(arcR-tl),  Math.sin(rad)*(arcR-tl));
        ctx.stroke();
      }
    }

    // Fixed zero-bank reference triangle (tip at arc, points inward)
    ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.moveTo(0,-arcR+1); ctx.lineTo(-6,-arcR+13); ctx.lineTo(6,-arcR+13);
    ctx.closePath(); ctx.fill();

    // Moving bank pointer: rotates with aircraft bank
    ctx.save();
    ctx.rotate(-bankRad);
    ctx.fillStyle = C.yellow;
    ctx.beginPath(); ctx.moveTo(0,-arcR+2); ctx.lineTo(-5,-arcR+13); ctx.lineTo(5,-arcR+13);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.restore();

    // ── 3. Fixed aircraft symbol (never rotates) ──────────────────────
    const ww = r * 0.30;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx-ww,cy); ctx.lineTo(cx-ww*0.28,cy); ctx.lineTo(cx-ww*0.28,cy+6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+ww*0.28,cy); ctx.lineTo(cx+ww*0.28,cy+6); ctx.lineTo(cx+ww,cy); ctx.stroke();
    ctx.strokeStyle = C.yellow; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx-ww,cy); ctx.lineTo(cx-ww*0.28,cy); ctx.lineTo(cx-ww*0.28,cy+6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+ww*0.28,cy); ctx.lineTo(cx+ww*0.28,cy+6); ctx.lineTo(cx+ww,cy); ctx.stroke();
    ctx.fillStyle = C.yellow;
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.lineCap = 'butt';
  }

  // ── Heading tape ─────────────────────────────────────────────────
  _hdgTape(ctx, x, y, w, h, ac, scenario, checker) {
    const hdg = ac.heading;
    const cx  = x + w / 2;
    ctx.fillStyle = C.tape; ctx.fillRect(x, y, w, h);

    // Compass tape — pixels per degree
    const ppd = w / 60;   // show ±30° either side

    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

    ctx.font = `bold ${Math.round(h * 0.38)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let d = -35; d <= 35; d++) {
      const deg = ((Math.round(hdg) + d) % 360 + 360) % 360;
      const px  = cx + d * ppd;
      const is10 = deg % 10 === 0, is30 = deg % 30 === 0;
      if (!is10) {
        if (deg % 5 === 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, y+h-8); ctx.lineTo(px, y+h-2); ctx.stroke();
        }
        continue;
      }
      ctx.strokeStyle = C.white; ctx.lineWidth = is30 ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(px, y+h-(is30?14:9)); ctx.lineTo(px, y+h-2); ctx.stroke();
      if (is30) {
        const lbl = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W'
          : String(deg/10).padStart(2,'0');
        ctx.fillStyle = (deg%90===0) ? C.cyan : C.white;
        ctx.fillText(lbl, px, y+2);
      }
    }
    ctx.restore();

    // Fixed heading triangle + box
    ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.moveTo(cx,y+h-2); ctx.lineTo(cx-6,y+h-13); ctx.lineTo(cx+6,y+h-13);
    ctx.closePath(); ctx.fill();

    const hStr = String(Math.round(hdg)%360).padStart(3,'0')+'°';
    const bW=52, bH=18;
    ctx.fillStyle = C.black; ctx.fillRect(cx-bW/2, y+1, bW, bH);
    ctx.strokeStyle = C.white; ctx.lineWidth=1; ctx.strokeRect(cx-bW/2, y+1, bW, bH);
    ctx.fillStyle = C.white; ctx.font=`bold ${Math.round(bH*0.75)}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(hStr, cx, y+1+bH/2);

    // Wind (right side of heading tape)
    const windX = x + w - 4, windY = y + h/2;
    if (scenario.windSpeed > 0) {
      const spd = scenario.windSpeed + (scenario.windGust ? 'G'+scenario.windGust : '');
      ctx.fillStyle = C.white; ctx.font=`bold ${Math.round(h*0.40)}px monospace`;
      ctx.textAlign='right'; ctx.textBaseline='middle';
      ctx.fillText(spd+'KT', windX, windY);
    } else {
      ctx.fillStyle = C.gray; ctx.font=`bold ${Math.round(h*0.40)}px monospace`;
      ctx.textAlign='right'; ctx.textBaseline='middle';
      ctx.fillText('CALM', windX, windY);
    }

    ctx.strokeStyle = C.border; ctx.lineWidth=1; ctx.strokeRect(x, y, w, h);
  }

  // ── Speed Tape ───────────────────────────────────────────────────
  _speedTape(ctx, x, y, w, h, ac, vrefSpd) {
    const asp=ac.airspeed, d=ac.data, ppk=h/60, cy=y+h/2;
    ctx.fillStyle=C.tape; ctx.fillRect(x,y,w,h);
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();

    const band=(lo,hi,col)=>{
      const t=cy-(hi-asp)*ppk, b=cy-(lo-asp)*ppk;
      ctx.fillStyle=col; ctx.fillRect(x,Math.max(y,t),7,Math.min(b-t,y+h-Math.max(y,t)));
    };
    band(0,      d.vs0,    '#BB0000');
    band(d.vs0,  d.vs1,    '#CCCCCC');
    band(d.vs1,  d.vno,    C.green);
    band(d.vno,  d.vne,    C.yellow);
    band(d.vne,  d.vne+50, '#BB0000');

    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.font=`${Math.round(h*0.044)}px monospace`;
    for (let s=Math.max(0,Math.floor((asp-35)/10)*10); s<=Math.ceil((asp+35)/10)*10; s+=5) {
      const py=cy-(s-asp)*ppk;
      if (py<y+1||py>y+h-1) continue;
      const maj=s%10===0;
      ctx.strokeStyle=C.white; ctx.lineWidth=maj?1.5:1;
      ctx.beginPath(); ctx.moveTo(x+(maj?11:15),py); ctx.lineTo(x+w-2,py); ctx.stroke();
      if (maj){ctx.fillStyle=C.white; ctx.fillText(s,x+w-4,py);}
    }
    ctx.restore();

    const bH=Math.round(h*0.088);
    ctx.fillStyle=C.black; ctx.fillRect(x,cy-bH/2,w,bH);
    ctx.strokeStyle=C.white; ctx.lineWidth=1.5; ctx.strokeRect(x,cy-bH/2,w,bH);
    ctx.fillStyle=C.black;
    ctx.beginPath(); ctx.moveTo(x+w-2,cy-bH/2); ctx.lineTo(x+w+10,cy); ctx.lineTo(x+w-2,cy+bH/2); ctx.fill();
    ctx.strokeStyle=C.white; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=C.white; ctx.font=`bold ${Math.round(bH*0.78)}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.round(Math.max(0,asp)), x+w*0.48, cy);

    const vrY=cy-(vrefSpd-asp)*ppk;
    if (vrY>y+2&&vrY<y+h-2){
      ctx.fillStyle=C.magenta;
      ctx.beginPath(); ctx.moveTo(x+w,vrY); ctx.lineTo(x+w+9,vrY-5); ctx.lineTo(x+w+9,vrY+5); ctx.fill();
    }
    ctx.fillStyle='#aaa'; ctx.font=`${Math.round(h*0.036)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText('KIAS', x+w/2, y+h-3);
    ctx.strokeStyle=C.border; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
  }

  // ── Altitude Tape ────────────────────────────────────────────────
  _altTape(ctx, x, y, w, h, ac, patAlt, airportElev) {
    const alt=ac.position.y, ppf=h/800, cy=y+h/2;
    ctx.fillStyle=C.tape; ctx.fillRect(x,y,w,h);
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();

    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.font=`${Math.round(h*0.042)}px monospace`;
    for (let a=Math.floor((alt-500)/100)*100; a<=Math.ceil((alt+500)/100)*100; a+=20) {
      const py=cy-(a-alt)*ppf;
      if (py<y+1||py>y+h-1) continue;
      const maj=a%100===0;
      ctx.strokeStyle=C.white; ctx.lineWidth=maj?1.5:1;
      ctx.beginPath(); ctx.moveTo(x+2,py); ctx.lineTo(x+(maj?18:10),py); ctx.stroke();
      if (maj){ctx.fillStyle=C.white; ctx.fillText(Math.round(a),x+20,py);}
    }
    ctx.restore();

    const bH=Math.round(h*0.088);
    ctx.fillStyle=C.black; ctx.fillRect(x+6,cy-bH/2,w-6,bH);
    ctx.strokeStyle=C.white; ctx.lineWidth=1.5; ctx.strokeRect(x+6,cy-bH/2,w-6,bH);
    ctx.fillStyle=C.black;
    ctx.beginPath(); ctx.moveTo(x+12,cy-bH/2); ctx.lineTo(x-3,cy); ctx.lineTo(x+12,cy+bH/2); ctx.fill();
    ctx.strokeStyle=C.white; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=C.white; ctx.font=`bold ${Math.round(bH*0.72)}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.round(alt).toLocaleString(), x+6+(w-6)/2, cy);

    const paY=cy-(patAlt-alt)*ppf;
    if (paY>y+2&&paY<y+h-2){
      ctx.fillStyle=C.cyan;
      ctx.beginPath(); ctx.moveTo(x+2,paY); ctx.lineTo(x-8,paY-5); ctx.lineTo(x-8,paY+5); ctx.fill();
    }
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(x,y,w,22);
    ctx.fillStyle=C.cyan; ctx.font=`bold ${Math.min(12,Math.round(h*0.046))}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('PAT '+Math.round(patAlt), x+w/2, y+11);

    ctx.fillStyle='#aaa'; ctx.font=`${Math.round(h*0.036)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText('ALT ft', x+w/2, y+h-25);

    // Airport elevation badge at bottom of tape
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(x, y+h-22, w, 22);
    ctx.fillStyle=C.green; ctx.font=`bold ${Math.min(11,Math.round(h*0.044))}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('APT '+Math.round(airportElev), x+w/2, y+h-11);

    ctx.strokeStyle=C.border; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
  }

  // ── VSI ──────────────────────────────────────────────────────────
  _vsi(ctx, x, y, w, h, ac) {
    const vs=Math.max(-2000,Math.min(2000,ac.vs)), cy=y+h/2, sc=(h*0.43)/2000;
    ctx.fillStyle=C.tape; ctx.fillRect(x,y,w,h);
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.font=`${Math.round(w*0.55)}px monospace`;
    for (const v of [500,1000,2000]) {
      for (const s of [-1,1]) {
        const py=cy-s*v*sc;
        ctx.strokeStyle=C.white; ctx.lineWidth=v%1000===0?1.5:1;
        ctx.beginPath(); ctx.moveTo(x+1,py); ctx.lineTo(x+8,py); ctx.stroke();
        if (v%1000===0){ctx.fillStyle=C.white; ctx.fillText(v/1000,x+w-1,py);}
      }
    }
    const ny=cy-vs*sc, col=vs<-800?C.red:vs>300?C.green:C.white;
    ctx.strokeStyle=col; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x+w/2,cy); ctx.lineTo(x+w/2,ny); ctx.stroke();
    const dir=vs>=0?1:-1;
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.moveTo(x+w/2,ny); ctx.lineTo(x+w/2-3,ny-dir*8); ctx.lineTo(x+w/2+3,ny-dir*8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=C.border; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
  }

  // ── Top info bar ─────────────────────────────────────────────────
  // Layout (left → right):
  //  [phase text] [gear icon] [flap icon] [TURBO badge?] [guide/dist]
  _topBar(ctx, SX, SW, stripH, checker, aircraft, guideVisible, turbo) {
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(SX, 0, SW, 22);

    // Phase label
    const pc={CRUISE:C.cyan,APPROACH:C.yellow,DOWNWIND:C.green,
              BASE:C.orange,FINAL:'#FF6644',FLARE:C.white,LANDED:C.green};
    ctx.fillStyle=pc[checker.phase]||C.white;
    ctx.font='bold 11px monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(checker.phase, SX+6, 11);

    // Gear icon (~38% from left)
    const gearCol = aircraft.data.gear==='fixed' ? C.gray
                  : aircraft.gearDown ? C.green : C.red;
    this._drawGearIcon(ctx, SX + SW*0.38, 11, gearCol,
                       aircraft.data.gear==='fixed', aircraft.gearDown);

    // Flap icon (~52% from left)
    const flapFrac = aircraft.data.flaps.length > 1
      ? aircraft.flaps / (aircraft.data.flaps.length - 1) : 0;
    this._drawFlapIcon(ctx, SX + SW*0.52, 11, flapFrac);

    // TURBO badge (~64%) — only when active
    if (turbo) {
      const tx = SX + SW*0.645;
      ctx.fillStyle='rgba(255,120,0,0.22)'; ctx.fillRect(tx-20, 2, 40, 18);
      ctx.fillStyle=C.orange; ctx.font='bold 11px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('TURBO', tx, 11);
    }

    // Distance / GUIDE (right)
    const dist=Math.sqrt(aircraft.position.x**2+aircraft.position.z**2);
    ctx.font='bold 11px monospace';
    if (guideVisible) {
      ctx.fillStyle='rgba(0,229,255,0.18)'; ctx.fillRect(SX+SW-50,2,44,18);
      ctx.fillStyle=C.cyan; ctx.textAlign='center';
      ctx.fillText('GUIDE', SX+SW-28, 11);
    } else {
      ctx.fillStyle=C.white; ctx.textAlign='right';
      ctx.fillText((dist/6076.12).toFixed(1)+' nm', SX+SW-6, 11);
    }
  }

  // Tricycle gear: 3 circles (nose top, mains bottom-left/right).
  // Filled = down or fixed.  Outline only = retracted.
  _drawGearIcon(ctx, cx, cy, color, isFixed, isDown) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    const solid = isFixed || isDown;
    const wheel = (x, y, r) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
      if (solid) ctx.fill(); else ctx.stroke();
    };
    wheel(cx,      cy - 4, 2.5);   // nose (small, top-centre)
    wheel(cx - 7,  cy + 4, 3);     // left main
    wheel(cx + 7,  cy + 4, 3);     // right main
    ctx.restore();
  }

  // Wing chord + trailing-edge flap deflection.
  // flapFrac 0 = up (inline with chord), 1 = full down (~42°).
  _drawFlapIcon(ctx, cx, cy, flapFrac) {
    ctx.save();
    ctx.strokeStyle = flapFrac > 0.5 ? C.orange : C.white;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    const angle = flapFrac * 42 * Math.PI / 180;
    // Wing chord (trailing edge at cx)
    ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx, cy); ctx.stroke();
    // Flap (from hinge, deflecting down-right)
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle)*7, cy + Math.sin(angle)*7); ctx.stroke();
    ctx.restore();
  }

  // ── Guidance + warnings (float below strip) ──────────────────────
  _overlays(ctx, W, stripY, checker) {
    // Guidance bar
    if (checker.guidance) {
      const gh=28, gy=stripY+6;
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.fillRect(W*0.2, gy, W*0.6, gh);
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
      ctx.strokeRect(W*0.2, gy, W*0.6, gh);
      ctx.fillStyle=C.white; ctx.font='13px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(checker.guidance, W/2, gy+gh/2);
    }

    // Warning banners
    checker.warnings.forEach((warn, i) => {
      const wh=24, wy=stripY+42+i*28, ww=Math.min(380,W*0.5);
      ctx.fillStyle='rgba(200,30,30,0.88)';
      ctx.fillRect(W/2-ww/2, wy, ww, wh);
      ctx.strokeStyle='#FF6666'; ctx.lineWidth=1;
      ctx.strokeRect(W/2-ww/2, wy, ww, wh);
      ctx.fillStyle=C.white; ctx.font='bold 12px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(warn, W/2, wy+wh/2);
    });
  }
}
