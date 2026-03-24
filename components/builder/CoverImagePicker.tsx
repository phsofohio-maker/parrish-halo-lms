import React, { useRef, useState } from 'react';
import { COVER_PRESETS } from '../../constants/coverPresets';
import { cn } from '../../utils';
import { ImageIcon, Upload, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import {
  uploadCourseImage,
  InvalidFileTypeError,
  FileTooLargeError,
} from '../../services/storageService';

interface CoverImagePickerProps {
  selectedUrl: string;
  onSelect: (url: string) => void;
  suggestedCategory?: string;
  courseId?: string;
  enableUpload?: boolean;
}

type Tab = 'presets' | 'upload';

export const CoverImagePicker: React.FC<CoverImagePickerProps> = ({
  selectedUrl,
  onSelect,
  suggestedCategory,
  courseId,
  enableUpload,
}) => {
  const showUploadTab = enableUpload ?? !!courseId;
  const [activeTab, setActiveTab] = useState<Tab>('presets');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  // Sort presets: category-matched first, then rest
  const sorted = [...COVER_PRESETS].sort((a, b) => {
    if (suggestedCategory) {
      const aMatch = a.category === suggestedCategory ? 0 : 1;
      const bMatch = b.category === suggestedCategory ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return 0;
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;

    setUploadError('');
    setUploadProgress(0);

    try {
      const { downloadUrl } = await uploadCourseImage(
        courseId,
        file,
        (percent) => setUploadProgress(percent)
      );
      setPreviewUrl(downloadUrl);
      onSelect(downloadUrl);
      setUploadProgress(null);
    } catch (err) {
      if (err instanceof InvalidFileTypeError || err instanceof FileTooLargeError) {
        setUploadError(err.message);
      } else {
        setUploadError('Upload failed. Please try again.');
      }
      setUploadProgress(null);
    }

    // Reset input so re-selecting the same file triggers onChange
    e.target.value = '';
  };

  const handleRemoveCustom = () => {
    setPreviewUrl('');
    onSelect('');
  };

  // Determine if the current selectedUrl is a custom upload (not a preset)
  const isCustomSelected =
    selectedUrl && !COVER_PRESETS.some((p) => p.url === selectedUrl);

  // Sync previewUrl when parent passes a custom URL on load
  if (isCustomSelected && !previewUrl && selectedUrl) {
    setPreviewUrl(selectedUrl);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4 text-gray-400" />
          Cover Image
        </span>
      </label>

      {/* Tab Header */}
      {showUploadTab && (
        <div className="flex gap-4 border-b border-gray-200 mb-3">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={cn(
              'pb-2 text-sm font-medium transition-colors',
              activeTab === 'presets'
                ? 'border-b-2 border-primary-500 text-primary-700'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={cn(
              'pb-2 text-sm font-medium transition-colors',
              activeTab === 'upload'
                ? 'border-b-2 border-primary-500 text-primary-700'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Custom Upload
          </button>
        </div>
      )}

      {/* Presets Tab */}
      {(activeTab === 'presets' || !showUploadTab) && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {sorted.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelect(preset.url)}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 transition-all h-16 focus:outline-none',
                  selectedUrl === preset.url
                    ? 'border-primary-500 ring-2 ring-primary-500/30'
                    : 'border-gray-200 hover:border-gray-300'
                )}
                title={preset.label}
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          {selectedUrl && (
            <button
              type="button"
              onClick={() => onSelect('')}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear selection
            </button>
          )}
        </>
      )}

      {/* Upload Tab */}
      {activeTab === 'upload' && showUploadTab && (
        <div>
          {previewUrl || isCustomSelected ? (
            <div className="relative rounded-lg overflow-hidden border-2 border-primary-500 ring-2 ring-primary-500/30 h-40">
              <img
                src={previewUrl || selectedUrl}
                alt="Custom cover"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={handleRemoveCustom}
                className="absolute top-2 right-2 bg-white/90 hover:bg-white p-1.5 rounded-full shadow text-gray-500 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : uploadProgress !== null ? (
            <div className="p-8 border-2 border-dashed border-primary-300 rounded-lg bg-primary-50 text-center">
              <Loader2 className="h-8 w-8 text-primary-500 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Uploading... {uploadProgress}%
              </p>
              <div className="w-48 h-1.5 bg-gray-200 rounded-full mx-auto mt-2 overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div
              className="p-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-center hover:bg-gray-100 hover:border-primary-400 transition-colors cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-gray-300 group-hover:text-primary-500 transition-colors mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">
                Click to upload a cover image
              </p>
              <p className="text-xs text-gray-500 mt-1">
                JPEG or PNG, max 20 MB
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={handleFileSelect}
          />

          {uploadError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {uploadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
