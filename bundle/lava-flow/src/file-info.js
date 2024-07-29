export class FileInfo {
	constructor(file) {
		this.keys = [];
		this.directories = [];
		this.journal = null;
		this.extension = null;
		this.originalFile = file;
		const nameParts = file.name.split('.');
		this.fileNameNoExt = nameParts[0];
	}
	static get(file) {
		const nameParts = file.webkitRelativePath.split('.');
		const extension = nameParts[nameParts.length - 1];
		const fileInfo = extension === 'md' ? new MDFileInfo(file) : new OtherFileInfo(file);
		fileInfo.extension = extension;
		return fileInfo;
	}
	createKeys(fileName) {
		this.directories = this.originalFile.webkitRelativePath.split('/');
		this.directories.pop(); // Remove file name
		for (let i = 0; i < this.directories.length; i++) {
			const prefixes = this.directories.slice(i);
			prefixes.push(fileName);
			this.keys.push(prefixes.join('/'));
		}
		this.keys.push(fileName);
	}
	isHidden() {
		return this.originalFile.webkitRelativePath.split('/').filter((s) => s[0] === '.').length > 0;
	}
	isCanvas() {
		return this.extension === 'canvas';
	}
}
export class MDFileInfo extends FileInfo {
	constructor(file) {
		super(file);
		this.links = [];
		this.createKeys(this.fileNameNoExt);
	}
	getPageId(headerOrPageName) {
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
	getValidLinkHeader(header) {
		if (header == '')
			return null;
		let validHeader = null;
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
	getLinkRegex() {
		// return this.keys.map((k) => new RegExp(`!?\\[\\[${k}(#[^\\]\\|]*)?(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
		return this.keys.map((k) => new RegExp(`!?\\[\\[(${k})?(#[^\\|\\]]*)?(\\|[^\\]]*)?\\]\\]`, 'gi'));
		// !?\[\[(${k})?(#[^\|\]]*)?(\|[^\]]*)?\]\]
		// matches all obsidian links, including current page header links.
	}
	getLink(header, page, alias) {
		if (header == null && page == null && alias == null)
			return null;
		if (header == '' && page == '' && alias == '')
			return this.journal?.link ?? null;
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
			link = (validHeader === null) ? `${link}.${pageId}]` : `${link}.${pageId}${validHeader}]`;
		}
		else {
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
	constructor(file) {
		super(file);
		this.uploadPath = null;
		this.createKeys(file.name);
	}
	getLinkRegex() {
		const obsidianPatterns = this.keys.map((k) => new RegExp(`!\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
		const altTextPatterns = this.keys.map((k) => new RegExp(`!\\[[^\\]]+\\]\\(${k}\\)`, 'gi'));
		return obsidianPatterns.concat(altTextPatterns);
	}
	getLink() {
		return `![${this.originalFile.name}](${encodeURI(this.uploadPath ?? '')})`;
	}
}
