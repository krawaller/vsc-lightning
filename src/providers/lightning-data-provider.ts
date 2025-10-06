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
    public readonly lightningItem?: LightningItem,
    private decorationProvider?: LightningDecorationProvider
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

      // For file items, use the actual file path for VS Code's file icon magic
      if (lightningItem.type === "file" && lightningItem.path) {
        this.resourceUri = vscode.Uri.file(lightningItem.path);
      }

      // Register label color with decoration provider
      if (lightningItem.labelColor && this.decorationProvider) {
        if (this.resourceUri) {
          // Use the actual URI (file path) for color mapping
          this.decorationProvider.setItemColor(
            this.resourceUri,
            lightningItem.labelColor
          );
        } else {
          // For non-file items, create a unique URI
          const uniqueUri = vscode.Uri.parse(
            `lightning://item/${this.label}-${Date.now()}`
          );
          this.resourceUri = uniqueUri;
          this.decorationProvider.setItemColor(
            uniqueUri,
            lightningItem.labelColor
          );
        }
      }

      // Set context value based on functionality, not internal type
      this.contextValue =
        this.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed ||
        this.collapsibleState === vscode.TreeItemCollapsibleState.Expanded
          ? "folder"
          : "item";
    }
  }
}

export class LightningDecorationProvider
  implements vscode.FileDecorationProvider
{
  private colorMap = new Map<string, string>();

  onDidChangeFileDecorations?: vscode.Event<
    undefined | vscode.Uri | vscode.Uri[]
  >;

  setItemColor(uri: vscode.Uri, color: string): void {
    this.colorMap.set(uri.toString(), color);
  }

  clearColors(): void {
    this.colorMap.clear();
  }

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FileDecoration> {
    // Check if this URI has a color mapping
    const color = this.colorMap.get(uri.toString());
    if (color) {
      return {
        color: new vscode.ThemeColor(color),
      };
    }

    // Legacy support for lightning:// scheme URIs
    if (uri.scheme === "lightning" && uri.authority === "label-color") {
      const colorName = uri.path.substring(1).split(".")[0]; // Remove leading slash and extension
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

  constructor(private decorationProvider: LightningDecorationProvider) {}

  setTreeView(treeView: vscode.TreeView<LightningTreeItem>): void {
    this.treeView = treeView;
  }

  refresh(): void {
    this.decorationProvider.clearColors();
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
          new LightningTreeItem(
            "Open configuration",
            {
              command: "lightning.openConfiguration",
              title: "Open configuration",
              arguments: [],
            },
            undefined,
            this.decorationProvider
          ),
        ]);
      } else {
        // Show items from the configuration
        return Promise.resolve(this.getConfigurationItems());
      }
    } else {
      // Handle folder expansion - show items of the folder
      if (element.lightningItem?.type === "folder") {
        // Pass the folder's folderIconColor/folderLabelColor as inheritance for children
        const folderItem = element.lightningItem as LightningFolder;
        return Promise.resolve(
          this.getChildItems(
            element.lightningItem.items,
            folderItem.folderLabelColor,
            folderItem.folderIconColor
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

      // Create a new item with inherited colors if the item doesn't have explicit colors
      const itemWithInheritedColors: LightningItem = {
        ...item,
        iconColor:
          item.iconColor ||
          (item.type === "folder"
            ? (item as LightningFolder).folderIconColor
            : undefined) ||
          parentIconColor,
        labelColor:
          item.labelColor ||
          (item.type === "folder"
            ? (item as LightningFolder).folderLabelColor
            : undefined) ||
          parentLabelColor,
      };

      return new LightningTreeItem(
        item.label,
        command,
        itemWithInheritedColors,
        this.decorationProvider
      );
    });
  }
}
