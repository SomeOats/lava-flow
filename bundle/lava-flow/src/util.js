import LavaFlow from './lava-flow.js';
export async function createOrGetFolder(folderName, parentFolderID = null) {
	console.log("Lava Flow | Get or create Folder: " + folderName);
	if (folderName == null || folderName === '')
		return null;
	const folder = (await getFolder(folderName, parentFolderID)) ?? (await createFolder(folderName, parentFolderID));
	console.log("Lava Flow | Got/Created folder: " + folder?.name);
	return folder;
}
export async function getFolder(folderName, parentFolderID) {
	if (parentFolderID !== null) {
		const parent = game.folders?.get(parentFolderID);
		// v10 not supported by foundry-vtt-types yet
		// @ts-expect-error
		const matches = parent.children.filter((c) => c.folder.name === folderName) ?? [];
		console.log('Lava Flow | getFolder with parent ID: ' + (matches.length > 0 ? matches[0].folder : null));
		return matches.length > 0 ? matches[0].folder : null;
	}
	else {
		console.log('Lava Flow | getFolders without parent id: ' + (game.folders?.find((f) => f.type === 'JournalEntry' && f.depth === 1 && f.name === folderName) ?? null));
		console.log('Lava Flow | without parent id but name ' + folderName);
		return (game.folders?.find((f) => f.type === 'JournalEntry' && f.depth === 1 && f.name === folderName) ?? null);
	}
}
export async function createFolder(folderName, parentFolderID) {
	const folder = await Folder.create({
		name: folderName,
		type: 'JournalEntry'
		// parent: parentFolderID,
	});
	await folder?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.FOLDER, true);
	console.log("Lava Flow | created folder: " + folder?.name);
	if (parentFolderID !== null) {
		let parent = game.folders?.get(parentFolderID);
		await folder?.update({ folder: parent });
	}
	return folder ?? null;
}
