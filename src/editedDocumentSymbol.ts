/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import * as vscode from "vscode";
import { Edit } from "./types";

let editQueue: Edit[] = [];
let lastRun: number | undefined; // timestamp as number

const coolDownTime = 3 * 1000; // time in ms
const editQueueTimeWindow = 60 * 1000;

export function getLastEdit(): Edit | undefined {
  if (editQueue.length === 0) return undefined;

  // the first element of the queue is the most recent element. We traverse the queue to see if
  // the user was recently editing multiple lines of the same function.
  const lastEdit: Edit = editQueue[0];
  for (let i = 1; i < editQueue.length; i++) {
    const pointer = editQueue[i];
    if (lastEdit.functionName !== pointer.functionName) {
      break;
    } else {
      const updatedRange: vscode.Range = lastEdit.lineRange.union(
        pointer.lineRange
      );
      lastEdit.lineRange = updatedRange;
    }
  }

  return lastEdit;
}

export async function storeEdit(e: vscode.TextDocumentChangeEvent) {
  // to save performance, only run algorithm every 5 seconds
  if (lastRun && Date.now() < lastRun + coolDownTime) {
    return;
  } else {
    lastRun = Date.now();
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor || e.contentChanges.length === 0) return;

  const changedRange = e.contentChanges[0].range;

  // find name of edited function
  let symbolsTree: vscode.DocumentSymbol[] = [];
  try {
    symbolsTree = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      activeEditor.document.uri
    );
  } catch (err) {
    console.error(err);
    return;
  }

  // depending on the structure of the project, we are at a different level
  // of the symbols tree. We traverse the tree structure recursively and extract
  // all functions / methods
  const functions: vscode.DocumentSymbol[] = [];
  extractFunctions(symbolsTree, functions);

  let functionName: string | undefined;
  functions.forEach((fun) => {
    const intersection = fun.range.intersection(changedRange);
    if (intersection) {
      functionName = fun.name;
    }
  });

  // get content of edited line
  const lineContent = activeEditor.document.lineAt(
    changedRange.start.line
  ).text;
  const cleanedContent = lineContent.match(/\S+.*/gm)?.[0]; // remove white spaces in front

  const lastEdit: Edit = {
    lineRange: changedRange,
    code: cleanedContent || "",
    filePath: activeEditor.document.uri.fsPath,
    functionName: functionName,
    timestamp: new Date(),
  };
  editQueue.unshift(lastEdit);
  refreshEditQueue();
}

function extractFunctions(
  symbols: vscode.DocumentSymbol[],
  result: vscode.DocumentSymbol[]
) {
  for (const symbol of symbols) {
    if (
      symbol.kind === vscode.SymbolKind.Method ||
      symbol.kind === vscode.SymbolKind.Function
    ) {
      result.push(symbol);
    } else if (symbol.children.length > 0) {
      extractFunctions(symbol.children, result);
    }
  }
}

// only keep the elements added during the time window specified in "editQueueTimeWindow"
function refreshEditQueue() {
  const earliestTime = Date.now() - editQueueTimeWindow;

  const updatedQueue = editQueue.filter((edit) => {
    return edit.timestamp.getTime() > earliestTime;
  });
  editQueue = updatedQueue;
}
