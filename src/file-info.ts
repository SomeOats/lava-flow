export abstract class FileInfo {
  originalFile: File;
  keys: string[] = [];
  directories: string[] = [];
  journal: JournalEntry | null = null;
  extension: string | null = null;
  fileNameNoExt: string;

  abstract getLinkRegex(): RegExp[];
  abstract getLink(header: string | null, page: string | null, alias: string | null): string | null;

  constructor(file: File) {
    this.originalFile = file;
    const nameParts = file.name.split('.');
    this.fileNameNoExt = nameParts[0];
  }

  static get(file: File): FileInfo {
    const nameParts = file.webkitRelativePath.split('.');
    const extension = nameParts[nameParts.length - 1];
    const fileInfo = extension === 'md' ? new MDFileInfo(file) : new OtherFileInfo(file);
    fileInfo.extension = extension;
    return fileInfo;
  }

  createKeys(fileName: string): void {
    this.directories = this.originalFile.webkitRelativePath.split('/');
    this.directories.pop(); // Remove file name
    for (let i = 0; i < this.directories.length; i++) {
      const prefixes = this.directories.slice(i);
      prefixes.push(fileName);
      this.keys.push(prefixes.join('/'));
    }
    this.keys.push(fileName);
  }

  isHidden(): boolean {
    return this.originalFile.webkitRelativePath.split('/').filter((s) => s[0] === '.').length > 0;
  }

  isCanvas(): boolean {
    return this.extension === 'canvas';
  }
}

export class MDFileInfo extends FileInfo {
  links: string[] = [];

  constructor(file: File) {
    super(file);
    this.createKeys(this.fileNameNoExt);
  }

  getPageId(headerOrPageName: string): string | null {
    let pageId = null;
    // @ts-expect-error
    for (let checkPage of this.journal.pages) {
      if ((checkPage.name == headerOrPageName) || (checkPage.text.markdown.includes(`# ${headerOrPageName}`))) {
        pageId = checkPage.id;
        break;
      }
    }
    return pageId;
  }

  getValidLinkHeader(header: string): string | null {
    if (header == '') return null;
    let validHeader = null
    
    // @ts-expect-error
    for (let currentPage of this.journal?.pages) {
      if (currentPage.name == header.slice(1)) {
        validHeader = `#${currentPage.name.toLowerCase().replaceAll(' ', '-').replaceAll('\'', '')}`;
        break;
      }
      let headerMatches = currentPage.text.markdown.matchAll(new RegExp(`^(#+)\\s(${header.slice(1)})$`, 'gmi'));

      // ^(#+)\s(Scene)$
      // ^<h(\d)>(${header})<\/h\d>$
      for (let headerMatch of headerMatches) {
        if (headerMatch[1].length > 2) {
          continue; // foundry does not support header links for headers greater than h2
        }
        validHeader = `#${headerMatch[2].toLowerCase().replaceAll(' ', '-').replaceAll('\'', '')}`;
        // foundry will remove some special characters for anchors to headers. I am only aware of apostrophe. Unsure what else there is.
      }
    }   

    return validHeader;
  }

  getLinkRegex(): RegExp[] {
    // return this.keys.map((k) => new RegExp(`!?\\[\\[${k}(#[^\\]\\|]*)?(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
    return this.keys.map((k) => new RegExp(`!?\\[\\[(${k})?(#[^\\|\\]]*)?(\\|[^\\]]*)?\\]\\]`, 'gi'));
    // !?\[\[(${k})?(#[^\|\]]*)?(\|[^\]]*)?\]\]
    // matches all obsidian links, including current page header links.
  }

  getLink(header: string | null, page: string | null, alias: string | null): string | null {
    if (header == null && page == null && alias == null) return null;
    if (header == '' && page == '' && alias == '') return this.journal?.link ?? null;
    header = header ?? '';
    page = page ?? '';
    alias = alias ?? '';
    let validHeader = (header === '') ? null : this.getValidLinkHeader(header);
    let pageId = null;
    // @UUID[JournalEntry.WBAoheAv9WO3ieMv.JournalEntryPage.RXxhfmwhm5muifn7#magic]{Magic} // link to other page header
    // @UUID[.5iPjPPTreRyAKx6C#gale]{Gale} // link to current journal page header. That is the pageID
    
    let link = '@UUID[';
    
    /* handle page links */
    link = (page === '') ? link : `${link}JournalEntry.${this.journal?.id ?? ''}`; // if we have a page reference, add it to the link.

    /* handle header */
    if (header !== '') { 
      pageId = this.getPageId(header.slice(1)); 
      if (page !== '') { // page header
        link = `${link}.JournalEntryPage`;
      }
    
      link = (validHeader === null) ? `${link}.${pageId}]` : `${link}.${pageId}${validHeader}]`
    } else {
      link = `${link}]`;
    }

    /* handle alias */
    link = (alias === '') ? link : `${link}{${alias.slice(1)}}`;

    if (validHeader === null && page !== '' && header !== '') {
      // if we have a header to another page, but it's not valid, append it outside of the core link
      link = `${link} ${header}`;
    }

    return link;
  }
}

export class OtherFileInfo extends FileInfo {
  uploadPath: string | null = null;

  constructor(file: File) {
    super(file);
    this.createKeys(file.name);
  }

  getLinkRegex(): RegExp[] {
    const obsidianPatterns = this.keys.map((k) => new RegExp(`!\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
    const altTextPatterns = this.keys.map((k) => new RegExp(`!\\[[^\\]]+\\]\\(${k}\\)`, 'gi'));
    return obsidianPatterns.concat(altTextPatterns);
  }

  getLink(): string | null {
    return `![${this.originalFile.name}](${encodeURI(this.uploadPath ?? '')})`;
  }
}
