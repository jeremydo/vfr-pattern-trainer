import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 1, 500000);

    this._camPos    = new THREE.Vector3();
    this._camLook   = new THREE.Vector3();
    this._camPosTgt = new THREE.Vector3();
    this._camLookTgt= new THREE.Vector3();

    this._clouds = [];

    this._buildLighting();
    this._buildGround();
    this._buildSky();

    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.Fog(0x87CEEB, 10000, 220000);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _buildLighting() {
    this.scene.add(new THREE.AmbientLight(0xFFFFFF, 0.65));
    const sun = new THREE.DirectionalLight(0xFFFAEE, 1.2);
    sun.position.set(80000, 60000, -40000);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xCCDDFF, 0.3);
    fill.position.set(-50000, 20000, 50000);
    this.scene.add(fill);
  }

  _buildGround() {
    // Canvas texture: green base with grid lines — no z-fighting
    const size = 512;
    const cvs  = document.createElement('canvas');
    cvs.width = cvs.height = size;
    const ctx  = cvs.getContext('2d');

    ctx.fillStyle = '#5C7A3C';
    ctx.fillRect(0, 0, size, size);

    // Minor grid lines (every 1/8 tile)
    ctx.strokeStyle = '#4A6A2A';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += size / 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
    // Major grid lines (every 1/2 tile)
    ctx.strokeStyle = '#3D5C28';
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += size / 2) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cvs);
    // Each tile = 4000 ft; 350 tiles across 1,400,000 ft
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(350, 350);

    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1400000, 1400000),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);
  }

  _buildSky() {
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(400000, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide })
    );
    this.scene.add(this.skyDome);
  }

  setSkyColor(hexStr) {
    const col = new THREE.Color(hexStr);
    this.skyDome.material.color.copy(col);
    this.scene.background = col;
    this.scene.fog = new THREE.Fog(col, 10000, 220000);
  }

  setGroundLevel(elevation) {
    this.groundMesh.position.y = elevation;
  }

  buildClouds(scenario, airportElevation) {
    this._clouds.forEach(c => this.scene.remove(c));
    this._clouds = [];

    for (const layer of scenario.clouds) {
      const altFt   = airportElevation + layer.agl;
      const opacity = layer.coverage === 'FEW' ? 0.5 : layer.coverage === 'SCT' ? 0.70 : 0.88;
      const count   = layer.coverage === 'FEW' ? 25 : layer.coverage === 'SCT' ? 55 : 110;

      for (let i = 0; i < count; i++) {
        const w = 2800 + Math.random() * 5000;
        const d = 1400 + Math.random() * 2600;
        const cloud = new THREE.Mesh(
          new THREE.BoxGeometry(w, 550, d),
          new THREE.MeshLambertMaterial({ color: 0xF0F4F8, transparent: true, opacity })
        );
        cloud.position.set(
          (Math.random() - 0.5) * 260000,
          altFt + (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 260000
        );
        this.scene.add(cloud);
        this._clouds.push(cloud);
      }
    }
  }

  // Smooth chase camera — 220 ft behind, 80 ft above
  updateCamera(aircraft, dt) {
    if (!aircraft) return;
    const r    = aircraft.heading * Math.PI / 180;
    const fwdX = Math.sin(r), fwdZ = -Math.cos(r);
    const pitchY = Math.sin(-aircraft.pitch * Math.PI / 180);

    this._camPosTgt.set(
      aircraft.position.x - fwdX * 220,
      aircraft.position.y + 80 + pitchY * 30,
      aircraft.position.z - fwdZ * 220
    );
    this._camLookTgt.set(
      aircraft.position.x + fwdX * 380,
      aircraft.position.y - 15,
      aircraft.position.z + fwdZ * 380
    );

    const s = Math.min(1, 6 * dt);
    this._camPos.lerp(this._camPosTgt, s);
    this._camLook.lerp(this._camLookTgt, s);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  snapCamera(aircraft) {
    const r = aircraft.heading * Math.PI / 180;
    const fwdX = Math.sin(r), fwdZ = -Math.cos(r);
    this._camPos.set(aircraft.position.x - fwdX*220, aircraft.position.y + 80, aircraft.position.z - fwdZ*220);
    this._camLook.set(aircraft.position.x + fwdX*380, aircraft.position.y - 15, aircraft.position.z + fwdZ*380);
    this._camPosTgt.copy(this._camPos);
    this._camLookTgt.copy(this._camLook);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
