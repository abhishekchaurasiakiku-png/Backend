const { MongoClient } = require("mongodb");

let client;
let usersCollection;

const getServerSelectionTimeout = () => {
  const configuredTimeout = Number(
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 10000;
};

const TOURISM_COLLECTIONS = [
  "hotels",
  "guides",
  "bookings",
  "destinations",
  "reviews",
  "crowdData",
  "transport",
  "weather",
  "emergencyAlerts",
  "businessListings",
  "payments",
];

const getDatabaseName = () => process.env.MONGODB_DB_NAME || "tourism_app";

const createTourismCollections = async (database) => {
  const existingCollections = new Set(
    await database.listCollections({}, { nameOnly: true }).toArray().then(
      (collections) => collections.map(({ name }) => name),
    ),
  );

  await Promise.all(
    TOURISM_COLLECTIONS.filter(
      (collectionName) => !existingCollections.has(collectionName),
    ).map((collectionName) =>
      database.createCollection(collectionName, {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            additionalProperties: true,
          },
        },
        validationLevel: "moderate",
        validationAction: "error",
      }),
    ),
  );

  if (!existingCollections.has("users")) {
    await database.createCollection("users");
  }

  await Promise.all([
    database.collection("hotels").createIndex({ destinationId: 1 }),
    database.collection("guides").createIndex({ destinationId: 1 }),
    database.collection("bookings").createIndex({ userId: 1, createdAt: -1 }),
    database.collection("bookings").createIndex({ hotelId: 1, checkIn: 1 }),
    database.collection("destinations").createIndex({ name: 1 }, { unique: true }),
    database.collection("reviews").createIndex({ destinationId: 1, createdAt: -1 }),
    database.collection("crowdData").createIndex({ destinationId: 1, recordedAt: -1 }),
    database.collection("transport").createIndex({ destinationId: 1, updatedAt: -1 }),
    database.collection("weather").createIndex({ destinationId: 1, recordedAt: -1 }),
    database.collection("emergencyAlerts").createIndex({ destinationId: 1, createdAt: -1 }),
    database.collection("businessListings").createIndex({ destinationId: 1, category: 1 }),
    database.collection("payments").createIndex({ bookingId: 1 }, { unique: true }),
  ]);
};

const connectDatabase = async () => {
  if (usersCollection) {
    return usersCollection;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to Backend/.env.");
  }

  client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: getServerSelectionTimeout(),
  });

  try {
    await client.connect();

    const database = client.db(getDatabaseName());
    await createTourismCollections(database);
    usersCollection = database.collection("users");
    await usersCollection.createIndex({ email: 1 }, { unique: true });

    return usersCollection;
  } catch (error) {
    await client.close().catch(() => undefined);
    client = undefined;
    usersCollection = undefined;
    throw error;
  }
};

const getUsersCollection = () => {
  if (!usersCollection) {
    throw new Error("Database is not connected yet.");
  }

  return usersCollection;
};

const closeDatabase = async () => {
  if (!client) {
    return;
  }

  await client.close();
  client = undefined;
  usersCollection = undefined;
};

module.exports = {
  closeDatabase,
  connectDatabase,
  createTourismCollections,
  getUsersCollection,
};
