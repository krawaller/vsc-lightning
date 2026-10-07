export type LightningTreeItemBase = {
  label: string;
  icon?: string;
  iconColor?: string;
  labelColor?: string;
  soundPath?: string;
};

export type LightningTitle = LightningTreeItemBase & {
  type: "title";
};

export type LightningDiff = LightningTreeItemBase & {
  type: "diff";
  diffPath: string;
  action?: "apply" | "preview";
  revertSoundPath?: string;
};

export type LightningFileDiffButton = {
  label: string;
  diffPath: string;
  icon?: string;
  revertSoundPath?: string;
};

export type LightningPointOfInterest = {
  title: string;
  startLine: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  icon?: string;
};

export type LightningFileRefButton = {
  label: string;
  gitRef: string;
  tabSuffix?: string;
  icon?: string;
  pointsOfInterest?: LightningPointOfInterest[];
};

export type LightningFileCompareButton = {
  label: string;
  fromGitRef: string;
  toGitRef: string;
  fromTabSuffix?: string;
  toTabSuffix?: string;
  title?: string;
  icon?: string;
};

export type LightningFileMenu = {
  path: string;
  line?: number;
  diffButtons?: LightningFileDiffButton[];
  refButtons?: LightningFileRefButton[];
  compareButtons?: LightningFileCompareButton[];
};

export type LightningFileLink = LightningTreeItemBase & {
  type: "file";
  path: string;
  openMode?: "editor" | "browser";
  gitRef?: string;
  tabSuffix?: string;
  openWorktree?: boolean;
  line?: number;
  closeSoundPath?: string;
  diffButtons?: LightningFileDiffButton[];
  refButtons?: LightningFileRefButton[];
  compareButtons?: LightningFileCompareButton[];
  // Highlight properties for presentation purposes
  highlightStartLine?: number;
  highlightEndLine?: number;
  highlightType?: "selection" | "decoration";
  highlightColor?: string;
  highlightDuration?: number; // Duration in milliseconds, 0 = permanent
};

export type LightningDialogMessage = LightningTreeItemBase & {
  type: "dialog";
  message: string;
  severity?: "info" | "warning" | "error";
};

export type LightningFolder = LightningTreeItemBase & {
  type: "folder";
  items: LightningItem[];
  folderLabelColor?: string;
  folderIconColor?: string;
};

export type LightningQuiz = LightningTreeItemBase & {
  type: "quiz";
  question: string;
  wrongAnswers: string[];
  correctAnswers: string[];
  displayMode?: "webview" | "menu" | "dialog";
  revealSoundPath?: string;
};

export type LightningBrowser = LightningTreeItemBase & {
  type: "browser";
  url: string;
  browserType?: "simple" | "external";
  title?: string;
};

export type LightningItem =
  | LightningTitle
  | LightningFileLink
  | LightningDialogMessage
  | LightningFolder
  | LightningDiff
  | LightningQuiz
  | LightningBrowser;

export type LightningConfiguration = {
  title: string;
  fileMenus?: LightningFileMenu[];
  items: LightningItem[];
};
