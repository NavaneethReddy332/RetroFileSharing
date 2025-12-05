import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const transferSessions = sqliteTable("transfer_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  status: text("status").notNull().default("waiting"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
  completedAt: text("completed_at"),
});

export const insertTransferSessionSchema = createInsertSchema(transferSessions).omit({
  id: true,
  createdAt: true,
  status: true,
  completedAt: true,
});

export type InsertTransferSession = z.infer<typeof insertTransferSessionSchema>;
export type TransferSession = typeof transferSessions.$inferSelect;

export const cloudUploads = sqliteTable("cloud_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  storageKey: text("storage_key").notNull(),
  fileId: text("file_id"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertCloudUploadSchema = createInsertSchema(cloudUploads).omit({
  id: true,
  createdAt: true,
  downloadCount: true,
});

export type InsertCloudUpload = z.infer<typeof insertCloudUploadSchema>;
export type CloudUpload = typeof cloudUploads.$inferSelect;
