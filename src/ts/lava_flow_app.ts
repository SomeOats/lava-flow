import {ID, FLAGS, TEMPLATES } from './constants';
import { LavaFlowSettings } from './lava-flow-settings';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LavaFlowApp extends HandlebarsApplicationMixin(ApplicationV2) {

  // ─── Static config (replaces defaultOptions) ────────────────────────────

  static DEFAULT_OPTIONS = {
    id: `${ID}-form`,
    window: {
      title: 'Import Obsidian MD Vault',
      resizable: true,
    },
    position: {
      width: 500,
      height: 600,
    },
    tag: 'form',
    form: {
      handler: LavaFlowApp.onSubmit,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    main: {
      template: TEMPLATES.IMPORTDIAG,
    },
  };

  // ─── Instance state ─────────────────────────────────────────────────────

  /** Populated by the file input's change listener before form submission. */
  vaultFiles: FileList | null = null;

  // ─── Data (replaces getData) ─────────────────────────────────────────────

  /**
   * Supplies data to the Handlebars template.
   * Mirrors the old FormApplication's getData(), which returned importSettings.
   */
  async _prepareContext(): Promise<LavaFlowSettings> {
    const savedSettings = (game as Game).user?.getFlag(
      FLAGS.SCOPE,
      FLAGS.LASTSETTINGS,
    ) as LavaFlowSettings | undefined;

    return savedSettings ?? new LavaFlowSettings();
  }

  // ─── Listeners (replaces activateListeners) ──────────────────────────────

  /**
   * Wires up all interactive elements after the form renders.
   * Mirrors activateListeners() from the old FormApplication.
   *
   * AppV2 note: `this.element` is a plain HTMLElement, not a jQuery object.
   * All DOM work uses querySelector / addEventListener instead of $.
   */
  protected _onRender(context: LavaFlowSettings, _options: object): void {
    const prefix = context.idPrefix ?? '';

    // Checkbox → show/hide toggles
    this._setToggle(`#${prefix}importNonMarkdown`, `#${prefix}nonMarkdownOptions`);
    this._setToggle(`#${prefix}useS3`,             `#${prefix}s3Options`);

    // Inverse toggle: hide the div when the checkbox is checked
    this._setInverseToggle(`#${prefix}overwrite`, `#${prefix}ignoreDuplicateDiv`);

    // File input — store the selected FileList for use in onSubmit
    const vaultFilesInput = this.element.querySelector<HTMLInputElement>(`#${prefix}vaultFiles`);
    vaultFilesInput?.addEventListener('change', (event) => {
      this.vaultFiles = (event.target as HTMLInputElement).files;
    });
  }

  // ─── Toggle helpers ──────────────────────────────────────────────────────

  private _setInverseToggle(checkBoxSelector: string, divSelector: string): void {
    this._setToggle(checkBoxSelector, divSelector, true);
  }

  /**
   * Shows/hides `divSelector` whenever `checkBoxSelector` changes.
   * When inverse=true the logic is flipped (hide when checked).
   */
  private _setToggle(
    checkBoxSelector: string,
    divSelector: string,
    inverse: boolean = false,
  ): void {
    const checkbox = this.element.querySelector<HTMLInputElement>(checkBoxSelector);
    const div      = this.element.querySelector<HTMLElement>(divSelector);
    if (!checkbox || !div) return;

    checkbox.addEventListener('change', () => {
      const show = inverse ? !checkbox.checked : checkbox.checked;
      div.style.display = show ? '' : 'none';
    });
  }

  // ─── Submit handler (replaces _updateObject) ─────────────────────────────

  /**
   * Called by AppV2's form machinery on submission.
   * Mirrors _updateObject() from the old FormApplication.
   *
   * `this` is bound to the LavaFlowApp instance by Foundry's AppV2 internals.
   */
  static async onSubmit(
    event: SubmitEvent,
    _form: HTMLFormElement,
    formData: FormDataExtended,
  ): Promise<void> {
    // `this` here is the LavaFlowApp instance (AppV2 binds it automatically).
    const self = this as unknown as LavaFlowApp;
    const data = formData.object as Record<string, unknown>;
    data.vaultFiles = self.vaultFiles;
    await LavaFlow.importVault(event, data);
  }
}