import { useState } from 'react';
import { RetroLayout } from '@/components/RetroLayout';
import { MessageSquare, Send, Star, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Feedback() {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedbackType, setFeedbackType] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const feedbackTypes = [
    { id: 'bug', label: 'BUG REPORT' },
    { id: 'feature', label: 'FEATURE REQUEST' },
    { id: 'improvement', label: 'IMPROVEMENT' },
    { id: 'praise', label: 'PRAISE' },
    { id: 'other', label: 'OTHER' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!feedbackType || !message) {
      toast({
        title: "Missing Information",
        description: "Please select a feedback type and enter your message.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSubmitting(false);
    setIsSubmitted(true);
    
    toast({
      title: "Feedback Received",
      description: "Thank you for helping us improve AeroSend!",
    });
  };

  if (isSubmitted) {
    return (
      <RetroLayout>
        <div className="max-w-2xl mx-auto">
          <div 
            className="text-center p-12"
            style={{ border: '1px solid hsl(var(--accent) / 0.3)' }}
          >
            <CheckCircle 
              className="mx-auto mb-4" 
              size={48} 
              style={{ color: 'hsl(var(--accent))' }}
            />
            <h2 
              className="text-lg tracking-[0.2em] mb-3"
              style={{ color: 'hsl(var(--accent))' }}
            >
              THANK YOU
            </h2>
            <p 
              className="text-sm mb-6"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              Your feedback has been received. We truly appreciate you taking the time 
              to help us make AeroSend better.
            </p>
            <button
              onClick={() => {
                setIsSubmitted(false);
                setRating(0);
                setFeedbackType('');
                setMessage('');
                setEmail('');
              }}
              className="px-6 py-2 text-xs tracking-wider transition-all"
              style={{ 
                border: '1px solid hsl(var(--accent))',
                color: 'hsl(var(--accent))',
              }}
              data-testid="button-submit-another"
            >
              SUBMIT ANOTHER
            </button>
          </div>
        </div>
      </RetroLayout>
    );
  }

  return (
    <RetroLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare size={20} style={{ color: 'hsl(var(--accent))' }} />
            <h1 
              className="text-sm tracking-[0.2em] font-medium"
              style={{ color: 'hsl(var(--accent))' }}
            >
              FEEDBACK
            </h1>
          </div>
          <p 
            className="text-[11px]"
            style={{ color: 'hsl(var(--text-dim))' }}
          >
            Help us make AeroSend even better. Your input matters.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div 
            className="p-6 mb-4"
            style={{ border: '1px solid hsl(var(--border-subtle))' }}
          >
            <label 
              className="block text-[10px] tracking-wider mb-3"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              HOW WOULD YOU RATE YOUR EXPERIENCE?
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                  data-testid={`button-star-${star}`}
                >
                  <Star
                    size={24}
                    fill={(hoverRating || rating) >= star ? 'hsl(45, 90%, 50%)' : 'transparent'}
                    style={{ 
                      color: (hoverRating || rating) >= star 
                        ? 'hsl(45, 90%, 50%)' 
                        : 'hsl(var(--text-dim))',
                      transition: 'all 0.2s ease',
                    }}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span 
                  className="ml-2 text-[10px]"
                  style={{ color: 'hsl(var(--text-secondary))' }}
                >
                  {rating === 5 ? 'EXCELLENT' : rating === 4 ? 'GREAT' : rating === 3 ? 'GOOD' : rating === 2 ? 'FAIR' : 'POOR'}
                </span>
              )}
            </div>
          </div>

          <div 
            className="p-6 mb-4"
            style={{ border: '1px solid hsl(var(--border-subtle))' }}
          >
            <label 
              className="block text-[10px] tracking-wider mb-3"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              FEEDBACK TYPE *
            </label>
            <div className="flex flex-wrap gap-2">
              {feedbackTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setFeedbackType(type.id)}
                  className="px-3 py-1.5 text-[10px] tracking-wider transition-all"
                  style={{ 
                    border: feedbackType === type.id 
                      ? '1px solid hsl(var(--accent))' 
                      : '1px solid hsl(var(--border-subtle))',
                    backgroundColor: feedbackType === type.id 
                      ? 'hsl(var(--accent) / 0.1)' 
                      : 'transparent',
                    color: feedbackType === type.id 
                      ? 'hsl(var(--accent))' 
                      : 'hsl(var(--text-dim))',
                  }}
                  data-testid={`button-type-${type.id}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div 
            className="p-6 mb-4"
            style={{ border: '1px solid hsl(var(--border-subtle))' }}
          >
            <label 
              className="block text-[10px] tracking-wider mb-3"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              YOUR MESSAGE *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              rows={5}
              className="w-full text-xs resize-none focus:outline-none"
              style={{ 
                backgroundColor: 'hsl(var(--input-bg))',
                border: '1px solid hsl(var(--border-dim))',
                color: 'hsl(var(--text-primary))',
                padding: '12px',
              }}
              data-testid="textarea-message"
            />
          </div>

          <div 
            className="p-6 mb-6"
            style={{ border: '1px solid hsl(var(--border-subtle))' }}
          >
            <label 
              className="block text-[10px] tracking-wider mb-3"
              style={{ color: 'hsl(var(--text-dim))' }}
            >
              EMAIL (OPTIONAL)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full text-xs focus:outline-none"
              style={{ 
                backgroundColor: 'hsl(var(--input-bg))',
                border: '1px solid hsl(var(--border-dim))',
                color: 'hsl(var(--text-primary))',
                padding: '10px 12px',
              }}
              data-testid="input-email"
            />
            <p 
              className="text-[9px] mt-2"
              style={{ color: 'hsl(var(--text-dim) / 0.6)' }}
            >
              Only if you'd like us to follow up with you
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs tracking-wider transition-all disabled:opacity-50"
            style={{ 
              backgroundColor: 'hsl(var(--accent))',
              color: 'hsl(var(--surface))',
            }}
            data-testid="button-submit-feedback"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                SENDING...
              </>
            ) : (
              <>
                <Send size={14} />
                SEND FEEDBACK
              </>
            )}
          </button>
        </form>
      </div>
    </RetroLayout>
  );
}
