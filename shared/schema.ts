import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const files = sqliteTable("files", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  code: text("code").notNull().unique(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  mimetype: text("mimetype").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  
  b2FileId: text("b2_file_id"),
  
  passwordHash: text("password_hash"),
  isPasswordProtected: integer("is_password_protected").notNull().default(0),
  downloadCount: integer("download_count").notNull().default(0),
  maxDownloads: integer("max_downloads"),
  isOneTime: integer("is_one_time").notNull().default(0),
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  uploadedAt: true,
  downloadCount: true,
});

export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;

export const guestbookEntries = sqliteTable("guestbook_entries", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  displayName: text("display_name").notNull(),
  message: text("message").notNull(),
  location: text("location"),
  favoriteSystem: text("favorite_system"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  isApproved: integer("is_approved").notNull().default(1),
});

export const insertGuestbookEntrySchema = createInsertSchema(guestbookEntries).omit({
  id: true,
  createdAt: true,
  isApproved: true,
});

export type InsertGuestbookEntry = z.infer<typeof insertGuestbookEntrySchema>;
export type GuestbookEntry = typeof guestbookEntries.$inferSelect;
