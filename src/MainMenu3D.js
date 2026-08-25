import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';

/** Public URL — place the file at `public/assets/leitstelle.glb`. */
export const LEITSTELLE_MODEL_URL = '/assets/leitstelle.glb';

/** Fired on the host element after the GSAP zoom finishes. */
export const ZOOM_COMPLETE_EVENT = 'mainmenu3d:zoomcomplete';

const ENV_NAME =
  /^(floor|walls?|ceiling|ground|hull|shell|backdrop|sky|carpet|parquet|fussboden|fußboden|decke|terrain|landschaft)(\.\d+)?$/i;

const FURNITURE_NAME =
  /monitor|screen|display|bildschirm|computer|desktop|desk|schreibtisch|tisch|chair|stuhl|sofa|shelf|regal|book|ordner|binder|lamp|lampe|keyboard|tastatur|mug|tasse|notebook|papier|door|tuer|tür|plant|pflanze|train|lok|map|karte|pc/i;

const MONITOR_NAME = /wallpaper|pc-1wallpaper|pc2.?screen|lap.?1screen/i;
const DESK_NAME = /desk|schreibtisch|(^|_|-|\s)tisch(?!lampe)/i;
const SCREEN_NAME = /wallpaper|pc-1wallpaper|pc2.?screen|surface.?[12].?screen|lap.?1screen/i;
const KEYBOARD_NAME = /keyboard|tastatur/i;
const CHAIR_NAME = /chair|stuhl|office.?chair/i;
const ROOM_SHELL_NAME = /(^|[._\s-])(floor|wall|roof|ceiling)([._\s-]|$)/i;

/**
 * Three.js office hub: first-person view at the desk, raycasts furniture, GSAP dolly-in.
 */
export class MainMenu3D {
  /**
   * @param {HTMLElement} container
   * @param {{
   *   modelUrl?: string,
   *   onZoomComplete?: (detail: { name: string, uuid: string, object: THREE.Object3D }) => void,
   *   onLoad?: () => void,
   *   onError?: (error: Error) => void,
   * }} [options]
   */
  constructor(container, options = {}) {
    if (!container) throw new Error('MainMenu3D: container element is required.');

    this.container = container;
    this.modelUrl = options.modelUrl ?? LEITSTELLE_MODEL_URL;
    this.onZoomComplete = options.onZoomComplete ?? null;
    this.onLoad = options.onLoad ?? null;
    this.onError = options.onError ?? null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15120f);

    this.camera = new THREE.PerspectiveCamera(64, 1, 0.08, 500);
    this.lookTarget = new THREE.Vector3(0, 1.2, 0);
    this.homePosition = new THREE.Vector3(0, 1.25, 1.4);
    this.homeTarget = this.lookTarget.clone();
    this.interiorBox = new THREE.Box3();
    this.unit = 1;
    this.floorY = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x15120f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;display:block;touch-action:none;';
    container.appendChild(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clickables = [];
    this.hovered = null;
    this.model = null;
    this.animating = false;
    this.zoomed = false;
    this.disposed = false;
    this.raf = 0;
    this.zoomTween = null;
    this.pointLights = [];
    this.screenMats = [];
    this.generatedTextures = [];
    this.generatedGeos = [];
    this.generatedMats = [];
    this.decor = new THREE.Group();
    this.decor.name = 'LeitstelleDecor';
    this.scene.add(this.decor);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);

    this._addLights();
    this._bindInput();
    this._onResize();
    this.resizeObserver = new ResizeObserver(this._onResize);
    this.resizeObserver.observe(container);

