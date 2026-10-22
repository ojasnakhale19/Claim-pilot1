import { useNavigate } from 'react-router-dom';
import { Plus, ExternalLink, ArrowRight } from 'lucide-react';
import { StatCard } from '../components/dashboard/StatCard';
import { ClaimsActivityChart, StatusDistributionChart } from '../components/dashboard/ClaimsChart';
import { ClaimsTable } from '../components/dashboard/ClaimsTable';
import { Button } from '../components/ui/Button';
import { mockClaims, mockKPIData, mockAnalyticsData } from '../data/mockClaims';
import type { Claim } from '../types';

export function DashboardPage() {
  const navigate = useNavigate();

  const handleNewAssessment = () => {
    navigate('/submit-claim');
  };

  const handleClaimClick = (claim: Claim) => {
    navigate(`/claims/${claim.id}`);
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Good morning, Alex</h1>
          <p className="mt-1 text-slate-500">Here's your claims operations overview.</p>
        </div>
        <Button onClick={handleNewAssessment} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Claim
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Claims"
          value={mockKPIData.totalClaims.toLocaleString()}
          change={mockKPIData.totalClaimsChange}
          changeLabel="vs last month"
          icon={<ExternalLink className="h-6 w-6" />}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
          demo
        />
        <StatCard
          title="AI-Assessed Claims"
          value={mockKPIData.aiAssessedClaims.toLocaleString()}
          change={mockKPIData.aiAssessedChange}
          changeLabel="vs last month"
          icon={<ArrowRight className="h-6 w-6" />}
          iconBg="bg-success-100"
          iconColor="text-success-600"
          demo
        />
        <StatCard
          title="Avg Settlement Time"
          value={`${mockKPIData.avgSettlementTime} min`}
          change={mockKPIData.settlementTimeChange}
          changeLabel="vs last month"
          icon={<ExternalLink className="h-6 w-6" />}
          iconBg="bg-warning-100"
          iconColor="text-warning-600"
          demo
        />
        <StatCard
          title="Human Review Required"
          value={mockKPIData.humanReviewRequired}
          change={-15.2}
          changeLabel="vs last month"
          icon={<ArrowRight className="h-6 w-6" />}
          iconBg="bg-danger-100"
          iconColor="text-danger-600"
          demo
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ClaimsActivityChart data={mockAnalyticsData.claimsOverTime} />
        <StatusDistributionChart
          data={[
            { name: 'Assessed', value: 642, color: '#3b82f6' },
            { name: 'Negotiating', value: 187, color: '#f59e0b' },
            { name: 'Settled', value: 398, color: '#22c55e' },
            { name: 'Escalated', value: 37, color: '#ef4444' },
          ]}
        />
      </div>

      <ClaimsTable claims={mockClaims} onClaimClick={handleClaimClick} />
    </div>
  );
}