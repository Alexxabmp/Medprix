import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

import { initPromise } from "@workspace/db";

const app: Express = express();
const allowedOrigins =
  process.env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    credentials: true,
    origin: true,
  }),
);

app.use(async (_req, _res, next) => {
  if (initPromise) {
    try {
      await initPromise;
    } catch (e) {
      console.warn("DB init notice in middleware:", e);
    }
  }
  next();
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    status: "healthy",
    service: "Medprix API Server",
    port: 5000,
    frontend: "http://localhost:3000",
    message: "Backend API is online and responding.",
  });
});

app.use("/api", router);
app.use(router);

function sanitizeErrorMessage(err: any): string {
  if (!err) return "Internal server error";

  const rawMessage = typeof err === "string" ? err : String(err.message || "");
  const lower = rawMessage.toLowerCase();

  const isSqlOrDbError =
    Boolean(err.query || err.routine || (err.code && /^[0-9A-Z]{5}$/.test(String(err.code)))) ||
    lower.includes("failed query") ||
    lower.includes("insert into") ||
    lower.includes("select ") ||
    lower.includes("update ") ||
    lower.includes("delete from") ||
    lower.includes("syntax error") ||
    lower.includes("violates") ||
    lower.includes("constraint") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("pglite") ||
    lower.includes("drizzle");

  if (!isSqlOrDbError) {
    return rawMessage || "Internal server error";
  }

  const code = String(err.code || "");
  if (code === "23505" || lower.includes("unique constraint") || lower.includes("duplicate key")) {
    return "A record with this identifier or code already exists.";
  }
  if (code === "23503" || lower.includes("foreign key") || lower.includes("violates foreign key")) {
    return "The referenced record could not be found or has dependent records.";
  }
  if (code === "23502" || lower.includes("not-null") || lower.includes("null value in column")) {
    return "One or more required fields are missing.";
  }
  if (code === "22P02" || lower.includes("invalid input syntax")) {
    return "Invalid data format provided for one or more fields.";
  }
  if (code.startsWith("23")) {
    return "The operation could not be completed due to invalid or conflicting data.";
  }

  return "An unexpected error occurred while processing the request. Please try again.";
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled server error");
  const statusCode =
    typeof err.status === "number" && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  res.status(statusCode).json({ error: sanitizeErrorMessage(err) });
});

export default app;
