import { type TransferSession, type InsertTransferSession, transferSessions } from "@shared/schema";
import { db } from "./db";
import { eq, lte } from "drizzle-orm";

export interface IStorage {
  createTransferSession(session: InsertTransferSession): Promise<TransferSession>;
  getSessionByCode(code: string): Promise<TransferSession | undefined>;
  updateSessionStatus(id: string, status: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
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
    
    if (session.expiresAt <= new Date()) {
      await this.deleteSession(session.id);
      return undefined;
    }
    
    return session;
  }

  async updateSessionStatus(id: string, status: string): Promise<void> {
    await db.update(transferSessions).set({ status }).where(eq(transferSessions.id, id));
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(transferSessions).where(eq(transferSessions.id, id));
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = new Date();
      await db.delete(transferSessions).where(lte(transferSessions.expiresAt, now));
    } catch (error) {
      console.error('[CLEANUP] Error during session cleanup:', error);
    }
  }
}

export const storage = new DatabaseStorage();
