/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { WebSocket } from "ws";
import * as vscode from "vscode";
import {
  ActiveFileMessage,
  OpenVSCodeFile,
  VSCodeSnapshot,
  VSCodeTODO,
  WindowUnfocusMessage,
} from "./types";
import { getCommit, getCurrentBranch, getDiffs } from "./helpers/gitApi";
import { Branch, Commit } from "./helpers/git";
import { extractTODOsFromDiffs } from "./helpers/gitDiffParser";
import { getLastEdit } from "./editedDocumentSymbol";

let isConnectionWarningShown: boolean;
let isConnectionWarningSnoozed: boolean;

let reconnectInterval: NodeJS.Timeout;
let websocket: WebSocket;

export function createWebsocketConnection() {
  websocket = new WebSocket("ws://localhost:8086");
  websocket.addEventListener("error", () => {
    console.log("error");
  });
  websocket.addEventListener("open", onOpen);
  websocket.addEventListener("message", onMessage);
  websocket.addEventListener("close", onClose);
}

function onOpen() {
  console.log("[ipc] websocket connection open");
  clearInterval(reconnectInterval);
  if (
    websocket.readyState === websocket.CLOSED ||
    websocket.readyState === websocket.CLOSING
  ) {
    return console.error(
      "[ipc] tried to send data, but websocket not connected"
    );
  }
  websocket.send(JSON.stringify({ data: {}, endpoint: "ws-connected" }));
}

async function onMessage(event: any) {
  console.log("[ipc] websocket message", event);
  const data = JSON.parse(event.data);
  if (data.endpoint === "get-vscode-snapshot") {
    await handleGetVSCodeSnapshot();
  } else if (data.endpoint === "open-files") {
    const files = data.data as string[];
    handleOpenFiles(files);
  } else if (data.endpoint === "close-files") {
    const files = data.data as string[];
    handleCloseFiles(files);
  }
}

function onClose() {
  console.log("[ipc] websocket connection closed");
  showConnectionWarning();
  reconnect();
}

function reconnect() {
  clearInterval(reconnectInterval);

  reconnectInterval = setInterval(() => {
    console.log("[ipc] reconnecting...");

    // make sure we don't have dangeling connection attempts
    websocket.close();

    // reconnect
    createWebsocketConnection();
  }, 10000);
}

async function handleGetVSCodeSnapshot() {
  let currentBranch: Branch | undefined = undefined;
  let lastCommit: Commit | undefined = undefined;
  let toDos: VSCodeTODO[] = [];
  let hasUncommittedChanges = false;

  const rootUri = getRootUri();
  if (rootUri) {
    currentBranch = getCurrentBranch(rootUri);
    const lastCommitRef = currentBranch?.commit;
    if (lastCommitRef) {
      lastCommit = await getCommit(rootUri, lastCommitRef);
    }

    // get TODOs
    const diffs = await getDiffs(rootUri);
    if (diffs) {
      toDos = extractTODOsFromDiffs(diffs);
      hasUncommittedChanges = diffs.length > 0;
    }
  }

  const response: VSCodeSnapshot = {
    openFiles: getOpenFiles(),
    branch: currentBranch?.name,
    lastCommit: lastCommit,
    hasUncommittedChanges: hasUncommittedChanges,
    toDos: toDos,
    lastEdit: getLastEdit(),
    workspaceName: vscode.workspace.name,
    // Prefer the saved .code-workspace file path; otherwise fall back to the
    // first open folder. The common case is a plain "open folder" window,
    // where `workspaceFile` is undefined but `workspaceFolders[0]` is the
    // project root — that's what we want to reopen so the project comes back
    // up the way it was, not just the individual files.
    workspacePath:
      vscode.workspace.workspaceFile?.fsPath ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };

  websocket.send(
    JSON.stringify({ data: response, endpoint: "get-vscode-snapshot" })
  );
}

function getOpenFiles(): OpenVSCodeFile[] {
  const openFiles: OpenVSCodeFile[] = [];
  const tabs = vscode.window.tabGroups.activeTabGroup.tabs;
  tabs.forEach((tab) => {
    if (
      tab.input instanceof vscode.TabInputText ||
      tab.input instanceof vscode.TabInputNotebook
    ) {
      const openFile: OpenVSCodeFile = {
        name: tab.label,
        path: tab.input.uri.fsPath,
        isActive: tab.isActive,
      };
      openFiles.push(openFile);
    }
  });

  return openFiles;
}

function getRootUri(): vscode.Uri | undefined {
  const currentEditor = vscode.window.activeTextEditor;
  if (!currentEditor) return undefined;

  const activeFile = currentEditor.document.uri;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeFile);
  return workspaceFolder?.uri;
}

async function handleOpenFiles(files: string[]) {
  for await (const filePath of files) {
    const document = await vscode.workspace.openTextDocument(filePath);
    vscode.window.showTextDocument(document, { preview: false });
  }
}

async function handleCloseFiles(filesToClose: string[]) {
  const openTabs = vscode.window.tabGroups.activeTabGroup.tabs;

  const tabsToClose = openTabs.filter((openTab) => {
    if (
      openTab.input instanceof vscode.TabInputText &&
      filesToClose.includes(openTab.input.uri.fsPath)
    ) {
      return true;
    }
  });
  vscode.window.tabGroups.close(tabsToClose);
}

export async function syncActiveFile(e: vscode.TextEditor | undefined) {
  if (e) {
    const filePath = e.document.fileName;
    const activeFileMessage: ActiveFileMessage = {
      activeFile: filePath,
      openFiles: getOpenFiles(),
    };
    websocket.send(
      JSON.stringify({ data: activeFileMessage, endpoint: "active-file" })
    );
  }
}

export async function syncActiveFileOnFocus() {
  const currentEditor = vscode.window.activeTextEditor;

  const filePath = currentEditor ? currentEditor.document.fileName : null;
  const activeFileMessage: ActiveFileMessage = {
    activeFile: filePath,
    openFiles: getOpenFiles(),
  };
  websocket.send(
    JSON.stringify({ data: activeFileMessage, endpoint: "active-file" })
  );
}

export async function sendWindowUnfocusEvent() {
  const windowUnfocusMessage: WindowUnfocusMessage = {
    openFiles: getOpenFiles(),
  };
  websocket.send(
    JSON.stringify({ data: windowUnfocusMessage, endpoint: "window-unfocus" })
  );
}

export async function syncFileSave(e: vscode.TextDocument) {
  const filePath = e.fileName;
  websocket.send(JSON.stringify({ data: filePath, endpoint: "file-save" }));
}

async function showConnectionWarning() {
  if (isConnectionWarningShown || isConnectionWarningSnoozed) {
    return;
  }
  isConnectionWarningShown = true;
  await vscode.window.showWarningMessage(
    "no connection - make sure TaskSnap is running",
    "ok"
  );
  isConnectionWarningShown = false;
  isConnectionWarningSnoozed = true;
  setTimeout(() => (isConnectionWarningSnoozed = false), 1000 * 60 * 5);
}
