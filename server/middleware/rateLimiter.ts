import rateLimit from 'express-rate-limit';

// Rate limiter for password verification attempts
// Allows 5 attempts per 15 minutes per IP + code combination
export const passwordVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many password attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for file downloads
// Allows 30 downloads per hour per IP
export const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { error: 'Too many download attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for file uploads
// Allows 10 uploads per hour per IP
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many upload attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed uploads
});

// Rate limiter for code lookups
// Allows 50 lookups per 15 minutes per IP to prevent code enumeration
export const codeLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many file lookup attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
