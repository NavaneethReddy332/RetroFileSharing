import { type User, type InsertUser, type File, type InsertFile, type GuestbookEntry, type InsertGuestbookEntry, users, files, guestbookEntries } from "@shared/schema";
import { db } from "./db";
import { eq, lte, sql, desc } from "drizzle-orm";
import { backblazeService } from "./backblaze";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createFile(file: InsertFile): Promise<File>;
  getFileByCode(code: string): Promise<File | undefined>;
  deleteFile(id: string): Promise<void>;
  cleanupExpiredFiles(): Promise<void>;
  incrementDownloadCount(id: string, delta?: number): Promise<void>;
  
  createGuestbookEntry(entry: InsertGuestbookEntry): Promise<GuestbookEntry>;
  getAllGuestbookEntries(): Promise<GuestbookEntry[]>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    setInterval(() => {
      this.cleanupExpiredFiles();
    }, 60000);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const result = await db.insert(files).values({
      ...insertFile,
      isPasswordProtected: insertFile.isPasswordProtected || 0,
      isOneTime: insertFile.isOneTime || 0,
      passwordHash: insertFile.passwordHash || null,
      maxDownloads: insertFile.maxDownloads || null,
      b2FileId: insertFile.b2FileId || null,
    }).returning();
    return result[0];
  }

  async getFileByCode(code: string): Promise<File | undefined> {
    const result = await db.select().from(files).where(eq(files.code, code)).limit(1);
    const file = result[0];
    
    if (!file) return undefined;
    
    if (file.expiresAt <= new Date()) {
      try {
        if (file.b2FileId) {
          await backblazeService.deleteFile(file.filename, file.b2FileId);
        }
      } catch (error) {
        console.error(`Failed to delete expired file ${file.filename} from Backblaze:`, error);
      }
      await this.deleteFile(file.id);
      return undefined;
    }
    
    return file;
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }

  async cleanupExpiredFiles(): Promise<void> {
    const now = new Date();
    const expiredFiles = await db.select().from(files).where(lte(files.expiresAt, now));
    
    for (const file of expiredFiles) {
      try {
        if (file.b2FileId) {
          await backblazeService.deleteFile(file.filename, file.b2FileId);
        }
      } catch (error) {
        console.error(`Failed to delete file ${file.filename} from Backblaze:`, error);
      }
      await this.deleteFile(file.id);
    }
  }

  async incrementDownloadCount(id: string, delta: number = 1): Promise<void> {
    await db.update(files)
      .set({ downloadCount: sql`${files.downloadCount} + ${delta}` })
      .where(eq(files.id, id));
  }

  async createGuestbookEntry(entry: InsertGuestbookEntry): Promise<GuestbookEntry> {
    const result = await db.insert(guestbookEntries).values({
      ...entry,
      location: entry.location || null,
      favoriteSystem: entry.favoriteSystem || null,
    }).returning();
    return result[0];
  }

  async getAllGuestbookEntries(): Promise<GuestbookEntry[]> {
    return await db.select()
      .from(guestbookEntries)
      .where(eq(guestbookEntries.isApproved, 1))
      .orderBy(desc(guestbookEntries.createdAt));
  }
}

export const storage = new DatabaseStorage();
