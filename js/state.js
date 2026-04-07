const SAVE_KEY = 'vfr_trainer_claude_v1';

export const SCREENS = { MAIN:'main', SETUP:'setup', BRIEFING:'briefing', FLIGHT:'flight', DEBRIEF:'debrief' };
export const PHASES  = { CRUISE:'CRUISE', APPROACH:'APPROACH', DOWNWIND:'DOWNWIND', BASE:'BASE', FINAL:'FINAL', FLARE:'FLARE', LANDED:'LANDED' };

export class AppState {
  constructor() {
    this.screen           = SCREENS.MAIN;
    this.selectedAirport  = null;
    this.selectedRunway   = null;
    this.selectedEnd      = null;
    this.selectedAircraft = null;
    this.selectedScenario = null;
    this.startDirection   = 'N';
    this.startDistance    = 5;
    this.phase            = PHASES.CRUISE;
    this.warnings         = [];
    this.guidance         = '';
    this.landing          = null;
    this.score            = null;
    this.save             = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { completedFlights: [], highScores: {} };
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (_) {}
  }

  recordFlight(result) {
    const key = `${this.selectedAirport.id}_${this.selectedEnd.id}_${this.selectedAircraft.id}`;
    const ex  = this.save.highScores[key];
    if (!ex || result.score > ex.score) {
      this.save.highScores[key] = { score: result.score, grade: result.grade };
    }
    this.save.completedFlights.unshift({
      airport: this.selectedAirport.id, runway: this.selectedEnd.id,
      aircraft: this.selectedAircraft.id, scenario: this.selectedScenario.id,
      score: result.score, grade: result.grade,
      date: new Date().toLocaleDateString()
    });
    if (this.save.completedFlights.length > 50) this.save.completedFlights.length = 50;
    this.persist();
  }

  getHighScore(airportId, endId, aircraftId) {
    return this.save.highScores[`${airportId}_${endId}_${aircraftId}`] || null;
  }

  setScreen(screen) {
    this.screen = screen;
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`screen-${screen}`);
    if (el) el.classList.add('active');
  }

  startFlight() {
    this.phase    = PHASES.CRUISE;
    this.warnings = [];
    this.guidance = '';
    this.landing  = null;
    this.score    = null;
  }
}
