import { LavaFlow } from './lava-flow';
import { ID } from './constants';

// ─── Init ────────────────────────────────────────────────────────────────────
// Runs once when Foundry has finished loading its core API.
Hooks.once("init", () => {
  console.log(`${ID} | Initialised.`);
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
  try {
    LavaFlow.createUIElements(html);
  } catch (e) {
    LavaFlow.errorHandling(e);
  }
});
