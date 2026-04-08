import { gql, gqlMutate } from "../client.js";

export const projectTools = [
  {
    name: "caido_list_projects",
    description: "List all Caido projects with their ID, name, and status.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "caido_create_project",
    description: "Create a new Caido project. Use temporary=false for persistent projects.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        temporary: { type: "boolean", description: "If true, project is not persisted to disk. Default false.", default: false },
      },
      required: ["name"],
    },
  },
  {
    name: "caido_select_project",
    description: "Switch to a project by ID. All subsequent operations target this project.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "caido_rename_project",
    description: "Rename a project.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "caido_delete_project",
    description: "Delete a project by ID. Cannot delete the currently active project.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
];

export async function handleProject(name: string, args: any): Promise<string> {
  switch (name) {
    case "caido_list_projects": {
      const data = await gql<any>(`{ projects { id name updatedAt status } currentProject { project { id name } } }`);
      const current = data.currentProject?.project?.id;
      const list = data.projects.map((p: any) =>
        `${p.id === current ? "* " : "  "}${p.id} | ${p.name}`
      );
      return `Projects (* = active):\n${list.join("\n")}`;
    }

    case "caido_create_project": {
      const data = await gqlMutate<any>(
        `mutation CreateProject($input: CreateProjectInput!) {
           createProject(input: $input) {
             project { id name }
             error { ... on OtherUserError { code } }
           }
         }`,
        { input: { name: args.name, temporary: args.temporary ?? false } }
      );
      const result = data.createProject;
      if (result.project) return `Created project: ${result.project.id} | ${result.project.name}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_select_project": {
      const data = await gql<any>(
        `mutation SelectProject($id: ID!) {
           selectProject(id: $id) {
             currentProject { project { id name } }
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: args.id }
      );
      const result = data.selectProject;
      if (result.currentProject?.project) return `Switched to project: ${result.currentProject.project.id} | ${result.currentProject.project.name}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_rename_project": {
      const data = await gqlMutate<any>(
        `mutation RenameProject($id: ID!, $name: String!) {
           renameProject(id: $id, name: $name) {
             project { id name }
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: args.id, name: args.name }
      );
      const result = data.renameProject;
      if (result.project) return `Renamed to: ${result.project.name}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    case "caido_delete_project": {
      const data = await gqlMutate<any>(
        `mutation DeleteProject($id: ID!) {
           deleteProject(id: $id) {
             deletedId
             error { ... on OtherUserError { code } }
           }
         }`,
        { id: args.id }
      );
      const result = data.deleteProject;
      if (result.deletedId) return `Deleted project: ${result.deletedId}`;
      return `Error: ${result.error?.code ?? "unknown"}`;
    }

    default:
      throw new Error(`Unknown project tool: ${name}`);
  }
}
