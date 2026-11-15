import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { type Relief, sampleHeight, toUV } from "./reliefData";
import type { Water } from "./water";

/** Most vertices along one side of the terrain mesh. */
const MAX_MESH_SIDE = 512;
/** Water thinner than this is not drawn; at this depth and above it is at full strength. */
const WATER_MIN_M = 0.0005;
const WATER_FULL_M = 0.03;
const WATER_COLOR = "#2f7fe0";
const OUTLINE_COLOR = "#ffd23f";
/**
 * The soil block under the surface: bands by depth below the ground, in real metres. The depth is
 * drawn stretched (`SOIL_STRETCH` of the field's longer side per metre) so a 40 cm topsoil layer is
 * visible next to a whole field. A drawing aid, not a survey.
 */
const SOIL_BANDS: readonly { toM: number; color: string }[] = [
  { toM: 0.4, color: "#3a281a" }, // topsoil, the top 40 cm
  { toM: 1.5, color: "#6d4a2b" }, // subsoil
  { toM: 3, color: "#a07b4d" }, // clay and loam
  { toM: 6, color: "#8a8173" }, // weathered rock
  { toM: Number.POSITIVE_INFINITY, color: "#5d5953" }, // bedrock
];
const SOIL_STRETCH = 0.03;
/** Soaking of a typical loam: cumulative intake F = S * sqrt(t) + Ks * t while water stands on it. */
const SORPTIVITY = 1.94e-4; // m per sqrt(second)
const CONDUCTIVITY = 2.8e-6; // m per second (10 mm/h)
/** Share of the soil's volume that rain can fill, so the wet front goes to F / this. */
const FILLABLE = 0.25;
const WET_BLEND = 0.55;
const WET_TINT = new Color("#1f3550");
const RAIN_DROPS = 6000;
const RAIN_COLOR = 0xc6dcff;
/** How far the block reaches below the lowest ground, as a share of the field's longer side. */
const BLOCK_DEPTH_SHARE = 0.07;

export type ViewPreset = "tilt" | "top";

/**
 * One field as a single mesh: the height grid lifted into 3D, wearing one canvas texture, with an
 * optional sheet of water on top. It draws a frame only when something changed.
 */
