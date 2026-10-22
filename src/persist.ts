import { DEFAULT_PARAMS, type BowlParams } from "./geometry/types";

export interface SavedProject {
  id: string;
  name: string;
  params: BowlParams;
  updatedAt: number;
}

const KEY = "mono.pet-bowl.projects";
const ACTIVE = "mono.pet-bowl.active";

export function loadProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: SavedProject[]) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE);
}

export function setActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE, id);
  else localStorage.removeItem(ACTIVE);
}

export function createProject(name: string, params: BowlParams = DEFAULT_PARAMS): SavedProject {
  return {
    id: crypto.randomUUID(),
    name,
    params: { ...params },
    updatedAt: Date.now(),
  };
}
