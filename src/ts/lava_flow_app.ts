// Foundry exposes its API on the global `foundry` object.
// We pull out what we need via destructuring.
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A minimal ApplicationV2 dialog that renders a Handlebars template.
 *
 * Key AppV2 concepts demonstrated:
 *  - DEFAULT_OPTIONS: static config (id, title, size)
 *  - PARTS: maps part names to .hbs template paths
 *  - _prepareContext: async method that returns data for the template
 */
export class LavaFlowApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    // Unique DOM id for this application
    id: "lava-flow-app",
    window: {
      title: "Lava Flow",
    },
    position: {
      width: 360,
    },
  };

  // Each key in PARTS becomes an independently renderable section.
  // The template path must be relative to Foundry's data root.
  static PARTS = {
    main: {
      template: "modules/lava-flow/templates/lava-flow.hbs",
    },
  };

  // _prepareContext is the AppV2 equivalent of AppV1's getData().
  // Whatever you return here is available inside the .hbs template.
  async _prepareContext() {
    return {};
  }
}
