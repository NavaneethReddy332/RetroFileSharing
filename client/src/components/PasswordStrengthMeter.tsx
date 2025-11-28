import { calculatePasswordStrength, PasswordStrength } from '@/lib/passwordStrength';

interface PasswordStrengthMeterProps {
  password: string;
}

const strengthColors: Record<PasswordStrength, { bg: string; text: string; border: string }> = {
  'NONE': {
    bg: 'hsl(var(--status-none-bg))',
    text: 'hsl(var(--status-none-text))',
    border: 'hsl(var(--status-none-border))'
  },
  'WEAK': {
    bg: 'hsl(var(--status-weak-bg))',
    text: 'hsl(var(--status-weak-text))',
    border: 'hsl(var(--status-weak-border))'
  },
  'MEDIUM': {
    bg: 'hsl(var(--status-medium-bg))',
    text: 'hsl(var(--status-medium-text))',
    border: 'hsl(var(--status-medium-border))'
  },
  'STRONG': {
    bg: 'hsl(var(--status-strong-bg))',
    text: 'hsl(var(--status-strong-text))',
    border: 'hsl(var(--status-strong-border))'
  },
  'VERY STRONG': {
    bg: 'hsl(var(--status-verystrong-bg))',
    text: 'hsl(var(--status-verystrong-text))',
    border: 'hsl(var(--status-verystrong-border))'
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
          backgroundColor: 'hsl(var(--text-primary))'
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
          style={{ color: 'hsl(var(--text-secondary))' }}
          data-testid="strength-feedback"
        >
          {result.feedback}
        </div>
      </div>
    </div>
  );
}
