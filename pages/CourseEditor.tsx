/**
 * CourseEditor Page — Course Structure Editor
 *
 * Sits between CourseManager and ModuleBuilder. Provides a course-level
 * authoring view where instructors see all modules and manage course metadata.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Course, Module, CourseCategory } from '../functions/src/types';
import {
  getCourse,
  getModules,
  updateCourse,
  createModule,
  updateModule,
} from '../services/courseService';
import { collection, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { auditService } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { RichTextEditorMini } from '../components/ui/RichTextEditorMini';
import { CoverImagePicker } from '../components/builder/CoverImagePicker';
import { cn } from '../utils';
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  FileEdit,
  Shield,
  AlertCircle,
  AlertTriangle,
  Globe,
  Lock,
  ChevronDown,
  ChevronUp,
  BookOpen,
  X,
  Calendar,
} from 'lucide-react';

interface CourseEditorProps {
  courseId: string;
  onNavigate: (path: string, context?: Record<string, any>) => void;
  onBack: () => void;
}

const CATEGORIES: { value: CourseCategory; label: string }[] = [
  { value: 'clinical_skills', label: 'Clinical Skills' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'hospice', label: 'Hospice' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'Testing', label: 'Testing' },
];

export const CourseEditor: React.FC<CourseEditorProps> = ({
  courseId,
  onNavigate,
  onBack,
}) => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Data state
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state for course metadata
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<CourseCategory>('clinical_skills');
  const [editCredits, setEditCredits] = useState(1.0);
  const [editThumbnail, setEditThumbnail] = useState('');
  const [editOpensAt, setEditOpensAt] = useState('');
  const [editClosesAt, setEditClosesAt] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(true);

  // Add module state
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModule, setNewModule] = useState({
    title: '',
    weight: 0,
    isCritical: false,
    passingScore: 80,
    estimatedMinutes: 15,
  });
  const [isAddingModule, setIsAddingModule] = useState(false);

  // Delete module state
  const [confirmDeleteModuleId, setConfirmDeleteModuleId] = useState<string | null>(null);
  const [isDeletingModule, setIsDeletingModule] = useState(false);

  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false);

  // Load course and modules
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [courseData, moduleData] = await Promise.all([
        getCourse(courseId),
        getModules(courseId),
      ]);
      if (!courseData) {
        setError('Course not found.');
        return;
      }
      setCourse(courseData);
      setModules(moduleData);
      setEditTitle(courseData.title);
      setEditDescription(courseData.description);
      setEditCategory(courseData.category);
      setEditCredits(courseData.ceCredits);
      setEditThumbnail(courseData.thumbnailUrl);
      setEditOpensAt(courseData.availability?.opensAt || '');
      setEditClosesAt(courseData.availability?.closesAt || '');
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to load course:', err);
      setError('Failed to load course data.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Track dirty state
  useEffect(() => {
    if (!course) return;
    const changed =
      editTitle !== course.title ||
      editDescription !== course.description ||
      editCategory !== course.category ||
      editCredits !== course.ceCredits ||
      editThumbnail !== course.thumbnailUrl ||
      editOpensAt !== (course.availability?.opensAt || '') ||
      editClosesAt !== (course.availability?.closesAt || '');
    setIsDirty(changed);
  }, [editTitle, editDescription, editCategory, editCredits, editThumbnail, editOpensAt, editClosesAt, course]);

  // Save course metadata
  const handleSaveMetadata = async () => {
    if (!user || !course || isSaving) return;
    setIsSaving(true);
    try {
      const availability = (editOpensAt || editClosesAt)
        ? { opensAt: editOpensAt || undefined, closesAt: editClosesAt || undefined }
        : undefined;
      await updateCourse(
        courseId,
        {
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory,
          ceCredits: editCredits,
          thumbnailUrl: editThumbnail,
          availability,
        },
        user.uid,
        user.displayName
      );
      setCourse({
        ...course,
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory,
        ceCredits: editCredits,
        thumbnailUrl: editThumbnail,
        availability,
      });
      setIsDirty(false);
      addToast({ type: 'success', title: 'Changes saved' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      addToast({ type: 'error', title: 'Failed to save changes', message: msg });
      console.error('Failed to save course:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle publish/draft
  const handleTogglePublish = async () => {
    if (!user || !course || isPublishing) return;
    setIsPublishing(true);
    const newStatus = course.status === 'published' ? 'draft' : 'published';
    try {
      await updateCourse(courseId, { status: newStatus }, user.uid, user.displayName);
      if (newStatus === 'published') {
        await auditService.logToFirestore(
          user.uid,
          user.displayName,
          'COURSE_PUBLISH',
          courseId,
          `Published course`
        );
      }
      setCourse({ ...course, status: newStatus });
      addToast({ type: 'success', title: `Course ${newStatus === 'published' ? 'published' : 'unpublished'}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      addToast({ type: 'error', title: 'Failed to update status', message: msg });
      console.error('Failed to toggle publish:', err);
    } finally {
      setIsPublishing(false);
    }
  };

  // Add module
  const handleAddModule = async () => {
    if (!user || isAddingModule || !newModule.title.trim()) return;
    setIsAddingModule(true);
    try {
      await createModule(
        courseId,
        {
          title: newModule.title.trim(),
          description: '',
          status: 'draft',
          passingScore: newModule.passingScore,
          estimatedMinutes: newModule.estimatedMinutes,
          order: modules.length,
          weight: newModule.weight,
          isCritical: newModule.isCritical,
        },
        user.uid,
        user.displayName
      );
      const updated = await getModules(courseId);
      setModules(updated);
      setShowAddModule(false);
      setNewModule({ title: '', weight: 0, isCritical: false, passingScore: 80, estimatedMinutes: 15 });
      addToast({ type: 'success', title: 'Module added' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      addToast({ type: 'error', title: 'Failed to create module', message: msg });
      console.error('Failed to add module:', err);
    } finally {
      setIsAddingModule(false);
    }
  };

  // Delete module
  const handleDeleteModule = async (moduleId: string) => {
    if (!user || isDeletingModule) return;
    setIsDeletingModule(true);
    try {
      const moduleRef = doc(db, 'courses', courseId, 'modules', moduleId);
      const blocksRef = collection(moduleRef, 'blocks');
      const blocksSnap = await getDocs(blocksRef);
      const batch = writeBatch(db);
      blocksSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(moduleRef);
      await batch.commit();

      await auditService.logToFirestore(
        user.uid,
        user.displayName,
        'MODULE_DELETE',
        moduleId,
        `Deleted module from course ${courseId}`
      );

      const updated = await getModules(courseId);
      setModules(updated);
      setConfirmDeleteModuleId(null);
      addToast({ type: 'success', title: 'Module deleted' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      addToast({ type: 'error', title: 'Failed to delete module', message: msg });
      console.error('Failed to delete module:', err);
    } finally {
      setIsDeletingModule(false);
    }
  };

  // Navigate to module builder
  const handleEditModule = (moduleId: string) => {
    onNavigate('/builder', { courseId, moduleId });
  };

  // Weight total
  const weightTotal = modules.reduce((sum, m) => sum + (m.weight || 0), 0);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-500">Loading course...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{error || 'Course not found.'}</p>
          <Button onClick={onBack}>Back to Curriculum Manager</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete Module Confirmation Modal */}
      {confirmDeleteModuleId && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 animate-in zoom-in duration-200">
            <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Delete Module?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              This will permanently remove this module and all its content blocks.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteModuleId(null)} disabled={isDeletingModule}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => handleDeleteModule(confirmDeleteModuleId)} isLoading={isDeletingModule}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (isDirty) {
                  const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
                  if (!confirmed) return;
                }
                onBack();
              }}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{course.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {course.status === 'published' ? (
                  <span className="flex items-center gap-1 text-green-600 font-medium text-xs">
                    <Globe className="h-3 w-3" />
                    Published
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-gray-400 font-medium text-xs">
                    <Lock className="h-3 w-3" />
                    Draft
                  </span>
                )}
                <span className="text-gray-300">|</span>
                <span className="text-xs text-gray-500">{modules.length} module{modules.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button
                onClick={handleSaveMetadata}
                isLoading={isSaving}
                size="sm"
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Save Changes
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePublish}
              isLoading={isPublishing}
              className={cn(
                'gap-1.5',
                course.status === 'published'
                  ? 'text-amber-600 hover:text-amber-700'
                  : 'text-green-600 hover:text-green-700'
              )}
            >
              {course.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Course Metadata Panel */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <button
            onClick={() => setMetadataOpen(!metadataOpen)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Course Details</h2>
            {metadataOpen ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {metadataOpen && (
            <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <RichTextEditorMini
                    content={editDescription}
                    onChange={(html) => setEditDescription(html)}
                    placeholder="Describe what this course covers..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as CourseCategory)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CE Credits</label>
                  <input
                    type="number"
                    value={editCredits}
                    onChange={(e) => setEditCredits(parseFloat(e.target.value) || 0)}
                    step={0.5}
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Availability Window */}
              <div className="col-span-2 border-t border-gray-100 pt-4 mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Availability Window
                  <span className="text-xs text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <p className="text-xs text-gray-400 mb-3">
                  Set dates to control when students can access this course. Leave blank for always available.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Opens</label>
                    <input
                      type="datetime-local"
                      value={editOpensAt ? editOpensAt.slice(0, 16) : ''}
                      onChange={(e) => setEditOpensAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Closes</label>
                    <input
                      type="datetime-local"
                      value={editClosesAt ? editClosesAt.slice(0, 16) : ''}
                      onChange={(e) => setEditClosesAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                {(editOpensAt || editClosesAt) && (
                  <button
                    onClick={() => { setEditOpensAt(''); setEditClosesAt(''); }}
                    className="text-xs text-gray-400 hover:text-red-500 mt-2 transition-colors"
                  >
                    Clear dates
                  </button>
                )}
                {editOpensAt && editClosesAt && new Date(editClosesAt) <= new Date(editOpensAt) && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Close date must be after open date.
                  </p>
                )}
              </div>

              <CoverImagePicker
                selectedUrl={editThumbnail}
                onSelect={setEditThumbnail}
                suggestedCategory={editCategory}
                courseId={courseId}
                enableUpload={true}
              />

              {isDirty && (
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveMetadata} isLoading={isSaving} size="sm" className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Weight Warning */}
        {modules.length > 0 && weightTotal !== 100 && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">
              Module weights total <span className="font-bold">{weightTotal}%</span> — they should add up to 100% for accurate grading.
            </p>
          </div>
        )}

        {/* Module List Panel */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Course Modules</h2>
            <Button size="sm" onClick={() => setShowAddModule(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Module
            </Button>
          </div>

          {modules.length === 0 && !showAddModule ? (
            <div className="px-6 py-16 text-center">
              <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-1">This course has no modules yet.</p>
              <p className="text-sm text-gray-400 mb-6">Add your first module to start building content.</p>
              <Button onClick={() => setShowAddModule(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add First Module
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {modules.map((mod, idx) => (
                <div
                  key={mod.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors group"
                >
                  {/* Order number */}
                  <span className="text-sm font-bold text-gray-300 w-6 text-center shrink-0">
                    {idx + 1}
                  </span>

                  {/* Module info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{mod.title}</span>
                      {mod.isCritical && (
                        <span title="Critical module"><Shield className="h-3.5 w-3.5 text-red-500 shrink-0" /></span>
                      )}
                      {mod.availability && (mod.availability.opensAt || mod.availability.closesAt) && (
                        <span title="Has availability window"><Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" /></span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{mod.blocks?.length || 0} blocks</span>
                      <span>Pass: {mod.passingScore}%</span>
                      <span>{mod.estimatedMinutes} min</span>
                      {mod.status === 'published' ? (
                        <span className="flex items-center gap-1 text-green-500">
                          <Globe className="h-2.5 w-2.5" />
                          Published
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400">
                          <Lock className="h-2.5 w-2.5" />
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Weight badge */}
                  <span className="text-xs font-mono font-bold text-primary-700 bg-primary-50 px-2 py-1 rounded shrink-0">
                    {mod.weight}%
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditModule(mod.id)}
                      className="gap-1.5"
                    >
                      <FileEdit className="h-3.5 w-3.5" />
                      Edit Content
                    </Button>
                    <button
                      onClick={() => setConfirmDeleteModuleId(mod.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Module Inline Form */}
              {showAddModule && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-700">New Module</h3>
                    <button onClick={() => setShowAddModule(false)} className="p-1 text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Module title"
                        value={newModule.title}
                        onChange={(e) => setNewModule({ ...newModule, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Weight (%)</label>
                      <input
                        type="number"
                        value={newModule.weight}
                        onChange={(e) => setNewModule({ ...newModule, weight: parseInt(e.target.value) || 0 })}
                        min={0}
                        max={100}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Passing Score (%)</label>
                      <input
                        type="number"
                        value={newModule.passingScore}
                        onChange={(e) => setNewModule({ ...newModule, passingScore: parseInt(e.target.value) || 70 })}
                        min={0}
                        max={100}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Est. Minutes</label>
                      <input
                        type="number"
                        value={newModule.estimatedMinutes}
                        onChange={(e) => setNewModule({ ...newModule, estimatedMinutes: parseInt(e.target.value) || 10 })}
                        min={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newModule.isCritical}
                          onChange={(e) => setNewModule({ ...newModule, isCritical: e.target.checked })}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 flex items-center gap-1">
                          <Shield className="h-3.5 w-3.5 text-red-400" />
                          Critical
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => setShowAddModule(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddModule}
                      isLoading={isAddingModule}
                      disabled={!newModule.title.trim()}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Module
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Weight total footer */}
          {modules.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {modules.length} module{modules.length !== 1 ? 's' : ''}
              </span>
              <span
                className={cn(
                  'text-xs font-mono font-bold',
                  weightTotal === 100 ? 'text-green-600' : 'text-amber-600'
                )}
              >
                Total Weight: {weightTotal}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
