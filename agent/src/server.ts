import http from "node:http";
import { formatEther, getAddress, parseEther, type Address, type Hex } from "viem";
import {
  AGENT_PORT,
  GUARDIAN_ACCOUNT_ADDRESS,
  QORE_CHAIN_ID,
  RECOVERY_VAULT_ADDRESS,
} from "./config.ts";
import { GuardianDefender } from "./defender.ts";
import { readGuardianSnapshot } from "./index.ts";
import { GuardianMonitor } from "./monitor.ts";

function jsonBigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body, jsonBigintReplacer, 2));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

export function createGuardianServer(opts?: { port?: number; pollIntervalMs?: number }) {
  let defender: GuardianDefender | undefined;
  try {
    defender = new GuardianDefender();
  } catch (err) {
    console.warn(`[agent] Running in read-only monitor mode: ${err instanceof Error ? err.message : String(err)}`);
  }

  const monitor = new GuardianMonitor(defender);
  const sseClients = new Set<http.ServerResponse>();

  monitor.subscribe((event) => {
    const line = `event: ${event.type}\ndata: ${JSON.stringify(event, jsonBigintReplacer)}\n\n`;
    for (const client of sseClients) {
      client.write(line);
    }
  });

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          chainId: QORE_CHAIN_ID,
          guardianAccount: GUARDIAN_ACCOUNT_ADDRESS,
          recoveryVault: RECOVERY_VAULT_ADDRESS,
          defenderAddress: defender?.address ?? null,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        const snap = await readGuardianSnapshot();
        sendJson(res, 200, {
          snapshot: {
            ...snap,
            balanceQor: formatEther(snap.balanceWei),
            perTxLimitQor: formatEther(snap.perTxLimit),
            dailyLimitQor: formatEther(snap.dailyLimit),
            spentTodayQor: formatEther(snap.spentToday),
            vaultBalanceQor: formatEther(snap.vaultBalanceForOwner),
          },
          history: monitor.getHistory(),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(`event: connected\ndata: ${JSON.stringify({ guardianAccount: GUARDIAN_ACCOUNT_ADDRESS })}\n\n`);
        for (const item of monitor.getHistory().slice(-20)) {
          res.write(`event: ${item.type}\ndata: ${JSON.stringify(item, jsonBigintReplacer)}\n\n`);
        }
        sseClients.add(res);
        req.on("close", () => {
          sseClients.delete(res);
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/simulate") {
        const body = await readJsonBody(req);
        const to = getAddress(
          typeof body.to === "string" ? body.to : "0x000000000000000000000000000000000000dEaD"
        ) as Address;
        const valueWei =
          typeof body.valueWei === "string"
            ? BigInt(body.valueWei)
            : typeof body.valueQor === "string" || typeof body.valueQor === "number"
              ? parseEther(String(body.valueQor))
              : parseEther("0.1");

        const result = await monitor.evaluateAndDefend({
          to,
          valueWei,
          data: typeof body.data === "string" ? (body.data as Hex) : undefined,
          promptText: typeof body.promptText === "string" ? body.promptText : undefined,
          leakedKeySignal: typeof body.leakedKeySignal === "boolean" ? body.leakedKeySignal : false,
          recentTxCountLastHour:
            typeof body.recentTxCountLastHour === "number" ? body.recentTxCountLastHour : undefined,
          executeDefense: typeof body.executeDefense === "boolean" ? body.executeDefense : true,
          useLivePreflight: typeof body.useLivePreflight === "boolean" ? body.useLivePreflight : true,
        });

        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const port = opts?.port ?? AGENT_PORT;
  return {
    server,
    monitor,
    start: () =>
      new Promise<number>((resolve) => {
        monitor.start(opts?.pollIntervalMs ?? 5000);
        server.listen(port, "0.0.0.0", () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        monitor.stop();
        for (const client of sseClients) client.end();
        sseClients.clear();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

const isEntrypoint = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isEntrypoint) {
  const app = createGuardianServer();
  const port = await app.start();
  console.log(`QoreGuardian Agent Telemetry Server listening on http://localhost:${port}`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/state`);
  console.log(`  GET  /api/events (SSE)`);
  console.log(`  POST /api/simulate`);
}