export class ReliefScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 1, 20000);
  private readonly controls: OrbitControls;
  private readonly terrain: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly texture: CanvasTexture;
  private readonly outline: Line<BufferGeometry, LineBasicMaterial>;
  private readonly soil: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly rainLines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly dropX = new Float32Array(RAIN_DROPS);
  private readonly dropZ = new Float32Array(RAIN_DROPS);
  private readonly dropY = new Float32Array(RAIN_DROPS);
  private rainStrength = 0;
  /** Seconds the water has stood on each cell of the water grid (kept for the edge cells only). */
  private soaked: Float32Array | null = null;
  private soilBuiltAt = 0;
  private readonly cols: number;
  private readonly rows: number;
  private rings: [number, number][][] = [];
  private exaggeration = 3;
  private waterMesh: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null;
  private water: Water | null = null;
  private waterGround: Float32Array | null = null;
  private loop: ((seconds: number) => void) | null = null;
  private frame = 0;
  private last = 0;
  private disposed = false;
  private preset: ViewPreset = "tilt";
  private touched = false;
  private readonly onLost: (event: Event) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly relief: Relief,
    private readonly heights: Float32Array,
    drape: HTMLCanvasElement,
    onFailure: () => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.onLost = (event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);

    const step = Math.max(1, Math.ceil(Math.max(relief.width, relief.height) / MAX_MESH_SIDE));
    this.cols = Math.max(2, Math.ceil(relief.width / step));
    this.rows = Math.max(2, Math.ceil(relief.height / step));
    const geometry = new PlaneGeometry(
      relief.sizeM[0],
      relief.sizeM[1],
      this.cols - 1,
      this.rows - 1,
    );
    geometry.rotateX(-Math.PI / 2);
    this.texture = new CanvasTexture(drape);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.terrain = new Mesh(
      geometry,
      new MeshStandardMaterial({ map: this.texture, roughness: 1, metalness: 0 }),
    );
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.soil = new Mesh(
      new BufferGeometry(),
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        side: DoubleSide,
      }),
    );
    this.soil.receiveShadow = true;
    const dropPositions = new Float32Array(RAIN_DROPS * 6);
    const rainGeometry = new BufferGeometry();
    rainGeometry.setAttribute("position", new BufferAttribute(dropPositions, 3));
    this.rainLines = new LineSegments(
      rainGeometry,
      new LineBasicMaterial({
        color: RAIN_COLOR,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.rainLines.renderOrder = 4;
    this.outline = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({ color: OUTLINE_COLOR, depthTest: false }),
    );
    this.outline.renderOrder = 3;
    const sun = new DirectionalLight(0xfff1d6, 2.2);
    const reach = Math.max(relief.sizeM[0], relief.sizeM[1]);
    sun.position.set(-reach * 0.7, reach * 0.8, -reach * 0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -reach;
    sun.shadow.camera.right = reach;
    sun.shadow.camera.top = reach;
    sun.shadow.camera.bottom = -reach;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = reach * 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.4;
    this.scene.add(
      this.terrain,
      this.soil,
      this.rainLines,
      this.outline,
      new HemisphereLight(0xdbe8ff, 0x4a3d30, 1.1),
      sun,
    );

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    const span = Math.max(relief.sizeM[0], relief.sizeM[1]);
    this.controls.minDistance = span * 0.1;
    this.controls.maxDistance = span * 4;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.addEventListener("change", this.request);
    this.controls.addEventListener("start", () => {
      this.touched = true;
    });
    this.lift();
    this.setView("tilt");
  }

  private readonly request = (): void => {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(this.draw);
  };

  private readonly draw = (now: number): void => {
    this.frame = 0;
    if (this.disposed) return;
    const seconds = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.loop?.(seconds);
    this.fall(seconds);
    const moving = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.loop || this.rainStrength > 0 || this.controls.autoRotate || moving) this.request();
    else this.last = 0;
  };

  private y(heightM: number): number {
    return (heightM - this.relief.minElevationM) * this.exaggeration;
  }

  /** Moves every vertex, the outline and the water to the current exaggeration. */
  private lift(): void {
    const position = this.terrain.geometry.attributes.position as BufferAttribute;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const height = sampleHeight(
          this.relief,
          this.heights,
          col / (this.cols - 1),
          row / (this.rows - 1),
        );
        position.setY(row * this.cols + col, this.y(height));
      }
    }
    position.needsUpdate = true;
    this.terrain.geometry.computeVertexNormals();
    this.buildSoil();
    this.placeOutline();
    this.waterChanged();
  }

  /** Depth in metres that rain has soaked into the ground under the water-grid cell at (u, v). */
  private frontM(u: number, v: number): number {
    const { water, soaked } = this;
    if (!water || !soaked) return 0;
    const col = Math.round(Math.min(1, Math.max(0, u)) * (water.width - 1));
    const row = Math.round(Math.min(1, Math.max(0, v)) * (water.height - 1));
    const seconds = soaked[row * water.width + col] as number;
    return (SORPTIVITY * Math.sqrt(seconds) + CONDUCTIVITY * seconds) / FILLABLE;
  }

  /** Advances the soaking of the walls by `seconds` of model time and shows it. */
  soak(seconds: number): void {
    const { water } = this;
    if (!water) return;
    const { width, height } = water;
    this.soaked ??= new Float32Array(width * height);
    const soaked = this.soaked;
    const wetCell = (i: number) => {
      if ((water.depth[i] as number) >= WATER_MIN_M) soaked[i] = (soaked[i] as number) + seconds;
    };
    for (let col = 0; col < width; col++) {
      wetCell(col);
      wetCell((height - 1) * width + col);
    }
    for (let row = 1; row < height - 1; row++) {
      wetCell(row * width);
      wetCell(row * width + width - 1);
    }
    const now = performance.now();
    if (now - this.soilBuiltAt > 120) {
      this.soilBuiltAt = now;
      this.buildSoil();
    }
  }

  /** Dries the walls again. */
  clearSoak(): void {
    this.soaked = null;
    this.buildSoil();
    this.request();
  }

  /** Falling rain above the field: `mmPerHour` sets how many drops; 0 hides it. */
  setRain(mmPerHour: number): void {
    const strength = mmPerHour <= 0 ? 0 : Math.min(1, 0.15 + mmPerHour / 80);
    if (strength === this.rainStrength) return;
    const starting = this.rainStrength === 0;
    this.rainStrength = strength;
    this.rainLines.visible = strength > 0;
    this.rainLines.geometry.setDrawRange(0, Math.round(strength * RAIN_DROPS) * 2);
    if (starting && strength > 0) {
      const [width, depth] = this.relief.sizeM;
      const top = this.cloudHeight();
      for (let i = 0; i < RAIN_DROPS; i++) {
        this.dropX[i] = (Math.random() - 0.5) * width;
        this.dropZ[i] = (Math.random() - 0.5) * depth;
        this.dropY[i] = Math.random() * top;
      }
    }
    this.request();
  }

  private cloudHeight(): number {
    return this.y(this.relief.maxElevationM) + Math.max(...this.relief.sizeM) * 0.3;
  }

  /** Moves the drops down; one that reaches the ground starts again at the top. */
  private fall(seconds: number): void {
    if (this.rainStrength === 0) return;
    const [width, depth] = this.relief.sizeM;
    const span = Math.max(width, depth);
    const top = this.cloudHeight();
    const speed = span * 0.55;
    const streak = span * 0.035;
    const position = this.rainLines.geometry.attributes.position as BufferAttribute;
    const count = Math.round(this.rainStrength * RAIN_DROPS);
    for (let i = 0; i < count; i++) {
      let y = (this.dropY[i] as number) - speed * seconds;
      const x = this.dropX[i] as number;
      const z = this.dropZ[i] as number;
      const ground = this.y(
        sampleHeight(this.relief, this.heights, x / width + 0.5, z / depth + 0.5),
      );
      if (y < ground) {
        y = top - Math.random() * span * 0.05;
        this.dropX[i] = (Math.random() - 0.5) * width;
        this.dropZ[i] = (Math.random() - 0.5) * depth;
      }
      this.dropY[i] = y;
      const px = this.dropX[i] as number;
      const pz = this.dropZ[i] as number;
      position.setXYZ(i * 2, px, y, pz);
      position.setXYZ(i * 2 + 1, px, y + streak, pz);
    }
    position.needsUpdate = true;
  }

  /** Four walls of banded soil from the ground edge down to a flat base, so the field reads as a slab. */
  private buildSoil(): void {
    const [width, depth] = this.relief.sizeM;
    const base = -Math.max(width, depth) * BLOCK_DEPTH_SHARE;
    const perMetre = Math.max(width, depth) * SOIL_STRETCH;
    const positions: number[] = [];
    const colors: number[] = [];
    const tint = new Color();
    const edges: {
      count: number;
      at: (i: number) => [x: number, z: number, u: number, v: number];
    }[] = [
      {
        count: this.cols,
        at: (i) => [(i / (this.cols - 1) - 0.5) * width, -depth / 2, i / (this.cols - 1), 0],
      },
      {
        count: this.cols,
        at: (i) => [(i / (this.cols - 1) - 0.5) * width, depth / 2, i / (this.cols - 1), 1],
      },
      {
        count: this.rows,
        at: (i) => [-width / 2, (i / (this.rows - 1) - 0.5) * depth, 0, i / (this.rows - 1)],
      },
      {
        count: this.rows,
        at: (i) => [width / 2, (i / (this.rows - 1) - 0.5) * depth, 1, i / (this.rows - 1)],
      },
    ];
    const quad = (a: number[], b: number[], c: number[], d: number[], color: Color) => {
      for (const v of [a, b, c, a, c, d]) {
        positions.push(v[0] as number, v[1] as number, v[2] as number);
        colors.push(color.r, color.g, color.b);
      }
    };
    const wet = new Color();
    for (const edge of edges) {
      for (let i = 0; i < edge.count - 1; i++) {
        const [x0, z0, u0, v0] = edge.at(i);
        const [x1, z1, u1, v1] = edge.at(i + 1);
        const top0 = this.y(sampleHeight(this.relief, this.heights, u0, v0));
        const top1 = this.y(sampleHeight(this.relief, this.heights, u1, v1));
        // How deep the rain has soaked in at this stretch of wall, in real metres.
        const front = (this.frontM(u0, v0) + this.frontM(u1, v1)) / 2;
        const stops = [...new Set([0, ...SOIL_BANDS.map((b) => b.toM), front])]
          .filter((m) => Number.isFinite(m))
          .sort((p, q) => p - q);
        for (let k = 0; k < stops.length; k++) {
          const from = stops[k] as number;
          const to = (stops[k + 1] as number | undefined) ?? Number.POSITIVE_INFINITY;
          const band = SOIL_BANDS.find((b) => from < b.toM) ?? SOIL_BANDS[SOIL_BANDS.length - 1];
          const upper = (top: number) => top - from * perMetre;
          const lower = (top: number) => Math.max(base, top - to * perMetre);
          if (upper(top0) <= base && upper(top1) <= base) break;
          const color = tint.set(band?.color ?? "#5d5953");
          if (from < front) color.lerp(wet.copy(WET_TINT), WET_BLEND);
          quad(
            [x0, upper(top0), z0],
            [x1, upper(top1), z1],
            [x1, lower(top1), z1],
            [x0, lower(top0), z0],
            color,
          );
        }
      }
    }
    this.soil.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
    geometry.computeVertexNormals();
    this.soil.geometry = geometry;
  }

  private placeOutline(): void {
    const points: Vector3[] = [];
    for (const ring of this.rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [fromLon, fromLat] = ring[i] as [number, number];
        const [toLon, toLat] = ring[i + 1] as [number, number];
        // Follow the ground between corners so the line never cuts through a rise.
        for (let k = 0; k <= 24; k++) {
          const [u, v] = toUV(
            this.relief,
            fromLon + ((toLon - fromLon) * k) / 24,
            fromLat + ((toLat - fromLat) * k) / 24,
          );
          points.push(
            new Vector3(
              (u - 0.5) * this.relief.sizeM[0],
              this.y(sampleHeight(this.relief, this.heights, u, v)) + 0.5,
              (v - 0.5) * this.relief.sizeM[1],
            ),
          );
        }
      }
    }
    this.outline.geometry.dispose();
    this.outline.geometry = new BufferGeometry().setFromPoints(points);
  }

  setBackground(color: string): void {
    this.scene.background = new Color(color);
    this.request();
  }

  setExaggeration(value: number): void {
    this.exaggeration = value;
    this.lift();
    this.controls.target.setY(this.y(this.relief.maxElevationM) / 2);
    this.request();
  }

  /** Call after painting the drape canvas. */
  drapeChanged(): void {
    this.texture.needsUpdate = true;
    this.request();
  }

  setOutline(rings: [number, number][][]): void {
    this.rings = rings;
    this.placeOutline();
    this.request();
  }

  setView(preset: ViewPreset): void {
    this.preset = preset;
    this.touched = false;
    const [width, depth] = this.relief.sizeM;
    const span = Math.max(width, depth);
    this.controls.target.set(0, this.y(this.relief.maxElevationM) / 2, 0);
    // A narrow view needs the camera further back to keep the whole surface in frame.
    const back = Math.max(1, 1.9 / this.camera.aspect);
    if (preset === "top") this.camera.position.set(0, span * 1.45 * back, 0.01);
    else this.camera.position.set(span * 0.3 * back, span * 0.78 * back, span * 0.9 * back);
    this.camera.near = span / 500;
    this.camera.far = span * 12;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.request();
  }

  setOrbit(on: boolean): void {
    this.controls.autoRotate = on;
    this.request();
  }

  /** `tick` runs before every frame while set (the rain model); null stops the continuous frames. */
  setLoop(tick: ((seconds: number) => void) | null): void {
    this.loop = tick;
    this.request();
  }

  /** Shows a sheet of water over the ground it was computed on; null removes it. */
  setWater(water: Water | null, ground: Float32Array | null): void {
    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh.material.dispose();
      this.waterMesh = null;
    }
    this.water = water;
    this.waterGround = ground;
    if (!water) this.soaked = null;
    if (water && ground) {
      const geometry = new PlaneGeometry(
        this.relief.sizeM[0],
        this.relief.sizeM[1],
        water.width - 1,
        water.height - 1,
      );
      geometry.rotateX(-Math.PI / 2);
      const colors = new Float32Array(water.width * water.height * 4);
      const tint = new Color(WATER_COLOR);
      for (let i = 0; i < water.width * water.height; i++) {
        colors[i * 4] = tint.r;
        colors[i * 4 + 1] = tint.g;
        colors[i * 4 + 2] = tint.b;
      }
      geometry.setAttribute("color", new BufferAttribute(colors, 4));
      this.waterMesh = new Mesh(
        geometry,
        new MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          roughness: 0.25,
          metalness: 0,
          side: DoubleSide,
        }),
      );
      this.waterMesh.renderOrder = 2;
      this.scene.add(this.waterMesh);
      this.waterChanged();
    }
    this.request();
  }

  /** Re-reads the water depths into the sheet. */
  waterChanged(): void {
    const { water, waterGround: ground, waterMesh: mesh } = this;
    if (!water || !ground || !mesh) return;
    const position = mesh.geometry.attributes.position as BufferAttribute;
    const color = mesh.geometry.attributes.color as BufferAttribute;
    for (let i = 0; i < water.depth.length; i++) {
      const depth = water.depth[i] as number;
      // The sheet sits a hand above the ground so thin water is not lost in the mesh below it.
      position.setY(i, this.y((ground[i] as number) + depth) + 0.15);
      const strength =
        depth < WATER_MIN_M ? 0 : Math.min(1, Math.sqrt((depth - WATER_MIN_M) / WATER_FULL_M));
      color.setW(i, strength * 0.85);
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.request();
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Until the person moves the camera, keep the chosen view framed for the new shape.
    if (!this.touched) this.setView(this.preset);
    this.request();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.controls.dispose();
    this.setWater(null, null);
    this.terrain.geometry.dispose();
    this.terrain.material.dispose();
    this.soil.geometry.dispose();
    this.soil.material.dispose();
    this.rainLines.geometry.dispose();
    this.rainLines.material.dispose();
    this.texture.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.renderer.dispose();
  }
}
