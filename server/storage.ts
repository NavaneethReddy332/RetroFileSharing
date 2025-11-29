import { type User, type InsertUser, type File, type InsertFile, type GuestbookEntry, type InsertGuestbookEntry, users, files, guestbookEntries } from "@shared/schema";
import { db } from "./db";
import { eq, lte, sql, desc, and, gt } from "drizzle-orm";
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
  atomicIncrementDownloadCount(id: string, delta?: number): Promise<number>;
  
  createGuestbookEntry(entry: InsertGuestbookEntry): Promise<GuestbookEntry>;
  getAllGuestbookEntries(): Promise<GuestbookEntry[]>;
}

export class DatabaseStorage implements IStorage {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isCleaningUp = false;

  constructor() {
    this.startCleanupInterval();
    this.cleanupExpiredFiles();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFiles();
    }, 30000);
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
      this.deleteFileWithCleanup(file).catch(err => {
        console.error(`Failed to cleanup expired file ${file.filename}:`, err);
      });
      return undefined;
    }
    
    return file;
  }

  private async deleteFileWithCleanup(file: File): Promise<void> {
    try {
      if (file.b2FileId) {
        await backblazeService.deleteFile(file.filename, file.b2FileId);
      }
    } catch (error) {
      console.error(`Failed to delete file ${file.filename} from Backblaze:`, error);
    }
    await this.deleteFile(file.id);
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }

  async cleanupExpiredFiles(): Promise<void> {
    if (this.isCleaningUp) {
      return;
    }
    
    this.isCleaningUp = true;
    
    try {
      const now = new Date();
      const expiredFiles = await db.select().from(files).where(lte(files.expiresAt, now));
      
      if (expiredFiles.length > 0) {
        console.log(`[CLEANUP] Found ${expiredFiles.length} expired files`);
      }
      
      const deletePromises = expiredFiles.map(async (file) => {
        try {
          if (file.b2FileId) {
            await backblazeService.deleteFile(file.filename, file.b2FileId);
          }
          await this.deleteFile(file.id);
          console.log(`[CLEANUP] Deleted expired file: ${file.originalName}`);
        } catch (error) {
          console.error(`[CLEANUP] Failed to delete file ${file.filename}:`, error);
          await this.deleteFile(file.id);
        }
      });
      
      await Promise.allSettled(deletePromises);
      
      const maxDownloadFiles = await db.select().from(files).where(
        and(
          gt(files.maxDownloads, 0),
          sql`${files.downloadCount} >= ${files.maxDownloads}`
        )
      );
      
      for (const file of maxDownloadFiles) {
        try {
          if (file.b2FileId) {
            await backblazeService.deleteFile(file.filename, file.b2FileId);
          }
          await this.deleteFile(file.id);
          console.log(`[CLEANUP] Deleted max-download file: ${file.originalName}`);
        } catch (error) {
          console.error(`[CLEANUP] Failed to delete max-download file ${file.filename}:`, error);
        }
      }
    } catch (error) {
      console.error('[CLEANUP] Error during cleanup:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  async incrementDownloadCount(id: string, delta: number = 1): Promise<void> {
    await db.update(files)
      .set({ downloadCount: sql`${files.downloadCount} + ${delta}` })
      .where(eq(files.id, id));
  }

  async atomicIncrementDownloadCount(id: string, delta: number = 1): Promise<number> {
    const result = await db.update(files)
      .set({ downloadCount: sql`${files.downloadCount} + ${delta}` })
      .where(eq(files.id, id))
      .returning({ downloadCount: files.downloadCount });
    
    return result[0]?.downloadCount ?? 0;
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
