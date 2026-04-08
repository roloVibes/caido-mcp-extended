import { gql, gqlMutate } from "../client.js";

export const environmentTools = [
  {
    name: "caido_list_environments",
    description: "List all environments with their variables.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "caido_create_environment",
    description: "Create a new environment with optional initial variables.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Environment name (e.g. 'lmcu-prod')" },
        variables: {
          type: "array",
          description: "Initial variables",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
              secret: { type: "boolean", description: "If true, stored as SECRET kind", default: false },
            },
            required: ["name", "value"],
          },
        },
      },
      required: ["name"],
    },
  },
  {
    name: "caido_update_environment",
    description: "Update an environment's name and/or variables. Replaces ALL variables — include existing ones you want to keep.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Environment ID" },
        name: { type: "string", description: "New name" },
        variables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
              secret: { type: "boolean", default: false },
            },
            required: ["name", "value"],
          },
        },
      },
      required: ["id", "name", "variables"],
    },
  },
  {
    name: "caido_select_environment",
    description: "Activate an environment so its variables are used in requests and replays.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Environment ID (use null to deselect)" },
      },
      required: [],
    },
  },
  {
    name: "caido_delete_environment",
    description: "Delete an environment by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "caido_set_env_var",
    description: "Add or update a single variable in an existing environment without replacing others.",
    inputSchema: {
      type: "object",
      properties: {
        env_id: { type: "number", description: "Environment ID" },
        name: { type: "string", description: "Variable name" },
        value: { type: "string", description: "Variable value" },
        secret: { type: "boolean", default: false },
      },
      required: ["env_id", "name", "value"],
    },
  },
];

function buildVariables(vars: any[]): any[] {
  return (vars || []).map((v: any) => ({
    name: v.name,
    value: v.value,
    kind: v.secret ? "SECRET" : "PLAIN",
  }));
}

export async function handleEnvironment(toolName: string, args: any): Promise<string> {
  switch (toolName) {
    case "caido_list_environments": {
      const data = await gql<any>(`{
        environments { id name version variables { name value kind } }
        environmentContext { selected { id name } }
      }`);
      const activeId = data.environmentContext?.selected?.id;
      const envs = data.environments.map((e: any) => {
        const active = e.id === activeId ? " [ACTIVE]" : "";
        const vars = e.variables.map((v: any) =>
          `    ${v.name} = ${v.kind === "SECRET" ? "***" : v.value}`
        ).join("\n");
        return `${e.id} | ${e.name}${active}\n${vars || "    (no variables)"}`;
      });
      return envs.join("\n\n");
    }

    case "caido_create_environment": {
      const data = await gqlMutate<any>(
        `mutation CreateEnvironment($input: CreateEnvironmentInput!) {
           createEnvironment(input: $input) {
             environment { id name }
             error { ... on OtherUserError { code } }
           }
         }`,
        { input: { name: args.name, variables: buildVariables(args.variables || []) } }
      );
      const result = data.createEnvironment;
      if (result.environment) return `Created environment: ID=${result.environment.id} name="${result.environment.name}"`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_update_environment": {
      const current = await gql<any>(`{ environment(id: "${args.id}") { version } }`);
      const version = current?.environment?.version ?? 1;
      const data = await gqlMutate<any>(
        `mutation UpdateEnvironment($id: ID!, $input: UpdateEnvironmentInput!) {
           updateEnvironment(id: $id, input: $input) {
             environment { id name version variables { name value kind } }
             error { ... on OtherUserError { code } }
           }
         }`,
        {
          id: String(args.id),
          input: {
            name: args.name,
            version,
            variables: buildVariables(args.variables),
          },
        }
      );
      const result = data.updateEnvironment;
      if (result.environment) {
        const vars = result.environment.variables.map((v: any) => `  ${v.name}=${v.kind === "SECRET" ? "***" : v.value}`).join("\n");
        return `Updated environment "${result.environment.name}":\n${vars}`;
      }
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_select_environment": {
      await gqlMutate<any>(
        `mutation SelectEnvironment($id: ID) { selectEnvironment(id: $id) }`,
        { id: args.id != null ? String(args.id) : null }
      );
      return args.id ? `Activated environment ID=${args.id}` : "Deselected environment";
    }

    case "caido_delete_environment": {
      const data = await gqlMutate<any>(
        `mutation DeleteEnvironment($id: ID!) {
           deleteEnvironment(id: $id) {
             deletedId
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: String(args.id) }
      );
      const result = data.deleteEnvironment;
      if (result.deletedId) return `Deleted environment ID=${result.deletedId}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_set_env_var": {
      const current = await gql<any>(`{ environment(id: "${args.env_id}") { id name version variables { name value kind } } }`);
      const env = current?.environment;
      if (!env) return `Error: environment ${args.env_id} not found`;

      const existing = env.variables.filter((v: any) => v.name !== args.name);
      const merged = [
        ...existing.map((v: any) => ({ name: v.name, value: v.value, kind: v.kind })),
        { name: args.name, value: args.value, kind: args.secret ? "SECRET" : "PLAIN" },
      ];

      const data = await gqlMutate<any>(
        `mutation UpdateEnvironment($id: ID!, $input: UpdateEnvironmentInput!) {
           updateEnvironment(id: $id, input: $input) {
             environment { id name variables { name value kind } }
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: String(args.env_id), input: { name: env.name, version: env.version, variables: merged } }
      );
      const result = data.updateEnvironment;
      if (result.environment) return `Set ${args.name} in environment "${result.environment.name}"`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    default:
      throw new Error(`Unknown environment tool: ${toolName}`);
  }
}
