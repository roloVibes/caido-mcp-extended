import { gql, gqlMutate } from "../client.js";

export const workflowTools = [
  {
    name: "caido_list_workflows",
    description: "List all workflows with their ID, name, kind, and enabled state.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "caido_get_workflow",
    description: "Get a workflow's full definition JSON.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "caido_create_workflow",
    description: "Create a workflow from a definition JSON object. kind must be ACTIVE, PASSIVE, or CONVERT.",
    inputSchema: {
      type: "object",
      properties: {
        definition: {
          type: "object",
          description: "Workflow definition JSON. Must include 'kind' field.",
        },
        global: {
          type: "boolean",
          description: "If true, workflow is global (runs on all projects). Default false.",
          default: false,
        },
      },
      required: ["definition"],
    },
  },
  {
    name: "caido_run_workflow",
    description: "Run an ACTIVE workflow against a specific request ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Workflow ID" },
        request_id: { type: "string", description: "Request ID to run the workflow against" },
      },
      required: ["id", "request_id"],
    },
  },
  {
    name: "caido_toggle_workflow",
    description: "Enable or disable a workflow.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["id", "enabled"],
    },
  },
  {
    name: "caido_create_session_refresh_workflow",
    description: "Create a pre-built ACTIVE workflow that refreshes a session token and stores it in an environment variable. Provide the login request details.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Workflow name, e.g. 'Refresh GM Token'" },
        env_name: { type: "string", description: "Environment name to update, e.g. 'gm-prod'" },
        token_var: { type: "string", description: "Variable name to store the token in, e.g. 'access_token'" },
        token_path: { type: "string", description: "JSON path to token in response, e.g. 'access_token' or 'data.token'" },
      },
      required: ["name", "env_name", "token_var", "token_path"],
    },
  },
];

export async function handleWorkflow(toolName: string, args: any): Promise<string> {
  switch (toolName) {
    case "caido_list_workflows": {
      const data = await gql<any>(`{
        workflows { id name enabled kind global updatedAt }
      }`);
      if (!data.workflows?.length) return "No workflows defined.";
      return data.workflows.map((w: any) =>
        `${w.id} | [${w.kind}] ${w.name} | enabled=${w.enabled} global=${w.global}`
      ).join("\n");
    }

    case "caido_get_workflow": {
      const data = await gql<any>(
        `query GetWorkflow($id: ID!) { workflow(id: $id) { id name kind enabled global definition } }`,
        { id: args.id }
      );
      if (!data.workflow) return `Workflow ${args.id} not found.`;
      return JSON.stringify(data.workflow, null, 2);
    }

    case "caido_create_workflow": {
      const data = await gqlMutate<any>(
        `mutation CreateWorkflow($input: CreateWorkflowInput!) {
           createWorkflow(input: $input) {
             workflow { id name kind enabled }
             error { ... on OtherUserError { code } }
           }
         }`,
        { input: { definition: args.definition, global: args.global ?? false } }
      );
      const result = data.createWorkflow;
      if (result.workflow) return `Created workflow: ${result.workflow.id} | [${result.workflow.kind}] ${result.workflow.name}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_run_workflow": {
      const data = await gqlMutate<any>(
        `mutation RunWorkflow($id: ID!, $input: RunActiveWorkflowInput!) {
           runActiveWorkflow(id: $id, input: $input) {
             requests { id }
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: args.id, input: { requestId: args.request_id } }
      );
      const result = data.runActiveWorkflow;
      if (result.requests) return `Workflow ran. Output requests: ${result.requests.map((r: any) => r.id).join(", ")}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_toggle_workflow": {
      const data = await gqlMutate<any>(
        `mutation ToggleWorkflow($id: ID!, $enabled: Boolean!) {
           toggleWorkflow(id: $id, enabled: $enabled) {
             workflow { id name enabled }
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: args.id, enabled: args.enabled }
      );
      const result = data.toggleWorkflow;
      if (result.workflow) return `Workflow "${result.workflow.name}" enabled=${result.workflow.enabled}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_create_session_refresh_workflow": {
      // Build a workflow definition that extracts a token from a response and stores it in an env var
      const definition = {
        name: args.name,
        kind: "ACTIVE",
        nodes: [
          {
            id: "start",
            type: "trigger",
            label: "On Request",
            next: "extract_token",
          },
          {
            id: "extract_token",
            type: "js",
            label: "Extract Token",
            code: `
const body = JSON.parse(response.body ?? "{}");
const path = "${args.token_path}".split(".");
let val = body;
for (const key of path) val = val?.[key];
if (val) {
  await sdk.env.setVariable("${args.env_name}", "${args.token_var}", val);
}
            `.trim(),
            next: null,
          },
        ],
      };

      const data = await gqlMutate<any>(
        `mutation CreateWorkflow($input: CreateWorkflowInput!) {
           createWorkflow(input: $input) {
             ... on CreateWorkflowOk { workflow { id name kind } }
             ... on WorkflowUserError { reason }
             ... on OtherUserError { reason }
           }
         }`,
        { input: { definition, global: false } }
      );
      const result = data.createWorkflow;
      if (result.workflow) {
        return `Created session-refresh workflow: ${result.workflow.id} | ${result.workflow.name}\nThis workflow will extract "${args.token_path}" from responses and store it as "${args.token_var}" in environment "${args.env_name}".`;
      }
      return `Error: ${result.reason}\n\nNote: The workflow definition format may need adjustment based on your Caido version. Use caido_get_workflow on an existing workflow to see the correct format.`;
    }

    default:
      throw new Error(`Unknown workflow tool: ${toolName}`);
  }
}
