import rateLimit from 'express-rate-limit';

const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
};

export const passwordVerificationLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password attempts. Please try again later.' },
});

export const downloadLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many download attempts. Please try again later.' },
});

export const uploadLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many upload attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});

export const codeLookupLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many file lookup attempts. Please try again later.' },
});
