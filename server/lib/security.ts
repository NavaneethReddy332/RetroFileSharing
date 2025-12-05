import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function generateSecureCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0] % 900000) + 100000;
  return code.toString();
}

export function generateCloudCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (let i = 0; i < 8; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export function generateSessionToken(sessionId: number, code: string): string {
  const payload = `${sessionId}:${code}:${Date.now() + 600000}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

export function verifySessionToken(token: string, expectedCode: string): { valid: boolean; sessionId?: number } {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    
    if (parts.length !== 4) {
      return { valid: false };
    }
    
    const [sessionIdStr, code, expiresStr, providedSignature] = parts;
    const sessionId = parseInt(sessionIdStr, 10);
    const expires = parseInt(expiresStr, 10);
    
    if (code !== expectedCode) {
      return { valid: false };
    }
    
    if (Date.now() > expires) {
      return { valid: false };
    }
    
    const payload = `${sessionIdStr}:${code}:${expiresStr}`;
    const hmac = crypto.createHmac('sha256', SESSION_SECRET);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return { valid: false };
    }
    
    return { valid: true, sessionId };
  } catch {
    return { valid: false };
  }
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string, 
  maxRequests: number = 10, 
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }
  
  if (entry.count >= maxRequests) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetIn: entry.resetTime - now 
    };
  }
  
  entry.count++;
  return { 
    allowed: true, 
    remaining: maxRequests - entry.count, 
    resetIn: entry.resetTime - now 
  };
}

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);
