import { cn } from "@/lib/utils";
import { Sentiment, SENTIMENT_LABELS } from "@/lib/types";

const sentimentStyles: Record<Sentiment, { dot: string; label: string }> = {
  very_positive: { dot: "bg-emerald-400", label: "text-emerald-400" },
  positive: { dot: "bg-emerald-600", label: "text-emerald-500" },
  neutral: { dot: "bg-neutral-500", label: "text-neutral-400" },
  negative: { dot: "bg-orange-500", label: "text-orange-400" },
  very_negative: { dot: "bg-red-500", label: "text-red-400" },
};

interface SentimentIndicatorProps {
  sentiment: Sentiment;
  showLabel?: boolean;
  className?: string;
}

export function SentimentIndicator({
  sentiment,
  showLabel = false,
  className,
}: SentimentIndicatorProps) {
  const { dot, label } = sentimentStyles[sentiment];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
      {showLabel && (
        <span className={cn("text-xs", label)}>
          {SENTIMENT_LABELS[sentiment]}
        </span>
      )}
    </span>
  );
}
