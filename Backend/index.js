const http = require("http");
const dns = require("dns");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { closeDatabase, connectDatabase } = require("./models/user.model");
const handleUserRoutes = require("./routes/user.route");

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

const loadEnvFile = () => {
  const envPaths = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", ".env"),
  ];

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([^#=\s]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].trim();
      }
    }
  }
};

const configureDnsServers = () => {
  const servers = process.env.MONGODB_DNS_SERVERS;
  if (!servers) {
    return;
  }

  dns.setServers(
    servers
      .split(",")
      .map((server) => server.trim())
      .filter(Boolean),
  );
};

const getLocalNetworkUrls = (port) =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (networkInterface) =>
        networkInterface &&
        networkInterface.family === "IPv4" &&
        !networkInterface.internal,
    )
    .map((networkInterface) => `http://${networkInterface.address}:${port}`);

const getCorsOrigin = () => process.env.CORS_ORIGIN || "*";

const getRequestBodyLimit = () => {
  const configuredLimit = Number(process.env.REQUEST_BODY_LIMIT_BYTES);
  return Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_BODY_LIMIT_BYTES;
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Origin": getCorsOrigin(),
    "Content-Type": "application/json",
    Vary: "Origin",
  });
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    let isBodyTooLarge = false;
    const bodyLimitBytes = getRequestBodyLimit();

    req.on("data", (chunk) => {
      if (isBodyTooLarge) {
        return;
      }

      body += chunk;
      if (Buffer.byteLength(body) > bodyLimitBytes) {
        body = "";
        isBodyTooLarge = true;
      }
    });

    req.on("end", () => {
      if (isBodyTooLarge) {
        const error = new Error("Request body is too large.");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        return;
      }

      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        error.code = "INVALID_JSON";
        reject(error);
      }
    });

    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  res.status = (statusCode) => ({
    json: (payload) => sendJson(res, statusCode, payload),
  });

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": CORS_METHODS,
      "Access-Control-Allow-Origin": getCorsOrigin(),
      Vary: "Origin",
    });
    res.end();
    return;
  }

  try {
    req.url = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      req.body = await readJsonBody(req);
    }

    if (req.method === "GET" && req.url === "/") {
      sendJson(res, 200, {
        success: true,
        message: "Backend server is running",
      });
      return;
    }

    if (
      req.method === "GET" &&
      ["/health", "/healthz", "/api/health"].includes(req.url)
    ) {
      sendJson(res, 200, {
        success: true,
        status: "ok",
        uptime: process.uptime(),
      });
      return;
    }

    if (await handleUserRoutes(req, res)) {
      return;
    }

    sendJson(res, 404, {
      success: false,
      message: "Route not found",
    });
  } catch (error) {
    if (error.code === "INVALID_JSON") {
      sendJson(res, 400, {
        success: false,
        message: "Invalid JSON body.",
      });
      return;
    }

    if (error.code === "PAYLOAD_TOO_LARGE") {
      sendJson(res, 413, {
        success: false,
        message: "Request body is too large.",
      });
      return;
    }

    console.error(error);
    sendJson(res, 500, {
      success: false,
      message: "Server error. Please try again.",
    });
  }
});

loadEnvFile();
configureDnsServers();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
let isShuttingDown = false;

const shutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Closing server...`);

  server.close(async () => {
    try {
      await closeDatabase();
      console.log("Server closed successfully");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown failed:", error.message);
      process.exit(1);
    }
  });
};

connectDatabase()
  .then(() => {
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the old backend server or set a different PORT.`,
        );
        process.exit(1);
      }

      console.error("Server failed:", error.message);
      process.exit(1);
    });

    server.listen(PORT, HOST, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      if (HOST === "0.0.0.0") {
        const networkUrls = getLocalNetworkUrls(PORT);
        if (networkUrls.length > 0) {
          console.log(
            `Wireless debugging URL: ${networkUrls.join(", ")}`,
          );
        }
      }
      console.log("MongoDB connected successfully");
    });

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  })
  .catch((error) => {
    const errorCode = error.code || error.name || "UNKNOWN_ERROR";
    console.error(
      `MongoDB connection failed [${errorCode}]: ${error.message}`,
    );

    if (errorCode === "ENOTFOUND" || errorCode === "querySrv ENOTFOUND") {
      console.error(
        "Check the MONGODB_URI hostname and your network DNS settings.",
      );
    } else if (
      errorCode === "MongoServerError" ||
      errorCode === "AuthenticationFailed" ||
      errorCode === "8000" ||
      error.codeName === "AuthenticationFailed"
    ) {
      console.error(
        "Check the MongoDB username, password, and Atlas database access rules.",
      );
    } else if (
      errorCode === "MongoServerSelectionError" ||
      errorCode === "MongooseServerSelectionError"
    ) {
      console.error(
        "Check that your IP address is allowed in MongoDB Atlas Network Access.",
      );
    }

    process.exit(1);
  });
