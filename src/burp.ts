/**
 * Burp Suite REST API client for caido-mcp-extended
 * 
 * HARD CEILINGS:
 * - The REST API CANNOT drive Repeater or Intruder (tabs are user-driven only)
 * - Sending a request via an extension's sendRequest SKIPS session handling unless the Extender context is in tools_scope
 * - Proxy history is read-only
 * 
 * Configurable via environment variables:
 * - BURP_URL: REST API endpoint (default: http://127.0.0.1:1337)
 * - BURP_API_KEY: Optional API key for authentication
 */

const BURP_URL = process.env.BURP_URL || "http://127.0.0.1:1337";
const BURP_API_KEY = process.env.BURP_API_KEY;

export interface BurpIssue {
  id: string;
  name: string;
  severity: string;
  confidence: string;
  url: string;
  issue_detail: string;
  remediation: string;
  references: string[];
}

export interface BurpHistoryItem {
  id: string;
  url: string;
  method: string;
  status: number;
  host: string;
  response_bytes: number;
}

export interface BurpScanStatus {
  state: string;
  percentage: number;
}

export interface BurpScannerStatus {
  queued: number;
  running: number;
  finished: number;
}

export interface BurpIssueDefinition {
  id: string;
  name: string;
  severity: string;
  confidence: string;
  description: string;
  remediation: string;
  references: string[];
}

export interface BurpConfiguration {
  proxy: {
    port: number;
    host: string;
  };
  scanner: {
    max_scans: number;
  };
}

/**
 * Check if Burp Suite REST API is reachable (1s budget)
 */
export async function burpAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/scanner/status`, {
      method: "GET",
      headers: getBurpHeaders(),
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getBurpHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (BURP_API_KEY) {
    headers["X-API-KEY"] = BURP_API_KEY;
  }
  return headers;
}

/**
 * Start a new scan
 */
export async function burpScanStart(urls: string[], name?: string): Promise<{ ok: boolean; scan_id?: string; error?: string }> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/scan`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...getBurpHeaders(),
      },
      body: JSON.stringify({
        urls,
        name,
        scope: {
          include: urls.map(url => ({ url })),
        }
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    return { ok: true, scan_id: data.scan_id };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get scan status
 */
export async function burpScanStatus(scanId: string): Promise<{ ok: boolean; status?: BurpScanStatus; error?: string }> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/scan/${scanId}`, {
      method: "GET",
      headers: getBurpHeaders(),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    return { ok: true, status: { state: data.state, percentage: data.percentage } };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get scan issues
 */
export async function burpScanIssues(scanId: string): Promise<{ ok: boolean; issues?: BurpIssue[]; error?: string }> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/scan/${scanId}/issues`, {
      method: "GET",
      headers: getBurpHeaders(),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    
    // Normalize issues to our format
    const issues = (data.issues || []).map((issue: any) => ({
      id: issue.id,
      name: issue.name,
      severity: issue.severity,
      confidence: issue.confidence,
      url: issue.url,
      issue_detail: issue.issue_detail?.substring(0, 2000) || "",
      remediation: issue.remediation?.substring(0, 2000) || "",
      references: issue.references || [],
    }));
    
    return { ok: true, issues };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get scanner status
 */
export async function burpScannerStatus(): Promise<{ ok: boolean; status?: BurpScannerStatus; error?: string }> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/scanner/status`, {
      method: "GET",
      headers: getBurpHeaders(),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    return { ok: true, status: {
      queued: data.queued || 0,
      running: data.running || 0,
      finished: data.finished || 0
    }};
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get issue definitions
 */
export async function burpIssueDefinitions(): Promise<{ ok: boolean; definitions?: BurpIssueDefinition[]; error?: string }> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/scanner/issue_definitions`, {
      method: "GET",
      headers: getBurpHeaders(),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    
    // Normalize definitions to our format
    const definitions = (data.definitions || []).map((def: any) => ({
      id: def.id,
      name: def.name,
      severity: def.severity,
      confidence: def.confidence,
      description: def.description || "",
      remediation: def.remediation || "",
      references: def.references || [],
    }));
    
    return { ok: true, definitions };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get proxy history
 */
export async function burpProxyHistory(url?: string, limit = 50, offset = 0): Promise<{ ok: boolean; items?: BurpHistoryItem[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (url) params.append("url", url);
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());

    const res = await fetch(`${BURP_URL}/v0.1/proxy/history?${params}`, {
      method: "GET",
      headers: getBurpHeaders(),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    
    // Normalize history items to our format
    const items = (data.items || []).map((item: any) => ({
      id: item.id,
      url: item.url,
      method: item.method,
      status: item.status,
      host: item.host,
      response_bytes: item.response_bytes || 0,
    }));
    
    return { ok: true, items };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get current configuration
 */
export async function burpConfigurationGet(): Promise<{ ok: boolean; config?: BurpConfiguration; error?: string }> {
  try {
    const res = await fetch(`${BURP_URL}/v0.1/configuration`, {
      method: "GET",
      headers: getBurpHeaders(),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }

    const data = await res.json();
    return { ok: true, config: data.configuration };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}