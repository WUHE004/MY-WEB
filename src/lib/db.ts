import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

const isVercel = !!process.env.VERCEL;
const DB_DIR = isVercel ? "/tmp/data" : path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "inventory.db");

let db: SqlJsDatabase | null = null;
let saveTimeout: NodeJS.Timeout | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      return path.join(process.cwd(), "node_modules", "sql.js", "dist", file);
    },
  });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  return db;
}

export function getDbSync(): SqlJsDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveDb();
    saveTimeout = null;
  }, 500);
}