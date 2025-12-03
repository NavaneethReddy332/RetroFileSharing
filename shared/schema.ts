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
});

export const insertTransferSessionSchema = createInsertSchema(transferSessions).omit({
  id: true,
  createdAt: true,
  status: true,
});

export type InsertTransferSession = z.infer<typeof insertTransferSessionSchema>;
export type TransferSession = typeof transferSessions.$inferSelect;
