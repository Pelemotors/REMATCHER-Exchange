import { ExchangeMark } from "@/components/brand/exchange-mark";
import { Surface } from "./surface";

export function EmptyStateV2({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Surface depth="secondary" className="flex flex-col items-center px-6 py-14 text-center">
      <ExchangeMark state="idle" size={56} className="mb-6" />
      <p className="text-section font-semibold text-v2-warm">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-body text-v2-text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </Surface>
  );
}
