import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  LightningConfiguration,
  LightningItem,
  LightningFolder,
} from "../lightning-types";

// Default configuration for each Lightning item type
const DEFAULT_ITEM_CONFIG: Record<
  LightningItem["type"],
  { defaultIcon: string; command?: { command: string; title: string } }
> = {
  title: { defaultIcon: "symbol-event" },
  file: {
    defaultIcon: "file",
    command: { command: "lightning.openFile", title: "Open File" },
  },
  dialog: {
    defaultIcon: "comment-discussion",
    command: { command: "lightning.showDialog", title: "Show Dialog" },
  },
  folder: { defaultIcon: "folder" },
  diff: {
    defaultIcon: "git-pull-request",
    command: { command: "lightning.applyDiff", title: "Apply Diff" },
  },
  quiz: {
    defaultIcon: "question",
    command: { command: "lightning.showQuiz", title: "Show Quiz" },
  },
  browser: {
    defaultIcon: "globe",
    command: { command: "lightning.openBrowser", title: "Open Browser" },
  },
};

export class LightningTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly command?: vscode.Command,
    public readonly lightningItem?: LightningItem
  ) {
    // Set collapsible state based on item type
    const collapsibleState =
      lightningItem?.type === "folder"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    super(label, collapsibleState);
    this.tooltip = this.label;
    this.command = command;

    // Set appropriate icons and context values based on item type
    if (lightningItem) {
      // Use custom icon if provided, otherwise fall back to type-specific defaults
      const iconName =
        lightningItem.icon ||
        DEFAULT_ITEM_CONFIG[lightningItem.type].defaultIcon;

      // Create icon with optional color
      if (lightningItem.iconColor) {
        this.iconPath = new vscode.ThemeIcon(
          iconName,
          new vscode.ThemeColor(lightningItem.iconColor)
        );
      } else {
        this.iconPath = new vscode.ThemeIcon(iconName);
      }

      // Set custom label color if provided
      if (lightningItem.labelColor) {
        this.resourceUri = vscode.Uri.parse(
          `lightning://label-color/${lightningItem.labelColor}`
        );
      }

      // Set context value to the item type directly
      this.contextValue = lightningItem.type;
    }
  }
}

export class LightningDecorationProvider
  implements vscode.FileDecorationProvider
{
  onDidChangeFileDecorations?: vscode.Event<
    undefined | vscode.Uri | vscode.Uri[]
  >;

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    if (uri.scheme === "lightning" && uri.authority === "label-color") {
      const colorName = uri.path.substring(1); // Remove leading slash
      return {
        color: new vscode.ThemeColor(colorName),
      };
    }
    return undefined;
  }
}

export class LightningDataProvider
  implements vscode.TreeDataProvider<LightningTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    LightningTreeItem | undefined | null | void
  > = new vscode.EventEmitter<LightningTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    LightningTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private configuration: LightningConfiguration | undefined;
  private treeView: vscode.TreeView<LightningTreeItem> | undefined;

  setTreeView(treeView: vscode.TreeView<LightningTreeItem>): void {
    this.treeView = treeView;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  resetToInitialState(): void {
    this.configuration = undefined;
    vscode.commands.executeCommand(
      "setContext",
      "lightning.configLoaded",
      false
    );
    this.refresh();
  }

  hasConfiguration(): boolean {
    return this.configuration !== undefined;
  }

  async setConfigurationFile(filePath: string): Promise<void> {
    try {
      const fileContent = await fs.promises.readFile(filePath, "utf8");
      const config: LightningConfiguration = JSON.parse(fileContent);

      this.configuration = config;
      vscode.commands.executeCommand(
        "setContext",
        "lightning.configLoaded",
        true
      );

      this.refresh();
    } catch (error) {
      console.error("Error loading configuration file:", error);
      vscode.window.showErrorMessage(
        `Failed to load configuration file: ${error}`
      );
    }
  }

  getTreeItem(element: LightningTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LightningTreeItem): Thenable<LightningTreeItem[]> {
    if (!element) {
      // Root items
      if (!this.configuration) {
        // Show "Open configuration" button when no configuration is loaded
        return Promise.resolve([
          new LightningTreeItem("Open configuration", {
            command: "lightning.openConfiguration",
            title: "Open configuration",
            arguments: [],
          }),
        ]);
      } else {
        // Show items from the configuration
        return Promise.resolve(this.getConfigurationItems());
      }
    } else {
      // Handle folder expansion - show items of the folder
      if (element.lightningItem?.type === "folder") {
        return Promise.resolve(
          this.getChildItems(
            element.lightningItem.items,
            element.lightningItem.folderLabelColor,
            element.lightningItem.folderIconColor
          )
        );
      }
      return Promise.resolve([]);
    }
  }

  private getConfigurationItems(): LightningTreeItem[] {
    if (!this.configuration) {
      return [];
    }

    return this.getChildItems(this.configuration.items);
  }

  private getChildItems(
    items: LightningItem[],
    parentLabelColor?: string,
    parentIconColor?: string
  ): LightningTreeItem[] {
    return items.map((item) => {
      let command: vscode.Command | undefined;

      if (item.type === "title") {
        // Title items get a generic sound command if they have soundPath
        if (item.soundPath) {
          command = {
            command: "lightning.playSound",
            title: "Play Sound",
            arguments: [item],
          };
        }
      } else {
        // Use centralized command configuration for other types
        const commandConfig = DEFAULT_ITEM_CONFIG[item.type].command;
        if (commandConfig) {
          command = {
            ...commandConfig,
            arguments: [item],
          };
        }
      }
      // Note: folder items don't need commands as they're handled by expansion

      // Create item with inherited colors if not explicitly set
      const itemWithInheritedColors = {
        ...item,
        labelColor:
          item.labelColor ||
          (item.type === "folder"
            ? (item as LightningFolder).folderLabelColor
            : undefined) ||
          parentLabelColor,
        iconColor:
          item.iconColor ||
          (item.type === "folder"
            ? (item as LightningFolder).folderIconColor
            : undefined) ||
          parentIconColor,
      };

      return new LightningTreeItem(
        item.label,
        command,
        itemWithInheritedColors
      );
    });
  }
}
