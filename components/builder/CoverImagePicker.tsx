import React from 'react';
import { COVER_PRESETS, CoverPreset } from '../../constants/coverPresets';
import { cn } from '../../utils';
import { ImageIcon } from 'lucide-react';

interface CoverImagePickerProps {
  selectedUrl: string;
  onSelect: (url: string) => void;
  suggestedCategory?: string;
}

export const CoverImagePicker: React.FC<CoverImagePickerProps> = ({
  selectedUrl,
  onSelect,
  suggestedCategory,
}) => {
  // Sort presets: category-matched first, then rest
  const sorted = [...COVER_PRESETS].sort((a, b) => {
    if (suggestedCategory) {
      const aMatch = a.category === suggestedCategory ? 0 : 1;
      const bMatch = b.category === suggestedCategory ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return 0;
  });

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4 text-gray-400" />
          Cover Image
        </span>
      </label>
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
    </div>
  );
};
