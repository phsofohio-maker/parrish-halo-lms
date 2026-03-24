import { AvailabilityWindow } from '../functions/src/types';

export type AvailabilityStatus = 'available' | 'not_yet_open' | 'closed';

export interface AvailabilityCheck {
  status: AvailabilityStatus;
  opensAt?: Date;
  closesAt?: Date;
  message?: string;
}

export const checkAvailability = (
  availability?: AvailabilityWindow,
  now: Date = new Date()
): AvailabilityCheck => {
  if (!availability) return { status: 'available' };

  const opensAt = availability.opensAt ? new Date(availability.opensAt) : undefined;
  const closesAt = availability.closesAt ? new Date(availability.closesAt) : undefined;

  if (opensAt && now < opensAt) {
    return {
      status: 'not_yet_open',
      opensAt,
      closesAt,
      message: `Opens ${opensAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  }

  if (closesAt && now > closesAt) {
    return {
      status: 'closed',
      opensAt,
      closesAt,
      message: `Closed ${closesAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  }

  return { status: 'available', opensAt, closesAt };
};
