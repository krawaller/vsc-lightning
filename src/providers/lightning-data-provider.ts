import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  LightningConfiguration,
  LightningItem,
  LightningFolder,
  LightningFileLink,
  LightningFileMenu,
  LightningPointOfInterest,
  LightningFileRefButton,
} from "../lightning-types";
import { isLightningFileOpenInProgress } from "../features/tab-state";

type LightningSyntheticTreeItemKind = "fileMenusDivider" | "fileMenusRoot";
type FileRefSource = {
  label: string;
  path: string;
  line?: number;
  refButtons?: LightningFileRefButton[];
};
type ActiveFileRef = {
  source: FileRefSource;
  gitRef: string;
  selection?: vscode.Selection;
};

const gitSnapshotScheme = "lightning-git";

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
    private decorationProvider?: LightningDecorationProvider,
    public readonly syntheticKind?: LightningSyntheticTreeItemKind,
  ) {
    // Set collapsible state based on item type
    const collapsibleState =
      syntheticKind === "fileMenusRoot"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : lightningItem?.type === "folder"
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

    super(label, collapsibleState);
    this.tooltip = this.label;
    this.command = command;

    if (syntheticKind === "fileMenusRoot") {
      this.iconPath = new vscode.ThemeIcon("files");
      this.contextValue = syntheticKind;
    } else if (syntheticKind === "fileMenusDivider") {
      this.contextValue = syntheticKind;
    }

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
          new vscode.ThemeColor(lightningItem.iconColor),
        );
      } else {
        this.iconPath = new vscode.ThemeIcon(iconName);
      }

      // For file items, use the actual file path for VS Code's file icon magic
      if (lightningItem.type === "file" && lightningItem.path) {
        if (lightningItem.labelColor) {
          // For files with label colors, add a unique fragment to make the URI unique
          // while preserving the file path for icon magic
          const uniqueId = Math.random().toString(36).substring(2);
          this.resourceUri = vscode.Uri.file(lightningItem.path).with({
            fragment: uniqueId,
          });
        } else {
          // For files without label colors, use the plain file path
          this.resourceUri = vscode.Uri.file(lightningItem.path);
        }
      }

      // Register label color with decoration provider (including inherited colors)
      if (lightningItem.labelColor && this.decorationProvider) {
        if (this.resourceUri) {
          // For files with label colors, ensure we have a unique fragment
          if (lightningItem.type === "file" && lightningItem.labelColor) {
            // Use preregistered fragment if available, otherwise generate one
            const uniqueId =
              (lightningItem as any)._preregisteredFragment ||
              Math.random().toString(36).substring(2);
            this.resourceUri = this.resourceUri.with({
              fragment: uniqueId,
            });
          }
          // Always register the color mapping immediately to prevent white flash
          this.decorationProvider.setItemColor(
            this.resourceUri,
            lightningItem.labelColor,
          );
        } else {
          // For non-file items, use preregistered URI if available, otherwise create one
          let uniqueUri: vscode.Uri;
          if ((lightningItem as any)._preregisteredUri) {
            uniqueUri = vscode.Uri.parse(
              (lightningItem as any)._preregisteredUri,
            );
          } else {
            const uniqueId =
              Math.random().toString(36).substring(2) + Date.now().toString(36);
            uniqueUri = vscode.Uri.parse(`lightning://item/${uniqueId}`);
          }
          this.resourceUri = uniqueUri;
          this.decorationProvider.setItemColor(
            uniqueUri,
            lightningItem.labelColor,
          );
        }
      }

      // Set context value to the specific item type for menu contributions
      this.contextValue = lightningItem.type;
    }
  }
}

