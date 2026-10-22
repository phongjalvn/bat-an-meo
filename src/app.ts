import type { Font } from "opentype.js";
import { DEFAULT_PARAMS, MATERIALS, PARAM_LIMITS, type BowlParams, type Locale } from "./geometry/types";
import { buildBowl, estimateMassGrams, initEngine } from "./geometry/engine";
import type { BowlModel } from "./geometry/types";
import { t, type StringKey } from "./i18n/strings";
import { PRESETS } from "./presets";
import { createProject, loadActiveId, loadProjects, saveProjects, setActiveId, type SavedProject } from "./persist";
import { BowlViewer, type CameraView } from "./ui/viewer";
import { exportFileStem, modelToBinaryStl } from "./export/stl";
import { buildThreeMf, type ThreeMfTarget } from "./export/threemf";
import { loadAppFont } from "./font";

const SIZE_KEYS = ["bodyDiameter", "height", "innerDepth", "rimRadius", "tiltDeg"] as const;
const STRUCT_KEYS = ["wallThickness", "bottomThickness", "mouthShrink", "footHeight"] as const;

export class App {
  private locale: Locale = "vi";
  private params: BowlParams = { ...DEFAULT_PARAMS };
  private model: BowlModel | null = null;
  private font: Font | null = null;
  private viewer: BowlViewer | null = null;
  private material = MATERIALS[0];
  private saved = true;
  private projectName = t("vi", "defaultProject");
  private projects: SavedProject[] = [];
  private activeId: string | null = null;
  private rebuildTimer = 0;
  private leftTab: "design" | "presets" = "design";
  private open: Record<string, boolean> = { size: true, structure: true, personalize: true, texture: true };

  async start() {
    this.projects = typeof localStorage !== "undefined" ? loadProjects() : [];
    this.activeId = typeof localStorage !== "undefined" ? loadActiveId() : null;
    const current = this.projects.find((p) => p.id === this.activeId);
    if (current) {
      this.params = { ...current.params };
      this.projectName = current.name;
    }
    this.render();
    await initEngine();
    try {
      this.font = await loadAppFont();
    } catch (error) {
      console.warn("Font load failed; text will be skipped", error);
    }
    await this.rebuild();
  }

