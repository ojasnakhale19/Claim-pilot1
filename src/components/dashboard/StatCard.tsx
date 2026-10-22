import * as React from 'react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from '../ui/Card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  demo?: boolean;
}

export function StatCard({ title, value, change, changeLabel, icon, iconBg = 'bg-primary-100', iconColor = 'text-primary-600', demo = false }: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-500 truncate">{title}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              {demo && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  Demo
                </span>
              )}
            </div>
            {change !== undefined && (
              <p className="mt-1.5 flex items-center gap-1 text-sm" aria-label={changeLabel}>
                {isPositive && <TrendingUp className="h-4 w-4 text-success-600" aria-hidden="true" />}
                {isNegative && <TrendingDown className="h-4 w-4 text-danger-600" aria-hidden="true" />}
                {!isPositive && !isNegative && change !== 0 && <Minus className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                <span className={cn(
                  'font-medium',
                  isPositive ? 'text-success-600' : isNegative ? 'text-danger-600' : 'text-slate-500'
                )}>
                  {isPositive || isNegative ? '+' : ''}{change?.toFixed(1)}%
                </span>
                <span className="text-slate-500">{changeLabel || 'vs last period'}</span>
              </p>
            )}
          </div>
          {icon && (
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', iconBg)}>
              <span className={cn('h-6 w-6', iconColor)}>{icon}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}