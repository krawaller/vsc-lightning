import * as vscode from "vscode";
import { playSoundIfPresent } from "../utils/sound-manager";

export async function showDialog(item: any) {
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