  private render() {
    const root = document.querySelector("#app");
    if (!root) return;
    root.innerHTML = this.markup();
    this.bind();
    const canvas = root.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      this.viewer?.dispose();
      this.viewer = new BowlViewer(canvas);
      if (this.model) this.viewer.setModel(this.model);
    }
    this.syncInfo();
  }

  private markup(): string {
    const L = (key: StringKey) => t(this.locale, key);
    return `
      <div class="app">
        <header class="topbar">
          <div class="brand">
            <div class="logo">▣</div>
            <div>
              <strong>${L("brand")}</strong>
              <span>${L("studio")}</span>
            </div>
          </div>
          <div class="project-meta">
            <input id="project-name" value="${escapeHtml(this.projectName)}" />
            <div class="saved">${this.saved ? "✓ " + L("savedLocally") : L("unsaved")}</div>
          </div>
          <div class="actions">
            <button class="btn" id="lang">${L("language")}</button>
            <button class="btn" id="projects">${L("projects")}</button>
            <button class="btn" id="save">${L("save")}</button>
            <button class="btn-primary" id="export">${L("export")}</button>
          </div>
        </header>
        <div class="workspace">
          <aside class="panel left">${this.leftPanel()}</aside>
          <section class="viewport">
            <div class="view-copy">
              <h2>${L("viewportTitle")}</h2>
              <p>${L("viewportSub")}</p>
            </div>
            <div class="view-switch">
              ${(["3d", "front", "top", "side"] as CameraView[]).map((v) => `<button data-view="${v}">${L(viewKey(v))}</button>`).join("")}
            </div>
            <div class="zoom">
              <button id="zoom-in">+</button>
              <button id="zoom-out">−</button>
            </div>
            <button class="plate-toggle" id="plate">${L("refPlate")}</button>
            <div class="busy" id="busy" hidden>${L("generating")}</div>
            <canvas></canvas>
          </section>
          <aside class="panel right">${this.rightPanel()}</aside>
        </div>
        <div class="menu" id="export-menu" hidden>
          <button data-export="stl">${L("exportStl")}</button>
          <button data-export="bambu">${L("exportBambu")}</button>
          <button data-export="u1">${L("exportU1")}</button>
        </div>
        <div class="drawer" id="project-drawer" hidden>${this.projectList()}</div>
      </div>
    `;
  }

  private leftPanel(): string {
    const L = (key: StringKey) => t(this.locale, key);
    return `
      <div class="tabs">
        <button class="tab ${this.leftTab === "design" ? "active" : ""}" data-tab="design">${L("design")}</button>
        <button class="tab ${this.leftTab === "presets" ? "active" : ""}" data-tab="presets">${L("presets")}</button>
      </div>
      ${this.leftTab === "presets" ? this.presetsPanel() : this.designPanel()}
    `;
  }

  private designPanel(): string {
    const L = (key: StringKey) => t(this.locale, key);
    return `
      ${section("size", L("size"), this.open.size, SIZE_KEYS.map((key) => this.slider(key, L(labelFor(key)))).join("") + this.toggle("doubleBowl", L("doubleBowl")))}
      ${section("structure", L("structure"), this.open.structure, STRUCT_KEYS.map((key) => this.slider(key, L(labelFor(key)))).join("") + this.toggle("antiSlipGroove", L("antiSlip")))}
      ${section("personalize", L("personalize"), this.open.personalize, `
        <div class="field">
          <label>${L("bodyText")}</label>
          <input class="text-input" id="text" maxlength="24" value="${escapeHtml(this.params.text)}" />
          <div class="hint">${L("vietnameseHint")}</div>
        </div>
        ${this.slider("fontSize", L("fontSize"))}
        ${this.slider("embossDepth", L("embossDepth"))}
      `)}
      ${section("texture", L("baseTexture"), this.open.texture, `
        <div class="pills">
          ${(["smooth", "ribs", "twist"] as const).map((id) => `<button class="pill ${this.params.baseTexture === id ? "active" : ""}" data-tex="${id}">${L(id)}</button>`).join("")}
        </div>
        ${this.slider("ribCount", L("ribCount"))}
      `)}
    `;
  }

  private presetsPanel(): string {
    const L = (key: StringKey) => t(this.locale, key);
    const names = { "small-cat": L("smallCat"), "medium-dog": L("mediumDog"), "large-dog": L("largeDog") };
    return PRESETS.map((preset) => `
      <button class="preset" data-preset="${preset.id}">
        <strong>${names[preset.id]}</strong>
        <span>${preset.params.bodyDiameter} × ${preset.params.height} mm</span>
      </button>
    `).join("");
  }

  private rightPanel(): string {
    const L = (key: StringKey) => t(this.locale, key);
    return `
      <h2>${L("info")}</h2>
      <div class="dims" id="dims"></div>
      <div class="badge" id="seal"></div>
      <div class="legend">
        <div><i style="background:#F7F1E3"></i>${L("partBody")}</div>
        <div><i style="background:#C4A574"></i>${L("partBase")}</div>
        <div><i style="background:#6B4423"></i>${L("partText")}</div>
      </div>
      <div id="tris"></div>
      <label>${L("material")}</label>
      <select id="material">
        ${MATERIALS.map((m) => `<option value="${m.id}" ${m.id === this.material.id ? "selected" : ""}>${m.id.toUpperCase()} · ${m.density.toFixed(2)} g/cm³</option>`).join("")}
      </select>
      <div class="mass" id="mass"></div>
      <div id="capacity"></div>
    `;
  }

  private slider(key: keyof typeof PARAM_LIMITS, label: string): string {
    const lim = PARAM_LIMITS[key];
    const value = this.params[key] as number;
    const unit = key === "ribCount" || key === "tiltDeg" ? (key === "tiltDeg" ? "°" : "") : "mm";
    return `
      <div class="field">
        <label>${label}</label>
        <div class="row">
          <input type="range" data-param="${key}" min="${lim.min}" max="${lim.max}" step="${lim.step}" value="${value}" />
          <div class="num">
            <input type="number" data-param="${key}" min="${lim.min}" max="${lim.max}" step="${lim.step}" value="${value}" />
            <span>${unit}</span>
          </div>
        </div>
      </div>
    `;
  }

  private toggle(key: "doubleBowl" | "antiSlipGroove", label: string): string {
    return `<label class="check">${label}<input type="checkbox" data-toggle="${key}" ${this.params[key] ? "checked" : ""} /></label>`;
  }

  private projectList(): string {
    const L = (key: StringKey) => t(this.locale, key);
    return `
      <button class="btn" id="new-project">${L("newProject")}</button>
      ${this.projects.map((p) => `
        <div class="project-row">
          <button data-open="${p.id}">${escapeHtml(p.name)}</button>
          <button data-del="${p.id}">${L("deleteProject")}</button>
        </div>
      `).join("")}
    `;
  }

  private bind() {
    const q = (sel: string) => document.querySelector(sel);
    q("#lang")?.addEventListener("click", () => {
      this.locale = this.locale === "vi" ? "en" : "vi";
      this.render();
    });
    q("#save")?.addEventListener("click", () => this.save());
    q("#projects")?.addEventListener("click", () => toggle("#project-drawer"));
    q("#export")?.addEventListener("click", () => toggle("#export-menu"));
    q("#export-menu")?.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-export]");
      if (!(btn instanceof HTMLElement)) return;
      void this.exportNow(btn.dataset.export as "stl" | "bambu" | "u1");
      hide("#export-menu");
    });
    q("#new-project")?.addEventListener("click", () => {
      this.params = { ...DEFAULT_PARAMS };
      this.projectName = t(this.locale, "defaultProject");
      this.activeId = null;
      this.saved = false;
      this.render();
      void this.rebuild();
    });
    document.querySelectorAll("[data-open]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.open;
        const found = this.projects.find((p) => p.id === id);
        if (!found) return;
        this.activeId = found.id;
        this.params = { ...found.params };
        this.projectName = found.name;
        this.saved = true;
        setActiveId(found.id);
        this.render();
        void this.rebuild();
      });
    });
    document.querySelectorAll("[data-del]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.del;
        this.projects = this.projects.filter((p) => p.id !== id);
        saveProjects(this.projects);
        this.render();
      });
    });
    q("#project-name")?.addEventListener("input", (event) => {
      this.projectName = (event.target as HTMLInputElement).value;
      this.saved = false;
    });
    document.querySelectorAll("[data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        this.leftTab = (el as HTMLElement).dataset.tab as "design" | "presets";
        this.render();
      });
    });
    document.querySelectorAll("[data-preset]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.preset;
        const preset = PRESETS.find((p) => p.id === id);
        if (!preset) return;
        this.params = { ...preset.params };
        this.saved = false;
        this.render();
        void this.rebuild();
      });
    });
    document.querySelectorAll("[data-param]").forEach((el) => {
      el.addEventListener("input", (event) => {
        const key = (el as HTMLElement).dataset.param as keyof typeof PARAM_LIMITS;
        const value = Number((event.target as HTMLInputElement).value);
        (this.params[key] as number) = value;
        this.saved = false;
        this.queueRebuild();
        this.syncTwinInputs(key, value);
      });
    });
    document.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("change", () => {
        const key = (el as HTMLElement).dataset.toggle as "doubleBowl" | "antiSlipGroove";
        this.params[key] = (el as HTMLInputElement).checked;
        this.saved = false;
        void this.rebuild();
      });
    });
    document.querySelectorAll("[data-tex]").forEach((el) => {
      el.addEventListener("click", () => {
        this.params.baseTexture = (el as HTMLElement).dataset.tex as BowlParams["baseTexture"];
        this.saved = false;
        this.render();
        void this.rebuild();
      });
    });
    q("#text")?.addEventListener("input", (event) => {
      this.params.text = (event.target as HTMLInputElement).value;
      this.saved = false;
      this.queueRebuild();
    });
    q("#material")?.addEventListener("change", (event) => {
      const id = (event.target as HTMLSelectElement).value;
      this.material = MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
      this.syncInfo();
    });
    document.querySelectorAll("[data-view]").forEach((el) => {
      el.addEventListener("click", () => {
        this.viewer?.setView((el as HTMLElement).dataset.view as CameraView, this.model ?? undefined);
      });
    });
    q("#zoom-in")?.addEventListener("click", () => this.viewer?.zoom(1));
    q("#zoom-out")?.addEventListener("click", () => this.viewer?.zoom(-1));
    q("#plate")?.addEventListener("click", () => {
      if (!this.viewer) return;
      this.viewer.setPlateVisible(!this.viewer.showPlate);
    });
    document.querySelectorAll(".section h3").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.sec;
        if (!id) return;
        this.open[id] = !this.open[id];
        this.render();
      });
    });
  }

  private syncTwinInputs(key: string, value: number) {
    document.querySelectorAll(`[data-param="${key}"]`).forEach((el) => {
      (el as HTMLInputElement).value = String(value);
    });
  }

  private queueRebuild() {
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => void this.rebuild(), 160);
  }

  private async rebuild() {
    const busy = document.querySelector("#busy");
    if (busy) busy.removeAttribute("hidden");
    try {
      this.model = await buildBowl(this.params, this.font);
      this.viewer?.setModel(this.model);
      this.syncInfo();
    } catch (error) {
      console.error(error);
    } finally {
      busy?.setAttribute("hidden", "");
    }
  }

  private syncInfo() {
    if (!this.model) return;
    const L = (key: StringKey) => t(this.locale, key);
    const dims = document.querySelector("#dims");
    if (dims) {
      dims.innerHTML = `
        <div><span>${L("width")}</span><strong>${this.model.width.toFixed(1)} mm</strong></div>
        <div><span>${L("depth")}</span><strong>${this.model.depth.toFixed(1)} mm</strong></div>
        <div><span>${L("heightDim")}</span><strong>${this.model.height.toFixed(1)} mm</strong></div>
      `;
    }
    const seal = document.querySelector("#seal");
    if (seal) {
      seal.className = `badge ${this.model.manifold ? "" : "bad"}`;
      seal.textContent = this.model.manifold ? "✓ " + L("watertight") : L("notWatertight");
    }
    const tris = document.querySelector("#tris");
    if (tris) tris.textContent = `${L("triangles")}: ${this.model.triangleCount.toLocaleString()}`;
    const mass = estimateMassGrams(this.model.solidVolumeMm3, this.material.density);
    const massEl = document.querySelector("#mass");
    if (massEl) massEl.innerHTML = `${mass.toFixed(0)} <small>g</small>`;
    const cap = document.querySelector("#capacity");
    if (cap) cap.textContent = `${L("capacity")}: ${this.model.capacityMl.toFixed(0)} ml`;
    const saved = document.querySelector(".saved");
    if (saved) saved.textContent = this.saved ? "✓ " + L("savedLocally") : L("unsaved");
  }

  private save() {
    const existing = this.projects.find((p) => p.id === this.activeId);
    if (existing) {
      existing.name = this.projectName;
      existing.params = { ...this.params };
      existing.updatedAt = Date.now();
    } else {
      const created = createProject(this.projectName, this.params);
      this.projects.unshift(created);
      this.activeId = created.id;
      setActiveId(created.id);
    }
    saveProjects(this.projects);
    this.saved = true;
    this.syncInfo();
  }

  private async exportNow(kind: "stl" | "bambu" | "u1") {
    if (!this.model) this.model = await buildBowl(this.params, this.font);
    const stem = exportFileStem(this.params);
    if (kind === "stl") {
      downloadBlob(`${stem}.stl`, modelToBinaryStl(this.model), "model/stl");
      return;
    }
    const target: ThreeMfTarget = kind === "bambu" ? "bambu" : "snapmaker-u1";
    const result = await buildThreeMf(this.model, target);
    downloadBlob(`${stem}_${kind}.3mf`, result.bytes, "model/3mf");
  }
}

