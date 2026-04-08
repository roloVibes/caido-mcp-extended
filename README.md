# caido-mcp-extended

An extended [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Caido](https://caido.io) that exposes full control over projects, environments, scope rules, workflows, and the Autorize plugin — directly as Claude tools.

## What it adds over the stock Caido MCP

The official `vibe-hacking` MCP covers request browsing, replay, tamper rules, and findings. This server fills the gaps:

| Feature | Stock Caido MCP | caido-mcp-extended |
|---|---|---|
| Projects (create/switch/delete) | — | ✅ |
| Environments (full CRUD + single-var update) | read + select only | ✅ |
| Scope (update/delete) | read + create only | ✅ |
| Workflows (create/run/toggle) | — | ✅ |
| Autorize plugin control | — | ✅ |

## Prerequisites

- [Caido](https://caido.io) desktop app installed and running
- Node.js 18+
- Claude Desktop or Claude Code

## Installation

```bash
git clone https://github.com/roloTeppanyaki/caido-mcp-extended.git
cd caido-mcp-extended
npm install
```

## Authentication

No setup required. The server automatically reads your active session token from the Caido Electron app's local storage (`~/.config/Caido/Local Storage/leveldb/`). As long as Caido is open and you're logged in, it works.

Token refresh is handled automatically. If no valid token is found, the server will throw a clear error.

## Configuration

### Claude Code (`~/.claude.json`)

```json
{
  "mcpServers": {
    "caido-mcp-extended": {
      "command": "npx",
      "args": ["tsx", "/path/to/caido-mcp-extended/src/index.ts"]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "caido-mcp-extended": {
      "command": "node",
      "args": ["/path/to/caido-mcp-extended/bin/run.js"]
    }
  }
}
```

For Claude Desktop you'll need to build first:
```bash
npm run build
```

## Tools Reference

### Projects (5 tools)

| Tool | Description |
|---|---|
| `caido_list_projects` | List all projects, shows active |
| `caido_create_project` | Create a new project |
| `caido_select_project` | Switch active project |
| `caido_rename_project` | Rename a project |
| `caido_delete_project` | Delete a project |

### Environments (6 tools)

| Tool | Description |
|---|---|
| `caido_list_environments` | List all envs + variables (secrets masked) |
| `caido_create_environment` | Create env with initial variables |
| `caido_update_environment` | Replace all variables in an env |
| `caido_set_env_var` | Update a single variable without touching others |
| `caido_select_environment` | Activate an env (injects vars into requests) |
| `caido_delete_environment` | Delete an env |

### Scope (4 tools)

| Tool | Description |
|---|---|
| `caido_list_scopes` | List all scope rules |
| `caido_create_scope` | Create scope (auto-denies static assets) |
| `caido_update_scope` | Update a scope rule |
| `caido_delete_scope` | Delete a scope rule |

### Workflows (6 tools)

| Tool | Description |
|---|---|
| `caido_list_workflows` | List workflows with kind + enabled state |
| `caido_get_workflow` | Get full workflow definition JSON |
| `caido_create_workflow` | Create workflow from definition JSON |
| `caido_run_workflow` | Fire an ACTIVE workflow against a request ID |
| `caido_toggle_workflow` | Enable or disable a workflow |
| `caido_create_session_refresh_workflow` | Pre-built: extract token from response → store in env var |

### Autorize (9 tools)

Full programmatic control over the [Autorize](https://github.com/caido-community/autorize) plugin for automated authorization testing.

| Tool | Description |
|---|---|
| `autorize_get_config` | Show enabled state, profiles, queue, filter |
| `autorize_enable` | Toggle passive scanning on/off |
| `autorize_set_user_profile` | Add/update a test user profile (header swap rules) |
| `autorize_remove_user_profile` | Delete a profile |
| `autorize_set_passive_filter` | Set HTTPQL filter for which requests get tested |
| `autorize_set_queue_config` | Set concurrency, rate limit, timeout |
| `autorize_list_templates` | List tested requests + per-profile access states |
| `autorize_get_results_summary` | Aggregate ALLOW/DENY/UNCERTAIN counts per profile |
| `autorize_clear_templates` | Wipe all test results |

## Example: Cross-Role Authorization Testing

```
# Set up a lower-privilege user profile in Autorize
autorize_set_user_profile(
  name="low-priv-user",
  mutations=[{ header: "Cookie", value: "session=<low-priv-token>" }]
)

# Set filter to only test your target
autorize_set_passive_filter(httpql='req.host.cont:"api.example.com"')

# Enable passive scanning
autorize_enable(enabled=true)

# Browse the app as admin — Autorize auto-replays every request as low-priv-user
# Check results
autorize_get_results_summary()
```

## Technical Notes

- Uses Caido's GraphQL API at `http://127.0.0.1:8080/graphql`
- Autorize plugin config is managed via direct filesystem access (no GraphQL API exists for it)
- Workaround for Caido's read-only project mode on startup: `ensureProjectWritable()` calls `selectProject` to force read-write mode before any mutation
- Default Caido URL can be overridden with `CAIDO_URL` environment variable

## License

MIT
