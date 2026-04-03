import { AIRPORTS, selectActiveEnd, getPatternAlt } from './data/airports.js';
import { SCENARIOS, windComponents, gustAddition } from './data/scenarios.js';
import { AIRCRAFT_LIST, vref } from './data/aircraft_data.js';
import { SCREENS } from './state.js';

const DIRS = ['N','NE','E','SE','S','SW','W','NW'];

export class UI {
  constructor(state) { this.state = state; }

  renderMain() {
    const recent = this.state.save.completedFlights.slice(0, 5);
    document.getElementById('screen-main').innerHTML = `
      <div class="menu-panel">
        <div class="logo">VFR<span>PATTERN</span><br><small>TRAINER</small></div>
        <p class="subtitle">Practice VFR pattern entries &amp; landings at real US airports</p>
        <button class="btn-primary" id="btn-new">New Flight</button>
        ${recent.length ? `
          <div class="section-label" style="margin-top:24px">Recent Flights</div>
          ${recent.map(f => `
            <div class="recent-row">
              <span>${f.airport} RW${f.runway} · ${f.aircraft}</span>
              <span class="grade grade-${f.grade}">${f.grade} (${f.score})</span>
            </div>`).join('')}` : ''}
        <div class="controls-help">
          <div class="section-label">Controls</div>
          <div class="hint-grid">
            <span>↑↓ / W S</span><span>Pitch</span>
            <span>←→ / A D</span><span>Roll</span>
            <span>= / −</span><span>Throttle</span>
            <span>F / V</span><span>Flaps ↓ ↑</span>
            <span>G</span><span>Gear toggle</span>
            <span>B</span><span>Brakes</span>
            <span>P / Esc</span><span>Pause</span>
          </div>
        </div>
      </div>`;
    document.getElementById('btn-new').onclick = () => { this.renderSetup(); this.state.setScreen(SCREENS.SETUP); };
  }

