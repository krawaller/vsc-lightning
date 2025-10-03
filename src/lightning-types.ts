export type LightningTreeItemBase = {
  label: string;
  icon?: string;
  iconColor?: string;
  labelColor?: string;
};

export type LightningTitle = LightningTreeItemBase & {
  type: "title";
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

export type LightningItem =
  | LightningTitle
  | LightningFileLink
  | LightningDialogMessage
  | LightningFolder;

export type LightningConfiguration = {
  title: string;
  items: LightningItem[];
};
