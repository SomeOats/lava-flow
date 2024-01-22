var _a;
import { FileInfo, MDFileInfo, OtherFileInfo } from './file-info.js';
import { LavaFlowForm } from './lava-flow-form.js';
import { LavaFlowSettings } from './lava-flow-settings.js';
import { createOrGetFolder } from './util.js';
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class LavaFlow {
	static log(msg, notify = false) {
		console.log(LavaFlow.toLogMessage(msg));
		if (notify)
			ui?.notifications?.info(LavaFlow.toLogMessage(msg));
	}
	static errorHandling(e) {
		console.error(LavaFlow.toLogMessage(e.stack));
		ui?.notifications?.error(LavaFlow.toLogMessage('Unexpected error. Please see the console for more details.'));
	}
	static toLogMessage(msg) {
		return `Lava Flow | ${msg}`;
	}
	static isGM() {
		return game.user?.isGM ?? false;
	}
	static createUIElements(html) {
		if (!LavaFlow.isGM())
			return;
		LavaFlow.log('Creating UI elements...', false);
		const className = `${LavaFlow.ID}-btn`;
		const tooltip = game.i18n.localize('LAVA-FLOW.button-label');
		const button = $(`<div class="${LavaFlow.ID}-row action-buttons flexrow"><button class="${className}"><i class="fas fa-upload"></i> ${tooltip}</button></div>`);
		button.on('click', function () {
			LavaFlow.createForm();
		});
		html.find('.header-actions:first-child').after(button);
		LavaFlow.log('Creating UI elements complete.', false);
	}
	static createForm() {
		if (!LavaFlow.isGM())
			return;
		new LavaFlowForm().render(true);
	}
	static async importVault(event, settings) {
		if (!LavaFlow.isGM())
			return;
		LavaFlow.log('Begin import...', true);
		try {
			await this.saveSettings(settings);
			if (settings.importNonMarkdown) {
				await LavaFlow.validateUploadLocation(settings);
			}
			const rootFolder = await createOrGetFolder(settings.rootFolderName);
			const files = [];
			if (settings.vaultFiles == null)
				return;
			for (let i = 0; i < settings.vaultFiles.length; i++) {
				const file = FileInfo.get(settings.vaultFiles[i]);
				if (file.isHidden() || file.isCanvas())
					continue;
				await LavaFlow.importFile(file, settings, rootFolder);
				files.push(file);
			}
			const allJournals = files.filter((f) => f.journal !== null).map((f) => f.journal);
			for (let i = 0; i < files.length; i++)
				await LavaFlow.updateLinks(files[i], allJournals);
			if (settings.createIndexFile || settings.createBacklinks) {
				const mdFiles = files.filter((f) => f instanceof MDFileInfo);
				if (settings.createIndexFile)
					await LavaFlow.createIndexFile(settings, mdFiles, rootFolder);
				if (settings.createBacklinks)
					await LavaFlow.createBacklinks(mdFiles);
			}
			settings.vaultFiles = null;
			LavaFlow.saveSettings(settings);
			LavaFlow.log('Import complete.', true);
		}
		catch (e) {
			LavaFlow.errorHandling(e);
		}
	}
	static async saveSettings(settings) {
		const savedSettings = new LavaFlowSettings();
		Object.assign(savedSettings, settings);
		await game.user?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS, savedSettings);
	}
	static async importFile(file, settings, rootFolder) {
		if (file instanceof MDFileInfo) {
			await this.importMarkdownFile(file, settings, rootFolder);
		}
		else if (settings.importNonMarkdown && file instanceof OtherFileInfo) {
			await this.importOtherFile(file, settings);
		}
	}
	static async importMarkdownFile(file, settings, rootFolder) {
		let parentFolder = rootFolder;
		let initIndex = (settings.createRootFolder) ? 0 : 1;
		for (let i = initIndex; i < file.directories.length; i++) {
			const newFolder = await createOrGetFolder(file.directories[i], parentFolder?.id);
			parentFolder = newFolder;
		}
		const journalName = file.fileNameNoExt;
		let journal = game.journal?.find((j) => j.name === journalName && j.folder === parentFolder) ??
			null;
		if (journal !== null && settings.overwrite)
			await LavaFlow.updateJournalFromFile(journal, file);
		else if (journal === null || (!settings.overwrite && !settings.ignoreDuplicate))
			journal = await LavaFlow.createJournalFromFile(journalName, parentFolder, file, settings.playerObserve, settings.headerToPage);
		file.journal = journal;
	}
	static async importOtherFile(file, settings) {
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
	static async validateUploadLocation(settings) {
		if (settings.useS3) {
			if (settings.s3Bucket === null || settings.s3Region === null)
				throw new Error('S3 settings are invalid.');
		}
		try {
			let pickerPromise = await FilePicker.browse('data', settings.mediaFolder);
			return;
		}
		catch (error) {
			LavaFlow.log(`Error accessing filepath ${settings.mediaFolder}: ${error.message}`, false);
		}
		await FilePicker.createDirectory('data', settings.mediaFolder);
	}
	static async createIndexFile(settings, files, rootFolder) {
		const indexJournalName = 'Index';
		const indexJournal = game.journal?.find((j) => j.name === indexJournalName && j.folder === rootFolder);
		const mdDictionary = files.filter((d) => d instanceof MDFileInfo);
		const directories = [...new Set(mdDictionary.map((d) => LavaFlow.getIndexTopDirectory(d)))];
		directories.sort();
		let content = '';
		for (let j = 0; j < directories.length; j++) {
			content += `<h1>${directories[j]}</h1>`;
			const journals = mdDictionary
				.filter((d) => LavaFlow.getIndexTopDirectory(d) === directories[j])
				.map((d) => d.journal);
			content += `<ul>${journals.map((journal) => `<li>${journal?.link ?? ''}</li>`).join('\n')}</ul>`;
		}
		if (indexJournal != null)
			await LavaFlow.updateJournal(indexJournal, content);
		else {
			await LavaFlow.createJournal(indexJournalName, rootFolder, content, settings.playerObserve, settings.headerToPage);
		}
	}
	static getIndexTopDirectory(fileInfo) {
		return fileInfo.directories.length > 1 ? fileInfo.directories[1] : 'Uncatergorized';
	}
	static async createBacklinks(files) {
		for (let i = 0; i < files.length; i++) {
			const fileInfo = files[i];
			if (fileInfo.journal === null)
				continue;
			const backlinkFiles = [];
			for (let j = 0; j < files.length; j++) {
				if (j === i)
					continue;
				const otherFileInfo = files[j];
				// v10 not supported by foundry-vtt-types yet
				// @ts-expect-error
				const page = otherFileInfo.journal?.pages?.contents[0];
				const link = fileInfo.getLink();
				if (page !== undefined && page !== null && link !== null && page.text.markdown.includes(link))
					backlinkFiles.push(otherFileInfo);
			}
			if (backlinkFiles.length > 0) {
				backlinkFiles.sort((a, b) => a.fileNameNoExt.localeCompare(b.fileNameNoExt));
				const backLinkList = backlinkFiles.map((b) => `- ${b.getLink() ?? ''}`).join('\r\n');
				// v10 not supported by foundry-vtt-types yet
				// @ts-expect-error
				const page = fileInfo.journal.pages.contents[0];
				// TODO when v10 types are ready, this cast will be unecessary
				const newText = `${page.text.markdown}\r\n#References\r\n${backLinkList}`;
				page.update({ text: { markdown: newText } });
			}
		}
	}
	static linkMatch(fileInfo, matchFileInfo) {
		if (matchFileInfo !== fileInfo && matchFileInfo instanceof MDFileInfo) {
			const linkPatterns = fileInfo.getLinkRegex();
			for (let i = 0; i < linkPatterns.length; i++) {
				if (matchFileInfo.links.filter((l) => l.match(linkPatterns[i])).length > 0)
					return true;
			}
		}
		return false;
	}
	static decodeHtml(html) {
		const txt = document.createElement('textarea');
		txt.innerHTML = html;
		return txt.value;
	}
	static async createJournalFromFile(journalName, parentFolder, file, playerObserve, headerToPage) {
		const fileContent = await LavaFlow.getFileContent(file);
		return await LavaFlow.createJournal(journalName, parentFolder, fileContent, playerObserve, headerToPage);
	}
	static async createJournal(journalName, parentFolder, content, playerObserve, headerToPage) {
		const entryData = {
			name: journalName,
			folder: parentFolder?.id,
		};
		if (playerObserve && entryData.permission !== undefined && entryData.permission !== null)
			entryData.permission.default = CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;
		const entry = (await JournalEntry.create(entryData)) ?? new JournalEntry();
		await entry.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.JOURNAL, true);
		if (headerToPage) {
			await this.createPagesFromHeaders(entry, content);
		}
		else {
			// v10 not supported by foundry-vtt-types yet
			// @ts-expect-error
			await JournalEntryPage.create({ name: journalName, text: { markdown: content, format: 2 } }, { parent: journal });
		}
		const newJournal = (game.journal?.get(entry.id ?? '')) ?? entry;
		return newJournal; // ensuring the page content is returned as well as it's used for link generation
	}
	static async createPagesFromHeaders(journal, content) {
		if (journal === null) {
			return;
		}
		const header1RegEx = new RegExp(`^#\\s.*$`, `gmid`); // match level 1 headers. using index/lastIndex to split content
		const headersRegEx = new RegExp(`^#{2,}\\s`, `gmi`); // match level 2 or more headers, but only the header and the space. Not the text
		let fileContent = content;
		let index = -1; // start of next header
		let lastIndex = 0; // end of next header
		let priorIndex = 0; // end of last header
		let pageContent = ''; // current page content
		let nextHeader = ''; // next header
		let currentHeader = journal.name; // current page's header
		let hMatches = null;
		const h1Matches = fileContent.matchAll(header1RegEx);
		for (let h1Match of h1Matches) {
			LavaFlow.log(`Working on match ${h1Match[0]} at index ${h1Match.index ?? -1} with length ${h1Match[0].length} with last index ${lastIndex} and current header ${currentHeader}}`, false);
			index = h1Match.index ?? -1; // start position of current header
			lastIndex = index + (h1Match[0].length ?? 0); // final position of found header
			nextHeader = h1Match[0].replace('# ', ''); // this is the next page's header, not current page's header
			LavaFlow.log(`Found nextHeader: ${nextHeader}`);
			if (index == 0) {
				LavaFlow.log(`Found header at top of page`);
				priorIndex = lastIndex;
				currentHeader = nextHeader;
				continue;
			} // if the page starts with a header, we can skip the match and move to the next block.
			pageContent = fileContent.substring(priorIndex, index);
			fileContent = fileContent.slice(lastIndex); // this is the current page as the regex matches to the end of the current page.
			priorIndex = lastIndex;
			hMatches = pageContent.matchAll(headersRegEx);
			for (let hMatch of hMatches) { // increase header values for the page
				pageContent = pageContent.replace(hMatch[0], hMatch[0].slice(1));
				// this will replace all headers of a specific level with the next level. since regex matches all headers, this will do nothing most of the time. 
				// need to find a more efficient way
			}
			// @ts-expect-error
			await JournalEntryPage.create({ name: currentHeader, text: { markdown: pageContent, format: 2 } }, { parent: journal });
			currentHeader = nextHeader;
		}
		// @ts-expect-error
		await JournalEntryPage.create({ name: currentHeader, text: { markdown: fileContent, format: 2 } }, { parent: journal }); // create final page
	}
	static async updateJournalFromFile(journal, file) {
		await LavaFlow.updateJournal(journal, await LavaFlow.getFileContent(file));
	}
	static async updateJournal(journal, content) {
		if (journal === undefined || journal === null)
			return;
		// v10 not supported by foundry-vtt-types yet
		// @ts-expect-error
		const page = journal.pages.contents[0];
		await page.update({ text: { markdown: content } });
	}
	static async getFileContent(file) {
		let originalText = await file.originalFile.text();
		if (originalText !== null && originalText.length > 6)
			originalText = originalText.replace(/^---\r?\n([^-].*\r?\n)+---(\r?\n)+/, '');
		// unsure why this is replacing data in the original text...
		return originalText;
	}
	static async updateLinks(fileInfo, allJournals) {
		const linkPatterns = fileInfo.getLinkRegex();
		// scan all created journal entries (via allJournals) for matching references to markdown file fileInfo
		for (let i = 0; i < allJournals.length; i++) {
			// v10 not supported by foundry-vtt-types yet
			// @ts-expect-error
			const comparePage = allJournals[i].pages.contents[0];
			for (let j = 0; j < linkPatterns.length; j++) {
				const linkMatches = comparePage.text.markdown.matchAll(linkPatterns[j]);
				// linkMatches (full link, page, header, alias)
				for (const linkMatch of linkMatches) {
					if (linkMatch[2] !== undefined && linkMatch[1] == undefined && fileInfo.journal?.id != allJournals[i].id) { // current page header
						// link is a current page header link and we're not matching that page
						continue;
						// since we'll match current page headers irrespective of what page we are looking at, skip it if it doesn't match the current page
					}
					let link = fileInfo.getLink(linkMatch);
					if (link === null)
						continue;
					if (fileInfo instanceof OtherFileInfo) {
						const resizeMatches = linkMatch[0].match(/\|\d+(x\d+)?\]/gi);
						if (resizeMatches !== null && resizeMatches.length > 0) {
							const dimensions = resizeMatches[0]
								.replace(/(\||\])/gi, '')
								.toLowerCase()
								.split('x');
							if (dimensions.length === 1)
								dimensions.push('*');
							const dimensionsString = dimensions.join('x');
							link = link.replace(/\)$/gi, ` =${dimensionsString})`);
						}
					}
					const newContent = comparePage.text.markdown.replace(linkMatch[0], link);
					await LavaFlow.updateJournal(allJournals[i], newContent);
				}
			}
		}
	}
}
_a = LavaFlow;
LavaFlow.ID = 'lava-flow';
LavaFlow.FLAGS = {
	FOLDER: 'lavaFlowFolder',
	JOURNAL: 'lavaFlowJournalEntry',
	SCOPE: 'world',
	LASTSETTINGS: 'lava-flow-last-settings',
};
LavaFlow.TEMPLATES = {
	IMPORTDIAG: `modules/${_a.ID}/templates/lava-flow-import.hbs`,
};
