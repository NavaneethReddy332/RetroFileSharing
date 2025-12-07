import { type TransferSession, type InsertTransferSession, transferSessions, type CloudUpload, type InsertCloudUpload, cloudUploads, type User, type InsertUser, users, type UserFile, type InsertUserFile, userFiles, deletedEmails, type SavedEmail, type InsertSavedEmail, savedEmails } from "@shared/schema";
import { db } from "./db";
import { eq, lte, and, ne, lt, desc, gt } from "drizzle-orm";
import { generateSecureCode, generateCloudCode } from "./lib/security";

export interface IStorage {
  createTransferSession(session: InsertTransferSession): Promise<TransferSession>;
  getSessionByCode(code: string): Promise<TransferSession | undefined>;
  getSessionByCodeIncludeCompleted(code: string): Promise<TransferSession | undefined>;
  updateSessionStatus(id: number, status: string): Promise<void>;
  updateSession(code: string, data: Partial<Pick<TransferSession, 'status'>>): Promise<void>;
  markSessionCompleted(id: number): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
  deleteOldSessions(): Promise<void>;
  healthCheck(): Promise<boolean>;
  
  createCloudUpload(upload: Omit<InsertCloudUpload, 'code'>): Promise<CloudUpload>;
  getCloudUploadByCode(code: string): Promise<CloudUpload | undefined>;
  incrementCloudDownloadCount(id: number): Promise<void>;
  deleteCloudUpload(id: number): Promise<void>;

  createUser(user: InsertUser): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  updateUser(id: number, data: { username?: string; email?: string }): Promise<void>;
  updateUserPassword(id: number, passwordHash: string): Promise<void>;

  createUserFile(file: InsertUserFile): Promise<UserFile>;
  getUserFiles(userId: number, limit?: number): Promise<UserFile[]>;
  
  deleteUser(id: number): Promise<void>;
  addDeletedEmail(email: string): Promise<void>;
  isEmailBlocked(email: string): Promise<boolean>;
  cleanupOldDeletedEmails(): Promise<void>;

  // Saved emails
  saveEmail(email: InsertSavedEmail): Promise<SavedEmail>;
  getSavedEmails(userId: number): Promise<SavedEmail[]>;
  getSavedEmailById(id: number, userId: number): Promise<SavedEmail | undefined>;
  deleteSavedEmail(id: number, userId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private deleteInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
    this.startDeleteInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  private startDeleteInterval(): void {
    if (this.deleteInterval) {
      clearInterval(this.deleteInterval);
    }
    this.deleteInterval = setInterval(() => {
      this.deleteOldSessions();
    }, 3600000);
  }

  async createTransferSession(session: InsertTransferSession): Promise<TransferSession> {
    let code = generateSecureCode();
    let attempts = 0;
    
    while (attempts < 10) {
      const existing = await db.select().from(transferSessions).where(eq(transferSessions.code, code)).limit(1);
      if (existing.length === 0) break;
      code = generateSecureCode();
      attempts++;
    }
    
    const result = await db.insert(transferSessions).values({
      ...session,
      code,
    }).returning();
    return result[0];
  }

  async getSessionByCode(code: string): Promise<TransferSession | undefined> {
    const result = await db.select().from(transferSessions).where(eq(transferSessions.code, code)).limit(1);
    const session = result[0];
    
    if (!session) return undefined;
    
    if (session.status === 'completed') {
      return undefined;
    }
    
    if (session.expiresAt <= new Date().toISOString() && session.status !== 'completed') {
      await this.updateSessionStatus(session.id, 'expired');
      return undefined;
    }
    
    return session;
  }

  async getSessionByCodeIncludeCompleted(code: string): Promise<TransferSession | undefined> {
    const result = await db.select().from(transferSessions).where(eq(transferSessions.code, code)).limit(1);
    return result[0];
  }

  async updateSessionStatus(id: number, status: string): Promise<void> {
    await db.update(transferSessions).set({ status }).where(eq(transferSessions.id, id));
  }

  async updateSession(code: string, data: Partial<Pick<TransferSession, 'status'>>): Promise<void> {
    await db.update(transferSessions).set(data).where(eq(transferSessions.code, code));
  }

  async markSessionCompleted(id: number): Promise<void> {
    const now = new Date().toISOString();
    await db.update(transferSessions).set({ 
      status: 'completed',
      completedAt: now
    }).where(eq(transferSessions.id, id));
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = new Date().toISOString();
      await db.update(transferSessions)
        .set({ status: 'expired' })
        .where(
          and(
            lte(transferSessions.expiresAt, now),
            ne(transferSessions.status, 'completed'),
            ne(transferSessions.status, 'expired')
          )
        );
    } catch (error) {
      console.error('[CLEANUP] Error during session cleanup:', error);
    }
  }