    this._loadModel();
    this._tick();
  }

  _addLights() {
    const ambient = new THREE.AmbientLight(0xffb080, 0.48);
    this.scene.add(ambient);
    this.ambient = ambient;

    const sun = new THREE.DirectionalLight(0xff7a3c, 1.55);
    sun.position.set(-6, 8, -2);
    sun.castShadow = false;
    this.sun = sun;
    this.scene.add(sun);

    this.scene.fog = new THREE.Fog(0x1a110c, 8, 42);
  }

  /**
   * Warm dusk: sunset through the windows, practicals on ceiling fixtures and the desk.
   * @param {THREE.Box3} box
   */
  _placeInteriorLights(box) {
    for (const light of this.pointLights) {
      light.parent?.remove(light);
    }
    this.pointLights = [];

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const u = this.unit;
    const reach = Math.max(size.length() * 1.25, u * 9);
    const power = 18 * u * u;

    const addPoint = (color, intensity, x, y, z, dist = reach) => {
      const light = new THREE.PointLight(color, intensity, dist, 1.4);
      light.position.set(x, y, z);
      this.scene.add(light);
      this.pointLights.push(light);
      return light;
    };

    const glasses = this._findMeshes((obj) => /window.?glass/i.test(`${obj.name} ${obj.material?.name ?? ''}`));
    if (glasses.length > 0) {
      const gBox = new THREE.Box3();
      for (const mesh of glasses) gBox.expandByObject(mesh);
      const gCenter = gBox.getCenter(new THREE.Vector3());
      const fromWindow = center.clone().sub(gCenter);
      fromWindow.y = 0;
      if (fromWindow.lengthSq() < 1e-6) fromWindow.set(1, 0, 0);
      fromWindow.normalize();
      this.sun.position.copy(gCenter).add(new THREE.Vector3(0, u * 2.2, 0)).addScaledVector(fromWindow, -u * 4);
      this.sun.color.set(0xff6a32);
      this.sun.intensity = 1.7;
    }

    this.sun.target.position.copy(center);
    this.scene.add(this.sun.target);

    const fixtures = this._findMeshes((obj) => /light.?emission/i.test(obj.name));
    const used = fixtures.slice(0, 8);
    for (const mesh of used) {
      const pos = new THREE.Vector3();
      mesh.getWorldPosition(pos);
      addPoint(0xffc27a, power * 0.55, pos.x, pos.y - u * 0.08, pos.z, u * 4.5);
    }

    addPoint(0xffb060, power * 0.9, center.x, box.min.y + u * 1.15, center.z, u * 5.5);

    this.scene.fog = new THREE.Fog(0x1a110c, Math.max(u * 6, 4), Math.max(u * 28, 18));
  }

  /**
   * Brass desk lamp next to the main monitor so the PointLight has a visible source.
   * @param {THREE.Box3} box
   */
  _addDeskLamp(box) {
    const monitor = this._largestScreen();
    const u = this.unit;
    const pos = new THREE.Vector3();
    if (monitor) {
      const mCenter = new THREE.Box3().setFromObject(monitor).getCenter(new THREE.Vector3());
      const front = this._monitorFront(monitor);
      const keyboard = this._nearestKeyboard(mCenter);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), front);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      if (keyboard) {
        const kBox = new THREE.Box3().setFromObject(keyboard);
        pos.copy(kBox.getCenter(new THREE.Vector3()));
        pos.addScaledVector(right, u * 0.38);
        pos.y = kBox.max.y + u * 0.02;
      } else {
        pos.copy(mCenter).addScaledVector(front, u * 0.45).addScaledVector(right, u * 0.4);
        pos.y = this.floorY + u * 0.78;
      }
    } else {
      pos.set(
        THREE.MathUtils.lerp(box.min.x, box.max.x, 0.62),
        this.floorY + u * 0.92,
        THREE.MathUtils.lerp(box.min.z, box.max.z, 0.55),
      );
    }

    const brass = new THREE.MeshStandardMaterial({
      color: 0xb8863a,
      metalness: 0.82,
      roughness: 0.28,
    });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0x1f4a28,
      emissive: 0xffb24a,
      emissiveIntensity: 0.55,
      roughness: 0.45,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    this.generatedMats.push(brass, shadeMat);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(u * 0.012, u * 0.018, u * 0.38, 10), brass);
    stem.position.copy(pos);
    stem.position.y += u * 0.19;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(u * 0.11, u * 0.14, 16, 1, true), shadeMat);
    shade.position.copy(pos);
    shade.position.y += u * 0.4;
    shade.rotation.x = Math.PI;
    this.generatedGeos.push(stem.geometry, shade.geometry);
    this.decor.add(stem, shade);

    const lampLight = new THREE.PointLight(0xffb45c, 22 * u * u, u * 3.2, 1.6);
    lampLight.position.copy(pos);
    lampLight.position.y += u * 0.36;
    this.scene.add(lampLight);
    this.pointLights.push(lampLight);
  }

  _bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this._onPointerMove);
    el.addEventListener('pointerleave', this._onPointerLeave);
    el.addEventListener('click', this._onClick);
  }

  _loadModel() {
    const url = this.modelUrl;
    const fail = (err) => {
      if (this.disposed) return;
      const error = toLoadError(err, url);
      console.error('MainMenu3D: GLB load failed', error);
      this.onError?.(error);
    };

    fetch(url)
      .then(async (res) => {
        const type = res.headers.get('content-type') || '';
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} — ${url} konnte nicht geladen werden.`);
        }
        if (type.includes('text/html')) {
          throw new Error(
            `${url} fehlt oder wird als HTML ausgeliefert. Die Datei muss unter public/assets/leitstelle.glb liegen.`,
          );
        }
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 12) {
          throw new Error(`${url} ist leer oder beschädigt (${buffer.byteLength} Bytes).`);
        }
        const magic = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 4)));
        if (magic !== 'glTF') {
          throw new Error(`${url} ist keine gültige GLB-Datei (Dateikopf: ${JSON.stringify(magic)}).`);
        }
        const loader = new GLTFLoader();
        return new Promise((resolve, reject) => {
          loader.parse(buffer, '/assets/', resolve, reject);
        });
      })
      .then((gltf) => {
        if (this.disposed) return;
        this.model = gltf.scene;
        this.model.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
          }
        });
        this.scene.add(this.model);
        this._frameScene();
        this._dressLeitstelle();
        this.clickables = this._collectClickables(this.model);
        for (const child of this.decor.children) {
          if (child.isMesh) this.clickables.push(child);
          child.traverse((obj) => {
            if (obj.isMesh && obj !== child) this.clickables.push(obj);
          });
        }
        this.onLoad?.();
      })
      .catch(fail);
  }

  _frameScene() {
    this.model.updateMatrixWorld(true);
    this.interiorBox = this._computeInteriorBox();
    const box = this.interiorBox;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.floorY = this._computeFloorY(box);
    const roomH = Math.max(box.max.y - this.floorY, size.y, 0.001);
    this.unit = THREE.MathUtils.clamp(roomH / 2.8, 0.25, 4);

    this.camera.near = Math.max(0.05, this.unit * 0.04);
    this.camera.far = Math.max(80, size.length() * 20);
    this.camera.fov = 64;
    this.camera.updateProjectionMatrix();

    this._placeInteriorLights(box);
    this._placeStartCamera(box, center, size);
  }

  _dressLeitstelle() {
    try {
      const envScene = new RoomEnvironment();
      const envTex = this.pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.38;
      envScene.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
    } catch {
      /* environment is optional */
    }

    this._enhanceMaterials();
    this._applyScreenTextures();
    this._applyWallArt();
    this._addDeskLamp(this.interiorBox);
    this._addScreenGlowLights();
  }

  /**
   * Wood warmer, chrome shinier, windows carry sunset.
   */
  _enhanceMaterials() {
    this.model.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        const name = `${obj.name} ${mat.name ?? ''}`;
        if (/wood|cabinet/i.test(name)) {
          mat.color?.multiplyScalar(1.08);
          mat.roughness = Math.min(mat.roughness ?? 0.7, 0.58);
          mat.metalness = 0.06;
        }
        if (/chrome|handle|marble/i.test(name)) {
          mat.metalness = Math.max(mat.metalness ?? 0, 0.78);
          mat.roughness = Math.min(mat.roughness ?? 0.4, 0.22);
        }
        if (/window.?glass/i.test(name)) {
          mat.transparent = true;
          mat.opacity = Math.min(mat.opacity ?? 1, 0.55);
          mat.emissive = new THREE.Color(0xff6a2e);
          mat.emissiveIntensity = 0.28;
          mat.roughness = 0.08;
          mat.metalness = 0.05;
        }
        if (/floor|roof|wall_rim|wall rim/i.test(name)) {
          mat.roughness = Math.min(mat.roughness ?? 0.8, 0.7);
        }
      }
    });
  }

  _applyScreenTextures() {
    const paints = [paintLineNetwork, paintTerminal, paintDispatchBoard, paintLaptopRadar];
    const screens = this._findMeshes((obj) => {
      const name = `${obj.name} ${obj.material?.name ?? ''}`;
      return /wallpaper|pc2.?screen|surface.?[12].?screen|lap.?1screen/i.test(name);
    });
    screens.forEach((mesh, i) => {
      const tex = canvasTexture(paints[i % paints.length]);
      this.generatedTextures.push(tex);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: tex,
        emissiveIntensity: 1.35,
        roughness: 0.18,
        metalness: 0.04,
        toneMapped: false,
      });
      this.generatedMats.push(mat);
      this.screenMats.push(mat);
      mesh.material = mat;
    });
  }

  _addScreenGlowLights() {
    const u = this.unit;
    for (const mesh of this._screenMeshes()) {
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const front = this._monitorFront(mesh);
      const light = new THREE.PointLight(0x4dff88, 7 * u * u, u * 1.6, 2);
      light.position.copy(center).addScaledVector(front, u * 0.14);
      this.scene.add(light);
      this.pointLights.push(light);
    }
  }

  _applyWallArt() {
    const mapA = canvasTexture(paintGermanyRailMap, 1024, 768);
    const mapB = canvasTexture(paintTimetablePoster, 768, 1024);
    const mapC = canvasTexture(paintLineNetwork, 1024, 768);
    this.generatedTextures.push(mapA, mapB, mapC);

    const existing = this._findMeshes((obj) => /budhha|buddha/i.test(obj.name) && !/frame/i.test(obj.name));
    const existingTex = [mapA, mapB];
    existing.forEach((mesh, i) => {
      const tex = existingTex[i % existingTex.length];
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.62,
        metalness: 0.04,
        emissive: new THREE.Color(0x3a2a14),
        emissiveMap: tex,
        emissiveIntensity: 0.18,
      });
      this.generatedMats.push(mat);
      mesh.material = mat;
    });

    const box = this.interiorBox;
    const u = this.unit;
    const center = box.getCenter(new THREE.Vector3());
    const hangY = box.min.y + u * 1.55;
    const maps = [
      { tex: mapA, nx: 1, nz: 0, t: 0.62 },
      { tex: mapB, nx: 0, nz: 1, t: 0.28 },
      { tex: mapC, nx: -1, nz: 0, t: 0.55 },
    ];
    for (const spec of maps) {
      const normal = new THREE.Vector3(-spec.nx, 0, -spec.nz);
      let pos;
      if (spec.nx !== 0) {
        const x = spec.nx > 0 ? box.max.x - u * 0.045 : box.min.x + u * 0.045;
        pos = new THREE.Vector3(x, hangY, THREE.MathUtils.lerp(box.min.z, box.max.z, spec.t));
      } else {
        const z = spec.nz > 0 ? box.max.z - u * 0.045 : box.min.z + u * 0.045;
        pos = new THREE.Vector3(THREE.MathUtils.lerp(box.min.x, box.max.x, spec.t), hangY, z);
      }
      if (pos.distanceTo(center) < u * 0.4) continue;
      this._addFramedMap(pos, normal, u * 1.05, u * 0.78, spec.tex);
    }
  }

  /**
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} intoRoom
   * @param {number} width
   * @param {number} height
   * @param {THREE.Texture} texture
   */
  _addFramedMap(position, intoRoom, width, height, texture) {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3d2614,
      roughness: 0.48,
      metalness: 0.18,
    });
    const artMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.58,
      metalness: 0.03,
      emissive: new THREE.Color(0x2a1c0c),
      emissiveMap: texture,
      emissiveIntensity: 0.16,
    });
    this.generatedMats.push(frameMat, artMat);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.08, height * 1.1), frameMat);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(width, height), artMat);
    art.position.z = this.unit * 0.004;
    this.generatedGeos.push(frame.geometry, art.geometry);
    frame.add(art);
    frame.position.copy(position);
    const target = position.clone().add(intoRoom.normalize());
    frame.lookAt(target);
    frame.name = 'Schienenkarte';
    art.name = 'Schienenkarte';
    this.decor.add(frame);
  }

  /**
   * Sit at chair height in front of the desk, looking at the monitors as a group.
   * Never spawn inside a screen or monitor housing.
   * @param {THREE.Box3} box
   * @param {THREE.Vector3} center
   * @param {THREE.Vector3} size
   */
  _placeStartCamera(box, center, _size) {
    const u = this.unit;
    const eyeY = THREE.MathUtils.clamp(
      this.floorY + u * 1.15,
      box.min.y + u * 0.7,
      box.max.y - u * 0.35,
    );
    const screen = this._largestScreen();
    const screens = this._screenMeshes();
    const chair = this._findByName(CHAIR_NAME);

    let look = center.clone();
    look.y = eyeY;
    let front = new THREE.Vector3(0, 0, 1);

    if (screen) {
      const mainCenter = new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3());
      const nearby = screens.filter((mesh) => {
        const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
        return c.distanceTo(mainCenter) <= u * 1.35;
      });
      const groupBox = new THREE.Box3();
      const groupMeshes = nearby.length > 0 ? nearby : [screen];
      for (const mesh of groupMeshes) groupBox.expandByObject(mesh);
      const groupCenter = groupBox.getCenter(new THREE.Vector3());
      front = this._monitorFront(screen);
      look.copy(groupCenter);
      look.y = THREE.MathUtils.clamp(groupCenter.y, eyeY - u * 0.12, eyeY + u * 0.22);

      const keyboard = this._nearestKeyboard(groupCenter);
      const gSize = groupBox.getSize(new THREE.Vector3());
      let dist = THREE.MathUtils.clamp(
        Math.max(gSize.x, gSize.y, gSize.z) * 1.15,
        u * 1.45,
        u * 2.2,
      );
      if (keyboard) {
        const kCenter = new THREE.Box3().setFromObject(keyboard).getCenter(new THREE.Vector3());
        const along = kCenter.clone().sub(groupCenter);
        along.y = 0;
        dist = Math.max(along.length() + u * 0.95, dist, u * 1.5);
      }

      this.camera.position.copy(groupCenter).addScaledVector(front, dist);
      this.camera.position.y = eyeY;

      if (chair) {
        const cCenter = new THREE.Box3().setFromObject(chair).getCenter(new THREE.Vector3());
        const fromChair = cCenter.clone().sub(groupCenter);
        fromChair.y = 0;
        if (fromChair.lengthSq() > 1e-6 && fromChair.normalize().dot(front) > 0.15) {
          this.camera.position.x = cCenter.x;
          this.camera.position.z = cCenter.z;
          this.camera.position.addScaledVector(front, u * 0.22);
          this.camera.position.y = eyeY;
        }
      }

      this._ensureOutsideScreens(this.camera.position, front);
      this._clampInside(this.camera.position, box, u * 0.35);
      this._ensureOutsideScreens(this.camera.position, front);

      const hold = this.camera.position.clone();
      hold.y = groupCenter.y;
      if (hold.distanceTo(groupCenter) < u * 0.85) {
        this.camera.position.copy(groupCenter).addScaledVector(front, Math.max(dist, u * 1.35));
        this.camera.position.y = eyeY;
        this._ensureOutsideScreens(this.camera.position, front);
      }
    } else {
      this.camera.position.set(
        THREE.MathUtils.lerp(box.min.x, box.max.x, 0.5),
        eyeY,
        THREE.MathUtils.lerp(box.min.z, box.max.z, 0.72),
      );
      look.set(
        THREE.MathUtils.lerp(box.min.x, box.max.x, 0.5),
        eyeY - u * 0.04,
        THREE.MathUtils.lerp(box.min.z, box.max.z, 0.42),
      );
      front.copy(look).sub(this.camera.position);
      front.y = 0;
      if (front.lengthSq() < 1e-8) front.set(0, 0, -1);
      front.normalize();
    }

    this.lookTarget.copy(look);
    if (!screen) {
      this._ensureOutsideScreens(this.camera.position, front);
      this._clampInside(this.camera.position, box, u * 0.35);
      this._ensureOutsideScreens(this.camera.position, front);
    }
    this.homePosition.copy(this.camera.position);
    this.homeTarget.copy(this.lookTarget);
    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Horizontal front of a monitor: keyboard → screen, then the camera/room side.
   * @param {THREE.Object3D} mesh
   * @param {THREE.Vector3 | null} [preferFrom]
   * @returns {THREE.Vector3}
   */
  _monitorFront(mesh, preferFrom = null) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const front = new THREE.Vector3();

    const keyboard = this._nearestKeyboard(center);
    if (keyboard) {
      const kCenter = new THREE.Box3().setFromObject(keyboard).getCenter(new THREE.Vector3());
      front.copy(kCenter).sub(center);
      front.y = 0;
    }

    if (front.lengthSq() < 1e-8) {
      if (size.x <= size.z) front.set(1, 0, 0);
      else front.set(0, 0, 1);
      const desk = this._findByName(DESK_NAME);
      const toward = desk
        ? new THREE.Box3().setFromObject(desk).getCenter(new THREE.Vector3()).sub(center)
        : this.interiorBox.getCenter(new THREE.Vector3()).sub(center);
      toward.y = 0;
      if (toward.lengthSq() < 1e-8) toward.set(0, 0, 1);
      toward.normalize();
      if (front.dot(toward) < 0) front.negate();
    }

    front.normalize();

    if (preferFrom) {
      const side = preferFrom.clone().sub(center);
      side.y = 0;
      if (side.lengthSq() > 1e-8 && front.dot(side) < 0) front.negate();
    }
    return front;
  }

  /**
   * Room bounds from floor / wall / roof — not the monitor cluster.
   * @returns {THREE.Box3}
   */
  _computeInteriorBox() {
    const namedShell = [];
    const genericShell = [];
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    this.model.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes.push(obj);
      if (!obj.name) return;
      if (/plane\.\d+_(floor|wall|roof)/i.test(obj.name)) namedShell.push(obj);
      else if (ROOM_SHELL_NAME.test(obj.name) && !SCREEN_NAME.test(obj.name)) genericShell.push(obj);
    });

    const seed = namedShell.length >= 2 ? namedShell : genericShell.length >= 2 ? genericShell : [];
    const box = new THREE.Box3();
    if (seed.length >= 2) {
      for (const obj of seed) box.expandByObject(obj);
      return box;
    }

    const furniture = meshes.filter(
      (obj) =>
        obj.name &&
        FURNITURE_NAME.test(obj.name) &&
        !SCREEN_NAME.test(obj.name) &&
        !/wallpaper/i.test(obj.name),
    );
    const fallback = furniture.length >= 2 ? furniture : this._dropHugeMeshes(meshes);
    if (fallback.length === 0) {
      box.setFromObject(this.model);
      return box;
    }
    for (const obj of fallback) box.expandByObject(obj);
    box.expandByScalar(box.getSize(new THREE.Vector3()).length() * 0.08);
    return box;
  }

  /**
   * @param {THREE.Box3} room
   */
  _computeFloorY(room) {
    const floors = this._findMeshes(
      (obj) => /_floor|floor_/i.test(obj.name) || /plane\.\d+_floor/i.test(obj.name),
    );
    if (floors.length === 0) return room.min.y;
    const fBox = new THREE.Box3();
    for (const mesh of floors) fBox.expandByObject(mesh);
    return Number.isFinite(fBox.max.y) ? fBox.max.y : room.min.y;
  }

  /**
   * @param {THREE.Mesh[]} meshes
   * @returns {THREE.Mesh[]}
   */
  _dropHugeMeshes(meshes) {
    if (meshes.length === 0) return meshes;
    const ranked = meshes
      .map((mesh) => ({ mesh, vol: volumeOf(new THREE.Box3().setFromObject(mesh)) }))
      .filter((row) => row.vol > 0)
      .sort((a, b) => a.vol - b.vol);
    const cutoff = ranked[Math.max(0, Math.floor(ranked.length * 0.82))]?.vol ?? Infinity;
    return ranked.filter((row) => row.vol <= cutoff).map((row) => row.mesh);
  }

  /**
   * @param {(obj: THREE.Object3D) => boolean} test
   * @returns {THREE.Mesh[]}
   */
  _findMeshes(test) {
    /** @type {THREE.Mesh[]} */
    const found = [];
    this.model.traverse((obj) => {
      if (obj.isMesh && test(obj)) found.push(obj);
    });
    return found;
  }

  /**
   * @param {THREE.Object3D} obj
   */
  _objectLabel(obj) {
    const mat = obj.material;
    const matName = Array.isArray(mat) ? mat.map((m) => m?.name ?? '').join(' ') : (mat?.name ?? '');
    return `${obj.name} ${obj.parent?.name ?? ''} ${matName}`;
  }

  /**
   * @param {THREE.Object3D} obj
   */
  _isScreenMesh(obj) {
    return SCREEN_NAME.test(this._objectLabel(obj));
  }

  /**
   * @param {THREE.Object3D} obj
   */
  _isMonitorTarget(obj) {
    if (this._isScreenMesh(obj)) return true;
    const name = this._objectLabel(obj);
    if (/keyboard|tastatur|mouse|maus|mousepad/i.test(name)) return false;
    return /monitor|bildschirm|display/i.test(name);
  }

  /**
   * @param {THREE.Object3D} obj
   * @returns {THREE.Object3D | null}
   */
  _screenNear(obj) {
    const screens = this._screenMeshes();
    if (screens.length === 0) return null;
    const center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    let best = screens[0];
    let bestD = Infinity;
    for (const mesh of screens) {
      const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      const d = c.distanceToSquared(center);
      if (d < bestD) {
        bestD = d;
        best = mesh;
      }
    }
    const max = this.unit * this.unit * 1.2;
    return bestD <= max ? best : null;
  }

  /**
   * @returns {THREE.Mesh[]}
   */
  _screenMeshes() {
    return this._findMeshes((obj) => this._isScreenMesh(obj));
  }

  /**
   * @returns {THREE.Object3D | null}
   */
  _largestScreen() {
    const pc1 = this._findByName(/pc-1wallpaper/i);
    if (pc1) return pc1;
    const screens = this._screenMeshes();
    if (screens.length === 0) return this._findByName(MONITOR_NAME);
    let best = screens[0];
    let bestSpan = 0;
    for (const mesh of screens) {
      const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      if (span > bestSpan) {
        bestSpan = span;
        best = mesh;
      }
    }
    return best;
  }

  /**
   * @param {THREE.Vector3} from
   * @returns {THREE.Object3D | null}
   */
  _nearestKeyboard(from) {
    const keys = this._findMeshes((obj) => KEYBOARD_NAME.test(this._objectLabel(obj)));
    if (keys.length === 0) return this._findByName(KEYBOARD_NAME);
    let best = keys[0];
    let bestDist = Infinity;
    for (const mesh of keys) {
      const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      const d = center.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = mesh;
      }
    }
    return best;
  }

  /**
   * Solid volume of a monitor (screen + housing), not the thin wallpaper plane.
   * @param {THREE.Object3D} mesh
   * @returns {THREE.Box3}
   */
  _monitorVolumeBox(mesh) {
    const self = new THREE.Box3().setFromObject(mesh);
    const parent = mesh.parent;
    if (!parent || parent === this.model || parent === this.scene) return self;
    const parentBox = new THREE.Box3().setFromObject(parent);
    const pSize = parentBox.getSize(new THREE.Vector3());
    const sSize = self.getSize(new THREE.Vector3());
    if (pSize.length() > sSize.length() * 8) return self;
    return parentBox;
  }

  /**
   * If a point sits inside a screen or its housing cavity, push it along `pushDir`.
   * @param {THREE.Vector3} point
   * @param {THREE.Vector3} pushDir
   */
  _ensureOutsideScreens(point, pushDir) {
    const screens = this._screenMeshes();
    const pad = this.unit * 0.06;
    for (let n = 0; n < 10; n++) {
      let moved = false;
      for (const mesh of screens) {
        const box = this._monitorVolumeBox(mesh);
        box.expandByScalar(pad);
        if (!box.containsPoint(point)) continue;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        let dir = pushDir ? pushDir.clone() : this._monitorFront(mesh);
        dir.y = 0;
        if (dir.lengthSq() < 1e-8) {
          dir.copy(point).sub(center);
          dir.y = 0;
        }
        if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
        dir.normalize();
        const depth = Math.min(size.x, size.z);
        const step = Math.max(depth, this.unit * 0.35) + this.unit * 0.25;
        point.addScaledVector(dir, step);
        moved = true;
      }
      if (!moved) break;
    }
    return point;
  }

  /**
   * @param {RegExp} pattern
   * @returns {THREE.Object3D | null}
   */
  _findByName(pattern) {
    let found = null;
    this.model.traverse((obj) => {
      if (found || !obj.name) return;
      if (pattern.test(obj.name)) found = obj;
    });
    return found;
  }

  /**
   * @param {THREE.Vector3} point
   * @param {THREE.Box3} box
   * @param {number} pad
   */
  _clampInside(point, box, pad) {
    const p = Number.isFinite(pad) ? pad : this.unit * 0.15;
    const min = box.min;
    const max = box.max;
    point.x = THREE.MathUtils.clamp(point.x, min.x + p, max.x - p);
    point.y = THREE.MathUtils.clamp(point.y, min.y + p, max.y - p);
    point.z = THREE.MathUtils.clamp(point.z, min.z + p, max.z - p);
    return point;
  }

  /**
   * @param {THREE.Object3D} root
   * @returns {THREE.Object3D[]}
   */
  _collectClickables(root) {
    /** @type {THREE.Mesh[]} */
    const meshes = [];
    root.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj);
    });
    if (meshes.length === 0) return [];

    const interiorVol = Math.max(volumeOf(this.interiorBox), 1e-6);
    const filtered = meshes.filter((mesh) => {
      if (this._isEnvironment(mesh)) return false;
      const vol = volumeOf(new THREE.Box3().setFromObject(mesh));
      return vol < interiorVol * 0.35;
    });
    return filtered.length > 0 ? filtered : meshes.filter((mesh) => !this._isEnvironment(mesh));
  }

  /**
   * @param {THREE.Object3D} obj
   */
  _isEnvironment(obj) {
    const names = [obj.name, obj.parent?.name].filter(Boolean);
    return names.some((name) => ENV_NAME.test(name.trim()));
  }

  /**
   * @param {PointerEvent} event
   */
  _setPointerFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    this.pointer.x = ((event.clientX - rect.left) / w) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / h) * 2 + 1;
  }

  /**
   * @returns {THREE.Intersection | null}
   */
  _hit() {
    if (this.clickables.length === 0) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.clickables, false);
    return hits[0] ?? null;
  }

  /**
   * Named parent for the UI event — never the whole room.
   * @param {THREE.Object3D} object
   */
  _resolveTarget(object) {
    const meshVol = volumeOf(new THREE.Box3().setFromObject(object));
    const roomVol = Math.max(volumeOf(this.interiorBox), 1e-6);
    let best = object;
    const parent = object.parent;
    if (parent && parent !== this.model && parent !== this.scene && parent.name) {
      const parentVol = volumeOf(new THREE.Box3().setFromObject(parent));
      if (parentVol < roomVol * 0.06 && parentVol < meshVol * 10) best = parent;
    }
    return best;
  }

  /**
   * @param {PointerEvent} event
   */
  _onPointerMove(event) {
    if (this.disposed || this.animating) return;
    this._setPointerFromEvent(event);
    const hit = this._hit();
    this.hovered = hit ? this._resolveTarget(hit.object) : null;
    this.renderer.domElement.style.cursor = this.hovered ? 'pointer' : 'default';
  }

  _onPointerLeave() {
    this.hovered = null;
    this.renderer.domElement.style.cursor = 'default';
  }

  /**
   * @param {MouseEvent} event
   */
  _onClick(event) {
    if (this.disposed || this.animating || this.zoomed) return;
    this._setPointerFromEvent(event);
    const hit = this._hit();
    if (!hit) return;
    this._zoomToHit(hit);
  }

  /**
   * Front-on approach: stay in front of the surface, never through it or out of the room.
   * @param {THREE.Intersection} hit
   */
  _zoomToHit(hit) {
    const target = this._resolveTarget(hit.object);
    if (this._isMonitorTarget(hit.object) || this._isMonitorTarget(target)) {
      const seed = this._isMonitorTarget(hit.object) ? hit.object : target;
      const screen = this._screenNear(seed) ?? seed;
      this._animateCameraTo(this._monitorViewPose(screen), target);
      return;
    }

    const point = hit.point.clone();
    let normal;
    if (hit.face) {
      normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    } else {
      normal = this.camera.position.clone().sub(point);
      if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
      else normal.normalize();
    }
    const fromCam = this.camera.position.clone().sub(point);
    if (normal.dot(fromCam) < 0) normal.negate();

    const minDist = Math.max(this.unit * 0.7, 0.55);
    const endPos = point.clone().addScaledVector(normal, minDist);
    endPos.y = THREE.MathUtils.clamp(
      endPos.y,
      this.floorY + this.unit * 0.85,
      this.floorY + this.unit * 1.7,
    );

    this._ensureOutsideScreens(endPos, normal);
    this._clampInside(endPos, this.interiorBox, this.unit * 0.28);
    this._ensureOutsideScreens(endPos, normal);

    const away = endPos.clone().sub(point);
    if (away.length() < minDist * 0.95) {
      if (away.lengthSq() < 1e-8) away.copy(normal);
      away.normalize();
      endPos.copy(point).addScaledVector(away, minDist);
      this._ensureOutsideScreens(endPos, away);
    }

    this._animateCameraTo({ pos: endPos, target: point }, target);
  }

  /**
   * Sit in front of a monitor, looking at it squarely. Distance stays outside the housing.
   * @param {THREE.Object3D} mesh
   */
  _monitorViewPose(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const front = this._monitorFront(mesh, this.camera.position);
    const span = Math.max(size.x, size.y);
    const dist = THREE.MathUtils.clamp(
      Math.max(span * 1.35, this.unit * 0.9),
      this.unit * 0.75,
      this.unit * 1.7,
    );
    const pos = center.clone().addScaledVector(front, dist);
    pos.y = THREE.MathUtils.clamp(center.y, this.floorY + this.unit * 0.95, this.floorY + this.unit * 1.4);

    this._ensureOutsideScreens(pos, front);
    this._clampInside(pos, this.interiorBox, this.unit * 0.28);
    this._ensureOutsideScreens(pos, front);

    const stillFront = pos.clone().sub(center);
    stillFront.y = 0;
    if (stillFront.dot(front) < this.unit * 0.45) {
      pos.copy(center).addScaledVector(front, dist);
      pos.y = THREE.MathUtils.clamp(center.y, this.floorY + this.unit * 0.95, this.floorY + this.unit * 1.4);
      this._ensureOutsideScreens(pos, front);
    }

    return { pos, target: center.clone() };
  }

  /**
   * @param {{ pos: THREE.Vector3, target: THREE.Vector3 }} pose
   * @param {THREE.Object3D} object
   */
  _animateCameraTo(pose, object) {
    this.animating = true;
    this.renderer.domElement.style.cursor = 'default';
    this.zoomTween?.kill();

    this.zoomTween = gsap.timeline({
      defaults: { duration: 1.15, ease: 'power2.inOut' },
      onComplete: () => {
        this.animating = false;
        this.zoomed = true;
        this._emitZoomComplete(object);
      },
    });
    this.zoomTween.to(this.camera.position, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z }, 0);
    this.zoomTween.to(this.lookTarget, { x: pose.target.x, y: pose.target.y, z: pose.target.z }, 0);
  }

  /**
   * @param {THREE.Object3D} object
   */
  _emitZoomComplete(object) {
    const detail = {
      name: object.name || 'object',
      uuid: object.uuid,
      object,
    };
    this.onZoomComplete?.(detail);
    this.container.dispatchEvent(
      new CustomEvent(ZOOM_COMPLETE_EVENT, { bubbles: true, detail }),
    );
  }

  /**
   * Animate back to the desk overview (e.g. after closing the dashboard).
   * @param {boolean} [animated=true]
   */
  resetCamera(animated = true) {
    this.zoomTween?.kill();
    this.zoomed = false;
    if (!animated) {
      this.camera.position.copy(this.homePosition);
      this.lookTarget.copy(this.homeTarget);
      this.animating = false;
      return;
    }
    this.animating = true;
    this.zoomTween = gsap.timeline({
      defaults: { duration: 1.05, ease: 'power2.inOut' },
      onComplete: () => {
        this.animating = false;
      },
    });
    this.zoomTween.to(
      this.camera.position,
      {
        x: this.homePosition.x,
        y: this.homePosition.y,
        z: this.homePosition.z,
      },
      0,
    );
    this.zoomTween.to(
      this.lookTarget,
      {
        x: this.homeTarget.x,
        y: this.homeTarget.y,
        z: this.homeTarget.z,
      },
      0,
    );
  }

  _onResize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  _tick() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this._tick);
    this.camera.lookAt(this.lookTarget);
    if (this.screenMats.length > 0) {
      const pulse = 1.28 + Math.sin(performance.now() * 0.0028) * 0.14;
      for (const mat of this.screenMats) mat.emissiveIntensity = pulse;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.zoomTween?.kill();
    this.resizeObserver?.disconnect();

    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._onPointerMove);
    el.removeEventListener('pointerleave', this._onPointerLeave);
    el.removeEventListener('click', this._onClick);
    el.style.cursor = 'default';

    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mat = obj.material;
        if (!mat) return;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const material of mats) {
          for (const value of Object.values(material)) {
            if (value && value.isTexture) value.dispose();
          }
          material.dispose();
        }
      });
    }

    this.scene.remove(this.decor);
    for (const geo of this.generatedGeos) geo.dispose();
    for (const tex of this.generatedTextures) tex.dispose();
    for (const mat of this.generatedMats) mat.dispose();
    for (const light of this.pointLights) light.parent?.remove(light);
    this.pmrem?.dispose();
    this.scene.environment?.dispose?.();

    this.renderer.dispose();
    el.remove();
  }
}

/**
 * @param {unknown} err
 * @param {string} url
 */
function toLoadError(err, url) {
  if (err instanceof Error && err.message) return err;
  const nested = err?.message || err?.error?.message || err?.target?.statusText;
  return new Error(nested ? `${url}: ${nested}` : `${url} konnte nicht geladen werden.`);
}

/**
 * @param {THREE.Box3} box
 */
function volumeOf(box) {
  const size = box.getSize(new THREE.Vector3());
  return Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z);
}

/**
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} paint
 * @param {number} [w]
 * @param {number} [h]
 */
function canvasTexture(paint, w = 1024, h = 640) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function drawScanlines(ctx, w, h, alpha = 0.16) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

function paintLineNetwork(ctx, w, h) {
  ctx.fillStyle = '#03140c';
  ctx.fillRect(0, 0, w, h);
  const grd = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, w * 0.7);
  grd.addColorStop(0, 'rgba(20, 80, 40, 0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#0b2a18';
  ctx.fillRect(0, 0, w, 52);
  ctx.fillStyle = '#7dff9a';
  ctx.font = 'bold 22px Consolas, "Courier New", monospace';
  ctx.fillText('EVU DISPO  ·  LINIENNETZ REGION WEST', 28, 34);
  ctx.font = '15px Consolas, "Courier New", monospace';
  ctx.fillStyle = '#4caf6a';
  ctx.fillText('LIVE  18:38    TRASSEN FREI  14/16', 28, 78);

  const nodes = [
    { n: 'DUIS', x: 0.22, y: 0.42 },
    { n: 'D', x: 0.38, y: 0.36 },
    { n: 'E', x: 0.48, y: 0.3 },
    { n: 'DO', x: 0.62, y: 0.34 },
    { n: 'K', x: 0.28, y: 0.62 },
    { n: 'F', x: 0.55, y: 0.68 },
    { n: 'H', x: 0.78, y: 0.28 },
    { n: 'HH', x: 0.82, y: 0.48 },
    { n: 'B', x: 0.88, y: 0.62 },
    { n: 'M', x: 0.7, y: 0.82 },
    { n: 'S', x: 0.48, y: 0.86 },
  ];
  const links = [
    [0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [3, 6], [6, 7], [7, 8], [5, 9], [5, 10], [0, 4], [2, 6],
  ];
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2ee36a';
  ctx.shadowColor = '#3dff88';
  ctx.shadowBlur = 8;
  for (const [a, b] of links) {
    ctx.beginPath();
    ctx.moveTo(nodes[a].x * w, nodes[a].y * h);
    ctx.lineTo(nodes[b].x * w, nodes[b].y * h);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (const node of nodes) {
    const x = node.x * w;
    const y = node.y * h;
    ctx.fillStyle = '#03140c';
    ctx.strokeStyle = '#9dffb8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c8ffd4';
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.fillText(node.n, x + 14, y + 4);
  }
  drawScanlines(ctx, w, h, 0.18);
}

function paintTerminal(ctx, w, h) {
  ctx.fillStyle = '#070e07';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7CFF6B';
  ctx.font = 'bold 26px Consolas, "Courier New", monospace';
  const lines = [
    'EVU-OS  v3.14    DISPOSITIONSKONSOLE',
    '────────────────────────────────────────',
    '> STATUS  NETZ WEST               OK',
    '> TRASSE  KN–HH                   FREI',
    '> ZUG    4721  DUIS–OBERHAUSEN   +4 MIN',
    '> ZUG    8802  KÖLN GREMBERG     PÜNKTLICH',
    '> BAUGLEIS  KM 42.1               SPERRE',
    '> PERSONAL  TF VERFÜGBAR          3',
    '',
    '18:38  WARTE AUF FAHRPLANFREIGABE…',
    '',
    'C:\\EVU\\DISPO> █',
  ];
  let y = 56;
  for (const line of lines) {
    ctx.fillText(line, 36, y);
    y += 42;
  }
  ctx.fillStyle = 'rgba(124,255,107,0.07)';
  ctx.fillRect(0, 0, w, h);
  drawScanlines(ctx, w, h, 0.2);
}

function paintDispatchBoard(ctx, w, h) {
  ctx.fillStyle = '#10140c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 24px Consolas, "Courier New", monospace';
  ctx.fillText('GLEISBILDSTELLWERK  ·  DUISBURG HBF', 28, 40);
  ctx.strokeStyle = '#5a7a3a';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 56, w - 48, h - 88);

  const tracks = [0.28, 0.42, 0.56, 0.7, 0.84];
  ctx.lineWidth = 6;
  tracks.forEach((ty, i) => {
    ctx.strokeStyle = i % 2 === 0 ? '#3dff7a' : '#d4b44a';
    ctx.beginPath();
    ctx.moveTo(60, h * ty);
    ctx.lineTo(w - 70, h * ty);
    ctx.stroke();
    ctx.fillStyle = '#9ad6a8';
    ctx.font = '16px Consolas, "Courier New", monospace';
    ctx.fillText(`GL ${i + 1}`, 70, h * ty - 12);
  });
  ctx.fillStyle = '#7CFF6B';
  ctx.font = '18px Consolas, "Courier New", monospace';
  ctx.fillText('AUSFAHRT OST  FREI     EINF. WEST  HALT', 60, h - 40);
  drawScanlines(ctx, w, h, 0.15);
}

function paintLaptopRadar(ctx, w, h) {
  ctx.fillStyle = '#0a1218';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3aa0c8';
  ctx.lineWidth = 1;
  const cx = w * 0.5;
  const cy = h * 0.55;
  for (let r = 50; r < 260; r += 50) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 260, cy);
  ctx.lineTo(cx + 260, cy);
  ctx.moveTo(cx, cy - 260);
  ctx.lineTo(cx, cy + 260);
  ctx.stroke();
  ctx.fillStyle = '#7ec8e8';
  ctx.font = 'bold 20px Consolas, "Courier New", monospace';
  ctx.fillText('LIVE-TRACKING  ·  NORDWEST', 28, 36);
  const blips = [
    [0.42, 0.4],
    [0.58, 0.48],
    [0.5, 0.62],
    [0.63, 0.33],
  ];
  ctx.fillStyle = '#4dff88';
  for (const [bx, by] of blips) {
    ctx.beginPath();
    ctx.arc(bx * w, by * h, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  drawScanlines(ctx, w, h, 0.14);
}

function paintGermanyRailMap(ctx, w, h) {
  ctx.fillStyle = '#e8d7b8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = '#f3e6c8';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText('SCHIENENNETZ DEUTSCHLAND', 36, 42);

  ctx.strokeStyle = '#6b4a28';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 84, w - 56, h - 120);

  ctx.strokeStyle = '#8b1e1e';
  ctx.lineWidth = 4;
  const routes = [
    [0.32, 0.28, 0.38, 0.4, 0.48, 0.48, 0.55, 0.7],
    [0.38, 0.4, 0.52, 0.36, 0.7, 0.42, 0.78, 0.5],
    [0.48, 0.48, 0.42, 0.62, 0.5, 0.78, 0.62, 0.84],
    [0.32, 0.28, 0.28, 0.5, 0.3, 0.7, 0.42, 0.62],
  ];
  for (const r of routes) {
    ctx.beginPath();
    ctx.moveTo(r[0] * w, r[1] * h);
    for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i] * w, r[i + 1] * h);
    ctx.stroke();
  }
  const cities = [
    ['Hamburg', 0.48, 0.26],
    ['Berlin', 0.72, 0.34],
    ['Köln', 0.28, 0.52],
    ['Frankfurt', 0.42, 0.6],
    ['München', 0.62, 0.82],
    ['Duisburg', 0.3, 0.42],
  ];
  ctx.fillStyle = '#3a2414';
  ctx.font = 'bold 16px Georgia, serif';
  for (const [label, x, y] of cities) {
    ctx.beginPath();
    ctx.arc(x * w, y * h, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(label, x * w + 10, y * h + 5);
  }
}

function paintTimetablePoster(ctx, w, h) {
  ctx.fillStyle = '#1b2a1c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 0, w, 90);
  ctx.fillStyle = '#1b2a1c';
  ctx.font = 'bold 32px Georgia, serif';
  ctx.fillText('FAHRPLAN', 36, 40);
  ctx.font = '18px Georgia, serif';
  ctx.fillText('Güterverkehr  ·  West', 36, 70);

  const rows = [
    ['4721', 'Duisburg', 'Oberhausen', '18:41'],
    ['8802', 'Köln-Grm.', 'Gremberg', '18:55'],
    ['1304', 'Essen', 'Hamm', '19:12'],
    ['6610', 'Düsseldorf', 'Neuss', '19:28'],
    ['2291', 'Dortmund', 'Bielefeld', '19:40'],
  ];
  ctx.font = 'bold 18px Consolas, monospace';
  let y = 140;
  ctx.fillStyle = '#e8d7b8';
  ctx.fillText('ZUG     VON            NACH           AB', 36, y);
  y += 16;
  ctx.strokeStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(36, y);
  ctx.lineTo(w - 36, y);
  ctx.stroke();
  y += 36;
  ctx.font = '17px Consolas, monospace';
  for (const row of rows) {
    ctx.fillStyle = '#f0e6d0';
    ctx.fillText(row.join('   '), 36, y);
    y += 40;
  }
  ctx.fillStyle = '#c9a227';
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('Nur für den Dienstgebrauch', 36, h - 36);
}

export default MainMenu3D;
