const dns = require("dns");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const DEFAULT_TIMEOUT_MS = 10000;

const loadEnvFile = () => {
  const envPaths = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
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
    return [];
  }

  const parsedServers = servers
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (parsedServers.length > 0) {
    dns.setServers(parsedServers);
  }

  return parsedServers;
};

const getServerSelectionTimeout = () => {
  const configuredTimeout = Number(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;
};

const getMongoUriDetails = (uriText) => {
  if (!uriText) {
    throw new Error("MONGODB_URI is missing. Add it to Backend/.env.");
  }

  if (uriText.includes("<db_password>")) {
    throw new Error(
      "MONGODB_URI still contains <db_password>. Replace it with the Atlas database user's real password.",
    );
  }

  const uri = new URL(uriText);
  const [username, password = ""] = uri.username
    ? [decodeURIComponent(uri.username), uri.password]
    : uri.username.split(":", 2);

  if (!username || !password) {
    throw new Error("MONGODB_URI must include both username and password.");
  }

  return {
    databaseName: process.env.MONGODB_DB_NAME || "tourism_app",
    host: uri.host,
    username,
  };
};

const printFailureHint = (error) => {
  const errorCode = error.code || error.name || "UNKNOWN_ERROR";
  console.error(`MongoDB ping failed [${errorCode}]: ${error.message}`);

  if (
    errorCode === 8000 ||
    errorCode === "8000" ||
    error.codeName === "AuthenticationFailed"
  ) {
    console.error(
      "Fix: reset/copy the password for this exact Atlas Database Access user, then URL-encode special characters in MONGODB_URI.",
    );
    return;
  }

  if (
    errorCode === "ENOTFOUND" ||
    errorCode === "ECONNREFUSED" ||
    String(error.message).includes("querySrv")
  ) {
    console.error(
      "Fix: check Atlas SRV DNS resolution or set MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8.",
    );
    return;
  }

  if (errorCode === "MongoServerSelectionError") {
    console.error(
      "Fix: check that your current IP is allowed in MongoDB Atlas Network Access.",
    );
  }
};

const main = async () => {
  loadEnvFile();
  const dnsServers = configureDnsServers();
  const details = getMongoUriDetails(process.env.MONGODB_URI);
  const timeout = getServerSelectionTimeout();

  console.log("MongoDB config:");
  console.log(`  user: ${details.username}`);
  console.log(`  host: ${details.host}`);
  console.log(`  database: ${details.databaseName}`);
  console.log(`  timeoutMs: ${timeout}`);
  console.log(
    `  dnsServers: ${dnsServers.length ? dnsServers.join(",") : "system default"}`,
  );

  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: timeout,
  });

  try {
    await client.connect();
    await client.db(details.databaseName).command({ ping: 1 });
    console.log("MongoDB ping succeeded.");
  } catch (error) {
    printFailureHint(error);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => undefined);
  }
};

main().catch((error) => {
  console.error(`MongoDB config check failed: ${error.message}`);
  process.exit(1);
});
