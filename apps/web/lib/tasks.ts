import { InlineTaskRunner, RenderTaskRunner, type TaskRunner } from "@secondcurrent/integrations";

let taskRunner: TaskRunner | undefined;

// Mock mode runs every task in-process through InlineTaskRunner, same as
// Phases 3-5. Live mode dispatches to the real Render Workflow service
// (apps/workflows) instead - that service registers its own tasks
// independently, so this route process never calls .registerTask() on a
// RenderTaskRunner (it has no such method; see ensureTaskRegistered() call
// sites, which guard on `instanceof InlineTaskRunner`).
export function getTaskRunner(): TaskRunner {
  if (taskRunner) {
    return taskRunner;
  }

  if (process.env.INTEGRATION_MODE === "live") {
    const apiKey = process.env.RENDER_API_KEY;
    const workflowSlug = process.env.RENDER_WORKFLOW_SLUG;
    if (!apiKey || !workflowSlug) {
      throw new Error(
        "RENDER_API_KEY and RENDER_WORKFLOW_SLUG are required when INTEGRATION_MODE=live",
      );
    }
    taskRunner = new RenderTaskRunner({ apiKey, workflowSlug });
  } else {
    taskRunner = new InlineTaskRunner();
  }

  return taskRunner;
}

export { InlineTaskRunner };
