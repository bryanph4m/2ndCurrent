import { RenderTaskRunner, type TaskRunner } from "@secondcurrent/integrations";
import { requireServerEnvironmentValue } from "./env.js";

// This service only runs at all in live mode (apps/workflows/src/index.ts:
// mock mode drives every task through InlineTaskRunner inside the web
// service instead), so there is no InlineTaskRunner branch to make here -
// unlike apps/web/lib/tasks.ts, which serves both modes.
let taskRunner: TaskRunner | undefined;

export function getTaskRunner(): TaskRunner {
  taskRunner ??= new RenderTaskRunner({
    apiKey: requireServerEnvironmentValue("RENDER_API_KEY"),
    workflowSlug: requireServerEnvironmentValue("RENDER_WORKFLOW_SLUG"),
  });
  return taskRunner;
}
