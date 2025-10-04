import * as vscode from "vscode";
import { playSoundIfPresent } from "../utils/sound-manager";
import { LightningDialogMessage } from "../lightning-types";

export async function showDialog(item: LightningDialogMessage) {
  // Play sound if present
  await playSoundIfPresent(item);

  const severity = item.severity || "info";
  switch (severity) {
    case "error":
      vscode.window.showErrorMessage(item.message);
      break;
    case "warning":
      vscode.window.showWarningMessage(item.message);
      break;
    case "info":
    default:
      vscode.window.showInformationMessage(item.message);
      break;
  }
}