  renderSetup() {
    const s   = this.state;
    const sel = { airport: s.selectedAirport || AIRPORTS[0],
                  aircraft: s.selectedAircraft || AIRCRAFT_LIST[0],
                  scenario: s.selectedScenario || SCENARIOS[0],
                  dir: s.startDirection || 'N' };

    document.getElementById('screen-setup').innerHTML = `
      <div class="menu-panel wide">
        <h2>Flight Setup</h2>
        <div class="setup-grid">

          <div class="setup-col">
            <label class="section-label">Airport</label>
            <select id="sel-airport" class="sel-input">
              ${AIRPORTS.map(a => `<option value="${a.id}" ${a.id===sel.airport.id?'selected':''}>${a.id} — ${a.name} (${a.city})</option>`).join('')}
            </select>

            <label class="section-label" style="margin-top:20px">Weather Scenario</label>
            <select id="sel-scenario" class="sel-input">
              ${SCENARIOS.map(sc => `<option value="${sc.id}" ${sc.id===sel.scenario.id?'selected':''}>${sc.name}</option>`).join('')}
            </select>
            <p id="sc-desc" class="sc-desc">${sel.scenario.description}</p>

            <label class="section-label" style="margin-top:20px">Starting Direction (20 nm out)</label>
            <div class="compass-wrap" id="compass-btns">
              ${DIRS.map(d => `<button class="compass-btn${d===sel.dir?' active':''}" data-dir="${d}">${d}</button>`).join('')}
            </div>
          </div>

          <div class="setup-col">
            <label class="section-label">Aircraft</label>
            ${AIRCRAFT_LIST.map(ac => `
              <label class="ac-card${ac.id===sel.aircraft.id?' active':''}">
                <input type="radio" name="ac" value="${ac.id}" ${ac.id===sel.aircraft.id?'checked':''}>
                <div class="ac-name">${ac.name}</div>
                <div class="ac-sub">${ac.gear==='fixed'?'Fixed gear':'Retractable gear'} · ${ac.type}</div>
                <div class="ac-speeds">DW ${ac.speeds.downwind} / Base ${ac.speeds.base} / Vref ${Math.round(ac.vs0*1.3)} kts</div>
              </label>`).join('')}
          </div>

        </div>
        <div class="form-actions">
          <button class="btn-sec" id="btn-back">Back</button>
          <button class="btn-primary" id="btn-brief">Continue →</button>
        </div>
      </div>`;

    document.getElementById('sel-scenario').onchange = e => {
      const sc = SCENARIOS.find(s => s.id === e.target.value);
      document.getElementById('sc-desc').textContent = sc?.description || '';
    };
    document.getElementById('compass-btns').querySelectorAll('.compass-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.compass-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
    document.querySelectorAll('.ac-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.ac-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        card.querySelector('input').checked = true;
      };
    });
    document.getElementById('btn-back').onclick = () => { this.renderMain(); this.state.setScreen(SCREENS.MAIN); };
    document.getElementById('btn-brief').onclick = () => { this._applySetup(); this.renderBriefing(); this.state.setScreen(SCREENS.BRIEFING); };
  }

  _applySetup() {
    const s = this.state;
    s.selectedAirport  = AIRPORTS.find(a => a.id === document.getElementById('sel-airport').value);
    s.selectedScenario = SCENARIOS.find(sc => sc.id === document.getElementById('sel-scenario').value);
    s.selectedAircraft = AIRCRAFT_LIST.find(a => a.id === document.querySelector('input[name="ac"]:checked')?.value) || AIRCRAFT_LIST[0];
    s.startDirection   = document.querySelector('.compass-btn.active')?.dataset.dir || 'N';
    const { runway, end } = selectActiveEnd(s.selectedAirport, s.selectedScenario.windFrom, s.selectedScenario.windSpeed);
    s.selectedRunway = runway;
    s.selectedEnd    = end;
  }

  renderBriefing() {
    const s   = this.state;
    const apt = s.selectedAirport;
    const ac  = s.selectedAircraft;
    const sc  = s.selectedScenario;
    const end = s.selectedEnd;
    const rwy = s.selectedRunway;
    const patAlt   = getPatternAlt(apt, ac.type === 'turbine');
    const { headwind, crosswind } = windComponents(sc, parseInt(end.id) * 10);
    const gust     = gustAddition(sc);
    const vrefKts  = vref(ac) + gust;
    const cloudStr = sc.clouds.length === 0 ? 'SKC'
      : sc.clouds.map(c => `${c.coverage} ${c.agl} ft AGL`).join(', ');
    const hi = s.getHighScore(apt.id, end.id, ac.id);

    document.getElementById('screen-briefing').innerHTML = `
      <div class="menu-panel wide brief-panel">
        <h2>Flight Briefing</h2>
        <div class="brief-grid">
          <div class="brief-box">
            <div class="section-label">Airport</div>
            <div class="brief-big">${apt.id}</div>
            <div class="brief-line">${apt.name}</div>
            <div class="brief-line">${apt.city} · Elev ${apt.elevation} ft MSL</div>
          </div>
          <div class="brief-box">
            <div class="section-label">Active Runway</div>
            <div class="brief-big">RW ${end.id}</div>
            <div class="brief-line">${rwy.length.toLocaleString()} × ${rwy.width} ft</div>
            <div class="brief-line">Pattern: <strong>${end.pattern === 'L' ? 'LEFT' : 'RIGHT'}</strong></div>
            <div class="brief-line">Pattern alt: <strong>${patAlt} ft MSL</strong></div>
          </div>
          <div class="brief-box">
            <div class="section-label">ATIS</div>
            <div class="brief-line"><strong>${sc.name}</strong></div>
            <div class="brief-line">Wind: ${sc.windSpeed===0?'CALM':`${String(sc.windFrom).padStart(3,'0')}°@${sc.windSpeed}${sc.windGust?'G'+sc.windGust:''} kts`}</div>
            <div class="brief-line">Clouds: ${cloudStr}</div>
            <div class="brief-line">Vis: ${sc.visibility} SM</div>
            <div class="brief-line">HW/XW: ${headwind.toFixed(1)} / ${Math.abs(crosswind).toFixed(1)} kts</div>
          </div>
          <div class="brief-box">
            <div class="section-label">Aircraft · ${ac.name}</div>
            <div class="brief-line">Gear: ${ac.gear==='fixed'?'Fixed (no action)':'RETRACTABLE — lower before landing'}</div>
            <div class="brief-line">Downwind: <strong>${ac.speeds.downwind} kts</strong></div>
            <div class="brief-line">Base: <strong>${ac.speeds.base} kts</strong></div>
            <div class="brief-line">Vref: <strong>${vrefKts} kts</strong>${gust?` (+${gust} gusts)`:''}</div>
            <div class="brief-line">Stall (flap/clean): ${ac.vs0} / ${ac.vs1} kts</div>
          </div>
        </div>
        <div class="procedure-box">
          <div class="section-label">Standard Entry — 45° to ${end.pattern==='L'?'Left':'Right'} Downwind</div>
          <ol>
            <li>Enter pattern at <strong>${patAlt} ft MSL</strong> via 45° to the downwind</li>
            <li>Downwind: <strong>${ac.speeds.downwind} kts</strong> · level · ~1 nm ${end.pattern==='L'?'left':'right'} of runway</li>
            <li>Abeam threshold: reduce power, flaps, begin descent</li>
            <li>Base: <strong>${ac.speeds.base} kts</strong>${ac.gear==='retractable'?' · gear DOWN':''}</li>
            <li>Final: full flaps · <strong>${vrefKts} kts</strong> · aim for touchdown zone</li>
          </ol>
        </div>
        ${hi ? `<div class="high-score">Best score for this setup: <strong>${hi.grade} (${hi.score}/100)</strong></div>` : ''}
        <div class="form-actions">
          <button class="btn-sec" id="btn-back-s">← Back</button>
          <button class="btn-primary" id="btn-fly">Fly!</button>
        </div>
      </div>`;

    document.getElementById('btn-back-s').onclick = () => { this.renderSetup(); this.state.setScreen(SCREENS.SETUP); };
    document.getElementById('btn-fly').onclick = () => {
      this.state.setScreen(SCREENS.FLIGHT);
      document.dispatchEvent(new CustomEvent('startFlight'));
    };
  }

  renderDebrief(result) {
    const { score, grade, breakdown: bd, touchdownMetrics: m } = result;
    const bar = (v, max) => `<div class="score-bar"><div class="score-fill" style="width:${Math.round(v/max*100)}%"></div></div>`;

    document.getElementById('screen-debrief').innerHTML = `
      <div class="menu-panel wide">
        <h2>Flight Debrief</h2>
        <div class="debrief-grade grade-${grade}">${grade}</div>
        <div class="debrief-score">${score} / 100</div>
        <div class="score-list">
          <div class="score-row"><span>Gear configuration</span><span>${Math.round(bd.gear)}/20</span>${bar(bd.gear,20)}</div>
          <div class="score-row"><span>Final approach speed</span><span>${Math.round(bd.speed)}/20</span>${bar(bd.speed,20)}</div>
          <div class="score-row"><span>Pattern altitude</span><span>${Math.round(bd.altitude)}/15</span>${bar(bd.altitude,15)}</div>
          <div class="score-row"><span>Touchdown zone</span><span>${Math.round(bd.zone)}/20</span>${bar(bd.zone,20)}</div>
          <div class="score-row"><span>Centerline accuracy</span><span>${Math.round(bd.centerline)}/15</span>${bar(bd.centerline,15)}</div>
          <div class="score-row"><span>Sink rate</span><span>${Math.round(bd.sinkRate)}/10</span>${bar(bd.sinkRate,10)}</div>
        </div>
        ${m ? `<div class="td-detail">
          <div class="section-label">Touchdown Data</div>
          <div class="td-grid">
            <span>${m.onRunway?'✓ On runway':'✗ Off runway'}</span>
            <span>${Math.round(Math.max(0,m.distFromThresh))} ft from threshold</span>
            <span>${Math.round(m.lateralDev)} ft off centerline</span>
            <span>${Math.round(Math.abs(m.vs))} fpm sink rate</span>
            <span>${Math.round(m.airspeed)} kts at touchdown</span>
          </div>
        </div>` : ''}
        <div class="form-actions">
          <button class="btn-sec" id="db-setup">Change Setup</button>
          <button class="btn-primary" id="db-retry">Fly Again</button>
        </div>
      </div>`;

    document.getElementById('db-setup').onclick = () => { this.renderSetup();    this.state.setScreen(SCREENS.SETUP); };
    document.getElementById('db-retry').onclick = () => { this.renderBriefing(); this.state.setScreen(SCREENS.BRIEFING); };
  }
}
