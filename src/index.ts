import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { projectTools, handleProject } from "./tools/projects.js";
import { environmentTools, handleEnvironment } from "./tools/environments.js";
import { scopeTools, handleScope } from "./tools/scope.js";
import { workflowTools, handleWorkflow } from "./tools/workflows.js";
import { autorizeTools, handleAutorize } from "./tools/autorize.js";
import { burpTools, burpStatusTools, handleBurpTool } from "./tools/burp.js";
import { burpAvailable } from "./burp.js";

// Check if Burp is available at startup
let burpToolsAvailable = false;

const ALL_TOOLS = [
  ...projectTools,
  ...environmentTools,
  ...scopeTools,
  ...workflowTools,
  ...autorizeTools,
  ...burpStatusTools,
];

const server = new Server(
  { name: "caido-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let result: string;

    if (name.startsWith("caido_list_projects") || name.startsWith("caido_create_project") ||
        name.startsWith("caido_select_project") || name.startsWith("caido_rename_project") ||
        name.startsWith("caido_delete_project")) {
      result = await handleProject(name, args ?? {});
    } else if (name.startsWith("caido_") && (name.includes("environment") || name.includes("env_var"))) {
      result = await handleEnvironment(name, args ?? {});
    } else if (name.startsWith("caido_") && (name.includes("scope"))) {
      result = await handleScope(name, args ?? {});
    } else if (name.startsWith("caido_") && (name.includes("workflow"))) {
      result = await handleWorkflow(name, args ?? {});
    } else if (name.startsWith("autorize_")) {
      result = await handleAutorize(name, args ?? {});
    } else if (name === "burp_status") {
      // always dispatchable, even when Burp is unreachable
      result = await handleBurpTool(name, args ?? {});
    } else if (burpToolsAvailable && name.startsWith("burp_")) {
      result = await handleBurpTool(name, args ?? {});
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: "text", text: result }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

async function main() {
  // Check if Burp is available and conditionally add tools
  try {
    burpToolsAvailable = await burpAvailable();
    if (burpToolsAvailable) {
      console.error("Burp Suite is available, adding Burp tools");
      // cast: the literal-inferred Caido union vs the SDK Tool shape
      ALL_TOOLS.push(...(burpTools as unknown as typeof ALL_TOOLS));
    } else {
      console.error("Burp Suite is not available, skipping Burp tools");
    }
  } catch (err) {
    console.error("Error checking Burp availability:", err);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("caido-mcp server running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
