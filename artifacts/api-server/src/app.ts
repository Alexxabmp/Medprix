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

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled server error");
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

export default app;
