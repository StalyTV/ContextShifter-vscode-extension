/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {
  createWebsocketConnection,
  sendWindowUnfocusEvent,
  syncActiveFile,
  syncActiveFileOnFocus,
  syncFileSave,
} from "./ipc";
import { storeEdit } from "./editedDocumentSymbol";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('[extension] Extension "tasksnap-vscode" is now active');
  createWebsocketConnection();

  vscode.workspace.onDidChangeTextDocument(storeEdit);
  vscode.window.onDidChangeActiveTextEditor(syncActiveFile);
  vscode.workspace.onDidSaveTextDocument(syncFileSave);

  vscode.window.onDidChangeWindowState(({ focused }) => {
    if (focused) {
      syncActiveFileOnFocus();
    } else {
      sendWindowUnfocusEvent();
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
