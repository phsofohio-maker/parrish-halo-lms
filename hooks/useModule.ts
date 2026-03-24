/**
 * useModule Hook
 * 
 * Provides module data with full CRUD operations for content blocks.
 * Handles optimistic updates and Firestore persistence.
 * 
 * @module hooks/useModule
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Module, ContentBlock, BlockType } from '../functions/src/types';
import {
  getModuleWithBlocks,
  createModule,
  updateModule,
  saveModuleBlocks,
} from '../services/courseService';
import { useAuth } from '../contexts/AuthContext';
import { generateId } from '../utils';

interface UseModuleOptions {
  courseId: string;
  moduleId?: string;
}

interface UseModuleReturn {
  module: Module | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isDirty: boolean;
  
  // Block operations
  addBlock: (type: BlockType, variant?: string) => void;
  updateBlock: (blockId: string, data: any) => void;
  deleteBlock: (blockId: string) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  
  // Module operations
  updateModuleMetadata: (updates: Partial<Module>) => void;
  save: () => Promise<boolean>;
  refetch: () => Promise<void>;
}

export const useModule = ({ courseId, moduleId }: UseModuleOptions): UseModuleReturn => {
  const { user } = useAuth();
  const [module, setModule] = useState<Module | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  
  // Track original state for dirty checking
  const originalRef = useRef<string>('');

  // Fetch module data
  const fetchModule = useCallback(async () => {
    if (!moduleId) {
      // New module - initialize empty
      const newModule: Module = {
        id: '',
        courseId,
        title: 'Untitled Module',
        description: '',
        status: 'draft',
        passingScore: 80,
        estimatedMinutes: 15,
        blocks: [],
        weight: 0,
        isCritical: false
      };
      setModule(newModule);
      originalRef.current = JSON.stringify(newModule); // Set baseline for dirty tracking
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getModuleWithBlocks(courseId, moduleId);
      
      if (!data) {
        setError('Module not found');
        return;
      }
      
      setModule(data);
      originalRef.current = JSON.stringify(data);
      setIsDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load module';
      setError(message);
      console.error('useModule fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, moduleId]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  // Check if module has changed
  useEffect(() => {
    if (module) {
      const current = JSON.stringify(module);
      // Compare against original, or mark dirty if no baseline exists
      if (originalRef.current) {
        setIsDirty(current !== originalRef.current);
      } else {
        // No baseline yet - set it now (shouldn't happen normally)
        originalRef.current = current;
      }
    }
  }, [module]);

  // Add a new block
  const addBlock = useCallback((type: BlockType, variant?: string) => {
    if (!module) return;
    
    const newBlock: ContentBlock = {
      id: generateId(),
      moduleId: module.id || 'pending',
      type,
      order: module.blocks.length,
      required: true,
      data: getDefaultBlockData(type, variant),
    };
    
    setModule(prev => prev ? {
      ...prev,
      blocks: [...prev.blocks, newBlock],
    } : null);
  }, [module]);

  // Update a block's data
  const updateBlock = useCallback((blockId: string, data: any) => {
    setModule(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        blocks: prev.blocks.map(b =>
          b.id === blockId ? { ...b, data: { ...b.data, ...data } } : b
        ),
      };
    });
  }, []);

  // Delete a block
  const deleteBlock = useCallback((blockId: string) => {
    setModule(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        blocks: prev.blocks
          .filter(b => b.id !== blockId)
          .map((b, idx) => ({ ...b, order: idx })),
      };
    });
  }, []);

  // Reorder blocks
  const reorderBlocks = useCallback((fromIndex: number, toIndex: number) => {
    setModule(prev => {
      if (!prev) return null;
      
      const blocks = [...prev.blocks];
      const [moved] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, moved);
      
      return {
        ...prev,
        blocks: blocks.map((b, idx) => ({ ...b, order: idx })),
      };
    });
  }, []);

  // Update module metadata
  const updateModuleMetadata = useCallback((updates: Partial<Module>) => {
    setModule(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Save to Firestore
  const save = useCallback(async (): Promise<boolean> => {
    if (!module || !user) {
      setError('Cannot save: no module or user');
      return false;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      let savedModuleId = module.id;
      
      // Create new module if no ID
      if (!savedModuleId) {
        savedModuleId = await createModule(
          courseId,
          {
            title: module.title,
            description: module.description,
            status: module.status,
            passingScore: module.passingScore,
            estimatedMinutes: module.estimatedMinutes,
            weight: 0,
            isCritical: false,
            ...(module.availability ? { availability: module.availability } : {}),
          },
          user.uid,
          user.displayName
        );
        
        // Update local state with new ID
        setModule(prev => prev ? { ...prev, id: savedModuleId } : null);
      } else {
        // Update existing module metadata
        await updateModule(
          courseId,
          savedModuleId,
          {
            title: module.title,
            description: module.description,
            status: module.status,
            passingScore: module.passingScore,
            estimatedMinutes: module.estimatedMinutes,
            ...(module.availability ? { availability: module.availability } : {}),
          },
          user.uid,
          user.displayName
        );
      }
      
      // Save all blocks
      await saveModuleBlocks(
        courseId,
        savedModuleId,
        module.blocks.map(b => ({ ...b, moduleId: savedModuleId })),
        user.uid,
        user.displayName
      );
      
      // Update original ref for dirty tracking
      originalRef.current = JSON.stringify({ ...module, id: savedModuleId });
      setIsDirty(false);
      
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save module';
      setError(message);
      console.error('useModule save error:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [module, user, courseId]);

  return {
    module,
    isLoading,
    isSaving,
    error,
    isDirty,
    addBlock,
    updateBlock,
    deleteBlock,
    reorderBlocks,
    updateModuleMetadata,
    save,
    refetch: fetchModule,
  };
};

// Helper: Get default data for block type
function getDefaultBlockData(type: BlockType, variant?: string): any {
  switch (type) {
    case 'heading':
      return { content: '', level: 2 };
    case 'text':
      return {
        content: variant === 'callout' ? 'Enter alert content...' : '',
        variant: variant === 'callout' ? 'callout-warning' : 'paragraph',
      };
    case 'image':
      return { url: '', caption: '', altText: '' };
    case 'video':
      return { url: '', title: '', duration: 0, transcript: '' };
    case 'quiz':
      return { title: 'Knowledge Check', questions: [], passingScore: 80 };
    case 'checklist':
      return { title: 'Checklist', items: [] };
    case 'correction_log':
      return { title: 'Correction Log', entries: [] };
    case 'obj_subj_validator':
      return { title: 'Objective vs. Subjective Exercise', items: [], pointsPerItem: 10 };
    default:
      return {};
  }
}