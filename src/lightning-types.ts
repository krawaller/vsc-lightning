export type LightningTreeItemBase = {
  label: string;
  icon?: string;
  iconColor?: string;
  labelColor?: string;
};

export type LightningTitle = LightningTreeItemBase & {
  type: "title";
};

export type LightningDiff = LightningTreeItemBase & {
  type: "diff";
  diffPath: string;
  action?: "apply" | "preview";
};

export type LightningFileLink = LightningTreeItemBase & {
  type: "file";
  path: string;
  line?: number;
};

export type LightningDialogMessage = LightningTreeItemBase & {
  type: "dialog";
  message: string;
  severity?: "info" | "warning" | "error";
};

export type LightningFolder = LightningTreeItemBase & {
  type: "folder";
  items: LightningItem[];
};

export type LightningQuiz = LightningTreeItemBase & {
  type: "quiz";
  question: string;
  wrongAnswers: string[];
  correctAnswers: string[];
  displayMode?: "webview" | "menu" | "dialog";
};

export type LightningSound = LightningTreeItemBase & {
  type: "sound";
  soundPath: string;
};

export type LightningItem =
  | LightningTitle
  | LightningFileLink
  | LightningDialogMessage
  | LightningFolder
  | LightningDiff
  | LightningQuiz
  | LightningSound;

export type LightningConfiguration = {
  title: string;
  items: LightningItem[];
};
