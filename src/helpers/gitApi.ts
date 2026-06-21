/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import * as vscode from "vscode";
import { API, Commit, GitExtension } from "./git";
import { Branch } from "./git.d";

let gitExtension: GitExtension | undefined;
let git: API | undefined;

function init() {
  gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git")?.exports;
  if (gitExtension) {
    git = gitExtension.getAPI(1);
  }
}

export function getCurrentBranch(
  repositoryRoot: vscode.Uri
): Branch | undefined {
  if (!gitExtension || !git) {
    init();
  }
  // check if now defined
  if (!gitExtension || !git) return;

  const repo = git.getRepository(repositoryRoot);
  if (!repo) return undefined;

  const currentBranch = repo.state.HEAD;
  return currentBranch;
}

export async function getCommit(
  repositoryRoot: vscode.Uri,
  ref: string
): Promise<Commit | undefined> {
  if (!gitExtension || !git) {
    init();
  }
  // check if now defined
  if (!gitExtension || !git) return;

  const repo = git.getRepository(repositoryRoot);
  if (!repo) return undefined;

  const commit = await repo.getCommit(ref);
  return commit;
}

export async function getDiffs(repositoryRoot: vscode.Uri) {
  const diffs: string[] = [];

  if (!gitExtension || !git) {
    init();
  }
  // check if now defined
  if (!gitExtension || !git) return;

  const repo = git.getRepository(repositoryRoot);
  if (!repo) return;

  for (const change of repo.state.workingTreeChanges) {
    try {
      diffs.push(await repo.diffWithHEAD(change.uri.fsPath));
    } catch (error) {
      console.error(error);
    }
  }

  return diffs;
}
