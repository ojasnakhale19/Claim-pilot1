import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Maximize, Eye, EyeOff, ArrowLeft, Check } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { cn } from '../lib/utils';
import { formatCurrency, getSeverityBadgeVariant, getClaimById, getAssessmentByClaimId, getDamageComponentsByClaimId, mockClaims, mockAssessments, mockDamageComponents } from '../data/mockClaims';
import type { DamageComponent, Annotation } from '../types';

const MOCK_IMAGES = [
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1617814076367-b759c7d7e773?w=800&h=600&fit=crop',
];

export function AssessmentResultsPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const claim = claimId ? getClaimById(claimId) : mockClaims[0];
  const assessment = claimId ? getAssessmentByClaimId(claimId) : mockAssessments[0];
  const components = claimId ? getDamageComponentsByClaimId(claimId) : mockDamageComponents[claim?.id || 'CLM-2026-1042'];

  const images = MOCK_IMAGES;

  const goBack = () => navigate(-1);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setZoom(1);
  };

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setZoom(1);
  const toggleFullscreen = () => {
    const viewer = document.querySelector('.image-viewer') as HTMLElement;
    if (!document.fullscreenElement) {
      viewer?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleComponentSelect = (componentId: string) => {
    setSelectedComponent(componentId === selectedComponent ? null : componentId);
  };

  if (!claim || !assessment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-medium text-slate-900">Claim not found</h2>
          <Button onClick={goBack} variant="outline" className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Damage Assessment Results</h1>
          <p className="text-slate-500">{claim.id} · {claim.customerName} · {claim.vehicle.make} {claim.vehicle.model}</p>
        </div>
        <Badge variant="warning" className="ml-auto text-xs">DEMO MODE</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Evidence Viewer</CardTitle>
                <CardDescription>Review uploaded photos and videos with damage annotations</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
                  <Maximize className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowOverlay(!showOverlay)} aria-label={showOverlay ? 'Hide damage overlay' : 'Show damage overlay'}>
                  <Eye className="h-4 w-4" />
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100">
                <div className="absolute inset-0 image-viewer" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
                  {images[selectedImageIndex] ? (
                    <img
                      src={images[selectedImageIndex]}
                      alt={`Damage photo ${selectedImageIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">No image available</div>
                  )}
                  {showOverlay && components.map((comp: DamageComponent, idx: number) => (
                    <div
                      key={comp.id}
                      className="absolute border-2 border-primary-500/80 bg-primary-500/10 rounded"
                      style={{
                        left: `${45 + idx * 15}%`,
                        top: `${45 + idx * 15}%`,
                        width: '25%',
                        height: '15%',
                      }}
                      onClick={() => handleComponentSelect(comp.id)}
                    >
                      <div className="absolute -top-6 left-0 bg-primary-600 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap">
                        {comp.component}
                      </div>
                    </div>
                  ))}
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setSelectedImageIndex(prev => (prev - 1 + images.length) % images.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg hover:bg-white transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-5 w-5 text-slate-700" />
                    </button>
                    <button
                      onClick={() => setSelectedImageIndex(prev => (prev + 1) % images.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg hover:bg-white transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-5 w-5 text-slate-700" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => handleImageClick(i)}
                      className={cn(
                        'h-2 w-2 rounded-full transition-all',
                        i === selectedImageIndex ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'
                      )}
                      aria-label={`View image ${i + 1}`}
                      aria-current={i === selectedImageIndex}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={zoomOut} disabled={zoom <= 0.5} aria-label="Zoom out">-</Button>
                  <span className="w-16 text-center text-sm font-mono text-slate-700">{Math.round(zoom * 100)}%</span>
                  <Button variant="outline" size="sm" onClick={zoomIn} disabled={zoom >= 3} aria-label="Zoom in">+</Button>
                  <Button variant="ghost" size="sm" onClick={resetZoom} aria-label="Reset zoom">Reset</Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleImageClick((selectedImageIndex - 1 + images.length) % images.length)} aria-label="Previous">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-slate-500">{selectedImageIndex + 1} / {images.length}</span>
                  <Button variant="outline" size="sm" onClick={() => handleImageClick((selectedImageIndex + 1) % images.length)} aria-label="Next">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => handleImageClick(i)}
                    className={cn(
                      'relative aspect-video rounded-lg overflow-hidden border-2 transition-all',
                      i === selectedImageIndex ? 'border-primary-500' : 'border-transparent hover:border-slate-300'
                    )}
                    aria-label={`Select image ${i + 1}`}
                    aria-current={i === selectedImageIndex}
                  >
                    <img src={src} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
                    {i === selectedImageIndex && (
                      <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                        <Check className="h-5 w-5 text-primary-600" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assessment Summary</CardTitle>
              <CardDescription>AI-generated damage assessment overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border bg-slate-50 p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-xs">Illustrative AI Assessment · Demo Mode</Badge>
                  <Badge variant={assessment.status === 'completed' ? 'success' : assessment.status === 'review_required' ? 'warning' : 'secondary'}>
                    {assessment.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">
                  Assessed on {new Date(assessment.assessedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  by {assessment.assessedBy === 'ai' ? 'AI System' : 'Human Adjuster'}
                  · Overall Confidence: {assessment.overallConfidence}%
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                {components.map((comp: DamageComponent) => (
                  <div
                    key={comp.id}
                    className={cn(
                      'rounded-lg border p-4 cursor-pointer transition-all',
                      selectedComponent === comp.id ? 'border-primary-500 bg-primary-50 shadow-lg' : 'border-border hover:border-slate-300'
                    )}
                    onClick={() => handleComponentSelect(comp.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{comp.component}</p>
                        <p className="text-sm text-slate-500">{comp.damageType}</p>
                      </div>
                      <Badge variant={getSeverityBadgeVariant(comp.severity) as any}>{comp.severity}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-mono font-medium text-slate-900">{formatCurrency(comp.estimatedCost)}</span>
                      <span className="text-xs text-slate-500">{comp.confidence}% confidence</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-4">
                <h4 className="font-medium text-slate-900 mb-3">Key Findings</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary-500 mt-2 shrink-0" /> No structural damage detected. All damage is cosmetic.</li>
                  <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary-500 mt-2 shrink-0" /> No safety concerns identified in this assessment.</li>
                  <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary-500 mt-2 shrink-0" /> All components eligible for standard repair procedures.</li>
                  <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-warning-500 mt-2 shrink-0" /> Right mirror housing requires replacement (not repairable).</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Damage Breakdown</CardTitle>
              <CardDescription>Detailed component-level damage analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Damage Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Repair Method</TableHead>
                    <TableHead className="text-right">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {components.map((comp: DamageComponent) => (
                    <TableRow key={comp.id} className={cn(selectedComponent === comp.id ? 'bg-primary-50' : '')} onClick={() => handleComponentSelect(comp.id)}>
                      <TableCell className="font-medium text-slate-900">{comp.component}</TableCell>
                      <TableCell>{comp.damageType}</TableCell>
                      <TableCell><Badge variant={getSeverityBadgeVariant(comp.severity) as any}>{comp.severity}</Badge></TableCell>
                      <TableCell>{comp.repairMethod}</TableCell>
                      <TableCell className="text-right font-mono font-medium text-slate-900">{formatCurrency(comp.estimatedCost)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-semibold">
                    <TableCell colSpan={4} className="text-right">Total Estimated Repair Cost</TableCell>
                    <TableCell className="text-right font-mono text-slate-900">{formatCurrency(assessment.totalEstimatedCost)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={() => navigate(`/settlement/${claim.id}`)}>
                  View Cost Breakdown & Settlement
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {(() => {
            const comp = selectedComponent ? components.find((c: DamageComponent) => c.id === selectedComponent) : null;
            if (!comp) return null;
            return (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Component Details</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedComponent(null)} aria-label="Close details">
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><p className="text-xs text-slate-500">Component</p><p className="font-medium">{comp.component}</p></div>
                    <div><p className="text-xs text-slate-500">Damage Type</p><p className="font-medium">{comp.damageType}</p></div>
                    <div><p className="text-xs text-slate-500">Severity</p><p className="font-medium"><Badge variant={getSeverityBadgeVariant(comp.severity) as any}>{comp.severity}</Badge></p></div>
                    <div><p className="text-xs text-slate-500">Confidence</p><p className="font-medium">{comp.confidence}%</p></div>
                    <div><p className="text-xs text-slate-500">Repair Method</p><p className="font-medium">{comp.repairMethod}</p></div>
                    <div><p className="text-xs text-slate-500">Safety Concern</p><p className="font-medium">{comp.safetyConcern ? 'Yes' : 'No'}</p></div>
                    <div className="sm:col-span-2"><p className="text-xs text-slate-500">Estimated Cost</p><p className="font-mono text-lg font-bold text-slate-900">{formatCurrency(comp.estimatedCost)}</p></div>
                    <div className="sm:col-span-2"><p className="text-xs text-slate-500">Details</p><p className="text-sm text-slate-600">{comp.details || 'No additional details available.'}</p></div>
                  </div>
                  {comp.annotations && comp.annotations.length > 0 && (
                    <div>
                      <h5 className="font-medium text-slate-900 mb-2">Damage Annotations</h5>
                      <div className="space-y-2">
                        {comp.annotations.map((ann: Annotation) => (
                          <div key={ann.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ann.color }} />
                            <span className="text-sm text-slate-700">{ann.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </CardContent>
              </Card>
            )
          })()}
        </div>
      </div>
    </div>
  );
}