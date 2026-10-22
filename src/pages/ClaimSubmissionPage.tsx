import { useState, useCallback, useEffect } from 'react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Upload,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Video,
  Image,
  Loader2,
  Edit2,
  FileText,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/Select';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  cn,
  isValidImageFile,
  isValidVideoFile,
  createObjectURL,
  revokeObjectURL,
  getFileSizeString,
  generateId,
} from '../lib/utils';

const STEPS = [
  { id: 1, name: 'Vehicle & Incident', description: 'Enter vehicle and accident details' },
  { id: 2, name: 'Upload Media', description: 'Add photos and video of damage' },
  { id: 3, name: 'Review & Submit', description: 'Review and confirm your claim' },
];

const VEHICLE_MAKES = [
  'Maruti Suzuki',
  'Hyundai',
  'Tata',
  'Kia',
  'Mahindra',
  'Toyota',
  'Honda',
  'Volkswagen',
  'Skoda',
  'Renault',
  'Nissan',
  'Ford',
  'MG',
  'Citroen',
  'Other',
];

const VEHICLE_TYPES = [
  { value: 'car', label: 'Car' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
];

const ACCIDENT_TYPES = [
  { value: 'collision', label: 'Collision' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'broken_glass', label: 'Broken Glass' },
  { value: 'broken_mirror', label: 'Broken Mirror' },
  { value: 'bumper_damage', label: 'Bumper Damage' },
  { value: 'other', label: 'Other' },
];

const DAMAGED_PARTS = [
  'Front Bumper',
  'Rear Bumper',
  'Front Fender (Left)',
  'Front Fender (Right)',
  'Rear Fender (Left)',
  'Rear Fender (Right)',
  'Hood / Bonnet',
  'Roof',
  'Trunk / Boot Lid',
  'Front Door (Left)',
  'Front Door (Right)',
  'Rear Door (Left)',
  'Rear Door (Right)',
  'Side Mirror (Left)',
  'Side Mirror (Right)',
  'Windshield',
  'Rear Window',
  'Side Window (Left)',
  'Side Window (Right)',
  'Headlight (Left)',
  'Headlight (Right)',
  'Taillight (Left)',
  'Taillight (Right)',
  'Grille',
  'Quarter Panel (Left)',
  'Quarter Panel (Right)',
  'Running Board / Side Step',
  'Exhaust / Muffler',
  'Wheel / Rim (Front Left)',
  'Wheel / Rim (Front Right)',
  'Wheel / Rim (Rear Left)',
  'Wheel / Rim (Rear Right)',
  'Other',
];

const PHOTO_GUIDANCE = [
  { id: 1, label: 'Overall Vehicle', desc: 'Full view of the vehicle showing context' },
  { id: 2, label: 'Primary Damage Close-up', desc: 'Clear close-up of the main damage area' },
  { id: 3, label: 'Damage from Another Angle', desc: 'Same damage from a different perspective' },
  { id: 4, label: 'Additional Damage (Optional)', desc: 'Any other damaged area if applicable' },
];

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 4;
const MAX_VIDEO_DURATION = 10; // seconds
const MIN_VIDEO_DURATION = 5; // seconds

interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
  name: string;
  size: number;
  guidanceIndex?: number; // Which guidance slot this photo fills (1-4)
}

interface UploadedVideo {
  id: string;
  file: File;
  preview: string;
  name: string;
  size: number;
  duration?: number; // in seconds
  durationValidated: boolean;
}

interface FormData {
  // Vehicle details
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleType: string;
  // Claim details
  policyNumber: string;
  customerName: string;
  contactInfo: string;
  incidentDate: string;
  incidentLocation: string;
  accidentType: string;
  damagedParts: string[];
  damageDescription: string;
  vehicleRepaired: 'yes' | 'no' | '';
  vehicleSafeToDrive: 'yes' | 'no' | 'unsure' | '';
}

const initialFormData: FormData = {
  vehicleRegistration: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleYear: new Date().getFullYear().toString(),
  vehicleType: 'car',
  policyNumber: '',
  customerName: '',
  contactInfo: '',
  incidentDate: new Date().toISOString().split('T')[0],
  incidentLocation: '',
  accidentType: 'collision',
  damagedParts: [],
  damageDescription: '',
  vehicleRepaired: '',
  vehicleSafeToDrive: '',
};

