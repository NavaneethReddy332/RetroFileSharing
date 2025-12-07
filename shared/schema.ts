import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const userFiles = sqliteTable("user_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  transferType: text("transfer_type").notNull(),
  direction: text("direction").notNull(),
  code: text("code"),
  status: text("status"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertUserFileSchema = createInsertSchema(userFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertUserFile = z.infer<typeof insertUserFileSchema>;
export type UserFile = typeof userFiles.$inferSelect;

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

export const deletedEmails = sqliteTable("deleted_emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  deletedAt: text("deleted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertDeletedEmailSchema = createInsertSchema(deletedEmails).omit({
  id: true,
  deletedAt: true,
});

export type InsertDeletedEmail = z.infer<typeof insertDeletedEmailSchema>;
export type DeletedEmail = typeof deletedEmails.$inferSelect;
