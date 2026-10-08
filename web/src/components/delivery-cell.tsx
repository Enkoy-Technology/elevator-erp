import { StatusPill } from '@/components/list-toolbar';
import { formatEtb } from '@/lib/money';

export interface DeliveryFields {
  deliveryDueDate?: string | null;
  deliveryDaysLeft?: number | null;
  deliveryPenaltyEtb?: string | null;
}

/**
 * The countdown to a project's promised delivery, the same on every list
 * that shows projects: working days left, then overdue with the delay
 * penalty run up so far. A dash until a contract with a delivery period
 * is signed.
 */
export const DeliveryCell = ({ project }: { project: DeliveryFields }) => {
  const days = project.deliveryDaysLeft;
  if (days === null || days === undefined) {
    return '—';
  }
  const plural = `working ${Math.abs(days) === 1 ? 'day' : 'days'}`;
  return (
    <span
      className="inline-flex flex-col items-start gap-1"
      title={`Due ${project.deliveryDueDate ?? ''}`}
    >
      <StatusPill
        label={
          days > 0
            ? `${days} ${plural} left`
            : days === 0
              ? 'Due today'
              : `${-days} ${plural} overdue`
        }
        tone={days <= 25 ? 'danger' : 'good'}
      />
      {project.deliveryPenaltyEtb ? (
        <span className="whitespace-nowrap text-xs text-red-700">
          Penalty {formatEtb(project.deliveryPenaltyEtb)}
        </span>
      ) : null}
    </span>
  );
};
