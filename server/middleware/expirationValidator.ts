// Allowed expiration durations in hours
export const ALLOWED_EXPIRATION_HOURS = [1, 12, 24, 168]; // 1hr, 12hr, 24hr, 7 days
export const DEFAULT_EXPIRATION_HOURS = 24;
export const MAX_EXPIRATION_HOURS = 168; // 7 days

/**
 * Validates and sanitizes the expiration time
 * Returns a safe expiration hours value
 */
export function validateExpirationHours(expiresIn: string | number | undefined): number {
  // Default to 24 hours if not provided
  if (!expiresIn) {
    return DEFAULT_EXPIRATION_HOURS;
  }
  
  const hours = typeof expiresIn === 'string' ? parseInt(expiresIn, 10) : expiresIn;
  
  // Check if it's a valid number
  if (isNaN(hours) || !isFinite(hours)) {
    console.warn(`[VALIDATION] Invalid expiresIn value: ${expiresIn}, using default`);
    return DEFAULT_EXPIRATION_HOURS;
  }
  
  // Check if it's in the whitelist
  if (!ALLOWED_EXPIRATION_HOURS.includes(hours)) {
    console.warn(`[VALIDATION] Unauthorized expiresIn value: ${hours}, using default`);
    return DEFAULT_EXPIRATION_HOURS;
  }
  
  // Ensure it's positive and within max limit
  if (hours <= 0) {
    console.warn(`[VALIDATION] Negative expiresIn value: ${hours}, using default`);
    return DEFAULT_EXPIRATION_HOURS;
  }
  
  if (hours > MAX_EXPIRATION_HOURS) {
    console.warn(`[VALIDATION] expiresIn exceeds maximum: ${hours}, capping at ${MAX_EXPIRATION_HOURS}`);
    return MAX_EXPIRATION_HOURS;
  }
  
  return hours;
}
