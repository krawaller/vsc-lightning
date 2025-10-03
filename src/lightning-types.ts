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

export type LightningItem = LightningFileLink | LightningDialogMessage;

export type LightningConfiguration = {
  title: string;
  items: LightningItem[];
};
