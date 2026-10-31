// Live 3D vehicles on the web map: real models drawn into the map's own WebGL context, each with its
// own way of moving. Loaded on demand for people who have the feature (three.js is big). Models come
// from public/models, exported by scripts/vehicle-sprites (index.html?export).
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MLMap } from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { PAINTS } from '@/lib/vehicles';

export type Car3D = { id: string; coord: [number, number]; heading: number; vehicle?: string | null; paint?: string | null; stale?: boolean };

type Rect = { x0: number; x1: number; y0: number; y1: number; mean: number };
type ManifestEntry = { kenney: boolean; stock?: boolean; rect?: Rect };

/** How a vehicle moves. Everything has wheels; the rest is its character. */
type Character = {
  /** slow suspension float: cycles per second, height */
  bob?: [number, number];
  /** fast engine rumble: cycles per second, strength */
  rumble?: [number, number];
  /** how far it rolls in a turn: cars away from the corner */
  lean?: number;
  /** banks into the corner instead, like a bike */
  banks?: boolean;
  /** nose lifts as it speeds up */
  squat?: number;
  flame?: string | null;
  flashers?: [string, string];
  roofGlow?: string;
  underglow?: string;
};

const CHARACTER: Record<string, Character> = {
  car: { bob: [1.1, 0.012], lean: 0.1 },
  hatch: { bob: [1.5, 0.018], lean: 0.14 },
  sport: { bob: [1.3, 0.01], lean: 0.1, squat: 0.05 },
  tuner: { bob: [1.2, 0.008], lean: 0.07, squat: 0.04, flame: '#b65cff', underglow: '#b65cff' },
  muscle: { rumble: [15, 0.012], lean: 0.12, squat: 0.1, flame: '#ff7a1a' },
  super: { bob: [1.3, 0.005], lean: 0.06, squat: 0.04, flame: '#3fd0ff', underglow: '#3fd0ff' },
  rally: { bob: [2.8, 0.05], lean: 0.2, squat: 0.06, flame: '#ffb020' },
  classic: { bob: [0.9, 0.022], lean: 0.16 },
  hotrod: { rumble: [19, 0.022], lean: 0.1, squat: 0.14, flame: '#ff5a1a' },
  wagon: { bob: [0.8, 0.028], lean: 0.17 },
  suv: { bob: [1, 0.022], lean: 0.15 },
  luxury: { bob: [0.7, 0.012], lean: 0.08 },
  van: { bob: [0.9, 0.028], lean: 0.2 },
  pickup: { bob: [1.3, 0.03], lean: 0.15 },
  jeep: { bob: [2, 0.05], lean: 0.17 },
  buggy: { bob: [3.2, 0.075], lean: 0.2, squat: 0.1 },
  truck: { bob: [0.8, 0.03], lean: 0.18, rumble: [10, 0.006] },
  flatbed: { bob: [0.9, 0.024], lean: 0.14, rumble: [10, 0.006] },
  bus: { bob: [0.7, 0.03], lean: 0.2, rumble: [9, 0.006] },
  moto: { bob: [1.6, 0.01], lean: 0.55, banks: true, squat: 0.18, flame: null },
  taxi: { bob: [1.1, 0.014], lean: 0.12, roofGlow: '#ffd23a' },
  police: { bob: [1.1, 0.01], lean: 0.1, flashers: ['#ff2a22', '#2a6bff'], squat: 0.04 },
  ambulance: { bob: [0.9, 0.024], lean: 0.16, flashers: ['#ff2a22', '#ffffff'] },
  firetruck: { bob: [0.8, 0.026], lean: 0.14, flashers: ['#ff2a22', '#ffd23a'], flame: '#3fd0ff' },
  garbage: { rumble: [11, 0.014], bob: [0.8, 0.02], lean: 0.14, flame: null },
  formula: { bob: [1.8, 0.004], lean: 0.05, squat: 0.03, flame: '#3fd0ff' },
  future: { bob: [1.2, 0.05], lean: 0.25, banks: true, flame: '#7dffea', underglow: '#7dffea' },
  kart: { rumble: [13, 0.014], lean: 0.3, flame: '#ffb020' },
  tractor: { rumble: [7, 0.03], lean: 0.07, flame: null },
};

