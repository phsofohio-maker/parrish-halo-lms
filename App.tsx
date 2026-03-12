/**
 * App.tsx - Complete Routing with All Pages
 *
 * All routes from the template are now wired:
 * - /              -> Dashboard
 * - /courses       -> CourseCatalog
 * - /my-grades     -> MyGrades
 * - /course        -> CourseDetail (full-screen, no sidebar)
 * - /player        -> CoursePlayer (full-screen, no sidebar)
 * - /curriculum    -> CourseManager (admin)
 * - /grade-management -> GradeManagement (admin)
 * - /invitations   -> Invitations (admin)
 * - /users         -> UserManagement (admin)
 * - /audit         -> AuditLogs (admin)
 * - /remediation   -> RemediationQueue (admin/instructor)
 * - /builder       -> ModuleBuilder (admin, full-screen)
 * - /course-editor -> CourseEditor (admin, full-screen)
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ModuleBuilder } from './pages/ModuleBuilder';
import { AuditLogs } from './pages/AuditLogs';
import { CourseCatalog } from './pages/CourseCatalog';
import { CourseDetail } from './pages/CourseDetail';
import { CoursePlayer } from './pages/CoursePlayer';
import { UserManagement } from './pages/UserManagement';
import { CourseManager } from './pages/CourseManager';
import { CourseEditor } from './pages/CourseEditor';
import { MyGrades } from './pages/MyGrades';
import { GradeManagement } from './pages/GradeManagement';
import { Invitations } from './pages/Invitations';
import { AcceptInvite } from './pages/AcceptInvite';
import { RemediationQueue } from './pages/RemediationQueue';
import { CohortManagement } from './pages/CohortManagement';
import { Button } from './components/ui/Button';
import { Loader2, AlertCircle } from 'lucide-react';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="h-12 w-12 text-primary-600 animate-spin mx-auto" />
      <p className="mt-4 text-gray-500 font-medium">Loading...</p>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [currentPath, setCurrentPath] = useState('/');

  // Context for routes that need IDs
  const [routeContext, setRouteContext] = useState<{
    courseId?: string;
    moduleId?: string;
    courseCategory?: string;
  }>({});

  if (isLoading) return <LoadingScreen />;

  // Accept Invitation route — accessible WITHOUT authentication.
  // Check URL params for the accept-invite flow before showing login.
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('token');
  if (window.location.pathname === '/accept-invite' && inviteToken) {
    return (
      <AcceptInvite
        token={inviteToken}
        onComplete={() => {
          // Clear URL params and go to login
          window.history.replaceState({}, '', '/');
          window.location.reload();
        }}
      />
    );
  }

  if (!isAuthenticated || !user) return <Login />;

  // Navigation handler
  const handleNavigate = (path: string, context?: Record<string, any>) => {
    setCurrentPath(path);
    if (context) {
      setRouteContext(prev => ({ ...prev, ...context }));
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentPath('/');
    setRouteContext({});
  };

  // ============================================
  // FULL-SCREEN ROUTES (no sidebar)
  // ============================================

  // Course Detail Page
  if (currentPath === '/course') {
    if (!routeContext.courseId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No course selected.</p>
            <Button onClick={() => setCurrentPath('/courses')}>
              Go to Catalog
            </Button>
          </div>
        </div>
      );
    }

    return (
      <CourseDetail
        courseId={routeContext.courseId}
        onNavigate={handleNavigate}
        onBack={() => setCurrentPath('/courses')}
      />
    );
  }

  // Course Player
  if (currentPath === '/player') {
    if (!routeContext.courseId || !routeContext.moduleId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No module selected.</p>
            <Button onClick={() => setCurrentPath('/courses')}>
              Go to Catalog
            </Button>
          </div>
        </div>
      );
    }

    return (
      <CoursePlayer
        courseId={routeContext.courseId}
        moduleId={routeContext.moduleId}
        courseCategory={routeContext.courseCategory}
        onBack={() => setCurrentPath('/course')}
      />
    );
  }

  // Course Editor (full-screen, between CourseManager and ModuleBuilder)
  if (currentPath === '/course-editor') {
    if (!routeContext.courseId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No course selected.</p>
            <Button onClick={() => setCurrentPath('/curriculum')}>
              Go to Curriculum Manager
            </Button>
          </div>
        </div>
      );
    }

    return (
      <CourseEditor
        courseId={routeContext.courseId}
        onNavigate={handleNavigate}
        onBack={() => setCurrentPath('/curriculum')}
      />
    );
  }

  // ============================================
  // SIDEBAR ROUTES
  // ============================================

  const renderPage = () => {
    switch (currentPath) {
      case '/':
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/courses':
        return <CourseCatalog onNavigate={handleNavigate} />;

      case '/my-grades':
        return <MyGrades />;

      case '/curriculum':
        return (
          <CourseManager
            onNavigate={handleNavigate}
          />
        );

      case '/grade-management':
        return <GradeManagement />;

      case '/remediation':
        return <RemediationQueue />;

      case '/invitations':
        return <Invitations />;

      case '/users':
        return <UserManagement />;

      case '/cohorts':
        return <CohortManagement />;

      case '/audit':
        return <AuditLogs />;

      case '/builder':
        return (
          <ModuleBuilder
            courseId={routeContext.courseId}
            moduleId={routeContext.moduleId}
            userUid={user.uid}
            onBack={() => setCurrentPath('/course-editor')}
          />
        );

      default:
        return <Dashboard user={user} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        user={user}
        currentPath={currentPath}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      <main className="flex-1 ml-[260px]">
        {renderPage()}
      </main>
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
