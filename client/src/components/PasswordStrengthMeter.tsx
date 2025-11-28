import { calculatePasswordStrength, PasswordStrength } from '@/lib/passwordStrength';

interface PasswordStrengthMeterProps {
  password: string;
}

const strengthColors: Record<PasswordStrength, { bg: string; text: string; border: string }> = {
  'NONE': {
    bg: '#d9d9d9',
    text: '#666666',
    border: '#999999'
  },
  'WEAK': {
    bg: '#ff6b6b',
    text: '#8b0000',
    border: '#cc0000'
  },
  'MEDIUM': {
    bg: '#ffd93d',
    text: '#8b6914',
    border: '#cc9a1f'
  },
  'STRONG': {
    bg: '#6bcf7f',
    text: '#0d5c1f',
    border: '#1a8c2e'
  },
  'VERY STRONG': {
    bg: '#51cf66',
    text: '#0a4d16',
    border: '#147a28'
  }
};

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const result = calculatePasswordStrength(password);
  const colors = strengthColors[result.strength];
  
  // Don't show meter if no password entered
  if (result.strength === 'NONE') {
    return null;
  }

  return (
    <div className="mt-2 space-y-1" data-testid="password-strength-meter">
      {/* Strength Bar */}
      <div 
        className="h-3 border-2 transition-colors duration-300"
        style={{ 
          borderColor: colors.border,
          backgroundColor: '#ffffff'
        }}
      >
        <div 
          className="h-full transition-all duration-300"
          style={{ 
            width: `${(result.score / 4) * 100}%`,
            backgroundColor: colors.bg
          }}
        />
      </div>

      {/* Strength Label */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div 
          className="font-bold font-retro px-2 py-0.5 border transition-colors duration-300"
          style={{ 
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border
          }}
          data-testid="strength-label"
        >
          {result.strength}
        </div>
        
        {/* Feedback */}
        <div 
          className="text-xs flex-1 transition-colors duration-300"
          style={{ color: 'var(--text-secondary)' }}
          data-testid="strength-feedback"
        >
          {result.feedback}
        </div>
      </div>
    </div>
  );
}
