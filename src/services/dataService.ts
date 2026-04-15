/**
 * dataService.ts
 *
 * Production-grade async data service backed by Supabase.
 * All methods return Promises. Business logic (score calculation, fraud detection)
 * runs client-side after fetching data from Supabase.
 *
 * Auth: login flow uses get_email_by_employee_id() RPC to resolve employee
 *       ID → email, then delegates to supabase.auth.signInWithPassword().
 * User creation: delegated to the create-employee Edge Function so the
 *                admin's session is never replaced.
 */

import { supabase, FUNCTIONS_URL } from './supabase';
import { calculateDistance } from '../lib/utils';
import type {
  User,
  Company,
  Shift,
  AttendanceRecord,
  Holiday,
  SystemRules,
  ShiftChangeLog,
  PerformanceScore,
  FraudAlert,
  StoreVisit,
} from '../types';

// ── Company context ────────────────────────────────────────────
// Set once after login/signup; scopes every DB query automatically.
let _companyId: string | null = null;

function requireCompany(): string {
  if (!_companyId) throw new Error('Company context not initialised — login first.');
  return _companyId;
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  const suffix = Math.random().toString(36).slice(2, 5);
  return `${base}-${suffix}`;
}

function mapCompany(row: Record<string, unknown>): Company {
  return {
    id:        row.id        as string,
    name:      row.name      as string,
    slug:      row.slug      as string,
    plan:      row.plan      as 'free' | 'paid',
    isActive:  row.is_active as boolean,
    createdAt: row.created_at as string,
  };
}

// ──────────────────────────────────────────────
// DB row → domain type mappers
// ──────────────────────────────────────────────

function mapProfile(row: Record<string, unknown>): User {
  return {
    id:        row.id         as string,
    companyId: (row.company_id as string) ?? '',
    code:      row.code       as string,
    employeeId: row.employee_id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as 'admin' | 'employee',
    department: row.department as string,
    shiftId: row.shift_id as string,
    fieldTrackingEnabled: row.field_tracking_enabled as boolean,
    needsAttention: row.needs_attention as boolean,
    isHighRisk: row.is_high_risk as boolean,
    overrides: {
      lateThresholdMinutes: (row.late_threshold_minutes as number) ?? undefined,
      minHoursForFullDay: (row.min_hours_for_full_day as number) ?? undefined,
    },
  };
}

function mapShift(row: Record<string, unknown>): Shift {
  return {
    id: row.id as string,
    name: row.name as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    minHoursForFullDay: row.min_hours_for_full_day as number,
    minHoursForHalfDay: row.min_hours_for_half_day as number,
    isFlexible: row.is_flexible as boolean,
  };
}

function mapAttendance(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    date: row.date as string,
    checkIn: row.check_in as string | undefined,
    checkOut: row.check_out as string | undefined,
    status: row.status as AttendanceRecord['status'],
    location: row.location as string | undefined,
    totalHours: row.total_hours as number | undefined,
    shiftId: row.shift_id as string | undefined,
    photoProof: row.photo_proof as string | undefined,
    isManual: row.is_manual as boolean,
    notes: row.notes as string | undefined,
    locked: row.locked as boolean,
  };
}

function mapStoreVisit(row: Record<string, unknown>): StoreVisit {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    storeId: row.store_id as string,
    storeName: row.store_name as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    distanceFromStore: row.distance_from_store as number,
    isSuspicious: row.is_suspicious as boolean,
    checkInTime: row.check_in_time as string,
    checkOutTime: row.check_out_time as string | undefined,
    duration: row.duration as number | undefined,
    date: row.date as string,
    path: (row.path as { lat: number; lng: number; timestamp: string }[]) ?? [],
  };
}

function mapHoliday(row: Record<string, unknown>): Holiday {
  return {
    id: row.id as string,
    date: row.date as string,
    name: row.name as string,
    type: row.type as Holiday['type'],
  };
}

function mapFraudAlert(row: Record<string, unknown>): FraudAlert {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    type: row.type as FraudAlert['type'],
    severity: row.severity as FraudAlert['severity'],
    date: row.date as string,
    details: row.details as string,
    timestamp: row.created_at as string,
  };
}

// ──────────────────────────────────────────────
// Default rules fallback
// ──────────────────────────────────────────────

const DEFAULT_RULES: SystemRules = {
  policy: {
    lateThresholdMinutes: 15,
    graceTimeMinutes: 5,
    minHoursForFullDay: 8,
    minHoursForHalfDay: 4,
    absentAfterMinutes: 60,
  },
  settings: {
    photoProofRequired: false,
    companyName: 'Executive Workspace',
    timezone: 'UTC+5:30',
    allowManualEdits: true,
    autoCheckoutHours: 8,
    storeRadiusOverrides: {},
  },
};

// ──────────────────────────────────────────────
// dataService
// ──────────────────────────────────────────────