const FAST = 6; // m/s: flames come on above about 13 mph
const FRAME_MS = 33;

/** Screen length of a vehicle, by map zoom: bigger up close, never a speck. */
function targetPixels(zoom: number): number {
  const stops: [number, number][] = [[11, 34], [14, 56], [16, 92], [18, 150], [20, 190]];
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (zoom <= stops[i][0]) {
      const [z0, p0] = stops[i - 1];
      const [z1, p1] = stops[i];
      return p0 + ((p1 - p0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

/** Same scale the 2D sprites were rendered at, so every model is roughly car-sized. */
const MODEL_LENGTH = 4.6;

const lightAttachments = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function hexOf(paint: string | null | undefined): string {
  return PAINTS.find((p) => p.value === paint)?.hex ?? PAINTS[0].hex;
}

type Instance = {
  id: string;
  key: string;
  root: THREE.Group; // placed on the map
  body: THREE.Group; // moves with the suspension
  wheels: { mesh: THREE.Object3D; axis: 'x' | 'y' }[];
  flames: THREE.Mesh[];
  flashers: { a: THREE.Mesh[]; b: THREE.Mesh[] } | null;
  roofGlow: THREE.Mesh | null;
  underglow: THREE.Mesh | null;
  character: Character;
  paintwork: THREE.Material[];
  stale: boolean;
  coord: [number, number] | null;
  heading: number;
  speed: number;
  lean: number;
  pitch: number;
  phase: number;
  spin: number;
};

export function createCarsLayer(getCars: () => Car3D[], onReady: () => void): CustomLayerInterface {
  let map: MLMap;
  let renderer: THREE.WebGLRenderer;
  let last = performance.now();
  let announced = false;
  let nextFrame: ReturnType<typeof setTimeout> | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const loader = new GLTFLoader();
  const instances = new Map<string, Instance>();
  const models = new Map<string, Promise<THREE.Group>>();
  const paintMaps = new Map<string, THREE.Texture>();
  let palette: ImageData | null = null;
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const manifest: Promise<Record<string, ManifestEntry>> = fetch('/models/manifest.json').then((r) => r.json());

  // The scene's axes are east, north, up (see flipNorth).
  const sky = new THREE.HemisphereLight(0xffffff, 0x6a6f80, 2.0);
  sky.position.set(0, 0, 1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-0.4, -0.3, 1);
  scene.add(sun);

  const model = (name: string) => {
    if (!models.has(name)) models.set(name, loader.loadAsync(`/models/${name}.glb`).then((g) => g.scene as unknown as THREE.Group));
    return models.get(name)!;
  };

  /** A copy of Kenney's shared palette with the model's body band swapped for this paint. */
  async function paintMap(name: string, paint: string, rect: Rect, source: THREE.Texture): Promise<THREE.Texture> {
    const key = `${name}:${paint}`;
    if (paintMaps.has(key)) return paintMaps.get(key)!;
    const image = source.image as CanvasImageSource & { width: number; height: number };
    if (!palette) {
      const c = document.createElement('canvas');
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      palette = ctx.getImageData(0, 0, c.width, c.height);
    }
    const out = new ImageData(new Uint8ClampedArray(palette.data), palette.width, palette.height);
    const color = new THREE.Color(hexOf(paint));
    const [tr, tg, tb] = [color.r, color.g, color.b].map((v) => new THREE.Color().setRGB(v, v, v).convertLinearToSRGB().r * 255);
    for (let y = rect.y0; y < rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = (y * out.width + x) * 4;
        const k = (0.3 * out.data[i] + 0.59 * out.data[i + 1] + 0.11 * out.data[i + 2]) / rect.mean;
        out.data[i] = tr * k;
        out.data[i + 1] = tg * k;
        out.data[i + 2] = tb * k;
      }
    }
    const c = document.createElement('canvas');
    c.width = out.width;
    c.height = out.height;
    c.getContext('2d')!.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.magFilter = source.magFilter;
    t.minFilter = source.minFilter;
    paintMaps.set(key, t);
    return t;
  }

  async function build(car: Car3D, key: string): Promise<Instance | null> {
    const entries = await manifest;
    const name = car.vehicle && entries[car.vehicle] ? car.vehicle : 'car';
    const entry = entries[name];
    const source = await model(name);
    const clone = source.clone(true);
    const accent = new THREE.Color(['yellow', 'white', 'silver'].includes(car.paint ?? '') ? '#e0431c' : '#f4f4f0');
    const wheels: Instance['wheels'] = [];
    const paintwork: THREE.Material[] = [];
    let kenneyMap: THREE.Texture | null = null;
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      // Its own copy, so fading one car doesn't fade every car of that model.
      const own = mat.clone();
      m.material = own;
      paintwork.push(own);
      if (entry.kenney) {
        if (!kenneyMap) kenneyMap = mat.map;
      } else {
        own.flatShading = true;
        if (mat.name === 'paint') own.color.set(hexOf(car.paint));
        if (mat.name === 'accent') own.color.copy(accent);
      }
      if (/wheel/.test(`${m.name} ${m.parent?.name ?? ''}`)) wheels.push({ mesh: entry.kenney ? (m.parent?.name?.includes('wheel') ? m.parent : m) : m, axis: entry.kenney ? 'x' : 'y' });
    });
    if (entry.kenney && entry.rect && !entry.stock && kenneyMap) {
      const map2 = await paintMap(name, car.paint ?? 'blue', entry.rect, kenneyMap);
      for (const mat of paintwork) (mat as THREE.MeshStandardMaterial).map = map2;
    }

    // Stand it at the origin, nose along -Z, about car-sized.
    const inner = new THREE.Group();
    inner.add(clone);
    let box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    if (entry.kenney) {
      const center = box.getCenter(new THREE.Vector3());
      clone.position.set(-center.x, -box.min.y, -center.z);
      inner.scale.setScalar(Math.min(1.75, 4.9 / size.z, 3.6 / size.x));
      inner.rotation.y = Math.PI;
    }
    inner.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(inner);

    const character = CHARACTER[name] ?? {};
    const body = new THREE.Group();
    body.add(inner);
    const root = new THREE.Group();
    root.add(body);
    root.matrixAutoUpdate = false;

    const flames: THREE.Mesh[] = [];
    const flameColor = character.flame === undefined ? '#3fd0ff' : character.flame;
    if (flameColor) {
      const material = lightAttachments(flameColor);
      const hot = lightAttachments('#ffffff');
      const w = box.max.x - box.min.x;
      for (const s of name === 'formula' || name === 'kart' ? [0] : [-1, 1]) {
        // Wide at the exhaust, to a point behind the car, with a white-hot core.
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1, 7).rotateX(Math.PI / 2).translate(0, 0, 0.5), material);
        const core = new THREE.Mesh(f.geometry, hot);
        core.scale.set(0.5, 0.5, 0.55);
        f.add(core);
        f.position.set(s * w * 0.28, Math.max(0.35, box.min.y + (box.max.y - box.min.y) * 0.22), box.max.z);
        f.visible = false;
        body.add(f);
        flames.push(f);
      }
    }

    let flashers: Instance['flashers'] = null;
    if (character.flashers) {
      flashers = { a: [], b: [] };
      const w = (box.max.x - box.min.x) * 0.28;
      for (const [s, list, color] of [[-1, flashers.a, character.flashers[0]], [1, flashers.b, character.flashers[1]]] as const) {
        const material = lightAttachments(color);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.16, 0.34), material);
        lamp.position.set(s * w * 0.55, box.max.y + 0.07, (box.min.z + box.max.z) * 0.5 - (box.max.z - box.min.z) * 0.08);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), material);
        halo.position.copy(lamp.position);
        body.add(lamp, halo);
        list.push(lamp, halo);
      }
    }

    let roofGlow: THREE.Mesh | null = null;
    if (character.roofGlow) {
      roofGlow = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), lightAttachments(character.roofGlow));
      roofGlow.position.set(0, box.max.y, (box.min.z + box.max.z) * 0.5);
      body.add(roofGlow);
    }

    let underglow: THREE.Mesh | null = null;
    if (character.underglow) {
      underglow = new THREE.Mesh(new THREE.PlaneGeometry((box.max.x - box.min.x) * 1.35, (box.max.z - box.min.z) * 1.12), lightAttachments(character.underglow));
      underglow.rotation.x = -Math.PI / 2;
      underglow.position.y = 0.04;
      root.add(underglow);
    }

    scene.add(root);
    return {
      id: car.id, key, root, body, wheels, flames, flashers, roofGlow, underglow, character, paintwork, stale: false,
      coord: null, heading: car.heading, speed: 0, lean: 0, pitch: 0, phase: Math.random() * 10, spin: 0,
    };
  }

  const pending = new Set<string>();
  function sync(cars: Car3D[]) {
    for (const car of cars) {
      const key = `${car.vehicle ?? 'car'}:${car.paint ?? ''}`;
      const have = instances.get(car.id);
      if (have?.key === key || pending.has(car.id)) continue;
      pending.add(car.id);
      void build(car, key)
        .then((inst) => {
          if (!inst) return;
          const old = instances.get(car.id);
          if (old) scene.remove(old.root);
          instances.set(car.id, inst);
          if (!announced) {
            announced = true;
            onReady();
          }
          map?.triggerRepaint();
        })
        .catch((e) => console.warn('[cars3d] could not load', car.vehicle, e))
        .finally(() => pending.delete(car.id));
    }
    for (const [id, inst] of instances) {
      if (!cars.some((c) => c.id === id)) {
        scene.remove(inst.root);
        instances.delete(id);
      }
    }
  }

  // The scene is measured from the map's center in car-sized units, with that shift and scale kept in
  // the camera: a car is about 0.0000002 of the world across, too fine for the GPU's 32-bit numbers,
  // which shreds the models if they're placed in map coordinates directly. Mercator's y also points
  // south, mirror-image to three.js; flipping it in the camera stops the wrong faces being culled.
  const toScene = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const upright = new THREE.Matrix4().makeRotationX(Math.PI / 2);

  return {
    id: 'convoy-cars-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    },
    onRemove() {
      if (nextFrame !== null) clearTimeout(nextFrame);
      for (const inst of instances.values()) scene.remove(inst.root);
      instances.clear();
      renderer?.dispose();
    },
    render(_gl, options: CustomRenderMethodInput) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const cars = getCars();
      sync(cars);
      const zoom = map.getZoom();
      const worldSize = 512 * 2 ** zoom;
      const scale = targetPixels(zoom) / MODEL_LENGTH / worldSize;
      const origin = MercatorCoordinate.fromLngLat(map.getCenter());
      const follow = 1 - Math.exp(-dt * 5);
      let busy = !reduceMotion;

      for (const car of cars) {
        const c = instances.get(car.id);
        if (!c) continue;
        // Glide to the latest fix; a big jump (a new drive, a fresh GPS lock) just moves.
        const prev = c.coord;
        let next: [number, number];
        if (!prev || Math.abs(prev[0] - car.coord[0]) + Math.abs(prev[1] - car.coord[1]) > 0.01) next = car.coord;
        else next = [prev[0] + (car.coord[0] - prev[0]) * follow, prev[1] + (car.coord[1] - prev[1]) * follow];
        const metres = prev ? Math.hypot((next[0] - prev[0]) * Math.cos((next[1] * Math.PI) / 180), next[1] - prev[1]) * 111320 : 0;
        const measured = dt > 0 && metres < 30 ? metres / dt : 0;
        const before = c.speed;
        c.speed += (measured - c.speed) * Math.min(1, dt * 3);
        c.coord = next;
        if (c.stale !== Boolean(car.stale)) {
          // Same as the sprites: a driver whose position has gone old fades out.
          c.stale = Boolean(car.stale);
          for (const mat of c.paintwork) {
            mat.transparent = c.stale;
            mat.opacity = c.stale ? 0.45 : 1;
            mat.needsUpdate = true;
          }
        }
        const delta = ((((car.heading - c.heading) % 360) + 540) % 360) - 180;
        const headingStep = delta * follow;
        c.heading += headingStep;
        const turnRate = dt > 0 ? headingStep / dt : 0; // degrees a second
        const accel = dt > 0 ? (c.speed - before) / dt : 0;

        const ch = c.character;
        const moving = c.speed > 0.8;
        const still = reduceMotion;
        // Roll with the turn, nose up under power.
        const roll = Math.max(-1, Math.min(1, turnRate / 45)) * (ch.banks ? -1 : 1);
        c.lean += (roll * (ch.lean ?? 0.1) - c.lean) * Math.min(1, dt * 5);
        c.pitch += (Math.max(-1, Math.min(1, accel / 2.5)) * (ch.squat ?? 0.02) - c.pitch) * Math.min(1, dt * 4);
        const bob = !still && ch.bob ? Math.sin((t + c.phase) * ch.bob[0] * Math.PI * 2) * ch.bob[1] * (moving ? 1.3 : 0.6) : 0;
        const rumble = !still && ch.rumble ? Math.sin((t + c.phase) * ch.rumble[0] * Math.PI * 2) * ch.rumble[1] * (moving ? 0.7 : 1) : 0;
        c.body.position.y = Math.abs(bob) * 0.5 + bob + rumble;
        c.body.rotation.z = still ? 0 : c.lean;
        c.body.rotation.x = still ? 0 : c.pitch + rumble * 0.6;

        if (c.speed > 0.05 || Math.abs(delta) > 0.5) busy = true;
        c.spin = (c.speed * dt) / 0.45;
        for (const w of c.wheels) {
          if (w.axis === 'x') w.mesh.rotateX(c.spin);
          else w.mesh.rotateY(c.spin);
        }

        for (const [i, f] of c.flames.entries()) {
          f.visible = !still && c.speed > FAST;
          if (f.visible) {
            const flicker = 0.75 + 0.35 * Math.sin(t * 38 + i * 2.1 + c.phase) + 0.2 * Math.sin(t * 61 + i);
            const power = Math.min(1.4, c.speed / 18 + 0.35);
            f.scale.set(0.9 + 0.2 * flicker, 0.9 + 0.2 * flicker, power * flicker);
          }
        }
        if (c.flashers) {
          // Two quick blinks a side, like a real light bar. Steady for people who ask for less motion.
          const phase = (t * 2.2 + c.phase) % 1;
          const left = still || (phase < 0.5 && (phase * 8) % 1 < 0.55);
          const right = still || (phase >= 0.5 && ((phase - 0.5) * 8) % 1 < 0.55);
          c.flashers.a.forEach((m) => (m.visible = left));
          c.flashers.b.forEach((m) => (m.visible = right));
        }
        if (c.roofGlow) c.roofGlow.scale.setScalar(still ? 1 : 0.85 + 0.2 * Math.sin(t * 3 + c.phase));
        if (c.underglow) (c.underglow.material as THREE.MeshBasicMaterial).opacity = still ? 0.4 : 0.32 + 0.14 * Math.sin(t * 2.4 + c.phase);

        const elevation = map.getTerrain() ? (map.queryTerrainElevation(next) ?? 0) : 0;
        const at = MercatorCoordinate.fromLngLat(next, elevation);
        place.makeTranslation((at.x - origin.x) / scale, (origin.y - at.y) / scale, at.z / scale);
        place.multiply(upright);
        place.multiply(turn.makeRotationY((-c.heading * Math.PI) / 180));
        c.root.matrix.copy(place);
        c.root.matrixWorldNeedsUpdate = true;
      }

      if (instances.size) {
        toScene.makeScale(scale, -scale, scale).setPosition(origin.x, origin.y, 0);
        camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix as unknown as number[]).multiply(toScene);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState();
        // On top of buildings, like the sprites: you never lose your own car behind one.
        renderer.clearDepth();
        renderer.render(scene, camera);
        renderer.resetState();
      }
      // Keep the animations running, at a rate that spares the battery on a long drive, and not at
      // all behind another tab.
      if (busy && instances.size && map.getCanvas().clientWidth > 0 && nextFrame === null) {
        nextFrame = setTimeout(() => {
          nextFrame = null;
          map.triggerRepaint();
        }, FRAME_MS);
      }
    },
  };
}
