import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const transferSessions = sqliteTable("transfer_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  status: text("status").notNull().default("waiting"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const insertTransferSessionSchema = createInsertSchema(transferSessions).omit({
  id: true,
  createdAt: true,
  status: true,
});

export type InsertTransferSession = z.infer<typeof insertTransferSessionSchema>;
export type TransferSession = typeof transferSessions.$inferSelect;
