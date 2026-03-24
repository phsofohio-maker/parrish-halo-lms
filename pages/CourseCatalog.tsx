/**
 * Course Catalog Page (Updated)
 * 
 * Now fetches from Firestore and navigates to CourseDetail.
 * 
 * @module pages/CourseCatalog
 */

import React from 'react';
import { useCourses } from '../hooks/useCourses';
import { Clock, BookOpen, Award, ArrowRight, Loader2, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../utils';
import { checkAvailability } from '../utils/availabilityUtils';

interface CourseCatalogProps {
  onNavigate: (path: string, context?: Record<string, any>) => void;
}

export const CourseCatalog: React.FC<CourseCatalogProps> = ({ onNavigate }) => {
  const { courses, isLoading, error, refetch } = useCourses();

  // Navigate to course detail
  const handleViewCourse = (courseId: string) => {
    onNavigate('/course', { courseId });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Catalog</h1>
          <p className="text-gray-500 mt-1">
            Browse and enroll in available clinical training modules.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Failed to load courses</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No courses available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <div 
              key={course.id} 
              className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-sm transition-all flex flex-col h-full cursor-pointer"
              onClick={() => handleViewCourse(course.id)}
            >
              {/* Thumbnail */}
              <div className="h-40 bg-gray-100 relative overflow-hidden">
                {course.thumbnailUrl ? (
                  <img 
                    src={course.thumbnailUrl} 
                    alt={course.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary-800">
                    <BookOpen className="h-12 w-12 text-white/50" />
                  </div>
                )}

                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-sm border border-white/30 text-white">
                    {course.category}
                  </span>
                  {course.status === 'draft' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/80 text-white">
                      Draft
                    </span>
                  )}
                  {(() => {
                    const avail = checkAvailability(course.availability);
                    if (avail.status === 'not_yet_open') return (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/80 text-white">
                        {avail.message}
                      </span>
                    );
                    if (avail.status === 'closed') return (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-500/80 text-white">
                        Closed
                      </span>
                    );
                    return null;
                  })()}
                </div>
              </div>
              
              {/* Content */}
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-gray-900 mb-2 leading-tight group-hover:text-primary-600 transition-colors">
                  {course.title}
                </h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-1">
                  {course.description || 'No description'}
                </p>
                
                <div className="space-y-3 mt-auto">
                  <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{course.modules?.length || 0} modules</span>
                    </div>
                    <div className="flex items-center gap-1 text-primary-600 font-medium">
                      <Award className="h-3.5 w-3.5" />
                      <span>{course.ceCredits} CEU</span>
                    </div>
                  </div>
                  
                  {(() => {
                    const avail = checkAvailability(course.availability);
                    if (avail.status !== 'available') return (
                      <Button
                        className="w-full justify-center opacity-60"
                        disabled
                      >
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        {avail.status === 'not_yet_open' ? avail.message : 'Enrollment Closed'}
                      </Button>
                    );
                    return (
                      <Button
                        className="w-full justify-between"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewCourse(course.id);
                        }}
                      >
                        View Course
                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity -ml-4 group-hover:ml-0" />
                      </Button>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};