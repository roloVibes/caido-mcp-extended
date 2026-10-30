import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Use a separate token file so we don't conflict with caido-mcp-server's token
const TOKEN_PATH = join(homedir(), ".caido-mcp", "caido-mcp-extended-token.json");
// Electron's Local Storage lives in different places by OS: Linux/Kali keeps
// ~/.config/Caido, macOS keeps ~/Library/Application Support/Caido. Try both,
// use whichever exists (fix: the Linux-only path never matched on a Mac).
const ELECTRON_LS_CANDIDATES = [
  join(homedir(), ".config", "Caido", "Local Storage", "leveldb", "000003.log"),
  join(homedir(), "Library", "Application Support", "Caido", "Local Storage", "leveldb", "000003.log"),
];
function electronLsPath(): string | null {
  return ELECTRON_LS_CANDIDATES.find((p) => existsSync(p)) ?? null;
}
const CAIDO_URL = process.env.CAIDO_URL || "http://127.0.0.1:8080";
const GRAPHQL_URL = `${CAIDO_URL}/graphql`;

interface TokenFile {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

function loadToken(): TokenFile | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
  } catch {
    return null;
  }
}

function isExpired(token: TokenFile): boolean {
  return new Date(token.expiresAt) < new Date(Date.now() + 60_000);
}

// Extract the most recent non-guest token from Electron's localStorage
function loadElectronToken(): TokenFile | null {
  const lsPath = electronLsPath();
  if (!lsPath) return null;
  try {
    const data = readFileSync(lsPath);
    const text = data.toString("utf8");
    const regex = /accessToken":"([^"]+)","expiresAt":"([^"]+)","refreshToken":"([^"]*)"[^}]*"scopes":\["[A-Z]/g;
    const matches = [...text.matchAll(regex)];
    // Find valid (non-expired, non-guest) tokens
    const now = new Date();
    for (const m of matches.reverse()) {
      const [, access, expires, refresh] = m;
      if (access.endsWith(".guest")) continue;
      if (new Date(expires) < new Date(now.getTime() + 60_000)) continue;
      const token: TokenFile = { accessToken: access, refreshToken: refresh ?? "", expiresAt: expires };
      return token;
    }
  } catch {
    return null;
  }
  return null;
}

async function refreshToken(token: TokenFile): Promise<TokenFile> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation RefreshToken($refreshToken: String!) {
        refreshAuthenticationToken(refreshToken: $refreshToken) {
          ... on AuthenticationToken { accessToken refreshToken expiresAt }
          ... on AuthenticationUserError { code }
          ... on OtherUserError { code }
        }
      }`,
      variables: { refreshToken: token.refreshToken },
    }),
  });
  const data = await res.json() as any;
  const result = data?.data?.refreshAuthenticationToken;
  if (!result?.accessToken) throw new Error(`Token refresh failed: ${JSON.stringify(result)}`);
  const newToken: TokenFile = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
  };
  mkdirSync(join(homedir(), ".caido-mcp"), { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(newToken, null, 2));
  return newToken;
}

let _token: TokenFile | null = null;

async function getToken(): Promise<string> {
  if (!_token) _token = loadToken();

  // Token expired or missing — try to refresh or find a new one
  if (!_token || isExpired(_token)) {
    // 1. Try refresh with existing refresh token
    if (_token?.refreshToken) {
      try { _token = await refreshToken(_token); return _token.accessToken; } catch { }
    }
    // 2. Try to extract a valid user token from Electron localStorage
    const electronToken = loadElectronToken();
    if (electronToken) {
      _token = electronToken;
      mkdirSync(join(homedir(), ".caido-mcp"), { recursive: true });
      writeFileSync(TOKEN_PATH, JSON.stringify(_token, null, 2));
      return _token.accessToken;
    }
    // 3. Fall back to guest (read-only)
    throw new Error(
      "No valid Caido token available. The Caido app must be running and logged in. " +
      "Guest tokens are read-only. Restart Caido and try again."
    );
  }
  return _token.accessToken;
}

// Track whether we've done the project wake-up in this session
let _projectWoken = false;

// Caido opens the active project read-only on startup. Calling selectProject
// (switch away and back, or just to same project if already switched) reopens it writable.
// We call this before any mutation that writes to project-scoped data.
export async function ensureProjectWritable(): Promise<void> {
  if (_projectWoken) return;
  _projectWoken = true;

  const token = await getToken();
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  // Get current project
  const res = await fetch(GRAPHQL_URL, {
    method: "POST", headers,
    body: JSON.stringify({ query: "{ currentProject { project { id } } }" }),
  });
  const body = await res.json() as any;
  const currentId = body?.data?.currentProject?.project?.id;
  if (!currentId) return; // no project selected, nothing to do

  // Switch to a different project and back to force read-write mode
  const listRes = await fetch(GRAPHQL_URL, {
    method: "POST", headers,
    body: JSON.stringify({ query: "{ projects { id } }" }),
  });
  const listBody = await listRes.json() as any;
  const projects: any[] = listBody?.data?.projects ?? [];
  const other = projects.find((p: any) => p.id !== currentId);

  if (other) {
    // Switch to another project
    await fetch(GRAPHQL_URL, {
      method: "POST", headers,
      body: JSON.stringify({
        query: "mutation S($id: ID!) { selectProject(id: $id) { currentProject { project { id } } } }",
        variables: { id: other.id },
      }),
    });
  }

  // Switch back to the original project (opens it read-write)
  await fetch(GRAPHQL_URL, {
    method: "POST", headers,
    body: JSON.stringify({
      query: "mutation S($id: ID!) { selectProject(id: $id) { currentProject { project { id } } } }",
      variables: { id: currentId },
    }),
  });
}

export async function gql<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json() as { data?: T; errors?: any[] };
  if (body.errors?.length) {
    const msg = body.errors.map((e: any) => e.message).join("; ");
    throw new Error(`GraphQL error: ${msg}`);
  }
  return body.data as T;
}

// Wrapper for mutations that write to project-scoped data (environments, scopes, workflows)
export async function gqlMutate<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  await ensureProjectWritable();
  return gql<T>(query, variables);
}
