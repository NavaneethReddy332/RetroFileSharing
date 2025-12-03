import { type TransferSession, type InsertTransferSession, transferSessions } from "@shared/schema";
import { db } from "./db";
import { eq, lte, and, ne } from "drizzle-orm";

export interface IStorage {
  createTransferSession(session: InsertTransferSession): Promise<TransferSession>;
  getSessionByCode(code: string): Promise<TransferSession | undefined>;
  getSessionByCodeIncludeCompleted(code: string): Promise<TransferSession | undefined>;
  updateSessionStatus(id: number, status: string): Promise<void>;
  markSessionCompleted(id: number): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export class DatabaseStorage implements IStorage {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  async createTransferSession(session: InsertTransferSession): Promise<TransferSession> {
    let code = generateCode();
    let attempts = 0;
    
    while (attempts < 10) {
      const existing = await db.select().from(transferSessions).where(eq(transferSessions.code, code)).limit(1);
      if (existing.length === 0) break;
      code = generateCode();
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
}

export const storage = new DatabaseStorage();
