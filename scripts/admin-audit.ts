import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

async function runCommand(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const failures: string[] = [];

  const adminFiles = (await walk(path.join(ROOT, "app", "admin"))).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const forbidden = [
    "Place Order",
    "Submit Order",
    "Buy Now",
    "Sell Now",
    "Execute Trade",
    "Execute Now",
    "Send to Broker",
    "Order Ticket",
    "Bracket Order",
  ];

  for (const file of adminFiles) {
    const text = await readFile(file, "utf8");
    for (const token of forbidden) {
      if (text.toLowerCase().includes(token.toLowerCase())) {
        failures.push(`Forbidden execution language found in ${path.relative(ROOT, file)}: ${token}`);
      }
    }
  }

  const adminRoutes = (await walk(path.join(ROOT, "app", "api", "admin"))).filter((f) => f.endsWith("route.ts"));
  for (const route of adminRoutes) {
    const text = await readFile(route, "utf8");
    const hasGuard = /(requireAdmin\(|verifyAdminAuth\(|verifyAdminRequest\()/.test(text);
    if (!hasGuard) {
      failures.push(`Missing explicit admin auth guard in ${path.relative(ROOT, route)}`);
    }
  }

  const packetFile = await readFile(path.join(ROOT, "lib", "admin", "getAdminResearchPacket.ts"), "utf8").catch(() => "");
  if (!packetFile.includes("dataTruth") || !packetFile.includes("createdAt")) {
    failures.push("Admin research packet must include DataTruth and timestamps");
  }

  const suppressionFile = await readFile(path.join(ROOT, "lib", "alerts", "alertSuppression.ts"), "utf8").catch(() => "");
  if (!suppressionFile.includes("STALE_OR_SIMULATED_DATA")) {
    failures.push("Alert suppression missing stale/simulated data guard");
  }

  const arcaTypes = await readFile(path.join(ROOT, "lib", "admin", "arcaTypes.ts"), "utf8").catch(() => "");
  if (!arcaTypes.includes("FORBIDDEN_OUTPUT_PHRASES") || !arcaTypes.includes("forbidden phrase in output")) {
    failures.push("ARCA output validator missing forbidden phrase checks");
  }

  const hasDiscordWebhook = Boolean(process.env.ADMIN_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_BRIDGE_WEBHOOK_URL);
  if (!hasDiscordWebhook) {
    failures.push("Discord webhook config missing: set ADMIN_DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL or DISCORD_BRIDGE_WEBHOOK_URL");
  }

  if (failures.length > 0) {
    console.error("\n[admin:audit] Static checks failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log("\n[admin:audit] Static checks passed. Running tests and build...");

  const testCode = await runCommand("npx", ["vitest", "run"]);
  if (testCode !== 0) process.exit(testCode);

  const buildCode = await runCommand("npm", ["run", "build"]);
  process.exit(buildCode);
}

main().catch((err) => {
  console.error("[admin:audit] Unexpected failure", err);
  process.exit(1);
});
