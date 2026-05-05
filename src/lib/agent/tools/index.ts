/**
 * 內建工具統一註冊入口
 */
import "server-only";

import { registerTool } from "../tool-registry";
import { coursePlanTool } from "./course-plan";
import { coursePlanStatusTool } from "./course-plan-status";
import { dbQueryTool } from "./db-query";
import { similarityCheckTool } from "./similarity-check";
import { webSearchTool } from "./web-search";
import { fileReadTool, fileWriteTool, fileListTool } from "./file-ops";
import { scriptRunTool } from "./script-run";
import { semanticSearchTool } from "./semantic-search";
import { memorySaveTool, memoryRecallTool, memoryDeleteTool } from "./memory";
import { knowledgeQueryTool } from "./knowledge-query";
import { workflowTool } from "./workflow";
import { dailyBriefingTool } from "./proactive-briefing";
import { instructorSearchTool } from "./instructor-search";

let registered = false;

export function ensureToolsRegistered(): void {
  if (registered) return;
  registered = true;

  registerTool(coursePlanTool);
  registerTool(coursePlanStatusTool);
  registerTool(dbQueryTool);
  registerTool(similarityCheckTool);
  registerTool(webSearchTool);
  registerTool(fileReadTool);
  registerTool(fileWriteTool);
  registerTool(fileListTool);
  registerTool(scriptRunTool);
  registerTool(semanticSearchTool);
  registerTool(memorySaveTool);
  registerTool(memoryRecallTool);
  registerTool(memoryDeleteTool);
  registerTool(knowledgeQueryTool);
  registerTool(workflowTool);
  registerTool(dailyBriefingTool);
  registerTool(instructorSearchTool);
}