export const dataService = {
  // ── AUTH ──────────────────────────────────────────────────────────────

  /**
   * Sign in with employee ID (or email) + password.
   * Looks up the user's email via RPC, then delegates to Supabase Auth.
   * Returns the User profile on success, throws on failure.
   */
  async login(idOrEmail: string, password: string, companySlug?: string): Promise<User> {
    let email = idOrEmail;

    // If the input doesn't look like an email, look it up by employee_id / code
    if (!idOrEmail.includes('@')) {
      const { data: resolvedEmail, error: rpcError } = await supabase.rpc(
        'get_email_by_employee_id',
        { emp_id: idOrEmail, p_company_slug: companySlug ?? null }
      );
      if (rpcError || !resolvedEmail) {
        throw new Error('Employee ID not found. Please check your ID and company code.');
      }
      email = resolvedEmail as string;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      const msg = authError.message;
      // Surface email-confirmation errors with a special prefix so the UI can
      // show a "Resend confirmation" button instead of a generic error.
      if (
        msg.toLowerCase().includes('email not confirmed') ||
        msg.toLowerCase().includes('email_not_confirmed') ||
        msg.toLowerCase().includes('not confirmed')
      ) {
        throw new Error(`EMAIL_NOT_CONFIRMED:${email}`);
      }
      throw new Error(msg);
    }

    const profile = await this.getCurrentUserProfile();
    if (!profile) throw new Error('Profile not found after login. Contact your administrator.');
    return profile;
  },

  async logout(): Promise<void> {
    _companyId = null;
    await supabase.auth.signOut();
  },

  async resendConfirmationEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw new Error(error.message);
  },

  async getCurrentUserProfile(): Promise<User | null> {
    // Use getSession (local cache) instead of getUser (network call) so auth
    // context is always available immediately after signup / login.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;

    console.log('[getCurrentUserProfile] querying id =', session.user.id);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('[getCurrentUserProfile] query error:', error.message);
      return null;
    }
    if (!data) {
      console.warn('[getCurrentUserProfile] No profile row found for id =', session.user.id);

      // ── Auto-recovery ──────────────────────────────────────────────────
      // If the signUp flow stored metadata (name, employee_id, company_id,
      // role) on the auth user, we can recreate the missing profile row here.
      // This handles cases where the auth user was created but the profile
      // INSERT failed mid-flow.
      const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.company_id && meta.employee_id && session.user.email) {
        console.log('[getCurrentUserProfile] Attempting profile auto-recovery from user metadata');
        try {
          const { data: recovered, error: recErr } = await supabase
            .from('profiles')
            .insert({
              id:                     session.user.id,
              company_id:             meta.company_id as string,
              name:                   (meta.name as string) || session.user.email,
              email:                  session.user.email,
              employee_id:            meta.employee_id as string,
              code:                   'ADMIN001',
              role:                   (meta.role as string) || 'admin',
              department:             'Management',
              shift_id:               null,
              field_tracking_enabled: false,
              needs_attention:        false,
              is_high_risk:           false,
            })
            .select()
            .maybeSingle();

          if (recErr) {
            console.error('[getCurrentUserProfile] Auto-recovery failed:', recErr.message);
            return null;
          }
          if (recovered) {
            console.log('[getCurrentUserProfile] Profile recovered successfully');
            const profile = mapProfile(recovered as Record<string, unknown>);
            if (profile.companyId) _companyId = profile.companyId;
            return profile;
          }
        } catch (recoverErr) {
          console.error('[getCurrentUserProfile] Auto-recovery error:', recoverErr);
        }
      }

      return null;
    }

    const profile = mapProfile(data as Record<string, unknown>);
    // Set company context for all subsequent queries in this session
    if (profile.companyId) _companyId = profile.companyId;
    return profile;
  },

  /**
   * Fetch a company by id. Does NOT require company context to be set.
   */
  async getCompany(id: string): Promise<Company> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new Error('Company not found.');
    return mapCompany(data as Record<string, unknown>);
  },

  /**
   * Full company signup flow:
   *  1. Create Supabase auth user (requires email confirmation OFF in Auth settings)
   *  2. Create company record
   *  3. Create admin profile linked to company
   *  4. Seed a default shift and rules for the company
   * Returns the new company on success.
   */
  async signUpNewCompany(opts: {
    companyName: string;
    adminName:   string;
    email:       string;
    password:    string;
    employeeId:  string;
  }): Promise<Company> {
    // Helper: reject if a step takes longer than `ms` milliseconds.
    // Wraps with Promise.resolve() so PostgREST thenables are accepted too.
    function step<T>(label: string, thenable: PromiseLike<T>, ms = 8000): Promise<T> {
      return Promise.race([
        Promise.resolve(thenable),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — check network / Supabase project`)), ms)
        ),
      ]);
    }

    // ── STEP 1: create auth user ──────────────────────────────────────────
    console.log('STEP 1: signup start', { email: opts.email });
    let authData: Awaited<ReturnType<typeof supabase.auth.signUp>>['data'];
    try {
      const result = await step(
        'STEP 1 auth.signUp',
        supabase.auth.signUp({
          email: opts.email,
          password: opts.password,
          options: {
            // Store profile fields in user metadata so the profile can be
            // auto-recovered if the DB insert fails mid-flow.
            data: {
              name:        opts.adminName,
              employee_id: opts.employeeId,
              role:        'admin',
            },
          },
        })
      );
      if (result.error) throw new Error(result.error.message);
      authData = result.data;
    } catch (err) {
      console.error('STEP 1 FAILED:', err);
      throw err;
    }

    if (!authData?.user) throw new Error('Sign-up failed — no user returned from Supabase.');
    if (!authData.session) {
      throw new Error(
        'Email confirmation is ON. Disable it: Supabase Dashboard → Authentication → Providers → Email → uncheck "Confirm email".'
      );
    }

    const authId = authData.user.id;
    console.log('STEP 2: auth user created', { authId });

    // ── STEP 2: create company ────────────────────────────────────────────
    console.log('STEP 3: creating company', { name: opts.companyName });
    let company: Company;
    try {
      const slug = slugify(opts.companyName);
      const { data: companyRow, error: companyError } = await step(
        'STEP 3 companies.insert',
        supabase
          .from('companies')
          .insert({ name: opts.companyName, slug, plan: 'free', is_active: true })
          .select()
          .single()
      );
      if (companyError) throw new Error('Company insert failed: ' + companyError.message + ' (code: ' + companyError.code + ')');
      company = mapCompany(companyRow as Record<string, unknown>);
      _companyId = company.id;
      console.log('STEP 3: company created', company);
      // Attach company_id to auth user metadata so profile auto-recovery works
      // if the profile INSERT below fails for any reason.
      supabase.auth.updateUser({ data: { company_id: company.id } }).catch(() => {});
    } catch (err) {
      console.error('STEP 3 FAILED:', err);
      throw err;
    }

    // ── STEP 3: create admin profile ──────────────────────────────────────
    console.log('STEP 4: creating profile', { authId, companyId: company.id });
    try {
      const { data: profileData, error: profileError } = await step(
        'STEP 4 profiles.insert',
        supabase
          .from('profiles')
          .insert({
            id:                     authId,
            company_id:             company.id,
            name:                   opts.adminName,
            email:                  opts.email,
            employee_id:            opts.employeeId,
            code:                   'ADMIN001',
            role:                   'admin',
            department:             'Management',
            shift_id:               null,
            field_tracking_enabled: false,
            needs_attention:        false,
            is_high_risk:           false,
          })
          .select()
          .single()
      );
      if (profileError) throw new Error('Profile insert failed: ' + profileError.message + ' (code: ' + profileError.code + ')');
      console.log('STEP 5: profile created', profileData);
      console.log('PROFILE CREATED', profileData);
    } catch (err) {
      console.error('STEP 4 FAILED:', err);
      throw err;
    }

    // ── STEP 4: seed default shift ────────────────────────────────────────
    try {
      const { data: shiftRow, error: shiftError } = await step(
        'STEP 5 shifts.insert',
        supabase
          .from('shifts')
          .insert({
            company_id:             company.id,
            name:                   'Standard',
            start_time:             '09:00',
            end_time:               '18:00',
            min_hours_for_full_day: 8,
            min_hours_for_half_day: 4,
            is_flexible:            false,
          })
          .select()
          .single()
      );
      if (shiftError) console.warn('Default shift insert failed (non-fatal):', shiftError.message);
      if (shiftRow) {
        await supabase.from('profiles').update({ shift_id: (shiftRow as Record<string,unknown>).id }).eq('id', authId);
      }
    } catch (err) {
      console.warn('STEP 5 (shift seed) failed — non-fatal, continuing:', err);
    }

    // ── STEP 5: seed default rules ────────────────────────────────────────
    try {
      const { error: rulesError } = await step(
        'STEP 6 rules.insert',
        supabase.from('rules').insert({
          company_id: company.id,
          policy:     DEFAULT_RULES.policy,
          settings:   DEFAULT_RULES.settings,
        })
      );
      if (rulesError) console.warn('Default rules insert failed (non-fatal):', rulesError.message);
    } catch (err) {
      console.warn('STEP 6 (rules seed) failed — non-fatal, continuing:', err);
    }

    return company;
  },

  // ── USERS ─────────────────────────────────────────────────────────────

  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', requireCompany())
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapProfile(row as Record<string, unknown>));
  },

  /**
   * Create or update an employee.
   * Creation is delegated to the Edge Function so admin's session is preserved.
   */
  async saveUser(
    user: User & { password?: string },
    adminId: string,
    oldShiftId?: string
  ): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const payload = {
      email: user.email,
      password: user.password,
      name: user.name,
      employeeId: user.employeeId,
      code: user.code,
      department: user.department,
      role: user.role,
      shiftId: user.shiftId,
      fieldTrackingEnabled: user.fieldTrackingEnabled ?? false,
      lateThresholdMinutes: user.overrides?.lateThresholdMinutes ?? null,
      minHoursForFullDay: user.overrides?.minHoursForFullDay ?? null,
      existingAuthId: user.id !== `u-${Date.now()}` ? user.id : undefined,
      oldShiftId: oldShiftId !== user.shiftId ? oldShiftId : undefined,
    };

    const res = await fetch(`${FUNCTIONS_URL}/create-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? 'Failed to save employee');
  },

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Employee CRUD (explicit named API) ───────────────────────────────

  /** Return all profiles (both admins and employees). */
  async fetchEmployees(): Promise<User[]> {
    return this.getUsers();
  },

  /**
   * Create a brand-new employee + Supabase Auth account.
   * Password is required. Delegates to the Edge Function so the
   * calling admin's session is never replaced.
   */
  async createEmployee(
    data: Omit<User, 'id'> & { password: string }
  ): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${FUNCTIONS_URL}/create-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email:                data.email,
        password:             data.password,
        name:                 data.name,
        employeeId:           data.employeeId,
        code:                 data.code,
        department:           data.department,
        role:                 data.role,
        shiftId:              data.shiftId,
        fieldTrackingEnabled: data.fieldTrackingEnabled ?? false,
        lateThresholdMinutes: data.overrides?.lateThresholdMinutes ?? null,
        minHoursForFullDay:   data.overrides?.minHoursForFullDay ?? null,
        companyId:            requireCompany(),
        // No existingAuthId → Edge Function creates a new auth user
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? 'Failed to create employee');
  },

  /**
   * Update an existing employee's profile and (optionally) their password.
   * Delegates to the Edge Function so admin's session is preserved.
   */
  async updateEmployee(
    data: User & { password?: string },
    oldShiftId?: string
  ): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(`${FUNCTIONS_URL}/create-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email:                data.email,
        password:             data.password || undefined, // omit if unchanged
        name:                 data.name,
        employeeId:           data.employeeId,
        code:                 data.code,
        department:           data.department,
        role:                 data.role,
        shiftId:              data.shiftId,
        fieldTrackingEnabled: data.fieldTrackingEnabled ?? false,
        lateThresholdMinutes: data.overrides?.lateThresholdMinutes ?? null,
        minHoursForFullDay:   data.overrides?.minHoursForFullDay ?? null,
        existingAuthId:       data.id,   // provided → Edge Function updates existing
        oldShiftId:           oldShiftId !== data.shiftId ? oldShiftId : undefined,
        companyId:            requireCompany(),
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? 'Failed to update employee');
  },

  /** Delete employee profile (and cascade-delete their attendance, visits etc. via DB FK). */
  async deleteEmployee(id: string): Promise<void> {
    return this.deleteUser(id);
  },

  async updateUserFlags(
    userId: string,
    flags: { needsAttention?: boolean; isHighRisk?: boolean }
  ): Promise<void> {
    const update: Record<string, boolean> = {};
    if (flags.needsAttention !== undefined) update['needs_attention'] = flags.needsAttention;
    if (flags.isHighRisk !== undefined) update['is_high_risk'] = flags.isHighRisk;
    if (Object.keys(update).length === 0) return;

    const { error } = await supabase.from('profiles').update(update).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  // ── SHIFTS ────────────────────────────────────────────────────────────

  async getShifts(): Promise<Shift[]> {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('company_id', requireCompany())
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapShift(row as Record<string, unknown>));
  },

  async saveShift(shift: Shift): Promise<void> {
    const { error } = await supabase.from('shifts').upsert({
      id:                     shift.id,
      company_id:             requireCompany(),
      name:                   shift.name,
      start_time:             shift.startTime,
      end_time:               shift.endTime,
      min_hours_for_full_day: shift.minHoursForFullDay,
      min_hours_for_half_day: shift.minHoursForHalfDay,
      is_flexible:            shift.isFlexible ?? false,
    });
    if (error) throw new Error(error.message);
  },

  // ── SHIFT LOGS ────────────────────────────────────────────────────────

  async getShiftLogs(): Promise<ShiftChangeLog[]> {
    const { data, error } = await supabase
      .from('shift_change_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => ({
      id: row.id as string,
      userId: row.user_id as string,
      oldShiftId: row.old_shift_id as string,
      newShiftId: row.new_shift_id as string,
      changedBy: row.changed_by as string,
      timestamp: row.created_at as string,
    }));
  },

  // ── HOLIDAYS ──────────────────────────────────────────────────────────

  async getHolidays(): Promise<Holiday[]> {
    const { data, error } = await supabase
      .from('holidays')
      .select('*')
      .eq('company_id', requireCompany())
      .order('date');
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapHoliday(row as Record<string, unknown>));
  },

  async saveHoliday(holiday: Holiday): Promise<void> {
    const { error } = await supabase.from('holidays').upsert({
      id:         holiday.id,
      company_id: requireCompany(),
      date:       holiday.date,
      name:       holiday.name,
      type:       holiday.type,
    });
    if (error) throw new Error(error.message);
  },

  async deleteHoliday(id: string): Promise<void> {
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async isHoliday(date: string): Promise<Holiday | undefined> {
    const { data } = await supabase
      .from('holidays')
      .select('*')
      .eq('date', date)
      .maybeSingle();
    return data ? mapHoliday(data as Record<string, unknown>) : undefined;
  },

  // ── RULES ─────────────────────────────────────────────────────────────

  async getRules(): Promise<SystemRules> {
    const { data, error } = await supabase
      .from('rules')
      .select('*')
      .eq('company_id', requireCompany())
      .maybeSingle();
    if (error || !data) return DEFAULT_RULES;
    try {
      const rules = {
        policy: { ...DEFAULT_RULES.policy, ...(data.policy as SystemRules['policy']) },
        settings: { ...DEFAULT_RULES.settings, ...(data.settings as SystemRules['settings']) },
      };
      if (!rules.policy || !rules.settings) return DEFAULT_RULES;
      return rules;
    } catch {
      return DEFAULT_RULES;
    }
  },

  async saveRules(rules: SystemRules): Promise<void> {
    const { error } = await supabase
      .from('rules')
      .upsert(
        { company_id: requireCompany(), policy: rules.policy, settings: rules.settings },
        { onConflict: 'company_id' }
      );
    if (error) throw new Error(error.message);
  },

  // ── ATTENDANCE ────────────────────────────────────────────────────────

  async getAttendance(filters?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<AttendanceRecord[]> {
    let query = supabase.from('attendance').select('*');

    if (filters?.userId) query = query.eq('user_id', filters.userId);
    if (filters?.startDate) query = query.gte('date', filters.startDate);
    if (filters?.endDate) query = query.lte('date', filters.endDate);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapAttendance(row as Record<string, unknown>));
  },

  async getAttendanceForUser(userId: string): Promise<AttendanceRecord[]> {
    return this.getAttendance({ userId });
  },

  async getAttendanceForDate(date: string): Promise<AttendanceRecord[]> {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('company_id', requireCompany())
      .eq('date', date);
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapAttendance(row as Record<string, unknown>));
  },

  async getRecord(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();
    return data ? mapAttendance(data as Record<string, unknown>) : undefined;
  },

  async saveAttendance(record: AttendanceRecord, isAdmin = false): Promise<void> {
    // If not admin, check that the record isn't locked
    if (!isAdmin) {
      const existing = await this.getRecord(record.userId, record.date);
      if (existing?.locked) {
        console.warn('Cannot update locked record without admin privileges');
        return;
      }
    }

    // Only include `id` when it looks like a real UUID (36-char hex string).
    // For new records, omitting it lets the DB auto-generate a UUID.
    const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      record.id ?? ''
    );

    const payload: Record<string, unknown> = {
      user_id:     record.userId,
      date:        record.date,
      check_in:    record.checkIn    ?? null,
      check_out:   record.checkOut   ?? null,
      status:      record.status,
      location:    record.location   ?? null,
      total_hours: record.totalHours ?? null,
      shift_id:    record.shiftId    ?? null,
      photo_proof: record.photoProof ?? null,
      is_manual:   record.isManual   ?? false,
      notes:       record.notes      ?? null,
      locked:      record.locked     ?? false,
    };
    if (isRealUUID) payload.id = record.id;

    const { error } = await supabase
      .from('attendance')
      .upsert(payload, { onConflict: 'user_id,date' });
    if (error) throw new Error(error.message);
  },

  async updateAttendanceManual(record: AttendanceRecord): Promise<void> {
    await this.saveAttendance({ ...record, isManual: true, locked: true }, true);
  },

  // ── Explicit attendance CRUD ─────────────────────────────────────────

  /**
   * Fetch a single attendance record by employee + date.
   * Returns undefined if no record exists yet.
   */
  async fetchAttendance(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    return this.getRecord(userId, date);
  },

  /**
   * INSERT a new attendance record. The DB generates the UUID.
   * Throws if a record for this user+date already exists.
   */
  async createAttendance(
    record: Omit<AttendanceRecord, 'id'>
  ): Promise<AttendanceRecord> {
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        user_id:     record.userId,
        company_id:  requireCompany(),
        date:        record.date,
        check_in:    record.checkIn    ?? null,
        check_out:   record.checkOut   ?? null,
        status:      record.status,
        location:    record.location   ?? null,
        total_hours: record.totalHours ?? null,
        shift_id:    record.shiftId    ?? null,
        photo_proof: record.photoProof ?? null,
        is_manual:   record.isManual   ?? false,
        notes:       record.notes      ?? null,
        locked:      record.locked     ?? false,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapAttendance(data as Record<string, unknown>);
  },

  /**
   * UPDATE an existing attendance record (identified by user_id + date).
   * Throws if no matching record is found.
   */
  async updateAttendance(record: AttendanceRecord): Promise<void> {
    const { error } = await supabase
      .from('attendance')
      .update({
        check_in:    record.checkIn    ?? null,
        check_out:   record.checkOut   ?? null,
        status:      record.status,
        location:    record.location   ?? null,
        total_hours: record.totalHours ?? null,
        shift_id:    record.shiftId    ?? null,
        photo_proof: record.photoProof ?? null,
        is_manual:   record.isManual   ?? false,
        notes:       record.notes      ?? null,
        locked:      record.locked     ?? false,
      })
      .eq('user_id', record.userId)
      .eq('date',    record.date);

    if (error) throw new Error(error.message);
  },

  // ── STORE VISITS ──────────────────────────────────────────────────────

  async getStoreVisits(filters?: { userId?: string; date?: string }): Promise<StoreVisit[]> {
    let query = supabase.from('store_visits').select('*');

    if (filters?.userId) query = query.eq('employee_id', filters.userId);
    if (filters?.date) query = query.eq('date', filters.date);

    const { data, error } = await query.order('check_in_time', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapStoreVisit(row as Record<string, unknown>));
  },

  async saveStoreVisit(visit: StoreVisit): Promise<void> {
    const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      visit.id ?? ''
    );

    const payload: Record<string, unknown> = {
      employee_id:         visit.employeeId,
      store_id:            visit.storeId,
      store_name:          visit.storeName,
      latitude:            visit.latitude,
      longitude:           visit.longitude,
      distance_from_store: visit.distanceFromStore,
      is_suspicious:       visit.isSuspicious ?? false,
      check_in_time:       visit.checkInTime,
      check_out_time:      visit.checkOutTime ?? null,
      duration:            visit.duration     ?? null,
      date:                visit.date,
      path:                visit.path         ?? [],
    };
    if (isRealUUID) payload.id = visit.id;

    const { error } = await supabase.from('store_visits').upsert(payload);
    if (error) throw new Error(error.message);
  },

  async getActiveStoreVisits(): Promise<StoreVisit[]> {
    const { data, error } = await supabase
      .from('store_visits')
      .select('*')
      .eq('company_id', requireCompany())
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapStoreVisit(row as Record<string, unknown>));
  },

  // ── Explicit store-visit CRUD ─────────────────────────────────────────

  /**
   * Return all store visits for a specific user on today's date.
   */
  async fetchTodayStoreVisits(userId: string): Promise<StoreVisit[]> {
    const today = new Date().toLocaleDateString('en-CA');
    return this.getStoreVisits({ userId, date: today });
  },

  /**
   * Return the single active (no checkout) store visit for a user.
   * Undefined if the user is not currently at any store.
   */
  async fetchActiveStoreVisit(userId: string): Promise<StoreVisit | undefined> {
    const { data, error } = await supabase
      .from('store_visits')
      .select('*')
      .eq('employee_id', userId)
      .is('check_out_time', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapStoreVisit(data as Record<string, unknown>) : undefined;
  },

  /**
   * INSERT a new store visit. DB generates the UUID.
   * Returns the full record including the DB-assigned id.
   */
  async createStoreVisit(data: Omit<StoreVisit, 'id'>): Promise<StoreVisit> {
    const { data: row, error } = await supabase
      .from('store_visits')
      .insert({
        employee_id:         data.employeeId,
        company_id:          requireCompany(),
        store_id:            data.storeId,
        store_name:          data.storeName,
        latitude:            data.latitude,
        longitude:           data.longitude,
        distance_from_store: data.distanceFromStore,
        is_suspicious:       data.isSuspicious ?? false,
        check_in_time:       data.checkInTime,
        check_out_time:      null,
        duration:            null,
        date:                data.date,
        path:                data.path ?? [],
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapStoreVisit(row as Record<string, unknown>);
  },

  /**
   * UPDATE only the checkout fields on an existing store visit.
   * Does not touch check_in_time, location, or path data.
   */
  async updateStoreVisitCheckout(
    visitId: string,
    checkOutTime: string,
    durationMinutes: number
  ): Promise<void> {
    const { error } = await supabase
      .from('store_visits')
      .update({
        check_out_time: checkOutTime,
        duration:       durationMinutes,
      })
      .eq('id', visitId);
    if (error) throw new Error(error.message);
  },

  async updateStoreVisitPath(visitId: string, lat: number, lng: number): Promise<void> {
    // Fetch existing path then append
    const { data } = await supabase
      .from('store_visits')
      .select('path, latitude, longitude')
      .eq('id', visitId)
      .maybeSingle();

    if (!data) return;

    const existingPath: { lat: number; lng: number; timestamp: string }[] =
      Array.isArray(data.path) ? data.path : [];

    const updatedPath = [
      ...existingPath,
      { lat, lng, timestamp: new Date().toISOString() },
    ];

    await supabase
      .from('store_visits')
      .update({ path: updatedPath, latitude: lat, longitude: lng })
      .eq('id', visitId);
  },

  /**
   * Auto-close stale store visits open longer than `autoCheckoutHours`.
   * Returns the number of visits closed.
   */
  async autoCloseStaleVisits(userId: string): Promise<number> {
    const rules = await this.getRules();
    const limitHours = rules.settings.autoCheckoutHours ?? 8;
    if (limitHours <= 0) return 0;

    const cutoff = new Date(Date.now() - limitHours * 3600000).toISOString();

    // Find open visits older than the cutoff
    const { data, error } = await supabase
      .from('store_visits')
      .select('id, check_in_time')
      .eq('employee_id', userId)
      .is('check_out_time', null)
      .lt('check_in_time', cutoff);

    if (error || !data || data.length === 0) return 0;

    // Close each stale visit
    await Promise.all(
      data.map(async (row) => {
        const checkInTime = row.check_in_time as string;
        const checkOutTime = new Date().toISOString();
        const durationMinutes = Math.floor(
          (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / 60000
        );
        await supabase
          .from('store_visits')
          .update({ check_out_time: checkOutTime, duration: durationMinutes })
          .eq('id', row.id);
      })
    );

    return data.length;
  },

  // ── PERFORMANCE SCORES ────────────────────────────────────────────────

  async getPerformanceScores(userId?: string): Promise<PerformanceScore[]> {
    let query = supabase.from('performance_scores').select('*');
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => ({
      userId: row.user_id as string,
      date: row.date as string,
      totalScore: row.total_score as number,
      breakdown: {
        attendance: row.attendance_score as number,
        field: row.field_score as number,
        punctuality: row.punctuality_score as number,
        location: row.location_score as number,
      },
    }));
  },

  async savePerformanceScore(score: PerformanceScore): Promise<void> {
    const { error } = await supabase.from('performance_scores').upsert(
      {
        user_id: score.userId,
        date: score.date,
        total_score: score.totalScore,
        attendance_score: score.breakdown.attendance,
        field_score: score.breakdown.field,
        punctuality_score: score.breakdown.punctuality,
        location_score: score.breakdown.location,
      },
      { onConflict: 'user_id,date' }
    );
    if (error) throw new Error(error.message);

    await this.checkNeedsAttention(score.userId);
  },

  /**
   * Calculate performance score for a user+date.
   * All data is fetched once in parallel, then computed in memory.
   */
  async calculatePerformanceScore(userId: string, date: string): Promise<PerformanceScore> {
    const [record, visits, user, shifts, rules, fraudAlerts] = await Promise.all([
      this.getRecord(userId, date),
      this.getStoreVisits({ userId, date }),
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(r =>
        r.data ? mapProfile(r.data as Record<string, unknown>) : null
      ),
      this.getShifts(),
      this.getRules(),
      this.getFraudAlerts(userId),
    ]);

    const shift = shifts.find(s => s.id === user?.shiftId);
    const policy = rules.policy;

    // Run fraud detection and persist alerts (admin context only)
    const fraudResult = this.detectSuspiciousActivity(visits);
    if (fraudResult.issues.length > 0 && user) {
      // Fire-and-forget: save alert, don't block score calculation
      this.saveFraudAlert({
        id: `fraud-${userId}-${date}-${Date.now()}`,
        userId,
        userName: user.name,
        type: fraudResult.issues[0].split(':')[0].trim() as FraudAlert['type'],
        severity: fraudResult.severity,
        date,
        details: fraudResult.issues.join('; '),
        timestamp: new Date().toISOString(),
      }).catch(console.warn);
    }

    let attendanceScore = 0;
    let punctualityScore = 0;
    let fieldScore = 0;
    let locationScore = 0;

    // 1. Attendance Score (40 pts)
    if (record) {
      if (record.status === 'present') attendanceScore = 40;
      else if (record.status === 'late' || record.status === 'half-day') attendanceScore = 20;
    }

    // 2. Punctuality Score (20 pts)
    if (record?.checkIn && shift) {
      const checkInDate = new Date(record.checkIn);
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const shiftStart = new Date(checkInDate);
      shiftStart.setHours(startH, startM, 0, 0);

      const diffMins = (checkInDate.getTime() - shiftStart.getTime()) / 60000;
      if (diffMins <= 0) punctualityScore = 20;
      else if (diffMins <= 15) punctualityScore = 10;
    }

    // 3. Field Activity Score (30 pts)
    if (visits.length > 0) {
      const completedVisits = visits.filter(v => v.checkOutTime);
      const totalFieldMins = completedVisits.reduce((acc, v) => acc + (v.duration ?? 0), 0);

      const visitPts = Math.min(completedVisits.length * 10, 20);
      const timePts = totalFieldMins >= 120 ? 10 : (totalFieldMins / 120) * 10;
      fieldScore = visitPts + timePts;
    }

    // 4. Location Accuracy Score (10 pts)
    if (visits.length > 0) {
      const avgDistance =
        visits.reduce((acc, v) => acc + (v.distanceFromStore ?? 0), 0) / visits.length;
      if (avgDistance <= 50) locationScore = 10;
      else if (avgDistance <= 100) locationScore = 5;
    }

    // 5. Fraud Penalty (deducted, min 0)
    const todayAlerts = fraudAlerts.filter(a => a.date === date);
    const penalty = todayAlerts.reduce((acc, a) => {
      if (a.severity === 'High') return acc + 20;
      if (a.severity === 'Medium') return acc + 10;
      return acc + 5;
    }, 0);

    const totalScore = Math.max(
      0,
      Math.round(attendanceScore + punctualityScore + fieldScore + locationScore - penalty)
    );

    return {
      userId,
      date,
      totalScore,
      breakdown: {
        attendance: attendanceScore,
        field: Math.round(fieldScore),
        punctuality: punctualityScore,
        location: locationScore,
      },
    };
  },

  async checkNeedsAttention(userId: string): Promise<boolean> {
    const scores = await this.getPerformanceScores(userId);
    if (scores.length < 3) return false;

    const last3 = scores.slice(0, 3);
    const needsAttention = last3.every(s => s.totalScore < 50);

    await this.updateUserFlags(userId, { needsAttention });
    return needsAttention;
  },

  // ── FRAUD ALERTS ──────────────────────────────────────────────────────

  async getFraudAlerts(userId?: string): Promise<FraudAlert[]> {
    let query = supabase.from('fraud_alerts').select('*').eq('company_id', requireCompany());
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => mapFraudAlert(row as Record<string, unknown>));
  },

  async saveFraudAlert(alert: FraudAlert): Promise<void> {
    const { error } = await supabase.from('fraud_alerts').upsert(
      {
        id: alert.id,
        user_id: alert.userId,
        user_name: alert.userName,
        type: alert.type,
        severity: alert.severity,
        date: alert.date,
        details: alert.details,
      },
      { onConflict: 'user_id,date,type', ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
    await this.checkHighRisk(alert.userId);
  },

  async checkHighRisk(userId: string): Promise<void> {
    const alerts = await this.getFraudAlerts(userId);
    const highCount = alerts.filter(a => a.severity === 'High').length;
    if (highCount >= 3) {
      await this.updateUserFlags(userId, { isHighRisk: true });
    }
  },

  // ── BUSINESS LOGIC (pure / sync) ─────────────────────────────────────

  /**
   * Determine attendance status for a given user/date/record combination.
   * Pure function — no DB calls. Caller must pre-fetch shift, rules, record.
   */
  determineStatus(
    _userId: string,
    date: string,
    shift: Shift,
    rules: SystemRules,
    record?: AttendanceRecord,
    user?: User,
    holidayForDate?: Holiday
  ): 'present' | 'absent' | 'late' | 'holiday' | 'half-day' | 'not-started' {
    if (holidayForDate) return 'holiday';

    const policy = rules.policy;

    if (record) {
      if (record.checkOut) {
        const minFull = user?.overrides?.minHoursForFullDay ?? policy.minHoursForFullDay;
        const minHalf = policy.minHoursForHalfDay;
        const hours = record.totalHours ?? 0;

        if (hours < minHalf) return 'absent';
        if (hours < minFull) return 'half-day';

        if (record.checkIn) {
          const checkInDate = new Date(record.checkIn);
          const [startH, startM] = shift.startTime.split(':').map(Number);
          const shiftStart = new Date(checkInDate);
          shiftStart.setHours(startH, startM, 0, 0);

          const threshold = user?.overrides?.lateThresholdMinutes ?? policy.lateThresholdMinutes;
          const lateThreshold = new Date(shiftStart);
          lateThreshold.setMinutes(lateThreshold.getMinutes() + threshold);

          if (!shift.isFlexible && checkInDate > lateThreshold) return 'late';
        }
        return 'present';
      }

      if (record.checkIn) {
        const checkInDate = new Date(record.checkIn);
        const [startH, startM] = shift.startTime.split(':').map(Number);
        const shiftStart = new Date(checkInDate);
        shiftStart.setHours(startH, startM, 0, 0);

        const threshold = user?.overrides?.lateThresholdMinutes ?? policy.lateThresholdMinutes;
        const lateThreshold = new Date(shiftStart);
        lateThreshold.setMinutes(lateThreshold.getMinutes() + threshold);

        if (!shift.isFlexible && checkInDate > lateThreshold) return 'late';
        return 'present';
      }
    }

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');

    if (date < todayStr) return 'absent';

    if (date === todayStr) {
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const officeEndTime = new Date(now);
      officeEndTime.setHours(endH, endM, 0, 0);

      const absentThreshold = new Date(officeEndTime);
      absentThreshold.setMinutes(absentThreshold.getMinutes() + policy.absentAfterMinutes);

      if (now > absentThreshold) return 'absent';
    }

    return 'not-started';
  },

  calculateStatus(
    checkIn: Date,
    shift: Shift,
    rules: SystemRules,
    user?: User
  ): 'present' | 'late' {
    if (shift.isFlexible) return 'present';

    const [startH, startM] = shift.startTime.split(':').map(Number);
    const shiftStart = new Date(checkIn);
    shiftStart.setHours(startH, startM, 0, 0);

    const threshold = user?.overrides?.lateThresholdMinutes ?? rules.policy.lateThresholdMinutes;
    const lateThreshold = new Date(shiftStart);
    lateThreshold.setMinutes(lateThreshold.getMinutes() + threshold);

    return checkIn > lateThreshold ? 'late' : 'present';
  },

  calculateFinalStatus(
    hours: number,
    shift: Shift,
    currentStatus: 'present' | 'late',
    user?: User,
    rules?: SystemRules
  ): 'present' | 'late' | 'half-day' | 'absent' {
    const policy = rules?.policy;
    const minFull =
      user?.overrides?.minHoursForFullDay ?? policy?.minHoursForFullDay ?? shift.minHoursForFullDay;
    const minHalf = policy?.minHoursForHalfDay ?? shift.minHoursForHalfDay;

    if (hours < minHalf) return 'absent';
    if (hours < minFull) return 'half-day';
    return currentStatus;
  },

  detectSuspiciousActivity(
    visits: StoreVisit[]
  ): { issues: string[]; severity: 'Low' | 'Medium' | 'High' } {
    const issues: string[] = [];
    let severity: 'Low' | 'Medium' | 'High' = 'Low';

    // 1. Very short visits (< 5 min)
    const shortVisits = visits.filter(v => v.checkOutTime && (v.duration ?? 0) < 5);
    if (shortVisits.length > 0) {
      issues.push(`Short Visit: detected at ${shortVisits.map(v => v.storeName).join(', ')}`);
      severity = 'Medium';
    }

    // 2. Too many stores (> 8)
    if (visits.length > 8) {
      issues.push(`Too Many Stores: Abnormal number of visits (${visits.length})`);
      severity = 'High';
    }

    // 3. Location mismatch (> 200 m)
    const mismatch = visits.filter(v => v.distanceFromStore > 200);
    if (mismatch.length > 0) {
      issues.push(`Location Mismatch: detected at ${mismatch.map(v => v.storeName).join(', ')}`);
      severity = 'High';
    }

    // 4. Unrealistic movement speed (> 120 km/h between visits)
    const sorted = [...visits].sort(
      (a, b) => new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.checkOutTime) {
        const timeDiffHours =
          (new Date(curr.checkInTime).getTime() - new Date(prev.checkOutTime).getTime()) /
          3600000;
        if (timeDiffHours > 0) {
          const distKm =
            calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude) / 1000;
          const speed = distKm / timeDiffHours;
          if (speed > 120) {
            issues.push(
              `Unrealistic Movement: speed between ${prev.storeName} and ${curr.storeName} was ${Math.round(speed)} km/h`
            );
            severity = 'High';
          }
        }
      }
    }

    return { issues, severity };
  },

  // ── AGGREGATE / SUMMARY ───────────────────────────────────────────────

  async getMonthlySummary(userId: string, month: number, year: number) {
    const records = await this.getAttendanceForUser(userId);
    const filtered = records.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });

    return {
      present: filtered.filter(r => r.status === 'present').length,
      late: filtered.filter(r => r.status === 'late').length,
      halfDay: filtered.filter(r => r.status === 'half-day').length,
      absent: filtered.filter(r => r.status === 'absent').length,
      totalHours: filtered.reduce((acc, r) => acc + (r.totalHours ?? 0), 0),
    };
  },

  /**
   * Comprehensive CEO metrics — fetches all data in parallel for efficiency.
   */
  async getCEOMetrics() {
    const today = new Date().toLocaleDateString('en-CA');

    const [users, todayAttendance, visits, alerts, shifts, rules] = await Promise.all([
      this.getUsers(),
      this.getAttendanceForDate(today),
      this.getStoreVisits({ date: today }),
      this.getFraudAlerts(),
      this.getShifts(),
      this.getRules(),
    ]);

    const employees = users.filter(u => u.role === 'employee');

    // Calculate all performance scores in parallel
    const scoreResults = await Promise.all(
      employees.map(u => this.calculatePerformanceScore(u.id, today))
    );

    const avgScore =
      scoreResults.length > 0
        ? scoreResults.reduce((acc, s) => acc + s.totalScore, 0) / scoreResults.length
        : 0;

    const scoredEmployees = scoreResults.map(s => ({
      name: users.find(u => u.id === s.userId)?.name ?? 'Unknown',
      score: s.totalScore,
    }));
    const sortedScores = [...scoredEmployees].sort((a, b) => b.score - a.score);

    const completedVisits = visits.filter(v => v.checkOutTime);
    const avgVisitTime =
      completedVisits.length > 0
        ? completedVisits.reduce((acc, v) => acc + (v.duration ?? 0), 0) / completedVisits.length
        : 0;

    const activeVisits = await this.getActiveStoreVisits();

    return {
      summary: {
        totalEmployees: employees.length,
        present: todayAttendance.filter(
          r => r.status === 'present' || r.status === 'late'
        ).length,
        absent: todayAttendance.filter(r => r.status === 'absent').length,
        late: todayAttendance.filter(r => r.status === 'late').length,
      },
      performance: {
        average: Math.round(avgScore),
        top: sortedScores.slice(0, 5),
        bottom: [...sortedScores].reverse().slice(0, 5),
      },
      field: {
        totalVisits: visits.length,
        activeEmployees: activeVisits.length,
        avgDuration: Math.round(avgVisitTime),
      },
      alerts: {
        totalSuspicious: alerts.filter(a => a.date === today).length,
        highRiskCount: users.filter(u => u.isHighRisk).length,
      },
    };
  },

  // ── CSV EXPORT ────────────────────────────────────────────────────────

  downloadCSV(filename: string, headers: string[], rows: unknown[][]) {
    const csvContent = [headers, ...rows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  async exportAttendanceReport(filters: {
    startDate: string;
    endDate: string;
    userId?: string;
    department?: string;
  }) {
    const [records, users] = await Promise.all([
      this.getAttendance({ startDate: filters.startDate, endDate: filters.endDate }),
      this.getUsers(),
    ]);

    let filtered = records;
    if (filters.userId) filtered = filtered.filter(r => r.userId === filters.userId);
    if (filters.department) {
      filtered = filtered.filter(r => {
        const u = users.find(u => u.id === r.userId);
        return u?.department === filters.department;
      });
    }

    const headers = ['Date', 'Employee Name', 'Department', 'Check In', 'Check Out', 'Hours', 'Status'];
    const rows = filtered.map(r => {
      const u = users.find(u => u.id === r.userId);
      return [
        r.date,
        u?.name ?? 'Unknown',
        u?.department ?? 'N/A',
        r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-',
        r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '-',
        r.totalHours?.toFixed(2) ?? '0',
        r.status,
      ];
    });

    this.downloadCSV(
      `attendance_report_${filters.startDate}_to_${filters.endDate}.csv`,
      headers,
      rows
    );
  },

  async exportFieldVisitReport(filters: { startDate: string; endDate: string; userId?: string }) {
    const [allVisits, users] = await Promise.all([
      this.getStoreVisits(),
      this.getUsers(),
    ]);

    let visits = allVisits.filter(
      v => v.date >= filters.startDate && v.date <= filters.endDate
    );
    if (filters.userId) visits = visits.filter(v => v.employeeId === filters.userId);

    const headers = [
      'Date', 'Employee Name', 'Store Name', 'Check In', 'Check Out',
      'Duration (min)', 'Distance (m)', 'Suspicious',
    ];
    const rows = visits.map(v => {
      const u = users.find(u => u.id === v.employeeId);
      return [
        v.date,
        u?.name ?? 'Unknown',
        v.storeName,
        new Date(v.checkInTime).toLocaleTimeString(),
        v.checkOutTime ? new Date(v.checkOutTime).toLocaleTimeString() : '-',
        v.duration ?? 0,
        Math.round(v.distanceFromStore),
        v.isSuspicious ? 'Yes' : 'No',
      ];
    });

    this.downloadCSV(
      `field_visit_report_${filters.startDate}_to_${filters.endDate}.csv`,
      headers,
      rows
    );
  },

  async exportPerformanceReport(filters: { date: string; department?: string }) {
    const users = await this.getUsers();
    const employees = users.filter(
      u =>
        u.role === 'employee' &&
        (!filters.department || u.department === filters.department)
    );

    const scores = await Promise.all(
      employees.map(u => this.calculatePerformanceScore(u.id, filters.date))
    );

    const headers = [
      'Employee Name', 'Department', 'Total Score',
      'Attendance', 'Field', 'Punctuality', 'Location',
    ];
    const rows = employees.map((u, i) => {
      const s = scores[i];
      return [
        u.name,
        u.department,
        s.totalScore,
        s.breakdown.attendance,
        s.breakdown.field,
        s.breakdown.punctuality,
        s.breakdown.location,
      ];
    });

    this.downloadCSV(`performance_report_${filters.date}.csv`, headers, rows);
  },

  async exportToCSV(userId: string) {
    const records = await this.getAttendanceForUser(userId);
    const headers = ['Date', 'Check In', 'Check Out', 'Status', 'Total Hours', 'Notes'];
    const rows = records.map(r => [
      r.date,
      r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '',
      r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '',
      r.status,
      r.totalHours?.toFixed(2) ?? '0',
      r.notes ?? '',
    ]);
    this.downloadCSV(`attendance_${userId}.csv`, headers, rows);
  },
};
