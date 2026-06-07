import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const observabilityDir = path.resolve("qa-artifacts", "observability", "raw");
const requestLogPath = path.join(observabilityDir, "request-logs.jsonl");
export function requestLogger(request, response, next) {
    const startedAt = Date.now();
    const requestId = request.header("x-request-id") ?? randomUUID();
    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        const logEntry = {
            timestamp: new Date().toISOString(),
            requestId,
            method: request.method,
            path: request.originalUrl,
            httpVersion: request.httpVersion,
            statusCode: response.statusCode,
            durationMs,
            userAgent: request.header("user-agent") ?? "",
            contentLength: Number(response.getHeader("content-length") ?? 0)
        };
        console.log(JSON.stringify(logEntry));
        try {
            mkdirSync(observabilityDir, { recursive: true });
            appendFileSync(requestLogPath, `${JSON.stringify(logEntry)}\n`, "utf8");
        }
        catch {
            // Keep request handling independent from local observability artifact writes.
        }
    });
    next();
}
