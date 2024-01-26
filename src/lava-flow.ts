import { FileInfo, MDFileInfo, OtherFileInfo } from './file-info.js';
import { LavaFlowForm } from './lava-flow-form.js';
import { LavaFlowSettings } from './lava-flow-settings.js';
import { createOrGetFolder } from './util.js';
import { JournalEntryDataConstructorData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/journalEntryData';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class LavaFlow {
  static ID = 'lava-flow';

  static FLAGS = {
    FOLDER: 'lavaFlowFolder',
    JOURNAL: 'lavaFlowJournalEntry',
    SCOPE: 'world',
    LASTSETTINGS: 'lava-flow-last-settings',
  };

  static TEMPLATES = {
    IMPORTDIAG: `modules/${this.ID}/templates/lava-flow-import.hbs`,
  };

  static log(msg: string, notify: boolean = false): void {
    console.log(LavaFlow.toLogMessage(msg));
    if (notify) ui?.notifications?.info(LavaFlow.toLogMessage(msg));
  }

  static errorHandling(e: any): void {
    console.error(LavaFlow.toLogMessage(e.stack));
    ui?.notifications?.error(LavaFlow.toLogMessage('Unexpected error. Please see the console for more details.'));
  }

  static toLogMessage(msg: string): string {
    return `Lava Flow | ${msg}`;
  }

  static isGM(): boolean {
    return (game as Game).user?.isGM ?? false;
  }

  static createUIElements(html: JQuery): void {
    if (!LavaFlow.isGM()) return;

    LavaFlow.log('Creating UI elements...', false);
    const className = `${LavaFlow.ID}-btn`;
    const tooltip = (game as Game).i18n.localize('LAVA-FLOW.button-label');
    const button = $(
      `<div class="${LavaFlow.ID}-row action-buttons flexrow"><button class="${className}"><i class="fas fa-upload"></i> ${tooltip}</button></div>`,
    );
    button.on('click', function () {
      LavaFlow.createForm();
    });
    html.find('.header-actions:first-child').after(button);
    LavaFlow.log('Creating UI elements complete.', false);
  }

  static createForm(): void {
    if (!LavaFlow.isGM()) return;
    new LavaFlowForm().render(true);
  }

  static async importVault(event: Event, settings: LavaFlowSettings): Promise<void> {
    if (!LavaFlow.isGM()) return;
    LavaFlow.log('Begin import...', true);

    try {
      await this.saveSettings(settings);

      if (settings.importNonMarkdown) { await LavaFlow.validateUploadLocation(settings); }

      const rootFolder = await createOrGetFolder(settings.rootFolderName);
      const files: FileInfo[] = [];
      if (settings.vaultFiles == null) return;
      for (let i = 0; i < settings.vaultFiles.length; i++) {
        const file = FileInfo.get(settings.vaultFiles[i]);
        if (file.isHidden() || file.isCanvas()) continue;
        await LavaFlow.importFile(file, settings, rootFolder);
        files.push(file);
      }

      const allJournals = files.filter((f) => f.journal !== null).map((f) => f.journal) as JournalEntry[];
      for (let i = 0; i < files.length; i++) await LavaFlow.updateLinks(files[i], allJournals, settings.headerToPage);

      if (settings.createIndexFile || settings.createBacklinks) {
        const mdFiles = files.filter((f) => f instanceof MDFileInfo) as MDFileInfo[];
        if (settings.createIndexFile) await LavaFlow.createIndexFile(settings, mdFiles, rootFolder);

        if (settings.createBacklinks) await LavaFlow.createBacklinks(mdFiles, settings.headerToPage);
      }
      
      settings.vaultFiles = null;
      LavaFlow.saveSettings(settings);
      LavaFlow.log('Import complete.', true);
    } catch (e: any) {
      LavaFlow.errorHandling(e);
    }
  }

  static async saveSettings(settings: LavaFlowSettings): Promise<void> {
    const savedSettings = new LavaFlowSettings();
    Object.assign(savedSettings, settings);
    await (game as Game).user?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS, savedSettings);
  }

  static async importFile(file: FileInfo, settings: LavaFlowSettings, rootFolder: Folder | null): Promise<void> {
    if (file instanceof MDFileInfo) {
      await this.importMarkdownFile(file, settings, rootFolder);
    } else if (settings.importNonMarkdown && file instanceof OtherFileInfo) {
      await this.importOtherFile(file, settings);
    }
  }

  static async importMarkdownFile(
    file: MDFileInfo,
    settings: LavaFlowSettings,
    rootFolder: Folder | null,
  ): Promise<void> {
    let parentFolder = rootFolder;
    let initIndex = (settings.createRootFolder) ? 0 : 1
    for (let i = initIndex; i < file.directories.length; i++) {
      const newFolder = await createOrGetFolder(file.directories[i], parentFolder?.id);
      parentFolder = newFolder;
    }
    const journalName = file.fileNameNoExt;
    let journal =
      ((game as Game).journal?.find((j) => j.name === journalName && j.folder === parentFolder) as JournalEntry) ??
      null;

    if (journal !== null && settings.overwrite) await LavaFlow.updateJournalFromFile(journal, file, settings.headerToPage);
    else if (journal === null || (!settings.overwrite && !settings.ignoreDuplicate))
      journal = await LavaFlow.createJournalFromFile(journalName, parentFolder, file, settings.playerObserve, settings.headerToPage);

    file.journal = journal;
  }

  static async importOtherFile(file: OtherFileInfo, settings: LavaFlowSettings): Promise<void> {
    const source = settings.useS3 ? 's3' : 'data';
    const body = settings.useS3 ? { bucket: settings.s3Bucket } : {};
    const promise = FilePicker.upload(source, settings.mediaFolder, file.originalFile, body);
    let path = `${settings.mediaFolder}/${file.originalFile.name}`;
    path.replace('//', '/');
    if (settings.useS3) {
      path = `https://${settings.s3Bucket}.s3.${settings.s3Region}.amazonaws.com/${path}`;
    }
    file.uploadPath = path;
    await promise;
  }

  static async validateUploadLocation(settings: LavaFlowSettings): Promise<void> {
    if (settings.useS3) {
      if (settings.s3Bucket === null || settings.s3Region === null) throw new Error('S3 settings are invalid.');
    }
    try {
      let pickerPromise = await FilePicker.browse('data', settings.mediaFolder);
      return;
    } catch (error: any) {
      LavaFlow.log(`Error accessing filepath ${settings.mediaFolder}: ${error.message}`, false);
    }

    await FilePicker.createDirectory('data', settings.mediaFolder);
  }

  static async createIndexFile(
    settings: LavaFlowSettings,
    files: FileInfo[],
    rootFolder: Folder | null,
  ): Promise<void> {
    const indexJournalName = 'Index';
    const indexJournal = (game as Game).journal?.find((j) => j.name === indexJournalName && j.folder === rootFolder);
    const mdDictionary = files.filter((d) => d instanceof MDFileInfo);
    const directories = [...new Set(mdDictionary.map((d) => LavaFlow.getIndexTopDirectory(d)))];
    directories.sort();
    let content = '';
    for (let j = 0; j < directories.length; j++) {
      content += `# ${directories[j]}`;
      const journals = mdDictionary
        .filter((d) => LavaFlow.getIndexTopDirectory(d) === directories[j])
        .map((d) => d.journal);
      content += `${journals.map((journal) => `- ${journal?.link ?? ''}`).join('\n')}`;
    }
    if (indexJournal != null) await LavaFlow.updateJournal(indexJournal, content, settings.headerToPage);
    else {
      await LavaFlow.createJournal(indexJournalName, rootFolder, content, settings.playerObserve, settings.headerToPage);
    }
  }

  static getIndexTopDirectory(fileInfo: FileInfo): string {
    return fileInfo.directories.length > 1 ? fileInfo.directories[1] : 'Uncatergorized';
  }

  static async createBacklinks(files: MDFileInfo[], headerToPage: boolean): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      if (fileInfo.journal === null) continue;
      const backlinkFiles: MDFileInfo[] = [];
      for (let j = 0; j < files.length; j++) {
        if (j === i) continue;
        const otherFileInfo = files[j];
        // v10 not supported by foundry-vtt-types yet
        // @ts-expect-error
        for (let currentPage of otherFileInfo.journal?.pages) {
          // TODO: create list of links from other pages calling this page. 
          const link = fileInfo.journal?.id ?? null;
          if (currentPage !== undefined && currentPage !== null && link !== null && (currentPage.text.markdown as string).includes(link))
            backlinkFiles.push(otherFileInfo);
        }
        //const page = otherFileInfo.journal?.pages?.contents[0];
        
      }
      if (backlinkFiles.length > 0) {
        backlinkFiles.sort((a, b) => a.fileNameNoExt.localeCompare(b.fileNameNoExt));
        const backLinkList = backlinkFiles.map((b) => `- ${b.getLink() ?? ''}`).join('\r\n');
        // v10 not supported by foundry-vtt-types yet
        // @ts-expect-error
        const page = fileInfo.journal.pages.contents[0];
        // TODO when v10 types are ready, this cast will be unecessary
        const newText = `${page.text.markdown as string}\r\n#References\r\n${backLinkList}`;
        page.update({ text: { markdown: newText } });
      }
    }
  }

  static linkMatch(fileInfo: FileInfo, matchFileInfo: FileInfo): boolean {
    if (matchFileInfo !== fileInfo && matchFileInfo instanceof MDFileInfo) {
      const linkPatterns = fileInfo.getLinkRegex();
      for (let i = 0; i < linkPatterns.length; i++) {
        if (matchFileInfo.links.filter((l) => l.match(linkPatterns[i])).length > 0) return true;
      }
    }
    return false;
  }

  static decodeHtml(html: string): string {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }

  static async createJournalFromFile(
    journalName: string,
    parentFolder: Folder | null,
    file: FileInfo,
    playerObserve: boolean,
    headerToPage: boolean
  ): Promise<JournalEntry> {
    const fileContent = await LavaFlow.getFileContent(file);
    return await LavaFlow.createJournal(journalName, parentFolder, fileContent, playerObserve, headerToPage);
  }

  static async createJournal(
    journalName: string,
    parentFolder: Folder | null,
    content: string,
    playerObserve: boolean,
    headerToPage: boolean
  ): Promise<JournalEntry> {
    const entryData: JournalEntryDataConstructorData = {
      name: journalName,
      folder: parentFolder?.id,
    };
    if (playerObserve && entryData.permission !== undefined && entryData.permission !== null)
      entryData.permission.default = CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;

    const entry = (await JournalEntry.create(entryData)) ?? new JournalEntry();
    await entry.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.JOURNAL, true);

    if (headerToPage) {
      await this.createPagesFromHeaders(entry, content);
    } else {
      // v10 not supported by foundry-vtt-types yet
      // @ts-expect-error
      await JournalEntryPage.create({ name: journalName, text: { markdown: content, format: 2 }},{ parent: journal });
    }    

    const newJournal = ((game as Game).journal?.get(entry.id ?? '')) ?? entry;
    return newJournal; // ensuring the page content is returned as well as it's used for link generation
  }

  static async createPagesFromHeaders(journal: JournalEntry, content: String): Promise<void> {
    if (journal === null) { return }
    const header1RegEx = new RegExp(`^#\\s.*$`, `gmid`); // match level 1 headers. using index/lastIndex to split content

    let fileContent = content;
    let currentStartIndex = 0; // start of next header
    let currentEndIndex = 0; // end of next header
    let priorEndIndex = 0; // end of last header
    let pageContent = ''; // current page content
    let nextHeader = ''; // next header
    let currentHeader = journal.name; // current page's header

    const h1Matches = fileContent.matchAll(header1RegEx);

    for (let h1Match of h1Matches) {
      currentStartIndex = h1Match.index ?? -1; // start position of current header
      currentEndIndex = currentStartIndex + (h1Match[0].length ?? 0); // final position of found header
      nextHeader = h1Match[0].replace('# ', ''); // this is the next page's header, not current page's header

      if (currentStartIndex == 0) {
        priorEndIndex = currentEndIndex;
        currentHeader = nextHeader;
        continue; 
      } // if the page starts with a header, we can skip the match and move to the next block.

      pageContent = fileContent.substring(priorEndIndex, currentStartIndex);
      priorEndIndex = currentEndIndex;

      for (let i = 2; i < 8; i++) {
        pageContent = pageContent.replace(`${"#".repeat(i)} `, `${"#".repeat(i - 1)} `);
      }

      // @ts-expect-error
      await JournalEntryPage.create({ name: currentHeader, text: { markdown: pageContent, format: 2 }},{ parent: journal });
      currentHeader = nextHeader;
    }
    pageContent = fileContent.slice(priorEndIndex);
    // @ts-expect-error
    await JournalEntryPage.create({ name: currentHeader, text: { markdown: pageContent, format: 2 }},{ parent: journal }); // create final page
  }

  static async updateJournalFromFile(journal: JournalEntry, file: FileInfo, headerToPage: boolean): Promise<void> {
    await LavaFlow.updateJournal(journal, await LavaFlow.getFileContent(file), headerToPage);
  }

  static async updateJournal(journal: JournalEntry, content: string, headerToPage: boolean): Promise<void> {
    if (journal === undefined || journal === null) return;
    if (headerToPage) {
      // @ts-expect-error
      for (let page of journal.pages) {
        page.delete();
      }
      await this.createPagesFromHeaders(journal, content);
    } else {
      // v10 not supported by foundry-vtt-types yet
      // @ts-expect-error
      const page = journal.pages.contents[0];
      await page.update({ text: { markdown: content } });
    }    
  }

  static async getFileContent(file: FileInfo): Promise<string> {
    let originalText = await file.originalFile.text();
    if (originalText !== null && originalText.length > 6)
      originalText = originalText.replace(/^---\r?\n([^-].*\r?\n)+---(\r?\n)+/, '');
    // unsure why this is replacing data in the original text...
    return originalText;
  }

  static async updateLinks(fileInfo: FileInfo, allJournals: JournalEntry[], headerToPage: boolean): Promise<void> {
    const linkPatterns = fileInfo.getLinkRegex(); 
    // scan all created journal entries (via allJournals) for matching references to markdown file fileInfo
    for (let i = 0; i < allJournals.length; i++) { 
      for (let j = 0; j < linkPatterns.length; j++) {
        // @ts-expect-error
        for (let currentPage of allJournals[i].pages) {
          const linkMatches = currentPage.text.markdown.matchAll(linkPatterns[j]);

          for (const linkMatch of linkMatches) {
            if (linkMatch[2] !== undefined && linkMatch[1] == undefined && fileInfo.journal?.id != allJournals[i].id) { // current page header
              // link is a current page header link and we're not matching that page
              continue;
              // since we'll match current page headers irrespective of what page we are looking at, skip it if it doesn't match the current page
            }
            
            let link = fileInfo.getLink(linkMatch);
            
            if (link === null) continue;
            if (fileInfo instanceof OtherFileInfo) {
              const resizeMatches = linkMatch[0].match(/\|\d+(x\d+)?\]/gi);
              if (resizeMatches !== null && resizeMatches.length > 0) {
                const dimensions = resizeMatches[0]
                  .replace(/(\||\])/gi, '')
                  .toLowerCase()
                  .split('x');
                if (dimensions.length === 1) dimensions.push('*');
                const dimensionsString = dimensions.join('x');
                link = link.replace(/\)$/gi, ` =${dimensionsString})`);
              }
            }
            const newContent = currentPage.text.markdown.replace(linkMatch[0], link);
            await currentPage.update({ text: { markdown: newContent } });
          }
        }        
      }
    }
  }
}
