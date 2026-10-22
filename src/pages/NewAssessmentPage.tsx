import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Upload, Trash2, ChevronLeft, ChevronRight, Loader2, CheckCircle, AlertCircle, Brain } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Progress } from '../components/ui/Progress';
import { cn, isValidImageFile, isValidVideoFile, createObjectURL, revokeObjectURL, getFileSizeString, assessGeneral, type GeneralAssessmentResponse } from '../lib/utils';
import { formatCurrency } from '../data/mockClaims';

const STEPS = [
  { id: 1, name: 'Claim Details', description: 'Enter claim and vehicle information' },
  { id: 2, name: 'Upload Evidence', description: 'Add photos and videos of the damage' },
  { id: 3, name: 'Review Assessment', description: 'Review AI-generated damage assessment' },
];

const damageTypes = [
  { value: 'collision', label: 'Collision' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'glass_breakage', label: 'Glass Breakage' },
  { value: 'theft_vandalism', label: 'Theft / Vandalism' },
  { value: 'weather', label: 'Weather Damage' },
  { value: 'fire', label: 'Fire Damage' },
  { value: 'other', label: 'Other' },
];

const severityOptions = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'uncertain', label: 'Uncertain' },
];

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
  name: string;
  size: number;
}

export function NewAssessmentPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    claimId: `CLM-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    customerName: '',
    policyNumber: '',
    vehicleRegistration: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: new Date().getFullYear().toString(),
    vehicleVariant: '',
    repairLocation: '',
    incidentDate: new Date().toISOString().split('T')[0],
    incidentDescription: '',
    damageType: 'collision',
    severity: 'minor',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [showAssessmentResult, setShowAssessmentResult] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<GeneralAssessmentResponse | null>(null);
  const [useAIAssessment, setUseAIAssessment] = useState(false);

  const analysisSteps = [
    'Reviewing uploaded evidence...',
    'Identifying vehicle components...',
    'Classifying visible damage...',
    'Estimating repair requirements...',
    'Preparing the assessment summary...',
  ];

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.customerName.trim()) newErrors.customerName = 'Customer name is required';
      if (!formData.policyNumber.trim()) newErrors.policyNumber = 'Policy number is required';
      if (!formData.vehicleRegistration.trim()) newErrors.vehicleRegistration = 'Vehicle registration is required';
      if (!formData.vehicleMake.trim()) newErrors.vehicleMake = 'Vehicle make is required';
      if (!formData.vehicleModel.trim()) newErrors.vehicleModel = 'Vehicle model is required';
      if (!formData.vehicleYear.trim()) newErrors.vehicleYear = 'Vehicle year is required';
      if (!formData.repairLocation.trim()) newErrors.repairLocation = 'Repair location is required';
      if (!formData.incidentDate) newErrors.incidentDate = 'Incident date is required';
      if (!formData.incidentDescription.trim()) newErrors.incidentDescription = 'Incident description is required';
    }

    if (step === 2) {
      if (uploadedFiles.length === 0) {
        newErrors.files = 'At least one image or video is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    e.target.value = '';
  };

  const processFiles = (files: File[]) => {
    const validFiles: UploadedFile[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      if (isValidImageFile(file)) {
        validFiles.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          preview: createObjectURL(file),
          type: 'image',
          name: file.name,
          size: file.size,
        });
      } else if (isValidVideoFile(file)) {
        validFiles.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          preview: createObjectURL(file),
          type: 'video',
          name: file.name,
          size: file.size,
        });
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles].slice(0, 10));
    }

    if (invalidFiles.length > 0) {
      alert(`The following files are not supported or exceed size limits: ${invalidFiles.join(', ')}. Supported: JPEG, PNG, WebP (max 10MB), MP4, MOV (max 50MB).`);
    }
  };

  const removeFile = (id: string) => {
    const file = uploadedFiles.find(f => f.id === id);
    if (file) {
      revokeObjectURL(file.preview);
    }
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleAnalyze = async () => {
    if (!validateStep(2)) return;

    if (useAIAssessment) {
      // Real AI assessment via backend API
      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setAnalysisStep(0);

      try {
        for (let i = 0; i < analysisSteps.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 800));
          setAnalysisStep(i + 1);
          setAnalysisProgress(Math.round(((i + 1) / analysisSteps.length) * 100));
        }

        const result = await assessGeneral({
          files: uploadedFiles.map(f => f.file),
          confidence_threshold: 0.25,
          image_size: 640,
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        setIsAnalyzing(false);
        setAssessmentResult(result);
        setShowAssessmentResult(true);
        setCurrentStep(3);
      } catch (error: any) {
        setIsAnalyzing(false);
        alert(`AI Assessment failed: ${error.message}`);
      }
    } else {
      // Demo mode - simulated analysis
      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setAnalysisStep(0);

      for (let i = 0; i < analysisSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        setAnalysisStep(i + 1);
        setAnalysisProgress(Math.round(((i + 1) / analysisSteps.length) * 100));
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setIsAnalyzing(false);
      setShowAssessmentResult(true);
      setCurrentStep(3);
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length) {
        setCurrentStep(prev => prev + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    const claimData = {
      ...formData,
      uploadedFiles: uploadedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
      submittedAt: new Date().toISOString(),
    };
    console.log('Claim submitted:', claimData);
    navigate(`/assessment/${formData.claimId}`);
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8" role="progressbar" aria-label="Assessment progress" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={STEPS.length}>
      {STEPS.map((step, index) => {
        const isActive = index + 1 === currentStep;
        const isCompleted = index + 1 < currentStep;
        return (
          <>
            <div className="flex flex-col items-center">
              <div className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all duration-300',
                isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30' :
                isCompleted ? 'bg-success-600 text-white' :
                'bg-slate-100 text-slate-400'
              )}>
                {isCompleted ? <Check className="h-5 w-5" /> : step.id}
              </div>
              <span className={cn('mt-2 text-xs font-medium text-center max-w-[80px]', isActive ? 'text-primary-700' : 'text-slate-500')}>
                {step.name}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={cn('flex-1 h-1.5 mx-2 rounded-full transition-colors', isCompleted ? 'bg-success-500' : 'bg-slate-200')} />
            )}
          </>
        );
      })}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Customer Name"
          value={formData.customerName}
          onChange={e => handleInputChange('customerName', e.target.value)}
          error={errors.customerName}
          placeholder="Enter customer name"
        />
        <Input
          label="Policy Number"
          value={formData.policyNumber}
          onChange={e => handleInputChange('policyNumber', e.target.value)}
          error={errors.policyNumber}
          placeholder="POL-2026-XXXXXX"
        />
        <Input
          label="Vehicle Registration"
          value={formData.vehicleRegistration}
          onChange={e => handleInputChange('vehicleRegistration', e.target.value)}
          error={errors.vehicleRegistration}
          placeholder="XX00XX0000"
        />
        <Select value={formData.vehicleMake} onValueChange={v => handleInputChange('vehicleMake', v)}>
          <SelectTrigger><SelectValue placeholder="Select make" /></SelectTrigger>
          <SelectContent>
            {['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Mahindra', 'Toyota', 'Honda', 'Volkswagen', 'Skoda', 'Renault', 'Nissan', 'Ford', 'MG', 'Citroen'].map(make => (
              <SelectItem key={make} value={make}>{make}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.vehicleMake && <p className="mt-1.5 text-sm text-danger-600">{errors.vehicleMake}</p>}
        <Input
          label="Vehicle Model"
          value={formData.vehicleModel}
          onChange={e => handleInputChange('vehicleModel', e.target.value)}
          error={errors.vehicleModel}
          placeholder="Enter model"
        />
        <Input
          label="Vehicle Year"
          type="number"
          value={formData.vehicleYear}
          onChange={e => handleInputChange('vehicleYear', e.target.value)}
          error={errors.vehicleYear}
          min="1990"
          max={new Date().getFullYear() + 1}
        />
        <Input
          label="Vehicle Variant (Optional)"
          value={formData.vehicleVariant}
          onChange={e => handleInputChange('vehicleVariant', e.target.value)}
          placeholder="e.g., VXi, SX(O), XZ+"
        />
        <Input
          label="Repair Location / Postal Code"
          value={formData.repairLocation}
          onChange={e => handleInputChange('repairLocation', e.target.value)}
          error={errors.repairLocation}
          placeholder="Enter workshop location or PIN code"
        />
        <Input
          label="Incident Date"
          type="date"
          value={formData.incidentDate}
          onChange={e => handleInputChange('incidentDate', e.target.value)}
          error={errors.incidentDate}
          max={new Date().toISOString().split('T')[0]}
        />
        <Select value={formData.damageType} onValueChange={v => handleInputChange('damageType', v)}>
          <SelectTrigger><SelectValue placeholder="Select damage type" /></SelectTrigger>
          <SelectContent>
            {damageTypes.map(dt => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={formData.severity} onValueChange={v => handleInputChange('severity', v)}>
          <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
          <SelectContent>
            {severityOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        label="Incident Description"
        value={formData.incidentDescription}
        onChange={e => handleInputChange('incidentDescription', e.target.value)}
        error={errors.incidentDescription}
        placeholder="Describe the incident in detail..."
        rows={4}
      />
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          'border-slate-300',
          dragActive && 'border-primary-500 bg-primary-50'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload damage photos and videos"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-4">
            <Upload className="h-12 w-12 text-slate-400" aria-hidden="true" />
            <div>
              <p className="text-lg font-medium text-slate-900">Drag & drop photos or videos here</p>
              <p className="text-sm text-slate-500">or click to browse files</p>
            </div>
            <Button variant="outline" size="sm" type="button">
              Browse Files
            </Button>
          </div>
        </label>
        <p className="mt-4 text-xs text-slate-500">
          Supported: JPEG, PNG, WebP (max 10MB) · MP4, MOV (max 50MB) · Max 10 files
        </p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-900">Uploaded Files ({uploadedFiles.length})</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="relative group rounded-lg border border-border bg-white p-3">
                {file.type === 'image' ? (
                  <img src={file.preview} alt={file.name} className="aspect-video w-full rounded object-cover" />
                ) : (
                  <video src={file.preview} className="aspect-video w-full rounded object-cover" controls />
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-xs text-white truncate">{file.name}</p>
                  <p className="text-[10px] text-slate-300">{getFileSizeString(file.size)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${file.name}`}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-danger-600 text-white">
                    <Trash2 className="h-3.5 w-3.5" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-slate-50 p-4">
        <h4 className="font-medium text-slate-900 mb-3">Photography Guidance</h4>
        <p className="text-sm text-slate-600 mb-4">Upload clear photos from multiple angles for a more complete damage review.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Front View', icon: '📷', desc: 'Full front of vehicle' },
            { label: 'Rear View', icon: '📷', desc: 'Full rear of vehicle' },
            { label: 'Side Views', icon: '📷', desc: 'Both left and right sides' },
            { label: 'Close-ups', icon: '🔍', desc: 'Damage details from 1ft away' },
          ].map((guide) => (
            <div key={guide.label} className="rounded-lg border border-border bg-white p-3 text-center">
              <div className="text-2xl mb-1">{guide.icon}</div>
              <p className="text-sm font-medium text-slate-900">{guide.label}</p>
              <p className="text-xs text-slate-500">{guide.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      {isAnalyzing ? (
        <div className="text-center py-12">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <Progress value={analysisProgress} className="absolute top-0 left-0 w-full h-full" />
            <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-primary-600 animate-spin" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Analyzing Damage...</h3>
          <p className="mt-2 text-sm text-slate-500">{analysisSteps[analysisStep] || analysisSteps[analysisSteps.length - 1]}</p>
          <div className="mt-6 space-y-2 text-left max-w-xs mx-auto">
            {analysisSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-2 text-sm">
                <div className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-medium',
                  index < analysisStep ? 'bg-success-500 text-white' :
                  index === analysisStep ? 'bg-primary-500 text-white animate-pulse' :
                  'bg-slate-200 text-slate-400'
                )}>
                  {index < analysisStep ? <Check className="h-3 w-3" /> : index + 1}
                </div>
                <span className={cn(index <= analysisStep ? 'text-slate-900' : 'text-slate-400')}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      ) : showAssessmentResult && assessmentResult && useAIAssessment ? (
        // Real AI Assessment Results
        <div className="space-y-4">
          <div className="rounded-lg border border-success-200 bg-success-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-success-800">AI Assessment Complete</h3>
                <p className="text-sm text-success-700">{assessmentResult.damage_summary}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-medium text-slate-900 mb-3">Assessment Summary</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Total Detections</p>
                <p className="text-lg font-bold text-slate-900">{assessmentResult.total_detections}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Total Est. Repair Cost</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatCurrency(assessmentResult.estimated_repair_cost_min)}–{formatCurrency(assessmentResult.estimated_repair_cost_max)}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Severity</p>
                <p className="text-lg font-bold text-slate-900 capitalize">{assessmentResult.severity}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Settlement Offer</p>
                <p className="text-lg font-bold text-success-600">{formatCurrency(assessmentResult.settlement_offer)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-medium text-slate-900 mb-3">Identified Damage by Image</h4>
            <div className="space-y-2">
              {assessmentResult.results.map((result, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-slate-900">{result.filename}</p>
                    <Badge variant={result.detection_count > 0 ? 'default' : 'secondary'}>
                      {result.detection_count} detections
                    </Badge>
                  </div>
                  {result.error ? (
                    <p className="text-sm text-danger-600">Error: {result.error}</p>
                  ) : result.detections.length === 0 ? (
                    <p className="text-sm text-slate-500">No damage detected</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {result.detections.map((det, i) => (
                        <Badge key={i} variant="outline" className="gap-1">
                          {det.damage_type} <span className="font-mono">{(det.confidence * 100).toFixed(1)}%</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {assessmentResult.review_required && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Review Required
              </h4>
              <p className="text-sm text-amber-700">The AI assessment has flags that require human review.</p>
            </div>
          )}
        </div>
      ) : showAssessmentResult ? (
        // Demo mode results (original)
        <div className="space-y-4">
          <div className="rounded-lg border border-success-200 bg-success-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-success-800">Assessment Complete</h3>
                <p className="text-sm text-success-700">Illustrative AI Assessment · Demo Mode. The AI has analyzed the uploaded evidence and generated a damage assessment.</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-medium text-slate-900 mb-3">Assessment Summary</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Components Identified</p>
                <p className="text-lg font-bold text-slate-900">3</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Total Est. Repair Cost</p>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(10502)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Overall Confidence</p>
                <p className="text-lg font-bold text-slate-900">91%</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-slate-500">Eligible for Auto-Settlement</p>
                <p className="text-lg font-bold text-success-600">Yes</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-medium text-slate-900 mb-3">Identified Damage</h4>
            <div className="space-y-2">
              {[
                { component: 'Front Bumper', damage: 'Surface scratches & minor deformation', severity: 'minor', cost: 3500 },
                { component: 'Right Mirror', damage: 'Housing damage', severity: 'minor', cost: 2200 },
                { component: 'Front Fender (Right)', damage: 'Paint scuff', severity: 'minor', cost: 1400 },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div>
                    <p className="font-medium text-slate-900">{item.component}</p>
                    <p className="text-sm text-slate-500">{item.damage}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={item.severity === 'minor' ? 'success' : item.severity === 'moderate' ? 'warning' : 'destructive'}>{item.severity}</Badge>
                    <p className="mt-1 font-mono font-medium text-slate-900">{formatCurrency(item.cost)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">Ready to Analyze</h3>
          <p className="mt-2 text-sm text-slate-500">Click "Analyze Damage" to start the AI assessment process.</p>
        </div>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      default: return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Damage Assessment</h1>
          <p className="mt-1 text-slate-500">Create a new claim and run AI-powered damage analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="warning" className="text-xs">DEMO MODE</Badge>
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 border border-slate-200">
            <Button
              variant={useAIAssessment ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setUseAIAssessment(true)}
              className="rounded-lg"
            >
              <Brain className="h-3.5 w-3.5 mr-1" />
              AI Analysis
            </Button>
            <Button
              variant={!useAIAssessment ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setUseAIAssessment(false)}
              className="rounded-lg"
            >
              Demo Mode
            </Button>
          </div>
        </div>
      </div>

      {renderStepIndicator()}

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].name}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {renderCurrentStep()}
        </CardContent>
        <CardFooter className="flex justify-between border-t border-border">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-3">
            {currentStep < STEPS.length ? (
              <Button onClick={handleNext} disabled={isAnalyzing}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : showAssessmentResult ? (
              <Button onClick={handleSubmit} variant="success">
                Complete Assessment
              </Button>
            ) : (
              <Button onClick={handleAnalyze} disabled={isAnalyzing || uploadedFiles.length === 0} className="gap-2">
                <Loader2 className="h-4 w-4" />
                Analyze Damage
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}