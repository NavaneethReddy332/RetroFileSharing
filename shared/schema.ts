import { pgTable, text, integer, timestamp, serial, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const userFiles = pgTable("user_files", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  transferType: text("transfer_type").notNull(),
  direction: text("direction"),
  code: text("code"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserFileSchema = createInsertSchema(userFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertUserFile = z.infer<typeof insertUserFileSchema>;
export type UserFile = typeof userFiles.$inferSelect;

export const transferSessions = pgTable("transfer_sessions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  status: text("status").notNull().default("waiting"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertTransferSessionSchema = createInsertSchema(transferSessions).omit({
  id: true,
  createdAt: true,
  status: true,
  completedAt: true,
});

export type InsertTransferSession = z.infer<typeof insertTransferSessionSchema>;
export type TransferSession = typeof transferSessions.$inferSelect;

export const cloudUploads = pgTable("cloud_uploads", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  storageKey: text("storage_key").notNull(),
  fileId: text("file_id"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCloudUploadSchema = createInsertSchema(cloudUploads).omit({
  id: true,
  createdAt: true,
  downloadCount: true,
});

export type InsertCloudUpload = z.infer<typeof insertCloudUploadSchema>;
export type CloudUpload = typeof cloudUploads.$inferSelect;
