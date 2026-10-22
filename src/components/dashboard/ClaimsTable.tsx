import { useState, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { Pagination } from '../ui/Pagination';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, formatDate, getStatusBadgeVariant, getStatusLabel } from '../../data/mockClaims';
import type { Claim } from '../../types';

interface ClaimsTableProps {
  claims: Claim[];
  onClaimClick?: (claim: Claim) => void;
  className?: string;
}

export function ClaimsTable({ claims, onClaimClick, className }: ClaimsTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Claim | 'estimatedRepairCost'; direction: 'asc' | 'desc' }>({ key: 'updatedAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      const matchesSearch = claim.id.toLowerCase().includes(search.toLowerCase()) ||
        claim.customerName.toLowerCase().includes(search.toLowerCase()) ||
        claim.vehicle.registrationNumber.toLowerCase().includes(search.toLowerCase()) ||
        claim.vehicle.make.toLowerCase().includes(search.toLowerCase()) ||
        claim.vehicle.model.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' || claim.status === statusFilter;
      const matchesSeverity = severityFilter === 'all' || claim.severity === severityFilter;

      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [claims, search, statusFilter, severityFilter]);

  const sortedClaims = useMemo(() => {
    return [...filteredClaims].sort((a, b) => {
      const aVal = a[sortConfig.key] as string | number | Date;
      const bVal = b[sortConfig.key] as string | number | Date;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredClaims, sortConfig]);

  const totalPages = Math.ceil(sortedClaims.length / pageSize);
  const paginatedClaims = sortedClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key: keyof Claim | 'estimatedRepairCost') => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'evidence_uploaded', label: 'Evidence Uploaded' },
    { value: 'assessing', label: 'Assessing' },
    { value: 'assessed', label: 'Assessed' },
    { value: 'negotiating', label: 'Negotiating' },
    { value: 'settled', label: 'Settled' },
    { value: 'escalated', label: 'Escalated' },
    { value: 'closed', label: 'Closed' },
  ];

  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'minor', label: 'Minor' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'severe', label: 'Severe' },
    { value: 'uncertain', label: 'Uncertain' },
  ];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle>Recent Claims</CardTitle>
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search claims..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="h-10 pl-10"
              aria-label="Search claims"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {severityOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort('id')}>
                  Claim ID
                  <span className="ml-1 flex items-center">
                    {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronDown className="h-3.5 w-3.5 text-slate-300" />}
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort('customerName')}>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Damage Type</TableHead>
                <TableHead className="cursor-pointer hover:bg-slate-50 text-right" onClick={() => handleSort('estimatedRepairCost')}>
                  Est. Repair Cost
                  <span className="ml-1 flex items-center">
                    {sortConfig.key === 'estimatedRepairCost' ? (sortConfig.direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronDown className="h-3.5 w-3.5 text-slate-300" />}
                  </span>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="cursor-pointer hover:bg-slate-50" onClick={() => handleSort('updatedAt')}>
                  Last Updated
                  <span className="ml-1 flex items-center">
                    {sortConfig.key === 'updatedAt' ? (sortConfig.direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronDown className="h-3.5 w-3.5 text-slate-300" />}
                  </span>
                </TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedClaims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-500">
                    No claims found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClaims.map((claim) => (
                  <TableRow
                    key={claim.id}
                    className={cn('cursor-pointer transition-colors hover:bg-slate-50', onClaimClick && 'hover:bg-primary-50/50')}
                    onClick={() => onClaimClick?.(claim)}
                    tabIndex={onClaimClick ? 0 : undefined}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClaimClick?.(claim); } }}
                  >
                    <TableCell className="font-mono font-medium text-slate-900">{claim.id}</TableCell>
                    <TableCell className="font-medium text-slate-900">{claim.customerName}</TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-900">{claim.vehicle.make} {claim.vehicle.model}</div>
                      <div className="text-xs text-slate-500">{claim.vehicle.registrationNumber} &middot; {claim.vehicle.year}</div>
                    </TableCell>
                    <TableCell className="capitalize">{claim.damageType.replace('_', ' ')}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-slate-900">{formatCurrency(claim.estimatedRepairCost)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(claim.status) as any}>{getStatusLabel(claim.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 whitespace-nowrap">{formatDate(claim.updatedAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClaimClick?.(claim); }} aria-label={`View details for ${claim.id}`}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              showPageNumbers
              maxPageButtons={5}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}