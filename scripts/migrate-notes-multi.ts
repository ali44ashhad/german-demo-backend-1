/**
 * One-time migration: multi-note model
 *
 * 1. Rename subAdminId -> authorId on existing documents
 * 2. Drop unique index on bookingId if present
 *
 * Run from german-demo-backend:
 *   npx ts-node scripts/migrate-notes-multi.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function migrate() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("Set MONGO_URI or MONGODB_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("No database connection");
  }

  const collection = db.collection("notes");

  const legacy = await collection
    .find({ subAdminId: { $exists: true } })
    .toArray();
  let renamed = 0;
  for (const doc of legacy) {
    await collection.updateOne(
      { _id: doc._id },
      { $set: { authorId: doc.subAdminId }, $unset: { subAdminId: "" } }
    );
    renamed += 1;
  }
  console.log(`Renamed subAdminId -> authorId on ${renamed} document(s)`);

  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.key?.bookingId === 1 && idx.unique) {
      await collection.dropIndex(idx.name as string);
      console.log(`Dropped unique index: ${idx.name}`);
    }
  }

  await collection.createIndex({ bookingId: 1, createdAt: -1 });
  await collection.createIndex({ authorId: 1 });
  console.log("Ensured compound indexes on bookingId+createdAt and authorId");

  await mongoose.disconnect();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
