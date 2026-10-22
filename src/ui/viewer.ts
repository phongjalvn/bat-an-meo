import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BowlModel } from "../geometry/types";
import { PART_COLORS } from "../geometry/types";

export type CameraView = "3d" | "front" | "top" | "side";

export class BowlViewer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private plate: THREE.Mesh;
  private dimGroup = new THREE.Group();
  private frame = 0;
  showPlate = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15181e);
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
    this.camera.position.set(220, 160, 260);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 50, 0);

    const hemi = new THREE.HemisphereLight(0xf3efe6, 0x2a2620, 0.9);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(180, 260, 120);
    const fill = new THREE.DirectionalLight(0xcdd6e2, 0.55);
    fill.position.set(-160, 80, -80);
    const rim = new THREE.DirectionalLight(0xfff2d8, 0.35);
    rim.position.set(40, 40, -200);
    this.scene.add(hemi, key, fill, rim, this.group, this.dimGroup);

    const plateGeom = new THREE.CircleGeometry(160, 72);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x2b3038,
      roughness: 0.92,
      metalness: 0.05,
    });
    this.plate = new THREE.Mesh(plateGeom, plateMat);
    this.plate.rotation.x = -Math.PI / 2;
    this.plate.position.y = -0.2;
    this.scene.add(this.plate);

    const grid = new THREE.GridHelper(320, 16, 0x3a414c, 0x2a3038);
    grid.position.y = 0.02;
    this.scene.add(grid);

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.tick();
  }

  setPlateVisible(visible: boolean) {
    this.showPlate = visible;
    this.plate.visible = visible;
  }

  setView(view: CameraView, model?: BowlModel) {
    const h = model?.height ?? 110;
    const w = model?.width ?? 130;
    if (view === "front") this.camera.position.set(0, h * 0.55, Math.max(w, h) * 2.2);
    else if (view === "top") this.camera.position.set(0, Math.max(w, h) * 2.4, 0.01);
    else if (view === "side") this.camera.position.set(Math.max(w, h) * 2.2, h * 0.55, 0);
    else this.camera.position.set(w * 1.4, h * 1.25, w * 1.7);
    this.controls.target.set(0, h * 0.45, 0);
    this.controls.update();
  }

  zoom(delta: number) {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    dir.multiplyScalar(delta > 0 ? 0.86 : 1.16);
    this.camera.position.copy(this.controls.target).add(dir);
  }

  setModel(model: BowlModel) {
    this.group.clear();
    this.dimGroup.clear();
    const lift = -0;
    for (const part of model.parts) {
      const geom = toGeometry(part.mesh.positions, part.mesh.indices);
      geom.computeVertexNormals();
      const color = part.name === "body" ? PART_COLORS.body : part.name === "base" ? PART_COLORS.base : PART_COLORS.text;
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: part.name === "base" ? 0.72 : 0.38,
        metalness: part.name === "text" ? 0.08 : 0.02,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = lift;
      this.group.add(mesh);
    }
    if (model.insert) {
      const geom = toGeometry(model.insert.positions, model.insert.indices);
      geom.computeVertexNormals();
      const mat = new THREE.MeshPhysicalMaterial({
        color: PART_COLORS.insert,
        metalness: 0.92,
        roughness: 0.22,
        clearcoat: 0.35,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      this.group.add(mesh);
    }
    this.drawDimensions(model);
    this.controls.target.set(0, model.height * 0.42, 0);
  }

  private drawDimensions(model: BowlModel) {
    const w = model.width;
    const d = model.depth;
    const h = model.height;
    const y0 = 0;
    addLine(this.dimGroup, [-w / 2, y0, -d / 2 - 8], [w / 2, y0, -d / 2 - 8]);
    addLine(this.dimGroup, [w / 2 + 8, y0, -d / 2], [w / 2 + 8, y0, d / 2]);
    addLine(this.dimGroup, [-w / 2 - 10, y0, 0], [-w / 2 - 10, h, 0]);
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.renderer.dispose();
  }
}

function toGeometry(positions: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  return geom;
}

function addLine(group: THREE.Group, a: number[], b: number[]) {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(a[0], a[1], a[2]),
    new THREE.Vector3(b[0], b[1], b[2]),
  ]);
  group.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0x8b93a1 })));
}
