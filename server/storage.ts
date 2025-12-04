import { type TransferSession, type InsertTransferSession, transferSessions } from "@shared/schema";
import { db } from "./db";
import { eq, lte, and, ne, lt } from "drizzle-orm";
import { generateSecureCode } from "./lib/security";

export interface IStorage {
  createTransferSession(session: InsertTransferSession): Promise<TransferSession>;
  getSessionByCode(code: string): Promise<TransferSession | undefined>;
  getSessionByCodeIncludeCompleted(code: string): Promise<TransferSession | undefined>;
  updateSessionStatus(id: number, status: string): Promise<void>;
  markSessionCompleted(id: number): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
  deleteOldSessions(): Promise<void>;
  healthCheck(): Promise<boolean>;
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
}

export const storage = new DatabaseStorage();
