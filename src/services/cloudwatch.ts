import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { config } from "../config.js";

// ─── CloudWatch Metrics Service ─────────────────────────────────────────────
//
// Publishes key business metrics to CloudWatch for monitoring and alerting.
// In dev, logs to console instead.

const NAMESPACE = "OvniAI/Production";

let cwClient: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!cwClient) {
    cwClient = new CloudWatchClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  }
  return cwClient;
}

export async function publishMetric(
  metricName: string,
  value: number,
  unit: "Count" | "Milliseconds" | "Bytes" = "Count",
  dimensions?: Record<string, string>,
): Promise<void> {
  if (config.nodeEnv !== "production") {
    console.log(`[CloudWatch] ${metricName}=${value} ${unit}`, dimensions ?? "");
    return;
  }

  try {
    const command = new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: dimensions
            ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
            : undefined,
        },
      ],
    });
    await getClient().send(command);
  } catch (err) {
    // Never let CloudWatch errors crash the app
    console.error("[CloudWatch] Failed to publish metric:", err);
  }
}

// ─── Metric helpers ───────────────────────────────────────────────────────────

export const metrics = {
  provisioningSuccess: (planId: string) =>
    publishMetric("Provisioning.Success", 1, "Count", { Plan: planId }),

  provisioningFailure: (reason: string) =>
    publishMetric("Provisioning.Failure", 1, "Count", { Reason: reason }),

  paymentSuccess: (amountCents: number) =>
    publishMetric("Payment.Success", amountCents / 100, "Count"),

  paymentFailure: () =>
    publishMetric("Payment.Failure", 1, "Count"),

  apiError: (statusCode: number) =>
    publishMetric("API.Error", 1, "Count", { StatusCode: String(statusCode) }),

  instanceHealthFailure: () =>
    publishMetric("Instance.HealthCheckFailure", 1, "Count"),

  creditDepleted: () =>
    publishMetric("Credit.Depleted", 1, "Count"),

  chatRequest: (tenantId: string, latencyMs: number) => {
    publishMetric("Chat.Request", 1, "Count");
    publishMetric("Chat.Latency", latencyMs, "Milliseconds");
  },
};
