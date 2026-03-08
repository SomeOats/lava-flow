import LavaFlow from './lava-flow.js';

Hooks.on('renderJournalDirectory', function (app: unknown, html: HTMLElement) {
  try {
    LavaFlow.createUIElements(html);
  } catch (e) {
    LavaFlow.errorHandling(e);
  }
});