  async deleteOldSessions(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString();
      
      await db.delete(transferSessions)
        .where(
          and(
            lt(transferSessions.createdAt, cutoffStr),
            ne(transferSessions.status, 'waiting'),
            ne(transferSessions.status, 'transferring')
          )
        );
    } catch (error) {
      console.error('[DELETE] Error deleting old sessions:', error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await db.select().from(transferSessions).limit(1);
      return true;
    } catch (error) {
      console.error('[HEALTH] Database health check failed:', error);
      return false;
    }
  }

  async createCloudUpload(upload: Omit<InsertCloudUpload, 'code'>): Promise<CloudUpload> {
    let code = generateCloudCode();
    let attempts = 0;
    
    while (attempts < 10) {
      const existing = await db.select().from(cloudUploads).where(eq(cloudUploads.code, code)).limit(1);
      if (existing.length === 0) break;
      code = generateCloudCode();
      attempts++;
    }
    
    const result = await db.insert(cloudUploads).values({
      ...upload,
      code,
    }).returning();
    return result[0];
  }

  async getCloudUploadByCode(code: string): Promise<CloudUpload | undefined> {
    const result = await db.select().from(cloudUploads).where(eq(cloudUploads.code, code)).limit(1);
    return result[0];
  }

  async incrementCloudDownloadCount(id: number): Promise<void> {
    const current = await db.select().from(cloudUploads).where(eq(cloudUploads.id, id)).limit(1);
    if (current[0]) {
      await db.update(cloudUploads).set({ 
        downloadCount: current[0].downloadCount + 1 
      }).where(eq(cloudUploads.id, id));
    }
  }

  async deleteCloudUpload(id: number): Promise<void> {
    await db.delete(cloudUploads).where(eq(cloudUploads.id, id));
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
    return result[0];
  }

  async updateUser(id: number, data: { username?: string; email?: string }): Promise<void> {
    const updateData: Partial<{ username: string; email: string }> = {};
    if (data.username) updateData.username = data.username.toLowerCase();
    if (data.email) updateData.email = data.email.toLowerCase();
    await db.update(users).set(updateData).where(eq(users.id, id));
  }

  async updateUserPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }

  async createUserFile(file: InsertUserFile): Promise<UserFile> {
    const result = await db.insert(userFiles).values(file).returning();
    return result[0];
  }

  async getUserFiles(userId: number, limit: number = 50): Promise<UserFile[]> {
    const result = await db.select().from(userFiles)
      .where(eq(userFiles.userId, userId))
      .orderBy(desc(userFiles.createdAt))
      .limit(limit);
    return result;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(userFiles).where(eq(userFiles.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async addDeletedEmail(email: string): Promise<void> {
    await db.insert(deletedEmails).values({
      email: email.toLowerCase(),
    });
  }

  async isEmailBlocked(email: string): Promise<boolean> {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const cutoffStr = fiveDaysAgo.toISOString();
    
    const result = await db.select().from(deletedEmails)
      .where(
        and(
          eq(deletedEmails.email, email.toLowerCase()),
          gt(deletedEmails.deletedAt, cutoffStr)
        )
      )
      .limit(1);
    
    return result.length > 0;
  }

  async cleanupOldDeletedEmails(): Promise<void> {
    try {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const cutoffStr = fiveDaysAgo.toISOString();
      
      await db.delete(deletedEmails).where(lt(deletedEmails.deletedAt, cutoffStr));
    } catch (error) {
      console.error('[CLEANUP] Error cleaning up old deleted emails:', error);
    }
  }

  async saveEmail(email: InsertSavedEmail): Promise<SavedEmail> {
    const result = await db.insert(savedEmails).values(email).returning();
    return result[0];
  }

  async getSavedEmails(userId: number): Promise<SavedEmail[]> {
    const result = await db.select().from(savedEmails)
      .where(eq(savedEmails.userId, userId))
      .orderBy(desc(savedEmails.savedAt));
    return result;
  }

  async getSavedEmailById(id: number, userId: number): Promise<SavedEmail | undefined> {
    const result = await db.select().from(savedEmails)
      .where(and(eq(savedEmails.id, id), eq(savedEmails.userId, userId)))
      .limit(1);
    return result[0];
  }

  async deleteSavedEmail(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(savedEmails)
      .where(and(eq(savedEmails.id, id), eq(savedEmails.userId, userId)))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
