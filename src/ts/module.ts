import { LavaFlowApp } from "./lava_flow_app";

const MODULE_ID = "lava-flow";

// ─── Init ────────────────────────────────────────────────────────────────────
// Runs once when Foundry has finished loading its core API.
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialised.`);
});

// ─── Sidebar button ──────────────────────────────────────────────────────────
// `renderActorsDirectory` fires whenever the Actors sidebar panel is rendered.
//
// In Foundry v13 (AppV2) the second argument is a plain HTMLElement, NOT a
// jQuery object.  Use querySelector / createElement instead of .find()/.append().
//
// Swap "renderActorsDirectory" for any other sidebar hook if you prefer a
// different panel (renderJournalDirectory, renderScenesDirectory, etc.).
Hooks.on("renderJournalDirectory", (_app: unknown, html: HTMLElement) => {
  // Guard: don't inject the button more than once
  if (html.querySelector(".lava-flow-btn")) return;

  const header = html.querySelector(".directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "lava-flow-btn";
  button.textContent = "👋 Hello World";

  button.addEventListener("click", () => {
    new LavaFlowApp().render(true);
  });

  header.appendChild(button);
});