export class LightningDecorationProvider
  implements vscode.FileDecorationProvider
{
  private colorMap = new Map<string, string>();

  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    undefined | vscode.Uri | vscode.Uri[]
  >();
  onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  setItemColor(uri: vscode.Uri, color: string): void {
    this.colorMap.set(uri.toString(), color);
    // Only notify that this specific URI's decoration changed
    this._onDidChangeFileDecorations.fire(uri);
  }

  clearColors(): void {
    this.colorMap.clear();
    // Fire single clean refresh
    this._onDidChangeFileDecorations.fire(undefined);
  }

  provideFileDecoration(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
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

export class LightningDataProvider implements vscode.TreeDataProvider<LightningTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    LightningTreeItem | undefined | null | void
  > = new vscode.EventEmitter<LightningTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    LightningTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private configuration: LightningConfiguration | undefined;
  private treeView: vscode.TreeView<LightningTreeItem> | undefined;
  private fileMenusVisible = false;
  private activeFileRef: ActiveFileRef | undefined;

  constructor(private decorationProvider: LightningDecorationProvider) {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        if (
          this.activeFileRef &&
          vscode.window.visibleTextEditors.length === 0 &&
          !isLightningFileOpenInProgress()
        ) {
          this.activeFileRef = undefined;
          this._onDidChangeTreeData.fire();
        }
        return;
      }

      this.activeFileRef = this.getActiveFileRef(editor);
      this._onDidChangeTreeData.fire();
    });
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const activeFileRef = this.getActiveFileRef(event.textEditor);
      if (!activeFileRef) {
        return;
      }

      this.activeFileRef = activeFileRef;
      this._onDidChangeTreeData.fire();
    });
  }

  setTreeView(treeView: vscode.TreeView<LightningTreeItem>): void {
    this.treeView = treeView;
  }

  refresh(): void {
    // Preregister all colors first, then clear old ones to prevent flash
    this.preregisterAllColors();
    this._onDidChangeTreeData.fire();
  }

  refreshActiveFileRef(): void {
    this.activeFileRef = this.getActiveFileRef(vscode.window.activeTextEditor);
    this._onDidChangeTreeData.fire();
  }

  resetToInitialState(): void {
    this.configuration = undefined;
    this.activeFileRef = undefined;
    vscode.commands.executeCommand(
      "setContext",
      "lightning.configLoaded",
      false,
    );
    this.updateFileMenusContext();
    this.refresh();
  }

  hasConfiguration(): boolean {
    return this.configuration !== undefined;
  }

  getConfiguration(): LightningConfiguration | undefined {
    return this.configuration;
  }

  setFileMenusVisible(visible: boolean): void {
    this.fileMenusVisible = visible;
    this.updateFileMenusContext();
    this.refresh();
  }

  async setConfigurationFile(filePath: string): Promise<void> {
    try {
      const fileContent = await fs.promises.readFile(filePath, "utf8");
      const config: LightningConfiguration = JSON.parse(fileContent);

      this.configuration = config;
      this.activeFileRef = this.getActiveFileRef(
        vscode.window.activeTextEditor,
      );
      vscode.commands.executeCommand(
        "setContext",
        "lightning.configLoaded",
        true,
      );
      this.updateFileMenusContext();

      // Preregister all colors before refreshing to prevent white flash
      this.preregisterAllColors();

      this.refresh();
    } catch (error) {
      console.error("Error loading configuration file:", error);
      vscode.window.showErrorMessage(
        `Failed to load configuration file: ${error}`,
      );
    }
  }

  private preregisterAllColors(): void {
    if (!this.configuration) {
      return;
    }

    // Recursively preregister colors for all items
    this.preregisterItemColors(this.configuration.items);
  }

  private updateFileMenusContext(): void {
    vscode.commands.executeCommand(
      "setContext",
      "lightning.fileMenusAvailable",
      this.getFileRefSources().length > 0,
    );
    vscode.commands.executeCommand(
      "setContext",
      "lightning.fileMenusVisible",
      this.fileMenusVisible,
    );
  }

  private preregisterItemColors(
    items: LightningItem[],
    parentLabelColor?: string,
    parentIconColor?: string,
  ): void {
    items.forEach((item) => {
      // Apply inheritance logic (same as in getChildItems)
      const effectiveLabelColor =
        item.labelColor ||
        (item.type === "folder"
          ? (item as LightningFolder).folderLabelColor
          : undefined) ||
        parentLabelColor;

      // If this item has a label color, preregister it
      // Store the preregistered data on the item for later use
      if (effectiveLabelColor) {
        if (item.type === "file" && item.path) {
          // For files, create the same URI structure as the constructor
          const uniqueId = Math.random().toString(36).substring(2);
          const fileUri = vscode.Uri.file(item.path).with({
            fragment: uniqueId,
          });
          this.decorationProvider.setItemColor(fileUri, effectiveLabelColor);

          // Store the generated fragment so the constructor can use the same one
          (item as any)._preregisteredFragment = uniqueId;
          (item as any)._effectiveLabelColor = effectiveLabelColor;
        } else {
          // For non-file items, create a unique URI
          const uniqueId =
            Math.random().toString(36).substring(2) + Date.now().toString(36);
          const uniqueUri = vscode.Uri.parse(`lightning://item/${uniqueId}`);
          this.decorationProvider.setItemColor(uniqueUri, effectiveLabelColor);

          // Store the generated URI so the constructor can use the same one
          (item as any)._preregisteredUri = uniqueUri.toString();
          (item as any)._effectiveLabelColor = effectiveLabelColor;
        }
      }

      // If this is a folder, recursively preregister its children
      if (item.type === "folder") {
        const folderItem = item as LightningFolder;
        this.preregisterItemColors(
          folderItem.items,
          folderItem.folderLabelColor,
          folderItem.folderIconColor,
        );
      }
    });
  }

  private createAndRegisterColorForItem(
    item: LightningItem,
    color: string,
  ): void {
    // This method is no longer needed since we're doing the registration inline
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
            this.decorationProvider,
          ),
        ]);
      } else {
        // Show items from the configuration
        return Promise.resolve(this.getConfigurationItems());
      }
    } else {
      if (element.syntheticKind === "fileMenusRoot") {
        return Promise.resolve(this.getFileMenuItems());
      }

      // Handle folder expansion - show items of the folder
      if (element.lightningItem?.type === "folder") {
        // Pass the folder's folderIconColor/folderLabelColor as inheritance for children
        const folderItem = element.lightningItem as LightningFolder;

        // Pre-register colors for all children before creating tree items to prevent white flash
        this.preregisterItemColors(
          (element.lightningItem as LightningFolder).items,
          folderItem.folderLabelColor,
          folderItem.folderIconColor,
        );

        return Promise.resolve(
          this.getChildItems(
            (element.lightningItem as LightningFolder).items,
            folderItem.folderLabelColor,
            folderItem.folderIconColor,
          ),
        );
      }
      return Promise.resolve([]);
    }
  }

  private getConfigurationItems(): LightningTreeItem[] {
    if (!this.configuration) {
      return [];
    }

    const items = this.getChildItems(this.configuration.items);
    if (this.fileMenusVisible && this.getFileRefSources().length > 0) {
      items.push(
        new LightningTreeItem(
          "----------",
          undefined,
          undefined,
          this.decorationProvider,
          "fileMenusDivider",
        ),
        new LightningTreeItem(
          "Files",
          undefined,
          undefined,
          this.decorationProvider,
          "fileMenusRoot",
        ),
      );
    }

    const fileMenuRefItems = this.getFileMenuRefItems();
    if (fileMenuRefItems.length > 0) {
      items.push(
        new LightningTreeItem(
          "----------",
          undefined,
          undefined,
          this.decorationProvider,
          "fileMenusDivider",
        ),
        ...fileMenuRefItems,
      );
    }

    return items;
  }

  private getFileMenuItems(): LightningTreeItem[] {
    if (!this.configuration) {
      return [];
    }

    const items = this.getFileRefSources().map((source) => {
      const fileItem: LightningFileLink = {
        type: "file",
        label: source.label,
        path: source.path,
        line: source.line,
      };
      return new LightningTreeItem(
        fileItem.label,
        {
          command: "lightning.openFile",
          title: "Open File",
          arguments: [fileItem],
        },
        fileItem,
        this.decorationProvider,
      );
    });

    return items;
  }

  private getFileMenuRefItems(): LightningTreeItem[] {
    if (!this.configuration) {
      return [];
    }

    const liveActiveFileRef = this.getActiveFileRef(
      vscode.window.activeTextEditor,
    );
    if (liveActiveFileRef) {
      this.activeFileRef = liveActiveFileRef;
    }

    const activeFileRef = liveActiveFileRef || this.activeFileRef;
    if (!activeFileRef) {
      return [];
    }

    const configuredRefs = this.getConfiguredFileRefs(activeFileRef.source);
    if (configuredRefs.length === 0) {
      return [];
    }

    const refs = configuredRefs.some((refButton) => refButton.gitRef === "HEAD")
      ? configuredRefs
      : [
          ...configuredRefs,
          {
            label: "HEAD",
            gitRef: "HEAD",
            tabSuffix: "HEAD",
            icon: "git-commit",
          },
        ];

    const pointOfInterestItems = this.getPointOfInterestItems(
      activeFileRef,
      configuredRefs,
    );

    return [
      ...refs.map((refButton) =>
        this.createFileMenuRefItem(
          activeFileRef.source,
          refButton,
          activeFileRef.gitRef === refButton.gitRef,
        ),
      ),
      ...(pointOfInterestItems.length > 0
        ? [
            new LightningTreeItem(
              "----------",
              undefined,
              undefined,
              this.decorationProvider,
              "fileMenusDivider",
            ),
            ...pointOfInterestItems,
          ]
        : []),
    ];
  }

  private getPointOfInterestItems(
    activeFileRef: ActiveFileRef,
    configuredRefs: LightningFileRefButton[],
  ): LightningTreeItem[] {
    const activeRefButton = configuredRefs.find(
      (refButton) => refButton.gitRef === activeFileRef.gitRef,
    );
    const pointsOfInterest = activeRefButton?.pointsOfInterest || [];
    if (pointsOfInterest.length === 0) {
      return [];
    }

    const selectedIndex = activeFileRef.selection
      ? this.getBestPointOfInterestIndex(
          pointsOfInterest,
          activeFileRef.selection,
        )
      : -1;

    return pointsOfInterest.map((pointOfInterest, index) =>
      this.createPointOfInterestItem(pointOfInterest, index === selectedIndex),
    );
  }

  private getFileRefSources(): FileRefSource[] {
    return [
      ...(this.configuration?.fileMenus || []).map((fileMenu) => ({
        label: fileMenu.path,
        path: fileMenu.path,
        line: fileMenu.line,
        refButtons: fileMenu.refButtons,
      })),
      ...this.getFileRefSourcesFromItems(this.configuration?.items || []),
    ];
  }

  private getFileRefSourcesFromItems(items: LightningItem[]): FileRefSource[] {
    return items.flatMap((item) => {
      if (item.type === "folder") {
        return this.getFileRefSourcesFromItems(item.items);
      }

      if (item.type !== "file") {
        return [];
      }

      return [
        {
          label: item.label,
          path: item.path,
          line: item.line,
          refButtons: item.refButtons,
        },
      ];
    });
  }

  private getConfiguredFileRefs(
    source: FileRefSource,
  ): LightningFileRefButton[] {
    return source.refButtons || [];
  }

  private createFileMenuRefItem(
    source: FileRefSource,
    refButton: LightningFileRefButton,
    isSelected: boolean,
  ): LightningTreeItem {
    const fileItem: LightningFileLink = {
      type: "file",
      label: refButton.label,
      path: source.path,
      gitRef: refButton.gitRef,
      tabSuffix: refButton.tabSuffix,
      icon: refButton.icon,
    };
    const treeItem = new LightningTreeItem(
      fileItem.label,
      {
        command: "lightning.openFile",
        title: "Open File",
        arguments: [fileItem],
      },
      undefined,
      this.decorationProvider,
    );
    treeItem.description = source.label;
    treeItem.iconPath = new vscode.ThemeIcon(
      isSelected ? "arrow-right" : refButton.icon || "git-commit",
    );
    return treeItem;
  }

  private createPointOfInterestItem(
    pointOfInterest: LightningPointOfInterest,
    isSelected: boolean,
  ): LightningTreeItem {
    const treeItem = new LightningTreeItem(
      pointOfInterest.title,
      {
        command: "lightning.selectPointOfInterest",
        title: "Select Point of Interest",
        arguments: [pointOfInterest],
      },
      undefined,
      this.decorationProvider,
    );
    treeItem.description = "point";
    treeItem.iconPath = new vscode.ThemeIcon(
      isSelected ? "arrow-right" : pointOfInterest.icon || "selection",
    );
    return treeItem;
  }

  private getActiveFileRef(
    activeEditor: vscode.TextEditor | undefined,
  ): ActiveFileRef | undefined {
    if (!activeEditor) {
      return undefined;
    }

    const sourceFilePath = this.getSourceFilePath(activeEditor.document.uri);
    if (!sourceFilePath) {
      return undefined;
    }

    const source = this.getFileRefSources().find((candidate) => {
      const candidatePath = this.resolveWorkspacePath(candidate.path);
      return candidatePath && path.normalize(candidatePath) === sourceFilePath;
    });

    if (!source) {
      return undefined;
    }

    return {
      source,
      gitRef: this.getGitRef(activeEditor.document.uri),
      selection: activeEditor.selection,
    };
  }

  private getBestPointOfInterestIndex(
    pointsOfInterest: LightningPointOfInterest[],
    selection: vscode.Selection,
  ): number {
    let bestIndex = -1;
    let bestSize = Number.POSITIVE_INFINITY;

    pointsOfInterest.forEach((pointOfInterest, index) => {
      const range = this.getPointOfInterestRange(pointOfInterest);
      const containsSelection = this.isSelectionWithinRange(selection, range);

      if (!containsSelection) {
        return;
      }

      const size = this.getRangeSize(range);
      if (size < bestSize) {
        bestIndex = index;
        bestSize = size;
      }
    });

    return bestIndex;
  }

  private isSelectionWithinRange(
    selection: vscode.Selection,
    range: vscode.Range,
  ): boolean {
    if (selection.isEmpty) {
      return this.isPositionWithinRange(selection.active, range);
    }

    return (
      this.isPositionWithinRange(selection.start, range) &&
      this.isPositionWithinRange(selection.end, range)
    );
  }

  private isPositionWithinRange(
    position: vscode.Position,
    range: vscode.Range,
  ): boolean {
    return (
      position.compareTo(range.start) >= 0 && position.compareTo(range.end) <= 0
    );
  }

  private getRangeSize(range: vscode.Range): number {
    const lineSpan = range.end.line - range.start.line;
    const characterSpan = range.end.character - range.start.character;
    return lineSpan * 1_000_000 + characterSpan;
  }

  private getPointOfInterestRange(
    pointOfInterest: LightningPointOfInterest,
  ): vscode.Range {
    const start = new vscode.Position(
      Math.max(0, pointOfInterest.startLine - 1),
      Math.max(0, (pointOfInterest.startColumn || 1) - 1),
    );
    const endColumn =
      pointOfInterest.endColumn ??
      (pointOfInterest.endLine === undefined &&
      pointOfInterest.startColumn === undefined
        ? Number.MAX_SAFE_INTEGER
        : pointOfInterest.startColumn || 1);
    const end = new vscode.Position(
      Math.max(0, (pointOfInterest.endLine || pointOfInterest.startLine) - 1),
      Math.max(0, endColumn - 1),
    );
    return new vscode.Range(start, end);
  }

  private getSourceFilePath(uri: vscode.Uri): string | undefined {
    if (uri.scheme === "file") {
      return path.normalize(uri.fsPath);
    }

    if (uri.scheme === gitSnapshotScheme) {
      const query = new URLSearchParams(uri.query);
      const workspaceRoot = query.get("workspaceRoot");
      const filePath = query.get("filePath");
      return workspaceRoot && filePath
        ? path.normalize(path.resolve(workspaceRoot, filePath))
        : undefined;
    }

    return undefined;
  }

  private getGitRef(uri: vscode.Uri): string {
    if (uri.scheme !== gitSnapshotScheme) {
      return "HEAD";
    }

    return new URLSearchParams(uri.query).get("gitRef") || "HEAD";
  }

  private resolveWorkspacePath(filePath: string): string | undefined {
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder
      ? path.normalize(path.resolve(workspaceFolder.uri.fsPath, filePath))
      : undefined;
  }

  private getChildItems(
    items: LightningItem[],
    parentLabelColor?: string,
    parentIconColor?: string,
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

      // Copy preregistered data to the inherited item
      if ((item as any)._preregisteredFragment) {
        (itemWithInheritedColors as any)._preregisteredFragment = (
          item as any
        )._preregisteredFragment;
      }
      if ((item as any)._preregisteredUri) {
        (itemWithInheritedColors as any)._preregisteredUri = (
          item as any
        )._preregisteredUri;
      }
      if ((item as any)._effectiveLabelColor) {
        (itemWithInheritedColors as any)._effectiveLabelColor = (
          item as any
        )._effectiveLabelColor;
      }

      // If this item has a label color but no preregistered data, register it immediately
      // This happens during folder expansion when new tree items are created on-demand
      if (
        itemWithInheritedColors.labelColor &&
        !(item as any)._preregisteredFragment &&
        !(item as any)._preregisteredUri
      ) {
        if (
          itemWithInheritedColors.type === "file" &&
          itemWithInheritedColors.path
        ) {
          // For files, create and store a fragment
          const uniqueId = Math.random().toString(36).substring(2);
          const fileUri = vscode.Uri.file(itemWithInheritedColors.path).with({
            fragment: uniqueId,
          });
          this.decorationProvider.setItemColor(
            fileUri,
            itemWithInheritedColors.labelColor,
          );
          (itemWithInheritedColors as any)._preregisteredFragment = uniqueId;
        } else {
          // For non-file items, create and store a URI
          const uniqueId =
            Math.random().toString(36).substring(2) + Date.now().toString(36);
          const uniqueUri = vscode.Uri.parse(`lightning://item/${uniqueId}`);
          this.decorationProvider.setItemColor(
            uniqueUri,
            itemWithInheritedColors.labelColor,
          );
          (itemWithInheritedColors as any)._preregisteredUri =
            uniqueUri.toString();
        }
      }

      const treeItem = new LightningTreeItem(
        item.label,
        command,
        itemWithInheritedColors,
        this.decorationProvider,
      );
      if (this.isActiveFileItem(itemWithInheritedColors)) {
        treeItem.iconPath = itemWithInheritedColors.iconColor
          ? new vscode.ThemeIcon(
              "arrow-right",
              new vscode.ThemeColor(itemWithInheritedColors.iconColor),
            )
          : new vscode.ThemeIcon("arrow-right");
      }
      return treeItem;
    });
  }

  private isActiveFileItem(item: LightningItem): boolean {
    if (item.type !== "file") {
      return false;
    }

    const activePath = this.activeFileRef
      ? this.resolveWorkspacePath(this.activeFileRef.source.path)
      : undefined;
    const itemPath = this.resolveWorkspacePath(item.path);
    return Boolean(
      activePath && itemPath && path.normalize(activePath) === itemPath,
    );
  }
}
