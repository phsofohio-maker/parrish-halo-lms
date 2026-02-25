/**
 * Course Detail Page
 * 
 * Shows course overview and module list.
 * Allows enrollment and module selection.
 * 
 * @module pages/CourseDetail
 */

import React, { useState, useEffect } from 'react';
import { Course, Module } from '../functions/src/types';
import { Button } from '../components/ui/Button';
import { 
  ArrowLeft, 
  BookOpen, 
  Clock, 
  Award, 
  PlayCircle, 
  CheckCircle,
  Lock,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../utils';

// Hooks
import { useEnrollment } from '../hooks/useUserEnrollments';
import { useCourseProgress } from '../hooks/useModuleProgress';
import { useAuth } from '../contexts/AuthContext';

// Services
import { getCourse, getModules } from '../services/courseService';

interface CourseDetailProps {
  courseId: string;
  onNavigate: (path: string, context?: Record<string, any>) => void;
  onBack: () => void;
}

export const CourseDetail: React.FC<CourseDetailProps> = ({
  courseId,
  onNavigate,
  onBack,
}) => {
  const { user } = useAuth();
  
  // Course data
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Enrollment state
  const {
    enrollment,
    isEnrolled,
    enroll,
    isLoading: enrollmentLoading,
    error: enrollmentError
  } = useEnrollment(courseId);
  
  // Progress (only fetch if enrolled)
  const { 
    moduleProgress, 
    overallPercent,
    completedModules 
  } = useCourseProgress(courseId, modules.length);

  // Load course and modules
  useEffect(() => {
    const loadCourse = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const [courseData, modulesData] = await Promise.all([
          getCourse(courseId),
          getModules(courseId),
        ]);
        
        if (!courseData) {
          setError('Course not found');
          return;
        }
        
        setCourse(courseData);
        setModules(modulesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load course');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCourse();
  }, [courseId]);

  // Handle enrollment
  const handleEnroll = async () => {
    const success = await enroll();
    if (success) {
      // Optionally start first module
    }
  };

  // Start a specific module
  const handleStartModule = (moduleId: string) => {
    onNavigate('/player', { courseId, moduleId });
  };

  // Get module completion status
  const getModuleStatus = (moduleId: string): 'locked' | 'available' | 'in_progress' | 'completed' => {
    if (!isEnrolled) return 'locked';
    
    const progress = moduleProgress.find(mp => mp.moduleId === moduleId);
    if (!progress) return 'available';
    if (progress.isComplete) return 'completed';
    if (progress.overallProgress > 0) return 'in_progress';
    return 'available';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-brand-600 animate-spin mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">Loading course...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Failed to Load</h2>
          <p className="text-slate-600 mb-6">{error || 'Course not found'}</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const totalMinutes = modules.reduce((acc, m) => acc + (m.estimatedMinutes || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-4 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </button>
          
          <div className="flex gap-6">
            {/* Thumbnail */}
            {course.thumbnailUrl && (
              <div className="hidden md:block w-48 h-32 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                <img 
                  src={course.thumbnailUrl} 
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-700">
                  {course.category}
                </span>
                {course.status === 'draft' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                    Draft
                  </span>
                )}
              </div>
              
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{course.title}</h1>
              <p className="text-slate-600 mb-4">{course.description}</p>
              
              <div className="flex items-center gap-6 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4" />
                  {modules.length} Modules
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {totalMinutes} min
                </span>
                <span className="flex items-center gap-1 text-brand-600 font-medium">
                  <Award className="h-4 w-4" />
                  {course.ceCredits} CE Credits
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Module List */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Course Modules</h2>
            
            {modules.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No modules available yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {modules.map((module, index) => {
                  const status = getModuleStatus(module.id);
                  const progress = moduleProgress.find(mp => mp.moduleId === module.id);
                  
                  return (
                    <div
                      key={module.id}
                      className={cn(
                        "bg-white rounded-lg border p-4 flex items-center gap-4 transition-all",
                        status === 'locked' 
                          ? "border-slate-200 opacity-60" 
                          : "border-slate-200 hover:border-brand-300 hover:shadow-sm cursor-pointer",
                        status === 'completed' && "border-green-200 bg-green-50/50"
                      )}
                      onClick={() => status !== 'locked' && handleStartModule(module.id)}
                    >
                      {/* Index/Status Icon */}
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                        status === 'completed' && "bg-green-100 text-green-600",
                        status === 'in_progress' && "bg-brand-100 text-brand-600",
                        status === 'available' && "bg-slate-100 text-slate-600",
                        status === 'locked' && "bg-slate-100 text-slate-400"
                      )}>
                        {status === 'completed' ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : status === 'locked' ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <span className="font-bold">{index + 1}</span>
                        )}
                      </div>
                      
                      {/* Module Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900 truncate">
                          {module.title}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>{module.estimatedMinutes || 0} min</span>
                          <span>Pass: {module.passingScore}%</span>
                          {progress && progress.overallProgress > 0 && (
                            <span className="text-brand-600 font-medium">
                              {progress.overallProgress}% complete
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Action */}
                      {status !== 'locked' && (
                        <Button
                          size="sm"
                          variant={status === 'completed' ? 'outline' : 'default'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartModule(module.id);
                          }}
                        >
                          {status === 'completed' ? (
                            'Review'
                          ) : status === 'in_progress' ? (
                            <>
                              <PlayCircle className="h-4 w-4 mr-1" />
                              Continue
                            </>
                          ) : (
                            <>
                              <PlayCircle className="h-4 w-4 mr-1" />
                              Start
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Sidebar */}
          <div className="space-y-4">
            {/* Enrollment Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              {isEnrolled ? (
                <>
                  <div className="flex items-center gap-2 text-green-600 mb-4">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Enrolled</span>
                  </div>
                  
                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">Progress</span>
                      <span className="font-medium text-slate-900">{overallPercent}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-brand-500 transition-all"
                        style={{ width: `${overallPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {completedModules} of {modules.length} modules completed
                    </p>
                  </div>
                  
                  {modules.length > 0 && (
                    <Button 
                      className="w-full"
                      onClick={() => {
                        // Find first incomplete module or first module
                        const nextModule = modules.find(m => {
                          const status = getModuleStatus(m.id);
                          return status === 'available' || status === 'in_progress';
                        }) || modules[0];
                        handleStartModule(nextModule.id);
                      }}
                    >
                      {overallPercent > 0 ? 'Continue Learning' : 'Start Course'}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-slate-600 mb-4">
                    Enroll in this course to track your progress and earn CE credits.
                  </p>
                  {enrollmentError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{enrollmentError}</p>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleEnroll}
                    disabled={enrollmentLoading}
                  >
                    {enrollmentLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enrolling...
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-4 w-4 mr-2" />
                        Enroll Now
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
            
            {/* Course Info Card */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="font-medium text-slate-900 mb-3">Course Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Category</dt>
                  <dd className="text-slate-900 capitalize">{course.category}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Modules</dt>
                  <dd className="text-slate-900">{modules.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Duration</dt>
                  <dd className="text-slate-900">{totalMinutes} min</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">CE Credits</dt>
                  <dd className="text-slate-900 font-medium text-brand-600">{course.ceCredits}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};