import React from 'react';
import { Crown, ShieldCheck } from 'lucide-react';
import { getAdminBadgeLabel, isPrimaryAdminUser } from '../utils/tokenomics';

interface AdminBadgeProps {
  user?: {
    uid?: string | null;
    id?: string | null;
    telegram?: string | null;
    username?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  testId?: string;
}

export const AdminBadge: React.FC<AdminBadgeProps> = ({
  user,
  size = 'sm',
  className = '',
  testId = 'admin-role-badge',
}) => {
  const label = getAdminBadgeLabel(user);
  if (!label) return null;

  const isPrimary = isPrimaryAdminUser(user);
  const Icon = isPrimary ? Crown : ShieldCheck;

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[9.5px] gap-1 rounded-md'
      : size === 'md'
      ? 'px-2.5 py-1 text-[11px] gap-1.5 rounded-lg'
      : 'px-2 py-0.5 text-[10px] gap-1 rounded-lg';

  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      data-testid={testId}
      title={isPrimary ? 'Platforma Bosh Admini' : 'Tasdiqlangan Administrator'}
      className={`inline-flex items-center font-extrabold tracking-wide uppercase shrink-0 border ${
        isPrimary
          ? 'bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-rose-500/25 border-amber-400/50 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
          : 'bg-gradient-to-r from-amber-500/15 to-amber-600/20 border-amber-400/35 text-amber-300'
      } ${sizeClasses} ${className}`}
    >
      <Icon className={`${iconSize} text-amber-300 shrink-0`} />
      <span>{label}</span>
    </span>
  );
};
