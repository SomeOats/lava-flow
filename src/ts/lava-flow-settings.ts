import { ID } from "./constants";

export class LavaFlowSettings {
  rootFolderName: string | null = null;
  createRootFolder: boolean = true;
  vaultFiles: FileList | null = null;
  imageDirectory: string | null = null;
  overwrite: boolean = true;
  ignoreDuplicate: boolean = false;
  idPrefix: string = `${ID}-`;
  playerObserve: boolean = false;
  createIndexFile: boolean = false;
  createBacklinks: boolean = true;
  importNonMarkdown: boolean = true;
  useS3: boolean = false;
  s3Bucket: string | null = null;
  s3Region: string | null = null;
  mediaFolder: string = 'img';
  headerToPage: boolean = false;
}
