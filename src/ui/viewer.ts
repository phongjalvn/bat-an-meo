import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BowlModel, PartName } from "../geometry/types";
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
  private exploded = false;
  private model: BowlModel | undefined;

  setExploded(exploded: boolean) {
    this.exploded = exploded;
    if (this.model) this.applyLayout(this.model);
  }

  private applyLayout(model: BowlModel) {
    const gap = Math.max(35, model.height * 0.5);
    for (const child of this.group.children) {
      const name = child.name;
      child.position.set(0, this.exploded && name !== "base" ? gap * (name === "insert" ? 2 : 1) : 0, 0);
      if (this.exploded && name === "text") child.position.z = model.depth * 0.4;
    }
    this.dimGroup.visible = !this.exploded;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15181e);
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    this.camera.position.set(200, 175, 280);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 70, 0);

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
    const h = (model?.height ?? 110) + (this.exploded ? Math.max(35, (model?.height ?? 110) * 0.5) * 2 : 0);
    const w = model?.width ?? 130;
    if (view === "front") this.camera.position.set(0, h * 0.48, Math.max(w, h) * 2.05);
    else if (view === "top") this.camera.position.set(0, Math.max(w, h) * 2.4, 0.01);
    else if (view === "side") this.camera.position.set(Math.max(w, h) * 2.05, h * 0.48, 0);
    else this.camera.position.set(w * 0.78, h * 1.15, w * 2.6);
    this.controls.target.set(0, h * 0.42, 0);
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
    this.model = model;
    for (const part of model.parts) {
      const raw = toGeometry(part.mesh.positions, part.mesh.indices);
      const geom = toCreasedNormals(raw, Math.PI / 5);
      raw.dispose();
      const color = colorOf(part.name);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: part.name === "base" ? 0.78 : part.name === "body" ? 0.64 : 0.36,
        metalness: part.name === "text" ? 0.06 : 0.02,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = part.name;
      this.group.add(mesh);
    }
    if (model.insert) {
      const geom = toGeometry(model.insert.positions, model.insert.indices);
      geom.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: PART_COLORS.insert,
        metalness: 0.55,
        roughness: 0.28,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = "insert";
      this.group.add(mesh);
    }
    const plateScale = Math.max(1, model.width / 220);
    this.plate.scale.set(plateScale, plateScale, 1);
    this.drawDimensions(model);
    this.applyLayout(model);
    this.controls.target.set(0, model.height * 0.38, 0);
  }

  private drawDimensions(model: BowlModel) {
    const w = model.width;
    const d = model.depth;
    const h = model.height;
    const y0 = 0;
    const insertR = model.insertRimMm / 2;
    const rimY = Math.max(18, h - 8);

    addLine(this.dimGroup, [-w / 2, y0, -d / 2 - 8], [w / 2, y0, -d / 2 - 8]);
    addLabel(this.dimGroup, `${w.toFixed(0)} mm`, 0, 6, -d / 2 - 14);

    addLine(this.dimGroup, [w / 2 + 8, y0, -d / 2], [w / 2 + 8, y0, d / 2]);
    addLabel(this.dimGroup, `${d.toFixed(0)} mm`, w / 2 + 18, 6, 0);

    addLine(this.dimGroup, [-w / 2 - 10, y0, 0], [-w / 2 - 10, h, 0]);
    addLabel(this.dimGroup, `${h.toFixed(0)} mm`, -w / 2 - 22, h * 0.5, 0);

    addLine(this.dimGroup, [-insertR, rimY, 0], [insertR, rimY, 0]);
    addLabel(this.dimGroup, `Ø ${model.insertRimMm.toFixed(0)} mm`, 0, rimY + 8, 0);
    addLabel(this.dimGroup, `h ${model.insertHeightMm.toFixed(0)} mm`, insertR + 16, rimY - model.insertHeightMm * 0.4, 0);

    if (model.tiltDeg > 0.05) {
      addLabel(this.dimGroup, `${model.tiltDeg.toFixed(0)}°`, w * 0.28, h * 0.78, d * 0.18);
    }
    addLabel(this.dimGroup, `Ø ${model.trayDiameter.toFixed(0)} mm`, 0, 8, d / 2 + 18);
    if (model.moatEnabled) {
      addLabel(
        this.dimGroup,
        `${model.moatWidth.toFixed(1)}×${model.moatDepth.toFixed(0)} · gap ${model.moatGap.toFixed(1)} mm`,
        0,
        18,
        d / 2 + 28,
      );
    }
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

function colorOf(name: PartName): string {
  return PART_COLORS[name] ?? PART_COLORS.body;
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

function addLabel(group: THREE.Group, text: string, x: number, y: number, z: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 28px IBM Plex Sans, Be Vietnam Pro, sans-serif";
  ctx.fillStyle = "#d7dde6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.position.set(x, y, z);
  spr.scale.set(42, 10.5, 1);
  group.add(spr);
}
