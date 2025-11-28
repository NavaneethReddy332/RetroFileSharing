import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 6 }).notNull().unique(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  mimetype: text("mimetype").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  
  // Backblaze B2 Fields
  b2FileId: text("b2_file_id"),
  
  // Security & Privacy Fields
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

export const guestbookEntries = pgTable("guestbook_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull(),
  message: text("message").notNull(),
  location: text("location"),
  favoriteSystem: text("favorite_system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isApproved: integer("is_approved").notNull().default(1),
});

export const insertGuestbookEntrySchema = createInsertSchema(guestbookEntries).omit({
  id: true,
  createdAt: true,
  isApproved: true,
});

export type InsertGuestbookEntry = z.infer<typeof insertGuestbookEntrySchema>;
export type GuestbookEntry = typeof guestbookEntries.$inferSelect;
