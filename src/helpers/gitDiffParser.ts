/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import GitDiffParser = require("git-diff-parser");
import { VSCodeTODO } from "../types";

export function extractTODOsFromDiffs(diffs: string[]): VSCodeTODO[] {
  const toDos: VSCodeTODO[] = [];

  diffs.forEach((diff) => {
    const res = GitDiffParser(diff);
    res.commits.forEach((c) => {
      c.files.forEach((f) => {
        f.lines.forEach((l) => {
          if (l.type == "added" && l.text.includes("TODO")) {
            const cleanedText = l.text.match(/\S+.*/gm)?.[0];

            const newTODO: VSCodeTODO = {
              filePath: f.name,
              line: l.ln1,
              text: cleanedText || "",
            };
            toDos.push(newTODO);
          }
        });
      });
    });
  });
  return toDos;
}
