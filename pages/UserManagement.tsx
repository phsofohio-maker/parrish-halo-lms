/**
 * User Management Page - Firestore Integration
 *
 * Converted from template's MOCK_USERS/props version to use Firestore.
 * Fetches users from Firestore 'users' collection, enrollments from
 * 'enrollments' collection, and courses via useCourses hook.
 *
 * @module pages/UserManagement
 */
import React, { useState, useEffect, useCallback } from 'react';
import { User, Enrollment, Course } from '../functions/src/types';
import { Users, Search, MoreVertical, ShieldCheck, Mail, PlusCircle, Book, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { useCourses } from '../hooks/useCourses';
import { createEnrollment, getUserEnrollments } from '../services/enrollmentService';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { courses } = useCourses();
  const [users, setUsers] = useState<User[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollModalUserId, setEnrollModalUserId] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all users from Firestore
      const usersSnap = await getDocs(
        query(collection(db, 'users'), orderBy('displayName'))
      );
      const fetchedUsers: User[] = usersSnap.docs.map(doc => ({
        uid: doc.data().uid || doc.id,
        displayName: doc.data().displayName || 'Unknown',
        email: doc.data().email || '',
        role: doc.data().role || 'staff',
        department: doc.data().department,
        jobTitle: doc.data().jobTitle,
        licenseNumber: doc.data().licenseNumber,
        licenseExpiry: doc.data().licenseExpiry,
      }));
      setUsers(fetchedUsers);

      // Fetch all enrollments
      const enrollmentsSnap = await getDocs(collection(db, 'enrollments'));
      const fetchedEnrollments: Enrollment[] = enrollmentsSnap.docs.map(doc => ({
        id: doc.id,
        userId: doc.data().userId,
        courseId: doc.data().courseId,
        progress: doc.data().progress ?? 0,
        status: doc.data().status ?? 'not_started',
        enrolledAt: doc.data().enrolledAt?.toDate?.()?.toISOString() || '',
        lastAccessedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || '',
      }));
      setEnrollments(fetchedEnrollments);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      setError(msg);
      console.error('UserManagement fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEnroll = async (courseId: string, userId: string) => {
    if (!currentUser || isEnrolling) return;
    setIsEnrolling(true);

    try {
      await createEnrollment(userId, courseId, currentUser.uid, currentUser.displayName);
      setEnrollModalUserId(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to enroll user:', err);
    } finally {
      setIsEnrolling(false);
    }
  };

  const filteredUsers = users.filter(u =>
    searchFilter === '' ||
    u.displayName.toLowerCase().includes(searchFilter.toLowerCase()) ||
    u.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (u.department || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  const renderEnrollModal = (userId: string) => {
    const targetUser = users.find(u => u.uid === userId);
    const userEnrollmentIds = enrollments.filter(e => e.userId === userId).map(e => e.courseId);
    const availableCourses = courses.filter(c => !userEnrollmentIds.includes(c.id));

    return (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 animate-in zoom-in duration-200">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Enroll Staff Member</h3>
          <p className="text-sm text-gray-500 mb-6">Select a course to assign to {targetUser?.displayName}.</p>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {availableCourses.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-4">All available courses are already assigned.</p>
            ) : (
                availableCourses.map(course => (
                    <button
                        key={course.id}
                        onClick={() => handleEnroll(course.id, userId)}
                        disabled={isEnrolling}
                        className="w-full p-3 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-all text-left flex items-center gap-3 disabled:opacity-50"
                    >
                        <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                            <Book className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">{course.title}</p>
                            <p className="text-[10px] text-gray-500">{course.category} - {course.ceCredits} CE Credits</p>
                        </div>
                    </button>
                ))
            )}
          </div>

          <div className="flex gap-3 mt-8">
            <Button variant="outline" className="flex-1" onClick={() => setEnrollModalUserId(null)} disabled={isEnrolling}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {enrollModalUserId && renderEnrollModal(enrollModalUserId)}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-primary-600" />
            Staff Compliance Directory
          </h1>
          <p className="text-gray-500 mt-1">Manage user roles and track organizational training requirements.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button>+ Add Staff Member</Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by name, email or department..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-700">Staff Member</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Role</th>
              <th className="px-6 py-4 font-semibold text-gray-700">License</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Compliance</th>
              <th className="px-6 py-4 font-semibold text-gray-700">Enrollments</th>
              <th className="px-6 py-4 font-semibold text-gray-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Loading staff directory...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                  {searchFilter ? 'No staff members match your search.' : 'No users found in the system.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => {
                const userEnrollments = enrollments.filter(e => e.userId === user.uid);
                const compliance = user.role === 'admin' ? 100 : userEnrollments.length > 0
                  ? (userEnrollments.filter(e => e.status === 'completed').length / userEnrollments.length) * 100
                  : 0;

                return (
                  <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                          {user.displayName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{user.displayName}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                          {user.jobTitle && (
                            <div className="text-xs text-gray-400 mt-0.5">{user.jobTitle} &middot; {user.department || 'No dept'}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                        user.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        if (!user.licenseExpiry) {
                          return <span className="text-xs text-gray-400">N/A</span>;
                        }
                        const expiry = new Date(user.licenseExpiry);
                        const now = new Date();
                        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        const isExpired = daysLeft < 0;
                        const isExpiringSoon = !isExpired && daysLeft <= 30;

                        return (
                          <div>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                              isExpired ? "bg-red-100 text-red-700" :
                              isExpiringSoon ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            )}>
                              {isExpired ? 'Expired' : isExpiringSoon ? `${daysLeft}d left` : 'Valid'}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              compliance >= 90 ? "bg-green-500" : compliance >= 70 ? "bg-amber-500" : "bg-red-500"
                            )}
                            style={{ width: `${compliance}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{Math.round(compliance)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="h-4 w-4 text-gray-300" />
                        {userEnrollments.length} Active
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setEnrollModalUserId(user.uid)}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Enroll
                        </Button>
                        <button className="p-1 hover:bg-gray-100 rounded">
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
