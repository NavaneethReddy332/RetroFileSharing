import { type TransferSession, type InsertTransferSession, transferSessions, type CloudUpload, type InsertCloudUpload, cloudUploads, type User, type InsertUser, users, type UserFile, type InsertUserFile, userFiles } from "@shared/schema";
import { db } from "./db";
import { eq, lte, and, ne, lt, desc } from "drizzle-orm";
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
}

export const storage = new DatabaseStorage();
