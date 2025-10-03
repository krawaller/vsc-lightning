export type LightningTreeItemBase = {
  label: string;
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
  | LightningFileLink
  | LightningDialogMessage
  | LightningFolder;

export type LightningConfiguration = {
  title: string;
  items: LightningItem[];
};
