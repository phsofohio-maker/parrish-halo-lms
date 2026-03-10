/**
 * Seed User Definitions
 *
 * Staff accounts for Parrish Healthcare's Harmony LMS.
 * Used by seedUsers.ts to create Firebase Auth + Firestore profiles.
 */

export interface SeedUser {
  email: string;
  password: string;
  displayName: string;
  role: 'admin' | 'instructor' | 'staff';
  department: string;
  jobTitle: string;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export const SEED_USERS: SeedUser[] = [
  // ── Real Admin — Miara Carpenter ──────────────
  {
    email: 'miarac@parrishhealthsystems.org',
    password: 'ParrishAdmin2026!',
    displayName: 'Miara Carpenter',
    role: 'admin',
    department: 'Clinical Education',
    jobTitle: 'Administrator',
  },

  // ── Test Admins (2) ──────────────────────────────
  {
    email: 'sarah.chen@parrish.health',
    password: 'ParrishAdmin2026!',
    displayName: 'Sarah Chen',
    role: 'admin',
    department: 'Information Technology',
    jobTitle: 'IT Administrator',
  },
  {
    email: 'marcus.wright@parrish.health',
    password: 'ParrishAdmin2026!',
    displayName: 'Marcus Wright',
    role: 'admin',
    department: 'Clinical Education',
    jobTitle: 'Education Director',
  },

  // ── Instructors (3) ─────────────────────────────
  {
    email: 'dr.patricia.gomez@parrish.health',
    password: 'ParrishInstr2026!',
    displayName: 'Dr. Patricia Gomez',
    role: 'instructor',
    department: 'Hospice Care',
    jobTitle: 'Medical Director',
  },
  {
    email: 'james.okonkwo@parrish.health',
    password: 'ParrishInstr2026!',
    displayName: 'James Okonkwo',
    role: 'instructor',
    department: 'Clinical Education',
    jobTitle: 'Clinical Educator',
  },
  {
    email: 'linda.tran@parrish.health',
    password: 'ParrishInstr2026!',
    displayName: 'Linda Tran',
    role: 'instructor',
    department: 'Compliance',
    jobTitle: 'Compliance Officer',
  },

  // ── Staff (7) ───────────────────────────────────
  {
    email: 'maria.santos@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'Maria Santos, RN',
    role: 'staff',
    department: 'Hospice Care',
    jobTitle: 'RN',
    licenseNumber: 'RN-FL-2024-48291',
    licenseExpiry: '2026-08-15',
  },
  {
    email: 'david.kim@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'David Kim, CNA',
    role: 'staff',
    department: 'Hospice Care',
    jobTitle: 'CNA',
    licenseNumber: 'CNA-FL-2023-73125',
    licenseExpiry: '2026-03-15',
  },
  {
    email: 'ashley.brooks@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'Ashley Brooks, LPN',
    role: 'staff',
    department: 'Hospice Care',
    jobTitle: 'LPN',
    licenseNumber: 'LPN-FL-2022-50814',
    licenseExpiry: '2025-12-01',
  },
  {
    email: 'robert.jackson@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'Robert Jackson, RN',
    role: 'staff',
    department: 'Home Health',
    jobTitle: 'RN',
    licenseNumber: 'RN-FL-2024-61047',
    licenseExpiry: '2027-01-20',
  },
  {
    email: 'jennifer.patel@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'Jennifer Patel, MSW',
    role: 'staff',
    department: 'Social Services',
    jobTitle: 'MSW',
  },
  {
    email: 'thomas.nguyen@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'Thomas Nguyen, RN',
    role: 'staff',
    department: 'Hospice Care',
    jobTitle: 'RN',
    licenseNumber: 'RN-FL-2023-89412',
    licenseExpiry: '2026-03-01',
  },
  {
    email: 'rachel.martinez@parrish.health',
    password: 'ParrishStaff2026!',
    displayName: 'Rachel Martinez, CHPNA',
    role: 'staff',
    department: 'Hospice Care',
    jobTitle: 'CHPNA',
    licenseNumber: 'CHPNA-FL-2024-33291',
    licenseExpiry: '2026-11-30',
  },
];
