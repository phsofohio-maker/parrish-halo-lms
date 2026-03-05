/**
 * Course Manager Page - Firestore Integration
 *
 * Converted from template prop-based version to use Firestore services.
 * Fetches courses via useCourses hook, uses courseService for CRUD.
 *
 * @module pages/CourseManager
 */
import React, { useState } from 'react';
import { Course } from '../functions/src/types';
import { Settings, FileEdit, Trash2, Plus, Search, Layers, AlertCircle, Globe, Lock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn, generateId } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useCourses } from '../hooks/useCourses';
import { createCourse, updateCourse, getModules } from '../services/courseService';
import { createModule } from '../services/courseService';
import { collection, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { auditService } from '../services/auditService';

interface CourseManagerProps {
  onNavigate: (path: string, context?: Record<string, any>) => void;
}

export const CourseManager: React.FC<CourseManagerProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { courses, isLoading, error, refetch } = useCourses();
  const [filter, setFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreateCourse = async () => {
    if (!user || isCreating) return;
    setIsCreating(true);

    try {
      // Create the course in Firestore
      const courseId = await createCourse(
        {
          title: 'New Clinical Course',
          description: 'Enter description here...',
          category: 'clinical_skills',
          ceCredits: 1.0,
          thumbnailUrl: `https://picsum.photos/400/200?random=${Math.random()}`,
          status: 'draft',
          estimatedHours: 0,
        },
        user.uid,
        user.displayName
      );

      // Create a default first module
      const moduleId = await createModule(
        courseId,
        {
          title: 'Module 1: Getting Started',
          description: '',
          status: 'draft',
          passingScore: 80,
          estimatedMinutes: 10,
          order: 0,
          weight: 100,
          isCritical: false,
        },
        user.uid,
        user.displayName
      );

      // Navigate to the builder with the new course and module
      onNavigate('/builder', { courseId, moduleId });
    } catch (err) {
      console.error('Failed to create course:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!user || isDeleting) return;
    setIsDeleting(true);

    try {
      // Delete all modules (subcollection) first
      const modulesRef = collection(db, 'courses', courseId, 'modules');
      const modulesSnap = await getDocs(modulesRef);

      const batch = writeBatch(db);
      for (const moduleDoc of modulesSnap.docs) {
        // Delete blocks subcollection for each module
        const blocksRef = collection(moduleDoc.ref, 'blocks');
        const blocksSnap = await getDocs(blocksRef);
        blocksSnap.docs.forEach(blockDoc => batch.delete(blockDoc.ref));
        batch.delete(moduleDoc.ref);
      }

      // Delete the course itself
      const courseRef = doc(db, 'courses', courseId);
      batch.delete(courseRef);

      await batch.commit();

      await auditService.logToFirestore(
        user.uid,
        user.displayName,
        'COURSE_DELETE',
        courseId,
        `Deleted course and all associated modules`
      );

      setConfirmDeleteId(null);
      await refetch();
    } catch (err) {
      console.error('Failed to delete course:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTogglePublish = async (courseId: string, currentStatus: string) => {
    if (!user) return;

    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      await updateCourse(
        courseId,
        { status: newStatus },
        user.uid,
        user.displayName
      );

      if (newStatus === 'published') {
        await auditService.logToFirestore(
          user.uid,
          user.displayName,
          'COURSE_PUBLISH',
          courseId,
          `Published course`
        );
      }

      await refetch();
    } catch (err) {
      console.error('Failed to toggle publish:', err);
    }
  };

  const handleEditCurriculum = async (courseId: string) => {
    try {
      // Fetch modules to get the first module ID
      const modules = await getModules(courseId);
      const moduleId = modules.length > 0 ? modules[0].id : undefined;

      if (moduleId) {
        onNavigate('/builder', { courseId, moduleId });
      } else {
        // Create a module if none exist
        if (!user) return;
        const newModuleId = await createModule(
          courseId,
          {
            title: 'Module 1',
            description: '',
            status: 'draft',
            passingScore: 80,
            estimatedMinutes: 10,
            order: 0,
            weight: 100,
            isCritical: false,
          },
          user.uid,
          user.displayName
        );
        onNavigate('/builder', { courseId, moduleId: newModuleId });
      }
    } catch (err) {
      console.error('Failed to load modules for editing:', err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 animate-in zoom-in duration-200">
            <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Delete Course?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              This action cannot be undone. All modules and data for this course will be permanently removed.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)} disabled={isDeleting}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={() => handleDeleteCourse(confirmDeleteId)} isLoading={isDeleting}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary-600" />
            Curriculum Manager
          </h1>
          <p className="text-gray-500 mt-1">Design courses, configure CE credits, and manage module publishing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={handleCreateCourse} className="gap-2" isLoading={isCreating}>
            <Plus className="h-4 w-4" />
            Create New Course
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Course Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by title or category..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-700">Course Detail</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Category</th>
              <th className="px-6 py-4 font-semibold text-gray-700">CE Units</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
              <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Loading courses...
                </td>
              </tr>
            ) : courses.filter(c => c.title.toLowerCase().includes(filter.toLowerCase())).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                  {filter ? 'No courses match your search.' : 'No courses yet. Create one to get started.'}
                </td>
              </tr>
            ) : (
              courses.filter(c => c.title.toLowerCase().includes(filter.toLowerCase())).map(course => (
                <tr key={course.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {course.thumbnailUrl ? (
                        <img src={course.thumbnailUrl} className="h-10 w-16 rounded object-cover bg-gray-100" />
                      ) : (
                        <div className="h-10 w-16 rounded bg-gray-100" />
                      )}
                      <div>
                        <div className="font-bold text-gray-900">{course.title}</div>
                        <div className="text-xs text-gray-500">{course.modules?.length || 0} Modules</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded capitalize">
                      {(course.category || '').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-primary-700">
                    {course.ceCredits.toFixed(1)}
                  </td>
                  <td className="px-6 py-4">
                    {course.status === 'published' ? (
                      <span className="flex items-center gap-1.5 text-green-600 font-medium text-xs">
                        <Globe className="h-3 w-3" />
                        Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-400 font-medium text-xs">
                        <Lock className="h-3 w-3" />
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTogglePublish(course.id, course.status || 'draft')}
                        className={cn("gap-1.5", course.status === 'published' ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700")}
                      >
                        {course.status === 'published' ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditCurriculum(course.id)}
                        className="gap-1.5"
                      >
                        <FileEdit className="h-3.5 w-3.5" />
                        Curriculum
                      </Button>
                      <button
                        onClick={() => setConfirmDeleteId(course.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