function section(id: string, title: string, open: boolean, body: string): string {
  return `<section class="section"><h3 data-sec="${id}">${title} <span>${open ? "▾" : "▸"}</span></h3>${open ? body : ""}</section>`;
}

function labelFor(key: string): StringKey {
  const map: Record<string, StringKey> = {
    bodyDiameter: "bodyDiameter",
    height: "height",
    innerDepth: "innerDepth",
    rimRadius: "rimRadius",
    tiltDeg: "tilt",
    wallThickness: "wallThickness",
    bottomThickness: "bottomThickness",
    mouthShrink: "mouthShrink",
    footHeight: "footHeight",
    fontSize: "fontSize",
    embossDepth: "embossDepth",
    ribCount: "ribCount",
  };
  return map[key] ?? "size";
}

function viewKey(view: CameraView): StringKey {
  if (view === "3d") return "view3d";
  if (view === "front") return "viewFront";
  if (view === "top") return "viewTop";
  return "viewSide";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function toggle(sel: string) {
  const el = document.querySelector(sel);
  if (!el) return;
  if (el.hasAttribute("hidden")) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

function hide(sel: string) {
  document.querySelector(sel)?.setAttribute("hidden", "");
}

function downloadBlob(name: string, data: Uint8Array, type: string) {
  const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
