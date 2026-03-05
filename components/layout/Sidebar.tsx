import React from 'react';
import { User, UserRoleType } from '../../functions/src/types';
import {
  BookOpen,
  LayoutDashboard,
  ShieldCheck,
  Users,
  LogOut,
  Layers,
  GraduationCap,
  ClipboardCheck,
  UserPlus,
  AlertTriangle,
  UsersRound
} from 'lucide-react';
import { cn } from '../../utils';

interface SidebarProps {
  user: User | null;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, currentPath, onNavigate, onLogout }) => {
  if (!user) return null;

  const NavItem = ({ path, icon: Icon, label }: { path: string, icon: any, label: string }) => {
    const isActive = currentPath === path;
    return (
      <button
        onClick={() => onNavigate(path)}
        className={cn(
          "flex w-full items-center gap-3 py-2.5 px-4 rounded-md text-sm transition-colors mx-2",
          isActive
            ? "bg-white/12 font-semibold border-l-3 border-primary-400"
            : "hover:bg-white/8 font-medium"
        )}
      >
        <Icon
          className="h-5 w-5 shrink-0"
          strokeWidth={1.75}
          style={{ opacity: isActive ? 1 : 0.7 }}
        />
        <span className="text-white">{label}</span>
      </button>
    );
  };

  return (
    <div className="w-[260px] flex flex-col bg-primary-900 h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="pt-5 pb-6 px-5 border-b border-white/12 flex items-center justify-center">
        <img
          src="/images/HHCA_LMS_LogoPNG_.png"
          alt="Harmony Health Care Assistant"
          className="max-h-[40px] w-auto"
        />
      </div>

      {/* Navigation */}
      <div className="flex-1 flex flex-col gap-1 py-4 overflow-y-auto">
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.08em] px-6 pt-6 pb-2">Platform</p>
          <NavItem path="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem path="/courses" icon={BookOpen} label="Course Catalog" />
          <NavItem path="/my-grades" icon={GraduationCap} label="My Grades" />
        </div>

        {(user.role === 'admin' || user.role === 'instructor') && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.08em] px-6 pt-6 pb-2">Management</p>
            <NavItem path="/curriculum" icon={Layers} label="Course Manager" />
            <NavItem path="/grade-management" icon={ClipboardCheck} label="Grade Center" />
            <NavItem path="/remediation" icon={AlertTriangle} label="Remediation" />
            <NavItem path="/cohorts" icon={UsersRound} label="Cohorts" />
            <NavItem path="/invitations" icon={UserPlus} label="Invite Staff" />
            <NavItem path="/users" icon={Users} label="Staff Directory" />
            <NavItem path="/audit" icon={ShieldCheck} label="Audit Trail" />
          </div>
        )}
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-white/12">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-primary-700 flex items-center justify-center text-white font-bold text-sm">
            {user.displayName.charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
            <p className="text-xs text-white/50 truncate capitalize font-semibold">{user.role}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 text-white/50 hover:text-white text-sm px-1 transition-colors"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          Sign Out
        </button>
      </div>
    </div>
  );
};
