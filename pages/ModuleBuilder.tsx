/**
 * Module Builder Page
 * 
 * Content authoring interface for creating and editing modules.
 * Persists all changes to Firestore with audit logging.
 * 
 * @module pages/ModuleBuilder
 */

import React, { useState } from 'react';
import { BlockType } from '../functions/src/types';
import { useModule } from '../hooks/useModule';
import { Button } from '../components/ui/Button';
import { BlockEditor } from '../components/builder/BlockEditor';
import {
  Plus,
  Save,
  Eye,
  ArrowLeft,
  Loader2,
  Check,
  AlertTriangle,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { cn } from '../utils';

interface ModuleBuilderProps {
  courseId?: string;
  moduleId?: string;
  userUid: string;
  onBack: () => void;
}

export const ModuleBuilder: React.FC<ModuleBuilderProps> = ({
  courseId = 'default-course', // Fallback for demo
  moduleId,
  userUid,
  onBack,
}) => {
  const {
    module,
    isLoading,
    isSaving,
    error,
    isDirty,
    addBlock,
    updateBlock,
    deleteBlock,
    updateModuleMetadata,
    save,
  } = useModule({ courseId, moduleId });

  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // Handle save with success feedback
  const handleSave = async () => {
    const success = await save();
    if (success) {
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 font-medium">Loading module...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !module) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Failed to Load</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (!module) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-gray-900">
                    {module.title || 'Untitled Module'}
                  </h1>
                  {isDirty && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                      Unsaved
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {module.blocks.length} block{module.blocks.length !== 1 ? 's' : ''}
                  {' · '}
                  {module.estimatedMinutes} min
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Error indicator */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success indicator */}
              {showSaveSuccess && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <Check className="h-4 w-4" />
                  <span>Saved successfully</span>
                </div>
              )}

              <Button variant="outline" size="sm" disabled>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>

              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                isLoading={isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Module Metadata */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8 shadow-sm">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
            Module Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={module.title}
                onChange={(e) => updateModuleMetadata({ title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-gray-900 bg-white"
                placeholder="Module title"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Passing Score
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={module.passingScore}
                    onChange={(e) =>
                      updateModuleMetadata({ passingScore: parseInt(e.target.value) || 0 })
                    }
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-gray-900 bg-white"
                    min="0"
                    max="100"
                  />
                  <span className="ml-2 text-gray-500">%</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={module.estimatedMinutes}
                    onChange={(e) =>
                      updateModuleMetadata({ estimatedMinutes: parseInt(e.target.value) || 0 })
                    }
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-gray-900 bg-white"
                    min="0"
                  />
                  <span className="ml-2 text-gray-500">min</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Block List */}
        <div className="space-y-4">
          {module.blocks.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-lg bg-white">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium mb-2">This module has no content yet</p>
              <p className="text-sm text-gray-400">Add a block below to get started</p>
            </div>
          ) : (
            module.blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                onChange={updateBlock}
                onDelete={deleteBlock}
              />
            ))
          )}
        </div>

        {/* Add Block Menu */}
        <div className="mt-8 flex justify-center">
          <div className="bg-white p-1.5 rounded-full shadow-lg border border-gray-200 flex gap-2 overflow-x-auto max-w-full">
            {[
              { type: 'heading' as BlockType, label: 'Heading' },
              { type: 'text' as BlockType, label: 'Text' },
              { type: 'image' as BlockType, label: 'Image' },
              { type: 'video' as BlockType, label: 'Video' },
              { type: 'quiz' as BlockType, label: 'Quiz' },
            ].map((item) => (
              <button
                key={item.type}
                onClick={() => addBlock(item.type)}
                className="px-4 py-2 rounded-full hover:bg-gray-100 text-sm font-medium text-gray-700 flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Plus className="h-3 w-3 text-gray-400" />
                {item.label}
              </button>
            ))}

            {/* Clinical Alert Divider */}
            <div className="w-px bg-gray-200 mx-1 my-2" />
            <button
              onClick={() => addBlock('text', 'callout')}
              className="px-4 py-2 rounded-full hover:bg-amber-50 text-sm font-medium text-amber-700 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <AlertTriangle className="h-3 w-3" />
              Clinical Alert
            </button>
            <button
              onClick={() => addBlock('correction_log')}
              className="px-4 py-2 rounded-full hover:bg-red-50 text-sm font-medium text-red-700 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3 w-3 text-red-400" />
              Correction Log
            </button>
            <button
              onClick={() => addBlock('obj_subj_validator')}
              className="px-4 py-2 rounded-full hover:bg-purple-50 text-sm font-medium text-purple-700 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3 w-3 text-purple-400" />
              Clinical Data Sorter
            </button>
          </div>
        </div>

        {/* Unsaved Changes Warning */}
        {isDirty && (
          <div className="fixed bottom-6 right-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">You have unsaved changes</span>
            <Button size="sm" onClick={handleSave} isLoading={isSaving}>
              Save Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};