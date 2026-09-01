import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const allowedOrigins =
  process.env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
const developmentOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

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
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== "production" &&
          developmentOrigins.includes(origin))
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed."));
    },
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
