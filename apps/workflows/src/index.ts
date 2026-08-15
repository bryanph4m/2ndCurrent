import { startTaskServer, TaskRegistry } from "@renderinc/sdk/workflows";
import "./tasks/analyze-item.js";
import "./tasks/compute-study-metrics.js";
import "./tasks/finalize-item.js";
import "./tasks/match-demand.js";
import "./tasks/process-webhook.js";

// Section 37.2: register all task files from one entry point. Importing each
// task module runs its top-level task(...) call, which registers it with
// the SDK's TaskRegistry as a side effect - this file's only job is to make
// sure every task module has been imported before the server starts.
async function main(): Promise<void> {
  const registeredNames = TaskRegistry.getInstance().getAllTaskNames();
  console.log(`secondcurrent-workflows: registered tasks: ${registeredNames.join(", ")}`);

  // Section 35.2: "Render tasks run inline or through the local task
  // server." Without a Render API key there is no control plane to connect
  // to - mock mode drives every task through InlineTaskRunner inside the web
  // service instead, so this process has nothing further to do locally.
  if (!process.env.RENDER_API_KEY) {
    console.log(
      "secondcurrent-workflows: RENDER_API_KEY not set, tasks registered but the task server was not started (local/mock mode)",
    );
    return;
  }

  await startTaskServer();
}

main();
