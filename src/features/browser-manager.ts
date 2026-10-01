import * as vscode from "vscode";
import { playSoundIfPresent } from "../utils/sound-manager";
import { LightningBrowser } from "../lightning-types";

export async function openBrowser(browserItem: LightningBrowser) {
  if (browserItem && browserItem.type === "browser") {
    // Play sound if present
    await playSoundIfPresent(browserItem);

    const browserType = browserItem.browserType || "simple";
    const url = browserItem.url;

    try {
      if (browserType === "external") {
        // Open in external browser
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } else {
        await vscode.commands.executeCommand("simpleBrowser.show", url);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to open browser: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
