// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./app";

vi.mock("./ui/viewer", () => ({
  BowlViewer: class {
    dispose() {}
    setExploded() {}
    setView() {}
  },
}));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});

it("keeps both panel scroll positions when a section is toggled repeatedly", () => {
  const app = new App();
  (app as unknown as { render(): void }).render();
  for (let i = 0; i < 2; i++) {
    const left = document.querySelector<HTMLElement>(".panel.left")!;
    const right = document.querySelector<HTMLElement>(".panel.right")!;
    left.scrollTop = 430;
    right.scrollTop = 120;
    document.querySelector<HTMLElement>('.section h3[data-sec="texture"]')!.click();
    expect(document.querySelector(".panel.left")!.scrollTop).toBe(430);
    expect(document.querySelector(".panel.right")!.scrollTop).toBe(120);
  }
});
