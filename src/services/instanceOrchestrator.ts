import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import type { Pool } from "pg";
import type { InstanceStatus } from "../types.js";

const exec = promisify(execFile);

const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE ?? "openclaw/openclaw:latest";
const OPENCLAW_GATEWAY_PORT = 18789;
const VOLUMES_BASE = process.env.OPENCLAW_VOLUMES_BASE ?? "/var/lib/ovni-ai/instances";
const DOCKER_NETWORK = process.env.OPENCLAW_NETWORK ?? "ovni-ai-instances";

export interface ProvisionInstanceInput {
  tenantId:       string;
  tenantSlug:     string;
  anthropicKey:   string;
  defaultModel:   string;
  systemPrompt?:  string;
  channels?:      Record<string, unknown>;
  softwareStack?: Record<string, unknown>;
}

export interface InstanceInfo {
  instanceId:  string;
  containerId: string;
  gatewayUrl:  string;
  gatewayToken: string;
  port:        number;
}

// ─── Ensure Docker network exists ────────────────────────────────────────────

async function ensureNetwork(): Promise<void> {
  try {
    await exec("docker", ["network", "inspect", DOCKER_NETWORK]);
  } catch {
    await exec("docker", ["network", "create", DOCKER_NETWORK]);
  }
}

// ─── Allocate a free port ────────────────────────────────────────────────────

let nextPort = 19000;

async function allocatePort(pg: Pool): Promise<number> {
  const result = await pg.query(
    `SELECT MAX(port) AS max_port FROM openclaw_instances WHERE port IS NOT NULL`,
  );
  const maxPort = result.rows[0]?.max_port;
  nextPort = maxPort ? Math.max(nextPort, maxPort + 1) : nextPort;
  return nextPort++;
}

// ─── Provision a new OpenClaw instance ───────────────────────────────────────

export async function provisionInstance(
  pg: Pool,
  input: ProvisionInstanceInput,
): Promise<InstanceInfo> {
  const port = await allocatePort(pg);
  const gatewayToken = randomUUID();
  const containerName = `openclaw-${input.tenantSlug}`;
  const configVolume = `${VOLUMES_BASE}/${input.tenantSlug}/config`;
  const workspaceVolume = `${VOLUMES_BASE}/${input.tenantSlug}/workspace`;

  // Create instance record (provisioning status)
  const instanceResult = await pg.query(
    `INSERT INTO openclaw_instances
       (tenant_id, container_name, host, port, status, gateway_token,
        config_volume_path, workspace_volume_path,
        channels, software_stack, agent_config)
     VALUES ($1, $2, 'localhost', $3, 'provisioning', $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.tenantId, containerName, port, gatewayToken,
      configVolume, workspaceVolume,
      JSON.stringify(input.channels ?? {}),
      JSON.stringify(input.softwareStack ?? {}),
      JSON.stringify({
        default_model: input.defaultModel,
        system_prompt: input.systemPrompt ?? null,
      }),
    ],
  );
  const instanceId: string = instanceResult.rows[0].id;

  try {
    await ensureNetwork();

    // Create volume directories
    await exec("mkdir", ["-p", configVolume, workspaceVolume]);

    // Build environment variables for the container
    const envVars = [
      `-e`, `ANTHROPIC_API_KEY=${input.anthropicKey}`,
      `-e`, `OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
      `-e`, `OPENCLAW_DEFAULT_MODEL=${input.defaultModel}`,
      `-e`, `OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}`,
    ];

    if (input.systemPrompt) {
      envVars.push(`-e`, `OPENCLAW_SYSTEM_PROMPT=${input.systemPrompt}`);
    }

    // Run the container
    const { stdout } = await exec("docker", [
      "run", "-d",
      "--name", containerName,
      "--network", DOCKER_NETWORK,
      "--restart", "unless-stopped",
      "-p", `${port}:${OPENCLAW_GATEWAY_PORT}`,
      "-v", `${configVolume}:/root/.openclaw`,
      "-v", `${workspaceVolume}:/root/openclaw/workspace`,
      ...envVars,
      OPENCLAW_IMAGE,
    ]);

    const containerId = stdout.trim();
    const gatewayUrl = `http://localhost:${port}`;

    // Update instance with container details
    await pg.query(
      `UPDATE openclaw_instances
       SET container_id = $2, gateway_url = $3, status = 'running',
           health_status = 'unknown'
       WHERE id = $1`,
      [instanceId, containerId, gatewayUrl],
    );

    return { instanceId, containerId, gatewayUrl, gatewayToken, port };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown provisioning error";

    await pg.query(
      `UPDATE openclaw_instances
       SET status = 'error', error_message = $2
       WHERE id = $1`,
      [instanceId, errorMsg],
    );

    throw new Error(`Failed to provision OpenClaw instance: ${errorMsg}`);
  }
}

// ─── Stop an instance ────────────────────────────────────────────────────────

