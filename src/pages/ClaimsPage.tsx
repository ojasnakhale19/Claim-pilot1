import { useNavigate } from 'react-router-dom';
import { ClaimsTable } from '../components/dashboard/ClaimsTable';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { mockClaims } from '../data/mockClaims';
import type { Claim } from '../types';

export function ClaimsPage() {
  const navigate = useNavigate();

  const handleClaimClick = (claim: Claim) => {
    navigate(`/claims/${claim.id}`);
  };

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Claims Management</h1>
        <p className="mt-1 text-slate-500">View and manage all claims across the organization.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>All Claims</CardTitle>
            <CardDescription>Complete list of claims with filtering and search</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ClaimsTable claims={mockClaims} onClaimClick={handleClaimClick} />
        </CardContent>
      </Card>
    </div>
  );
}