import { gql, gqlMutate } from "../client.js";

const STATIC_DENY = ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.ico",
  "*.woff", "*.woff2", "*.ttf", "*.eot", "*.css", "*.mp4", "*.webm", "*.zip"];

export const scopeTools = [
  {
    name: "caido_list_scopes",
    description: "List all scopes with allowlist and denylist.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "caido_create_scope",
    description: "Create a new scope. Pass multiple domains for multi-domain scope. Static assets auto-denied unless skip_auto_deny=true.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        allowlist: {
          type: "array",
          description: "Domains/patterns to allow, e.g. ['lmcu.org', '*.lmcu.org']",
          items: { type: "string" },
        },
        denylist: {
          type: "array",
          description: "Additional deny patterns (static assets added automatically)",
          items: { type: "string" },
        },
        skip_auto_deny: {
          type: "boolean",
          description: "Skip auto-adding static asset denies",
          default: false,
        },
      },
      required: ["name", "allowlist"],
    },
  },
  {
    name: "caido_update_scope",
    description: "Update an existing scope's allowlist and denylist.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        allowlist: { type: "array", items: { type: "string" } },
        denylist: { type: "array", items: { type: "string" } },
      },
      required: ["id", "allowlist", "denylist"],
    },
  },
  {
    name: "caido_delete_scope",
    description: "Delete a scope by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

export async function handleScope(toolName: string, args: any): Promise<string> {
  switch (toolName) {
    case "caido_list_scopes": {
      const data = await gql<any>(`{ scopes { id name allowlist denylist } }`);
      if (!data.scopes?.length) return "No scopes defined.";
      return data.scopes.map((s: any) =>
        `ID: ${s.id} | ${s.name}\n  allow: ${s.allowlist.join(", ")}\n  deny:  ${s.denylist.join(", ")}`
      ).join("\n\n");
    }

    case "caido_create_scope": {
      const denylist = [
        ...(args.denylist || []),
        ...(args.skip_auto_deny ? [] : STATIC_DENY),
      ];
      const data = await gqlMutate<any>(
        `mutation CreateScope($input: CreateScopeInput!) {
           createScope(input: $input) {
             scope { id name allowlist denylist }
             error { ... on OtherUserError { code } }
           }
         }`,
        { input: { name: args.name, allowlist: args.allowlist, denylist } }
      );
      const result = data.createScope;
      if (result.scope) {
        return `Created scope "${result.scope.name}" (ID: ${result.scope.id})\n  allow: ${result.scope.allowlist.join(", ")}\n  deny:  ${result.scope.denylist.length} patterns`;
      }
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_update_scope": {
      const data = await gqlMutate<any>(
        `mutation UpdateScope($id: ID!, $allowlist: [String!]!, $denylist: [String!]!) {
           updateScope(id: $id, allowlist: $allowlist, denylist: $denylist) {
             scope { id name allowlist denylist }
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: args.id, allowlist: args.allowlist, denylist: args.denylist }
      );
      const result = data.updateScope;
      if (result.scope) return `Updated scope "${result.scope.name}"`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_delete_scope": {
      const data = await gqlMutate<any>(
        `mutation DeleteScope($id: ID!) {
           deleteScope(id: $id) { deletedId }
         }`,
        { id: args.id }
      );
      if (data.deleteScope?.deletedId) return `Deleted scope: ${data.deleteScope.deletedId}`;
      return `Error deleting scope ${args.id}`;
    }

    default:
      throw new Error(`Unknown scope tool: ${toolName}`);
  }
}