export async function stopInstance(pg: Pool, instanceId: string): Promise<void> {
  const result = await pg.query(
    `SELECT container_id, container_name FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!result.rowCount) throw new Error("Instance not found");

  const { container_id } = result.rows[0];
  if (container_id) {
    await exec("docker", ["stop", container_id]).catch(() => {});
  }

  await pg.query(
    `UPDATE openclaw_instances SET status = 'stopped', health_status = 'unknown' WHERE id = $1`,
    [instanceId],
  );
}

// ─── Start a stopped instance ────────────────────────────────────────────────

export async function startInstance(pg: Pool, instanceId: string): Promise<void> {
  const result = await pg.query(
    `SELECT container_id FROM openclaw_instances WHERE id = $1 AND status = 'stopped'`,
    [instanceId],
  );
  if (!result.rowCount) throw new Error("Instance not found or not stopped");

  const { container_id } = result.rows[0];
  if (container_id) {
    await exec("docker", ["start", container_id]);
  }

  await pg.query(
    `UPDATE openclaw_instances SET status = 'running', health_status = 'unknown' WHERE id = $1`,
    [instanceId],
  );
}

// ─── Restart an instance ─────────────────────────────────────────────────────

export async function restartInstance(pg: Pool, instanceId: string): Promise<void> {
  const result = await pg.query(
    `SELECT container_id FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!result.rowCount) throw new Error("Instance not found");

  const { container_id } = result.rows[0];
  if (container_id) {
    await exec("docker", ["restart", container_id]);
  }

  await pg.query(
    `UPDATE openclaw_instances SET status = 'running', health_status = 'unknown' WHERE id = $1`,
    [instanceId],
  );
}

// ─── Pause an instance ───────────────────────────────────────────────────────

export async function pauseInstance(pg: Pool, instanceId: string): Promise<void> {
  const result = await pg.query(
    `SELECT container_id FROM openclaw_instances WHERE id = $1 AND status = 'running'`,
    [instanceId],
  );
  if (!result.rowCount) throw new Error("Instance not found or not running");

  const { container_id } = result.rows[0];
  if (container_id) {
    await exec("docker", ["pause", container_id]);
  }

  await pg.query(
    `UPDATE openclaw_instances SET status = 'paused' WHERE id = $1`,
    [instanceId],
  );
}

// ─── Destroy an instance (remove container + optionally volumes) ─────────────

export async function destroyInstance(
  pg: Pool,
  instanceId: string,
  removeVolumes = false,
): Promise<void> {
  const result = await pg.query(
    `SELECT container_id, container_name, config_volume_path, workspace_volume_path
     FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!result.rowCount) throw new Error("Instance not found");

  const row = result.rows[0];

  await pg.query(
    `UPDATE openclaw_instances SET status = 'destroying' WHERE id = $1`,
    [instanceId],
  );

  // Stop and remove container
  if (row.container_id) {
    await exec("docker", ["rm", "-f", row.container_id]).catch(() => {});
  }

  // Optionally remove volumes
  if (removeVolumes) {
    if (row.config_volume_path) {
      await exec("rm", ["-rf", row.config_volume_path]).catch(() => {});
    }
    if (row.workspace_volume_path) {
      await exec("rm", ["-rf", row.workspace_volume_path]).catch(() => {});
    }
  }

  // Delete from DB
  await pg.query(`DELETE FROM openclaw_instances WHERE id = $1`, [instanceId]);
}

// ─── Get instance status from Docker ─────────────────────────────────────────

export async function getContainerStatus(containerId: string): Promise<string> {
  try {
    const { stdout } = await exec("docker", [
      "inspect", "--format", "{{.State.Status}}", containerId,
    ]);
    return stdout.trim();
  } catch {
    return "not_found";
  }
}

// ─── Update environment variable in running container ────────────────────────

export async function updateInstanceEnv(
  pg: Pool,
  instanceId: string,
  envUpdates: Record<string, string>,
): Promise<void> {
  // Docker doesn't support updating env vars on a running container.
  // We need to recreate the container with new env vars.
  // For now, we store the update and require a restart.
  const instance = await pg.query(
    `SELECT * FROM openclaw_instances WHERE id = $1`,
    [instanceId],
  );
  if (!instance.rowCount) throw new Error("Instance not found");

  const config = instance.rows[0].agent_config as Record<string, unknown>;
  const updatedConfig = { ...config, env_pending: envUpdates };

  await pg.query(
    `UPDATE openclaw_instances SET agent_config = $2 WHERE id = $1`,
    [instanceId, JSON.stringify(updatedConfig)],
  );
}

// ─── Get instance logs ───────────────────────────────────────────────────────

export async function getInstanceLogs(
  containerId: string,
  tail = 100,
): Promise<string> {
  try {
    const { stdout } = await exec("docker", [
      "logs", "--tail", String(tail), containerId,
    ]);
    return stdout;
  } catch {
    return "Unable to retrieve logs";
  }
}
