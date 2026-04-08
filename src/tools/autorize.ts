import { gql } from "../client.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";

const AUTORIZE_PLUGIN_DIR = join(
  homedir(), ".local", "share", "caido", "plugins",
  "b6dc053f-e5aa-4415-8948-5cb49ad2aefb"
);

async function getCurrentProjectId(): Promise<string> {
  const data = await gql<any>(`{ currentProject { project { id } } }`);
  if (!data.currentProject?.project?.id) throw new Error("No active project selected.");
  return data.currentProject.project.id;
}

function configPath(projectId: string): string {
  return join(AUTORIZE_PLUGIN_DIR, `config-${projectId}.json`);
}

function templatesPath(projectId: string): string {
  return join(AUTORIZE_PLUGIN_DIR, `templates-${projectId}.json`);
}

function readConfig(projectId: string): any {
  const path = configPath(projectId);
  if (!existsSync(path)) throw new Error(`No Autorize config for project ${projectId}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeConfig(projectId: string, config: any): void {
  writeFileSync(configPath(projectId), JSON.stringify(config, null, 2));
}

function readTemplates(projectId: string): Record<string, any> {
  const path = templatesPath(projectId);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

export const autorizeTools = [
  {
    name: "autorize_get_config",
    description: "Get Autorize configuration for the current project — enabled state, user profiles, mutations, queue settings, passive filtering.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "autorize_enable",
    description: "Enable or disable Autorize passive scanning for the current project.",
    inputSchema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
    },
  },
  {
    name: "autorize_set_user_profile",
    description: "Add or update an Autorize user profile (the lower-privilege session to test with). Mutations are header replacements, e.g. replacing the Authorization header with a lower-priv token.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Profile name, e.g. 'low-priv user'" },
        mutations: {
          type: "array",
          description: "Header mutations for this profile",
          items: {
            type: "object",
            properties: {
              header: { type: "string", description: "Header name, e.g. 'Authorization'" },
              value: { type: "string", description: "Replacement value, e.g. 'Bearer <low-priv-token>'" },
            },
            required: ["header", "value"],
          },
        },
        enabled: { type: "boolean", default: true },
      },
      required: ["name", "mutations"],
    },
  },
  {
    name: "autorize_remove_user_profile",
    description: "Remove an Autorize user profile by name.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "autorize_set_passive_filter",
    description: "Set the HTTPQL filter for Autorize passive scanning (which requests get tested).",
    inputSchema: {
      type: "object",
      properties: {
        httpql: { type: "string", description: "HTTPQL filter, e.g. 'req.host.eq:\"api.example.com\"'" },
        only_in_scope: { type: "boolean", default: true },
      },
      required: ["httpql"],
    },
  },
  {
    name: "autorize_set_queue_config",
    description: "Configure Autorize queue settings — concurrency, rate, timeout.",
    inputSchema: {
      type: "object",
      properties: {
        max_concurrent: { type: "number", default: 5 },
        requests_per_second: { type: "number", default: 30 },
        timeout_seconds: { type: "number", default: 15 },
      },
      required: [],
    },
  },
  {
    name: "autorize_list_templates",
    description: "List all Autorize templates (tested requests) for the current project with their access state results.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "autorize_get_results_summary",
    description: "Get a summary of Autorize results — count of ALLOW/DENY/UNCERTAIN per profile.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "autorize_clear_templates",
    description: "Clear all Autorize templates for the current project.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export async function handleAutorize(toolName: string, args: any): Promise<string> {
  const projectId = await getCurrentProjectId();

  switch (toolName) {
    case "autorize_get_config": {
      const config = readConfig(projectId);
      const profiles = config.userProfiles?.map((p: any) =>
        `  [${p.enabled ? "ON" : "OFF"}] ${p.name}: ${p.mutations?.length ?? 0} mutations`
      ).join("\n") || "  (none)";
      return [
        `Autorize Config — Project ${projectId}`,
        `enabled:       ${config.enabled}`,
        `testNoAuth:    ${config.testNoAuth}`,
        `multiUserMode: ${config.multiUserMode}`,
        ``,
        `User Profiles:`,
        profiles,
        ``,
        `Queue: ${config.queue?.maxConcurrentRequests} concurrent, ${config.queue?.requestsPerSecond}/s, ${config.queue?.requestTimeoutSeconds}s timeout`,
        `Passive filter: ${config.passiveFiltering?.httpql || "(none)"} | inScope=${config.passiveFiltering?.onlyInScope}`,
        `Status detection: auth="${config.statusDetection?.authorizedHttpql || "auto"}" unauth="${config.statusDetection?.unauthorizedHttpql || "auto"}"`,
      ].join("\n");
    }

    case "autorize_enable": {
      const config = readConfig(projectId);
      config.enabled = args.enabled;
      writeConfig(projectId, config);
      return `Autorize ${args.enabled ? "enabled" : "disabled"} for project ${projectId}.\nNote: Changes take effect on next Autorize operation or project reload.`;
    }

    case "autorize_set_user_profile": {
      const config = readConfig(projectId);
      if (!config.userProfiles) config.userProfiles = [];

      const mutations = args.mutations.map((m: any) => ({
        id: randomUUID(),
        kind: "replace",
        name: m.header,
        value: m.value,
        enabled: true,
      }));

      const existing = config.userProfiles.findIndex((p: any) => p.name === args.name);
      const profile = {
        id: existing >= 0 ? config.userProfiles[existing].id : randomUUID(),
        name: args.name,
        enabled: args.enabled ?? true,
        mutations,
      };

      if (existing >= 0) {
        config.userProfiles[existing] = profile;
      } else {
        config.userProfiles.push(profile);
      }

      writeConfig(projectId, config);
      return `User profile "${args.name}" ${existing >= 0 ? "updated" : "created"} with ${mutations.length} mutation(s).`;
    }

    case "autorize_remove_user_profile": {
      const config = readConfig(projectId);
      const before = config.userProfiles?.length ?? 0;
      config.userProfiles = (config.userProfiles || []).filter((p: any) => p.name !== args.name);
      writeConfig(projectId, config);
      const removed = before - (config.userProfiles?.length ?? 0);
      return removed > 0 ? `Removed profile "${args.name}".` : `Profile "${args.name}" not found.`;
    }

    case "autorize_set_passive_filter": {
      const config = readConfig(projectId);
      if (!config.passiveFiltering) config.passiveFiltering = {};
      config.passiveFiltering.httpql = args.httpql;
      config.passiveFiltering.onlyInScope = args.only_in_scope ?? true;
      writeConfig(projectId, config);
      return `Passive filter set: "${args.httpql}" | inScope=${args.only_in_scope ?? true}`;
    }

    case "autorize_set_queue_config": {
      const config = readConfig(projectId);
      if (!config.queue) config.queue = {};
      if (args.max_concurrent != null) config.queue.maxConcurrentRequests = args.max_concurrent;
      if (args.requests_per_second != null) config.queue.requestsPerSecond = args.requests_per_second;
      if (args.timeout_seconds != null) config.queue.requestTimeoutSeconds = args.timeout_seconds;
      writeConfig(projectId, config);
      return `Queue config updated: ${config.queue.maxConcurrentRequests} concurrent, ${config.queue.requestsPerSecond}/s, ${config.queue.requestTimeoutSeconds}s timeout`;
    }

    case "autorize_list_templates": {
      const templates = readTemplates(projectId);
      const entries = Object.entries(templates);
      if (!entries.length) return "No Autorize templates in current project.";
      const lines = entries.map(([id, t]: [string, any]) => {
        const req = t.request;
        const results = t.results || {};
        const states = Object.entries(results).map(([profile, r]: [string, any]) =>
          `${profile}=${r.accessState ?? "?"}`
        ).join(" ");
        return `${id.slice(0, 8)} | ${req?.method ?? "?"} ${req?.host ?? "?"}${req?.path ?? ""} | ${states || "pending"}`;
      });
      return `Autorize Templates (${entries.length}):\n${lines.join("\n")}`;
    }

    case "autorize_get_results_summary": {
      const templates = readTemplates(projectId);
      const entries = Object.values(templates);
      if (!entries.length) return "No templates to summarize.";

      const summary: Record<string, Record<string, number>> = {};
      for (const t of entries as any[]) {
        for (const [profile, result] of Object.entries(t.results || {}) as any[]) {
          if (!summary[profile]) summary[profile] = { authorized: 0, unauthorized: 0, uncertain: 0, pending: 0 };
          summary[profile][result.accessState ?? "pending"]++;
        }
      }

      const lines = Object.entries(summary).map(([profile, counts]) =>
        `${profile}: ALLOW=${counts.authorized ?? 0} DENY=${counts.unauthorized ?? 0} UNCERTAIN=${counts.uncertain ?? 0} PENDING=${counts.pending ?? 0}`
      );
      return `Autorize Results (${entries.length} total):\n${lines.join("\n")}`;
    }

    case "autorize_clear_templates": {
      writeFileSync(templatesPath(projectId), JSON.stringify({}));
      return `Cleared all Autorize templates for project ${projectId}.`;
    }

    default:
      throw new Error(`Unknown autorize tool: ${toolName}`);
  }
}
