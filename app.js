require("dotenv").config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env" });

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");

const errorHandler = require("./middlewares/errorHandler");
const { buildOpenApiSpec } = require("./config/swagger");
const mountRoutes = require("./routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

if (process.env.NODE_ENV !== "test") {
  app.use(rateLimit({ windowMs: 60_000, max: 120 }));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true }));

const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
const openApiSpec = buildOpenApiSpec(baseUrl);
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, { explorer: true }));

mountRoutes(app);

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/js", express.static(path.join(__dirname, "js")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/staff", (_req, res) => {
  res.sendFile(path.join(__dirname, "staff.html"));
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(errorHandler);

module.exports = app;