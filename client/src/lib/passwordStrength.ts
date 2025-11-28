export type PasswordStrength = 'NONE' | 'WEAK' | 'MEDIUM' | 'STRONG' | 'VERY STRONG';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0-4
  feedback: string;
}

export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password || password.length === 0) {
    return {
      strength: 'NONE',
      score: 0,
      feedback: 'Enter a password'
    };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length check
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Use 8+ characters');
  }

  if (password.length >= 12) {
    score += 1;
  }

  // Character variety checks
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (hasLowercase && hasUppercase) {
    score += 1;
  } else {
    feedback.push('Mix upper & lower case');
  }

  if (hasNumbers) {
    score += 0.5;
  } else {
    feedback.push('Add numbers');
  }

  if (hasSpecialChars) {
    score += 0.5;
  } else {
    feedback.push('Add special characters');
  }

  // Common patterns penalty
  const commonPatterns = [
    /^123456/,
    /^password/i,
    /^qwerty/i,
    /^abc123/i,
    /^111111/,
    /^letmein/i
  ];

  const hasCommonPattern = commonPatterns.some(pattern => pattern.test(password));
  if (hasCommonPattern) {
    score = Math.max(0, score - 2);
    feedback.unshift('Avoid common patterns');
  }

  // Determine strength level
  let strength: PasswordStrength;
  if (score === 0) {
    strength = 'NONE';
  } else if (score < 2) {
    strength = 'WEAK';
  } else if (score < 3) {
    strength = 'MEDIUM';
  } else if (score < 4) {
    strength = 'STRONG';
  } else {
    strength = 'VERY STRONG';
  }

  return {
    strength,
    score: Math.min(4, Math.max(0, Math.round(score))),
    feedback: feedback.length > 0 ? feedback.join(', ') : 'Excellent password!'
  };
}
