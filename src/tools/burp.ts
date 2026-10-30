import {
  burpAvailable,
  burpScanStart,
  burpScanStatus,
  burpScanIssues,
  burpScannerStatus,
  burpIssueDefinitions,
  burpProxyHistory,
  burpConfigurationGet,
} from "../burp.js";

export const burpTools = [
  {
    name: "burp_scan_start",
    description: "Start a new Burp scan. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only).",
    inputSchema: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "URLs to scan"
        },
        name: {
          type: "string",
          description: "Optional scan name"
        }
      },
      required: ["urls"]
    }
  },
  {
    name: "burp_scan_status",
    description: "Get status of a Burp scan. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only).",
    inputSchema: {
      type: "object",
      properties: {
        scan_id: {
          type: "string",
          description: "Scan ID to check"
        }
      },
      required: ["scan_id"]
    }
  },
  {
    name: "burp_scan_issues",
    description: "Get issues found in a Burp scan. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only).",
    inputSchema: {
      type: "object",
      properties: {
        scan_id: {
          type: "string",
          description: "Scan ID to get issues for"
        }
      },
      required: ["scan_id"]
    }
  },
  {
    name: "burp_scanner_status",
    description: "Get current status of the Burp scanner queue. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only).",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "burp_issue_definitions",
    description: "Get the catalog of issue definitions in Burp. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only).",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "burp_proxy_history",
    description: "Get proxy history items. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only). HARD CEILING: Proxy history is read-only - request/response bodies stay in Burp and must be exported for full traffic analysis.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Filter by URL (optional)"
        },
        limit: {
          type: "number",
          description: "Maximum items to return (default 50)",
          default: 50
        },
        offset: {
          type: "number",
          description: "Offset for pagination (default 0)",
          default: 0
        }
      },
      required: []
    }
  },
  {
    name: "burp_configuration_get",
    description: "Get current Burp configuration. Read-only operation. HARD CEILING: The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only).",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
];

// Always registered — agents must be able to DISCOVER Burp's absence.
export const burpStatusTools = [
  {
    name: "burp_status",
    description: "Check if Burp Suite is reachable and get connection details. This tool is always available even when Burp is not running.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

export async function handleBurpTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "burp_scan_start": {
        const result = await burpScanStart(args.urls, args.name);
        if (!result.ok) return `Error starting scan: ${result.error}`;
        return `Started scan with ID: ${result.scan_id}`;
      }

      case "burp_scan_status": {
        const result = await burpScanStatus(args.scan_id);
        if (!result.ok) return `Error getting scan status: ${result.error}`;
        return `Scan ${args.scan_id} is ${result.status?.state} (${result.status?.percentage}% complete)`;
      }

      case "burp_scan_issues": {
        const result = await burpScanIssues(args.scan_id);
        if (!result.ok) return `Error getting scan issues: ${result.error}`;
        
        if (!result.issues || result.issues.length === 0) {
          return `No issues found for scan ${args.scan_id}`;
        }
        
        const issues = result.issues.map(issue => 
          `- ${issue.name} (${issue.severity}) at ${issue.url}`
        ).join("\n");
        
        return `Issues found in scan ${args.scan_id}:\n${issues}`;
      }

      case "burp_scanner_status": {
        const result = await burpScannerStatus();
        if (!result.ok) return `Error getting scanner status: ${result.error}`;
        return `Scanner status - Queued: ${result.status?.queued}, Running: ${result.status?.running}, Finished: ${result.status?.finished}`;
      }

      case "burp_issue_definitions": {
        const result = await burpIssueDefinitions();
        if (!result.ok) return `Error getting issue definitions: ${result.error}`;
        
        if (!result.definitions || result.definitions.length === 0) {
          return "No issue definitions found";
        }
        
        const defs = result.definitions.map(def => 
          `- ${def.name} (${def.severity})`
        ).join("\n");
        
        return `Issue definitions:\n${defs}`;
      }

      case "burp_proxy_history": {
        const result = await burpProxyHistory(args.url, args.limit, args.offset);
        if (!result.ok) return `Error getting proxy history: ${result.error}`;
        
        if (!result.items || result.items.length === 0) {
          return "No proxy history items found";
        }
        
        const items = result.items.map(item => 
          `- ${item.method} ${item.url} (${item.status})`
        ).join("\n");
        
        return `Proxy history items:\n${items}`;
      }

      case "burp_configuration_get": {
        const result = await burpConfigurationGet();
        if (!result.ok) return `Error getting configuration: ${result.error}`;
        
        if (!result.config) {
          return "No configuration found";
        }
        
        return `Burp Configuration:\nProxy port: ${result.config.proxy?.port}\nProxy host: ${result.config.proxy?.host}\nMax scans: ${result.config.scanner?.max_scans}`;
      }

      case "burp_status": {
        const available = await burpAvailable();
        return `Burp Suite is ${available ? 'reachable' : 'not reachable'} at ${process.env.BURP_URL || 'http://127.0.0.1:1337'}`;
      }

      default:
        throw new Error(`Unknown Burp tool: ${name}`);
    }
  } catch (err: any) {
    return `Error executing Burp tool ${name}: ${err.message}`;
  }
}