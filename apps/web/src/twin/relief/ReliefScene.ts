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
  Mesh,
  MeshStandardMaterial,
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
    this.outline = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({ color: OUTLINE_COLOR, depthTest: false }),
    );
    this.outline.renderOrder = 3;
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, 1.1, -0.6);
    this.scene.add(this.terrain, this.outline, new HemisphereLight(0xffffff, 0x6b7466, 1.5), sun);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    const span = Math.max(relief.sizeM[0], relief.sizeM[1]);
    this.controls.minDistance = span * 0.1;
    this.controls.maxDistance = span * 4;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.addEventListener("change", this.request);
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
    const moving = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (this.loop || this.controls.autoRotate || moving) this.request();
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
    this.placeOutline();
    this.waterChanged();
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
    const [width, depth] = this.relief.sizeM;
    const span = Math.max(width, depth);
    this.controls.target.set(0, this.y(this.relief.maxElevationM) / 2, 0);
    if (preset === "top") this.camera.position.set(0, span * 1.45, 0.01);
    else this.camera.position.set(span * 0.35, span * 0.62, span * 1.05);
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
    this.texture.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.renderer.dispose();
  }
}