export function ClaimSubmissionPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // Media uploads
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [dragActive, setDragActive] = useState<'photos' | 'video' | false>(false);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [videoInputKey, setVideoInputKey] = useState(0);

  // Validation
  const validateStep = useCallback(
    (step: number): boolean => {
      const newErrors: Record<string, string> = {};

      if (step === 1) {
        // Vehicle details
        if (!formData.vehicleRegistration.trim())
          newErrors.vehicleRegistration = 'Vehicle registration number is required';
        if (!formData.vehicleMake)
          newErrors.vehicleMake = 'Vehicle make is required';
        if (!formData.vehicleModel.trim())
          newErrors.vehicleModel = 'Vehicle model is required';
        if (!formData.vehicleYear.trim())
          newErrors.vehicleYear = 'Manufacturing year is required';
        else {
          const year = parseInt(formData.vehicleYear);
          const currentYear = new Date().getFullYear();
          if (year < 1990 || year > currentYear + 1) {
            newErrors.vehicleYear = `Year must be between 1990 and ${currentYear + 1}`;
          }
        }
        if (!formData.vehicleType)
          newErrors.vehicleType = 'Vehicle type is required';

        // Claim details
        if (!formData.policyNumber.trim())
          newErrors.policyNumber = 'Policy number is required';
        if (!formData.customerName.trim())
          newErrors.customerName = 'Customer name is required';
        if (!formData.contactInfo.trim())
          newErrors.contactInfo = 'Contact number or email is required';
        else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const phoneRegex = /^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{4,6}$/;
          if (!emailRegex.test(formData.contactInfo) && !phoneRegex.test(formData.contactInfo)) {
            newErrors.contactInfo = 'Enter a valid email or phone number';
          }
        }
        if (!formData.incidentDate)
          newErrors.incidentDate = 'Date of accident is required';
        else {
          const incidentDate = new Date(formData.incidentDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (incidentDate > today) {
            newErrors.incidentDate = 'Incident date cannot be in the future';
          }
        }
        if (!formData.accidentType)
          newErrors.accidentType = 'Accident type is required';
        if (formData.damagedParts.length === 0)
          newErrors.damagedParts = 'Select at least one damaged part';
        if (!formData.damageDescription.trim())
          newErrors.damageDescription = 'Brief description of damage is required';
        else if (formData.damageDescription.trim().length < 10) {
          newErrors.damageDescription = 'Description must be at least 10 characters';
        }
        if (!formData.vehicleRepaired)
          newErrors.vehicleRepaired = 'Please indicate if vehicle has been repaired';
        if (!formData.vehicleSafeToDrive)
          newErrors.vehicleSafeToDrive = 'Please indicate if vehicle is safe to drive';
      }

      if (step === 2) {
        if (photos.length < MIN_PHOTOS) {
          newErrors.photos = `Minimum ${MIN_PHOTOS} photos required (${photos.length}/${MIN_PHOTOS} uploaded)`;
        }
        if (photos.length > MAX_PHOTOS) {
          newErrors.photos = `Maximum ${MAX_PHOTOS} photos allowed`;
        }
        if (video) {
          if (video.duration !== undefined) {
            if (video.duration < MIN_VIDEO_DURATION || video.duration > MAX_VIDEO_DURATION) {
              newErrors.video = `Video must be between ${MIN_VIDEO_DURATION}-${MAX_VIDEO_DURATION} seconds (current: ${video.duration.toFixed(1)}s)`;
            }
          } else if (!video.durationValidated) {
            newErrors.video = 'Unable to validate video duration. Please ensure it is 5-10 seconds.';
          }
        }
      }

      // Mark all fields as touched for current step
      if (step === 1) {
        const step1Fields = [
          'vehicleRegistration',
          'vehicleMake',
          'vehicleModel',
          'vehicleYear',
          'vehicleType',
          'policyNumber',
          'customerName',
          'contactInfo',
          'incidentDate',
          'accidentType',
          'damagedParts',
          'damageDescription',
          'vehicleRepaired',
          'vehicleSafeToDrive',
        ];
        setTouchedFields((prev) => ({
          ...prev,
          ...Object.fromEntries(step1Fields.map((f) => [f, true])),
        }));
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [formData, photos, video]
  );

  const handleInputChange = useCallback(
    (field: string, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }));
      }
    },
    [errors]
  );

  const handleMultiSelectChange = useCallback(
    (field: 'damagedParts', value: string[]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }));
      }
    },
    [errors]
  );

  const handleBlur = useCallback((field: string) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
    validateStep(currentStep);
  }, [currentStep, validateStep]);

  // Photo handling
  const processPhotos = useCallback((files: File[]) => {
    const validPhotos: UploadedPhoto[] = [];
    const invalidFiles: string[] = [];

    files.forEach((file) => {
      if (isValidImageFile(file)) {
        validPhotos.push({
          id: generateId('photo'),
          file,
          preview: createObjectURL(file),
          name: file.name,
          size: file.size,
        });
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (validPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...validPhotos].slice(0, MAX_PHOTOS));
    }

    if (invalidFiles.length > 0) {
      alert(
        `The following files are not supported: ${invalidFiles.join(', ')}. Supported: JPEG, PNG, WebP (max 10MB each).`
      );
    }
  }, []);

  const handlePhotoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      processPhotos(files);
      e.target.value = '';
      setPhotoInputKey((k) => k + 1);
    },
    [processPhotos]
  );

  const handlePhotoDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive('photos');
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handlePhotoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      processPhotos(files);
    },
    [processPhotos]
  );

  const removePhoto = useCallback((id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (photo) {
      revokeObjectURL(photo.preview);
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, [photos]);

  const replacePhoto = useCallback(
    (id: string, newFile: File) => {
      if (!isValidImageFile(newFile)) {
        alert('Invalid file. Supported: JPEG, PNG, WebP (max 10MB).');
        return;
      }
      const photo = photos.find((p) => p.id === id);
      if (photo) {
        revokeObjectURL(photo.preview);
      }
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, file: newFile, preview: createObjectURL(newFile), name: newFile.name, size: newFile.size }
            : p
        )
      );
    },
    [photos]
  );

  // Video handling
  const processVideo = useCallback((file: File) => {
    if (!isValidVideoFile(file)) {
      alert('Invalid video file. Supported: MP4, MOV (max 50MB).');
      return;
    }

    const previewUrl = createObjectURL(file);
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.src = previewUrl;

    videoElement.onloadedmetadata = () => {
      const duration = videoElement.duration;
      URL.revokeObjectURL(previewUrl);

      setVideo({
        id: generateId('video'),
        file,
        preview: createObjectURL(file),
        name: file.name,
        size: file.size,
        duration,
        durationValidated: true,
      });
    };

    videoElement.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      alert('Unable to read video file. Please try another file.');
    };
  }, []);

  const handleVideoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processVideo(file);
      }
      e.target.value = '';
      setVideoInputKey((k) => k + 1);
    },
    [processVideo]
  );

  const handleVideoDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'dragenter' || e.type === 'dragover') {
        setDragActive('video');
      } else if (e.type === 'dragleave') {
        setDragActive(false);
      }
    },
    []
  );

  const handleVideoDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        processVideo(file);
      }
    },
    [processVideo]
  );

  const removeVideo = useCallback(() => {
    if (video) {
      revokeObjectURL(video.preview);
    }
    setVideo(null);
  }, [video]);

  const replaceVideo = useCallback(
    (newFile: File) => {
      if (video) {
        revokeObjectURL(video.preview);
      }
      processVideo(newFile);
    },
    [video, processVideo]
  );

  // Navigation
  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length) {
        setCurrentStep((prev) => prev + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    if (validateStep(1) && validateStep(2) && validateStep(3)) {
      setSubmitted(true);
      const claimData = {
        ...formData,
        photos: photos.map((p) => ({ name: p.name, size: p.size, type: 'image' as const })),
        video: video
          ? { name: video.name, size: video.size, type: 'video' as const, duration: video.duration }
          : null,
        submittedAt: new Date().toISOString(),
      };
      console.log('Claim submitted:', claimData);
      // Navigate to a confirmation page or show success
      alert('Claim submitted successfully! (Demo mode - no backend)');
      navigate('/');
    }
  };

  const handleEditStep = (step: number) => {
    setCurrentStep(step);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      photos.forEach((p) => revokeObjectURL(p.preview));
      if (video) revokeObjectURL(video.preview);
    };
  }, [photos, video]);

  // Step indicator
  const renderStepIndicator = () => (
    <div
      className="flex items-center justify-between mb-8"
      role="progressbar"
      aria-label="Claim submission progress"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
    >
      {STEPS.map((step, index) => {
        const isActive = index + 1 === currentStep;
        const isCompleted = index + 1 < currentStep;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all duration-300',
                  isActive
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                    : isCompleted
                    ? 'bg-success-600 text-white'
                    : 'bg-slate-100 text-slate-400'
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : step.id}
              </div>
              <span
                className={cn(
                  'mt-2 text-xs font-medium text-center max-w-[90px]',
                  isActive ? 'text-primary-700' : 'text-slate-500'
                )}
              >
                {step.name}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-1.5 mx-2 rounded-full transition-colors',
                  isCompleted ? 'bg-success-500' : 'bg-slate-200'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // Step 1: Vehicle & Incident Details
  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Vehicle Details Section */}
      <section className="space-y-4" aria-labelledby="vehicle-details-heading">
        <h2 id="vehicle-details-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-600" aria-hidden="true" />
          Vehicle Details
        </h2>
        <p className="text-sm text-slate-500">Enter your vehicle information as it appears on the registration</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Vehicle Registration Number *"
            value={formData.vehicleRegistration}
            onChange={(e) => handleInputChange('vehicleRegistration', e.target.value.toUpperCase())}
            onBlur={() => handleBlur('vehicleRegistration')}
            error={touchedFields.vehicleRegistration ? errors.vehicleRegistration : undefined}
            placeholder="e.g., MH12AB1234"
            required
            autoComplete="off"
          />
          <Select value={formData.vehicleMake} onValueChange={(v) => handleInputChange('vehicleMake', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select vehicle make" />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_MAKES.map((make) => (
                <SelectItem key={make} value={make}>
                  {make}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {touchedFields.vehicleMake && errors.vehicleMake && (
            <p className="mt-1.5 text-sm text-danger-600 col-span-2">{errors.vehicleMake}</p>
          )}

          <Input
            label="Vehicle Model *"
            value={formData.vehicleModel}
            onChange={(e) => handleInputChange('vehicleModel', e.target.value)}
            onBlur={() => handleBlur('vehicleModel')}
            error={touchedFields.vehicleModel ? errors.vehicleModel : undefined}
            placeholder="e.g., Swift, Creta, Nexon"
            required
          />
          <Input
            label="Manufacturing Year *"
            type="number"
            value={formData.vehicleYear}
            onChange={(e) => handleInputChange('vehicleYear', e.target.value)}
            onBlur={() => handleBlur('vehicleYear')}
            error={touchedFields.vehicleYear ? errors.vehicleYear : undefined}
            min="1990"
            max={new Date().getFullYear() + 1}
            required
          />
          <Select value={formData.vehicleType} onValueChange={(v) => handleInputChange('vehicleType', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select vehicle type" />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPES.map((vt) => (
                <SelectItem key={vt.value} value={vt.value}>
                  {vt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {touchedFields.vehicleType && errors.vehicleType && (
            <p className="mt-1.5 text-sm text-danger-600 col-span-2">{errors.vehicleType}</p>
          )}
        </div>
      </section>

      {/* Claim Details Section */}
      <section className="space-y-4 pt-4 border-t border-border" aria-labelledby="claim-details-heading">
        <h2 id="claim-details-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-600" aria-hidden="true" />
          Claim Details
        </h2>
        <p className="text-sm text-slate-500">Policy and incident information</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Policy Number *"
            value={formData.policyNumber}
            onChange={(e) => handleInputChange('policyNumber', e.target.value.toUpperCase())}
            onBlur={() => handleBlur('policyNumber')}
            error={touchedFields.policyNumber ? errors.policyNumber : undefined}
            placeholder="e.g., POL-2026-001234"
            required
          />
          <Input
            label="Customer Name *"
            value={formData.customerName}
            onChange={(e) => handleInputChange('customerName', e.target.value)}
            onBlur={() => handleBlur('customerName')}
            error={touchedFields.customerName ? errors.customerName : undefined}
            placeholder="Full name as per policy"
            required
          />
          <Input
            label="Contact Number or Email *"
            value={formData.contactInfo}
            onChange={(e) => handleInputChange('contactInfo', e.target.value)}
            onBlur={() => handleBlur('contactInfo')}
            error={touchedFields.contactInfo ? errors.contactInfo : undefined}
            placeholder="Phone or email for claim updates"
            required
          />
          <Input
            label="Date of Accident *"
            type="date"
            value={formData.incidentDate}
            onChange={(e) => handleInputChange('incidentDate', e.target.value)}
            onBlur={() => handleBlur('incidentDate')}
            error={touchedFields.incidentDate ? errors.incidentDate : undefined}
            max={new Date().toISOString().split('T')[0]}
            required
          />
          <Input
            label="Accident Location"
            value={formData.incidentLocation}
            onChange={(e) => handleInputChange('incidentLocation', e.target.value)}
            placeholder="City, area, landmark (optional)"
          />
          <Select value={formData.accidentType} onValueChange={(v) => handleInputChange('accidentType', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select accident type" />
            </SelectTrigger>
            <SelectContent>
              {ACCIDENT_TYPES.map((at) => (
                <SelectItem key={at.value} value={at.value}>
                  {at.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {touchedFields.accidentType && errors.accidentType && (
            <p className="mt-1.5 text-sm text-danger-600 col-span-2">{errors.accidentType}</p>
          )}
        </div>

        {/* Damaged Parts - Multi-select */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Damaged Vehicle Parts <span className="text-danger-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {DAMAGED_PARTS.map((part) => {
              const isSelected = formData.damagedParts.includes(part);
              return (
                <button
                  key={part}
                  type="button"
                  onClick={() => {
                    const newParts = isSelected
                      ? formData.damagedParts.filter((p) => p !== part)
                      : [...formData.damagedParts, part];
                    handleMultiSelectChange('damagedParts', newParts);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    isSelected
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-border'
                  )}
                  aria-pressed={isSelected}
                >
                  {part}
                </button>
              );
            })}
          </div>
          {touchedFields.damagedParts && errors.damagedParts && (
            <p className="mt-1.5 text-sm text-danger-600">{errors.damagedParts}</p>
          )}
          <p className="text-xs text-slate-500">
            {formData.damagedParts.length} part{formData.damagedParts.length !== 1 ? 's' : ''} selected
          </p>
        </div>

        <Textarea
          label="Damage Description *"
          value={formData.damageDescription}
          onChange={(e) => handleInputChange('damageDescription', e.target.value)}
          onBlur={() => handleBlur('damageDescription')}
          error={touchedFields.damageDescription ? errors.damageDescription : undefined}
          placeholder="Describe the damage in detail (what happened, extent of damage, etc.)"
          rows={4}
          required
          maxLength={500}
        />
        <div className="flex justify-end text-sm text-slate-500">
          {formData.damageDescription.length}/500 characters
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="block text-sm font-medium text-slate-700">
              Has the vehicle already been repaired? <span className="text-danger-500">*</span>
            </legend>
            <div className="flex gap-4">
              {['yes', 'no'].map((val) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="vehicleRepaired"
                    value={val}
                    checked={formData.vehicleRepaired === val}
                    onChange={(e) => handleInputChange('vehicleRepaired', e.target.value)}
                    onBlur={() => handleBlur('vehicleRepaired')}
                    className="h-4 w-4 text-primary-600 border-border focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">{val === 'yes' ? 'Yes' : 'No'}</span>
                </label>
              ))}
            </div>
            {touchedFields.vehicleRepaired && errors.vehicleRepaired && (
              <p className="text-sm text-danger-600">{errors.vehicleRepaired}</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="block text-sm font-medium text-slate-700">
              Is the vehicle safe to drive? <span className="text-danger-500">*</span>
            </legend>
            <div className="flex gap-4">
              {['yes', 'no', 'unsure'].map((val) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="vehicleSafeToDrive"
                    value={val}
                    checked={formData.vehicleSafeToDrive === val}
                    onChange={(e) => handleInputChange('vehicleSafeToDrive', e.target.value)}
                    onBlur={() => handleBlur('vehicleSafeToDrive')}
                    className="h-4 w-4 text-primary-600 border-border focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700 capitalize">{val}</span>
                </label>
              ))}
            </div>
            {touchedFields.vehicleSafeToDrive && errors.vehicleSafeToDrive && (
              <p className="text-sm text-danger-600">{errors.vehicleSafeToDrive}</p>
            )}
          </fieldset>
        </div>
      </section>
    </div>
  );

  // Step 2: Upload Media
  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Photo Upload Section */}
      <section className="space-y-4" aria-labelledby="photo-upload-heading">
        <h2 id="photo-upload-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Image className="h-5 w-5 text-primary-600" aria-hidden="true" />
          Damage Photos
        </h2>
        <p className="text-sm text-slate-500">
          Upload <strong>{MIN_PHOTOS}–{MAX_PHOTOS} photos</strong> of the damage. JPEG, PNG, or WebP (max 10MB each).
        </p>

        {/* Photo Upload Dropzone */}
        <div
          className={cn(
            'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            'border-slate-300',
            dragActive === 'photos' && 'border-primary-500 bg-primary-50'
          )}
          onDragEnter={handlePhotoDrag}
          onDragLeave={handlePhotoDrag}
          onDragOver={handlePhotoDrag}
          onDrop={handlePhotoDrop}
        >
          <input
            type="file"
            id={`photo-upload-${photoInputKey}`}
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoSelect}
            className="hidden"
            aria-label="Upload damage photos"
          />
          <label htmlFor={`photo-upload-${photoInputKey}`} className="cursor-pointer">
            <div className="flex flex-col items-center gap-4">
              <Upload className="h-12 w-12 text-slate-400" aria-hidden="true" />
              <div>
                <p className="text-lg font-medium text-slate-900">Drag & drop photos here</p>
                <p className="text-sm text-slate-500">or click to browse files</p>
              </div>
              <Button variant="outline" size="sm" type="button">
                Browse Files
              </Button>
            </div>
          </label>
          <p className="mt-4 text-xs text-slate-500">
            JPEG, PNG, WebP · Max 10MB each · {MIN_PHOTOS}–{MAX_PHOTOS} photos
          </p>
        </div>

        {/* Photo Previews */}
        {photos.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-900">
                Uploaded Photos ({photos.length}/{MAX_PHOTOS})
              </h3>
              {photos.length >= MIN_PHOTOS && photos.length <= MAX_PHOTOS && (
                <Badge variant="success" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Valid count
                </Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo, index) => (
                <div key={photo.id} className="relative group rounded-lg border border-border bg-white p-2">
                  <div className="aspect-video w-full overflow-hidden rounded">
                    <img
                      src={photo.preview}
                      alt={`Damage photo ${index + 1}: ${photo.name}`}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                    <p className="text-xs text-white truncate">{photo.name}</p>
                    <p className="text-[10px] text-slate-300">{getFileSizeString(photo.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePhoto(photo.id);
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${photo.name}`}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-danger-600 text-white">
                      <Trash2 className="h-3.5 w-3.5" />
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/jpeg,image/png,image/webp';
                      input.onchange = (ev) => {
                        const file = (ev.target as HTMLInputElement).files?.[0];
                        if (file) replacePhoto(photo.id, file);
                      };
                      input.click();
                    }}
                    className="absolute top-1 right-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Replace ${photo.name}`}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white">
                      <X className="h-3.5 w-3.5 rotate-45" />
                    </div>
                  </button>
                </div>
              ))}
              {/* Empty slots for guidance */}
              {photos.length < MAX_PHOTOS &&
                Array.from({ length: MAX_PHOTOS - photos.length }, (_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="relative rounded-lg border-2 border-dashed border-slate-200 p-4 bg-slate-50/50"
                  >
                    <div className="aspect-video w-full rounded bg-slate-100 flex items-center justify-center">
                      <span className="text-4xl text-slate-300">+</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Photo Guidance */}
        <div className="rounded-lg border border-border bg-slate-50 p-4">
          <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
            <Image className="h-4 w-4 text-primary-600" />
            Recommended Photo Angles
          </h4>
          <p className="text-sm text-slate-600 mb-4">
            Follow this guide for best results. Click a slot to upload directly.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PHOTO_GUIDANCE.map((guide) => {
              const filledPhoto = photos.find((p) => p.guidanceIndex === guide.id);
              const isFilled = !!filledPhoto;
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/jpeg,image/png,image/webp';
                    input.onchange = (ev) => {
                      const file = (ev.target as HTMLInputElement).files?.[0];
                      if (file) {
                        if (isFilled) {
                          replacePhoto(filledPhoto.id, file);
                        } else if (photos.length < MAX_PHOTOS) {
                          processPhotos([file]);
                          // Assign to this guidance slot
                          setPhotos((prev) =>
                            prev.map((p) =>
                              p.id === generateId('photo')
                                ? { ...p, guidanceIndex: guide.id }
                                : p
                            )
                          );
                          // Actually assign to the last added photo
                          setPhotos((prev) =>
                            prev.map((p, idx) =>
                              idx === prev.length - 1 ? { ...p, guidanceIndex: guide.id } : p
                            )
                          );
                        }
                      }
                    };
                    input.click();
                  }}
                  className={cn(
                    'relative rounded-lg border p-3 text-center transition-all',
                    isFilled
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-border bg-white hover:border-primary-300'
                  )}
                >
                  {isFilled && filledPhoto ? (
                    <>
                      <img
                        src={filledPhoto.preview}
                        alt={guide.label}
                        className="aspect-video w-full rounded object-cover mb-2"
                      />
                      <p className="text-xs font-medium text-primary-700">{guide.label}</p>
                      <p className="text-[10px] text-slate-500">{guide.desc}</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-100 flex items-center justify-center">
                        <span className="text-xl">{guide.id}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{guide.label}</p>
                      <p className="text-xs text-slate-500">{guide.desc}</p>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {errors.photos && (
          <p className="text-sm text-danger-600 flex items-center gap-1" role="alert">
            <AlertCircle className="h-4 w-4" />
            {errors.photos}
          </p>
        )}
      </section>

      {/* Video Upload Section */}
      <section className="space-y-4 pt-4 border-t border-border" aria-labelledby="video-upload-heading">
        <h2 id="video-upload-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Video className="h-5 w-5 text-primary-600" aria-hidden="true" />
          Damage Video (Optional)
        </h2>
        <p className="text-sm text-slate-500">
          Upload <strong>one video (5–10 seconds)</strong> showing the damage. MP4 or MOV (max 50MB).
        </p>

        {/* Video Upload Dropzone */}
        {video ? (
          <div className="rounded-xl border border-border bg-white p-4">
            <div className="flex gap-4">
              <div className="relative flex-shrink-0 w-32 aspect-video rounded-lg overflow-hidden bg-slate-100">
                <video
                  src={video.preview}
                  className="w-full h-full object-cover"
                  controls
                  controlsList="nodownload"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{video.name}</p>
                <p className="text-sm text-slate-500">{getFileSizeString(video.size)}</p>
                {video.duration !== undefined && (
                  <p
                    className={cn(
                      'text-sm mt-1',
                      video.duration >= MIN_VIDEO_DURATION && video.duration <= MAX_VIDEO_DURATION
                        ? 'text-success-600'
                        : 'text-danger-600'
                    )}
                  >
                    Duration: {video.duration.toFixed(1)}s
                    {video.duration >= MIN_VIDEO_DURATION && video.duration <= MAX_VIDEO_DURATION ? (
                      <Check className="h-3.5 w-3.5 inline-block ml-1" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 inline-block ml-1" />
                    )}
                  </p>
                )}
                {!video.durationValidated && video.duration === undefined && (
                  <p className="text-sm text-warning-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Unable to validate duration — please ensure 5–10 seconds
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={removeVideo}>
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Remove</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'video/mp4,video/quicktime';
                  input.onchange = (ev) => {
                    const file = (ev.target as HTMLInputElement).files?.[0];
                    if (file) replaceVideo(file);
                  };
                  input.click();
                }}>
                  <X className="h-4 w-4 rotate-45" />
                  <span className="hidden sm:inline">Replace</span>
                </Button>
              </div>
            </div>
            {errors.video && (
              <p className="mt-3 text-sm text-danger-600 flex items-center gap-1" role="alert">
                <AlertCircle className="h-4 w-4" />
                {errors.video}
              </p>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              'border-slate-300',
              dragActive === 'video' && 'border-primary-500 bg-primary-50'
            )}
            onDragEnter={handleVideoDrag}
            onDragLeave={handleVideoDrag}
            onDragOver={handleVideoDrag}
            onDrop={handleVideoDrop}
          >
            <input
              type="file"
              id={`video-upload-${videoInputKey}`}
              accept="video/mp4,video/quicktime"
              onChange={handleVideoSelect}
              className="hidden"
              aria-label="Upload damage video"
            />
            <label htmlFor={`video-upload-${videoInputKey}`} className="cursor-pointer">
              <div className="flex flex-col items-center gap-4">
                <Video className="h-12 w-12 text-slate-400" aria-hidden="true" />
                <div>
                  <p className="text-lg font-medium text-slate-900">Drag & drop video here</p>
                  <p className="text-sm text-slate-500">or click to browse</p>
                </div>
                <Button variant="outline" size="sm" type="button">
                  Browse Video
                </Button>
              </div>
            </label>
            <p className="mt-4 text-xs text-slate-500">
              MP4, MOV · Max 50MB · 5–10 seconds duration
            </p>
          </div>
        )}
      </section>
    </div>
  );

  // Step 3: Review & Submit
  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="rounded-lg border border-success-200 bg-success-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-success-800">Review Your Claim</h3>
            <p className="text-sm text-success-700">
              Please verify all information below before submitting. Click "Edit" on any section to make changes.
            </p>
          </div>
        </div>
      </div>

      {/* Vehicle Details Review */}
      <section className="space-y-3" aria-labelledby="review-vehicle-heading">
        <div className="flex items-center justify-between">
          <h3 id="review-vehicle-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-600" />
            Vehicle Details
          </h3>
          <Button variant="ghost" size="sm" onClick={() => handleEditStep(1)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          <div><dt className="text-slate-500">Registration</dt><dd className="font-medium">{formData.vehicleRegistration || '—'}</dd></div>
          <div><dt className="text-slate-500">Make</dt><dd className="font-medium">{formData.vehicleMake || '—'}</dd></div>
          <div><dt className="text-slate-500">Model</dt><dd className="font-medium">{formData.vehicleModel || '—'}</dd></div>
          <div><dt className="text-slate-500">Year</dt><dd className="font-medium">{formData.vehicleYear || '—'}</dd></div>
          <div><dt className="text-slate-500">Type</dt><dd className="font-medium capitalize">{formData.vehicleType || '—'}</dd></div>
        </dl>
      </section>

      {/* Claim Details Review */}
      <section className="space-y-3 pt-4 border-t border-border" aria-labelledby="review-claim-heading">
        <div className="flex items-center justify-between">
          <h3 id="review-claim-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-600" />
            Claim Information
          </h3>
          <Button variant="ghost" size="sm" onClick={() => handleEditStep(1)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          <div><dt className="text-slate-500">Policy Number</dt><dd className="font-medium">{formData.policyNumber || '—'}</dd></div>
          <div><dt className="text-slate-500">Customer Name</dt><dd className="font-medium">{formData.customerName || '—'}</dd></div>
          <div><dt className="text-slate-500">Contact</dt><dd className="font-medium">{formData.contactInfo || '—'}</dd></div>
          <div><dt className="text-slate-500">Incident Date</dt><dd className="font-medium">{formData.incidentDate ? new Date(formData.incidentDate).toLocaleDateString('en-IN') : '—'}</dd></div>
          <div><dt className="text-slate-500">Location</dt><dd className="font-medium">{formData.incidentLocation || 'Not provided'}</dd></div>
          <div><dt className="text-slate-500">Accident Type</dt><dd className="font-medium">{ACCIDENT_TYPES.find(at => at.value === formData.accidentType)?.label || '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">Damaged Parts</dt><dd className="font-medium">{formData.damagedParts.length > 0 ? formData.damagedParts.join(', ') : '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">Description</dt><dd className="font-medium">{formData.damageDescription || '—'}</dd></div>
          <div><dt className="text-slate-500">Already Repaired</dt><dd className="font-medium capitalize">{formData.vehicleRepaired || '—'}</dd></div>
          <div><dt className="text-slate-500">Safe to Drive</dt><dd className="font-medium capitalize">{formData.vehicleSafeToDrive || '—'}</dd></div>
        </dl>
      </section>

      {/* Photos Review */}
      <section className="space-y-3 pt-4 border-t border-border" aria-labelledby="review-photos-heading">
        <div className="flex items-center justify-between">
          <h3 id="review-photos-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Image className="h-5 w-5 text-primary-600" />
            Damage Photos ({photos.length}/{MAX_PHOTOS})
          </h3>
          <Button variant="ghost" size="sm" onClick={() => handleEditStep(2)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>
        {photos.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <div key={photo.id} className="relative rounded-lg border border-border bg-white overflow-hidden">
                <img
                  src={photo.preview}
                  alt={`Damage photo ${index + 1}`}
                  className="aspect-video w-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-xs text-white truncate">{photo.name}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No photos uploaded</p>
        )}
        {photos.length < MIN_PHOTOS && (
          <p className="text-sm text-danger-600 flex items-center gap-1" role="alert">
            <AlertCircle className="h-4 w-4" />
            Minimum {MIN_PHOTOS} photos required — please add {MIN_PHOTOS - photos.length} more
          </p>
        )}
      </section>

      {/* Video Review */}
      <section className="space-y-3 pt-4 border-t border-border" aria-labelledby="review-video-heading">
        <div className="flex items-center justify-between">
          <h3 id="review-video-heading" className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Video className="h-5 w-5 text-primary-600" />
            Damage Video
          </h3>
          <Button variant="ghost" size="sm" onClick={() => handleEditStep(2)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>
        {video ? (
          <div className="rounded-lg border border-border bg-white p-4">
            <div className="flex gap-4">
              <div className="relative flex-shrink-0 w-40 aspect-video rounded-lg overflow-hidden bg-slate-100">
                <video
                  src={video.preview}
                  className="w-full h-full object-cover"
                  controls
                  controlsList="nodownload"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{video.name}</p>
                <p className="text-sm text-slate-500">{getFileSizeString(video.size)}</p>
                {video.duration !== undefined && (
                  <p
                    className={cn(
                      'text-sm mt-1',
                      video.duration >= MIN_VIDEO_DURATION && video.duration <= MAX_VIDEO_DURATION
                        ? 'text-success-600'
                        : 'text-danger-600'
                    )}
                  >
                    Duration: {video.duration.toFixed(1)}s
                    {video.duration >= MIN_VIDEO_DURATION && video.duration <= MAX_VIDEO_DURATION ? (
                      <Check className="h-3.5 w-3.5 inline-block ml-1" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 inline-block ml-1" />
                    )}
                  </p>
                )}
                {!video.durationValidated && video.duration === undefined && (
                  <p className="text-sm text-warning-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Duration not validated
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No video uploaded (optional)</p>
        )}
      </section>

      {/* Validation Summary */}
      {(errors.photos || errors.video) && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-4" role="alert">
          <h4 className="font-medium text-danger-800 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Please fix the following before submitting:
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-danger-700">
            {errors.photos && <li>• {errors.photos}</li>}
            {errors.video && <li>• {errors.video}</li>}
          </ul>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-4 border-t border-border">
        <Button
          onClick={handleSubmit}
          size="lg"
          className="w-full"
          disabled={submitted}
        >
          {submitted ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Submit Claim
            </>
          )}
        </Button>
        <p className="mt-3 text-center text-xs text-slate-500">
          By submitting, you confirm the information provided is accurate to the best of your knowledge.
        </p>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6 animate-in">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Vehicle Insurance Claim</h1>
          <p className="mt-2 text-slate-500">Submit a new motor insurance claim in three simple steps</p>
        </div>

        {/* Progress Indicator */}
        {renderStepIndicator()}

        {/* Form Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{STEPS[currentStep - 1].name}</CardTitle>
            <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">{renderCurrentStep()}</CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex gap-3">
              {currentStep < STEPS.length ? (
                <Button onClick={handleNext}>
                  Continue
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} size="lg" variant="success" disabled={submitted}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Submit Claim
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400">
          Demo mode — no data is sent to a server. This is a frontend-only prototype.
        </p>
      </div>
    </div>
  );
}