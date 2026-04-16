/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabase';
import { dataService } from './services/dataService';
import Login from './components/Login';
import Signup from './components/Signup';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AttendanceCalendar from './components/AttendanceCalendar';
import TeamDirectory from './components/TeamDirectory';
import RulesSettings from './components/RulesSettings';
import Settings from './components/Settings';
import HolidayCalendar from './components/HolidayCalendar';
import CEODashboard from './components/CEODashboard';
import ExportReports from './components/ExportReports';
import type { User, Company } from './types';

// How long to wait for the profile to load before showing an error screen.
const PROFILE_LOAD_TIMEOUT_MS = 10_000;

export default function App() {
  const [session,          setSession]          = useState<Session | null>(null);
  const [user,             setUser]             = useState<User | null>(null);
  const [company,          setCompany]          = useState<Company | null>(null);
  const [activeTab,        setActiveTab]        = useState('dashboard');
  const [isAuthReady,      setIsAuthReady]      = useState(false);
  const [showSignup,       setShowSignup]       = useState(false);
  const [authError,        setAuthError]        = useState<string | null>(null);
  const [profileTimedOut,  setProfileTimedOut]  = useState(false);

  // Prevents SIGNED_IN event from racing handleLogin / handleSignupComplete
  const resolvedExternallyRef = useRef(false);
  // Tracks whether signup flow is in progress (blocks early loadProfileAndCompany)
  const signupInProgressRef = useRef(false);
  // Timeout ref for the "Loading your profile…" screen
  const profileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load profile + company (non-blocking) ─────────────────────────────
  const loadProfileAndCompany = useCallback(async () => {
    try {
      const profile = await dataService.getCurrentUserProfile();
      if (!profile) return;
      setUser(profile);
      if (profile.companyId) {
        const comp = await dataService.getCompany(profile.companyId);
        setCompany(comp);
      }
    } catch (err) {
      console.error('[Auth] loadProfileAndCompany error:', err);
    }
  }, []);

  // ── Bootstrap Supabase auth listener ──────────────────────────────────
  useEffect(() => {
    resolvedExternallyRef.current = false;

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      console.log('SESSION:', existingSession);
      setSession(existingSession);
      setIsAuthReady(true); // unblock UI immediately — no awaiting profile
      if (existingSession) loadProfileAndCompany(); // fire-and-forget
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);

        if (event === 'SIGNED_IN' && newSession) {
          // Don't load profile here if signup flow is managing it
          if (!resolvedExternallyRef.current && !signupInProgressRef.current) {
            loadProfileAndCompany();
          }
        }

        if (event === 'SIGNED_OUT') {
          resolvedExternallyRef.current = false;
          setUser(null);
          setCompany(null);
          setActiveTab('dashboard');
          setProfileTimedOut(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadProfileAndCompany]);

  // ── Profile load timeout ───────────────────────────────────────────────
  // If session exists but profile hasn't arrived within PROFILE_LOAD_TIMEOUT_MS,
  // stop spinning and show an actionable error screen instead.
  useEffect(() => {
    if (session && !user) {
      profileTimerRef.current = setTimeout(
        () => setProfileTimedOut(true),
        PROFILE_LOAD_TIMEOUT_MS
      );
    } else {
      if (profileTimerRef.current) {
        clearTimeout(profileTimerRef.current);
        profileTimerRef.current = null;
      }
      setProfileTimedOut(false);
    }
    return () => {
      if (profileTimerRef.current) clearTimeout(profileTimerRef.current);
    };
  }, [session, user]);

  // ── Auth handlers ─────────────────────────────────────────────────────

  const handleLogin = async (id: string, pass: string, companySlug: string): Promise<string | null> => {
    try {
      resolvedExternallyRef.current = true;
      const profile = await dataService.login(id, pass, companySlug || undefined);
      setUser(profile);
      if (profile.companyId) {
        const comp = await dataService.getCompany(profile.companyId);
        setCompany(comp);
      }
      return null;
    } catch (err) {
      resolvedExternallyRef.current = false;
      return err instanceof Error ? err.message : 'Login failed. Please try again.';
    }
  };

  const handleResendConfirmation = async (email: string): Promise<string | null> => {
    try {
      await dataService.resendConfirmationEmail(email);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Failed to resend. Try again later.';
    }
  };

  const handleSignupComplete = (comp: Company) => {
    resolvedExternallyRef.current = true;
    signupInProgressRef.current = false;
    setCompany(comp);
    setShowSignup(false);
    loadProfileAndCompany(); // fire-and-forget — profile now exists
  };

  const handleLogout = async () => {
    if (profileTimerRef.current) clearTimeout(profileTimerRef.current);
    await dataService.logout();
    setUser(null);
    setCompany(null);
    setAuthError(null);
    setActiveTab('dashboard');
    setProfileTimedOut(false);
  };

  // ── Loading guard (only blocks on getSession, not profile) ────────────
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Auth error fallback ───────────────────────────────────────────────
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-xl border border-outline-variant/10 p-10 text-center">
          <p className="text-error font-black text-lg mb-3">Something went wrong</p>
          <p className="text-sm text-on-surface-variant mb-6">{authError}</p>
          <button
            onClick={() => { setAuthError(null); setShowSignup(false); }}
            className="w-full bg-primary text-white font-black py-3 rounded-2xl uppercase tracking-widest text-xs"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Keep Signup visible even after session is created (avoids race where
  // SIGNED_IN fires before profile exists and unmounts the success screen)
  if (showSignup) {
    return (
      <Signup
        onSignupComplete={handleSignupComplete}
        onBackToLogin={() => {
          signupInProgressRef.current = false;
          setShowSignup(false);
        }}
      />
    );
  }

  if (!session) {
    return (
      <Login
        onLogin={handleLogin}
        onSignup={() => {
          signupInProgressRef.current = true;
          setShowSignup(true);
        }}
        onResendConfirmation={handleResendConfirmation}
      />
    );
  }

  // ── Profile loading state ─────────────────────────────────────────────
  if (!user) {
    // Timed out — profile can't be fetched; let the user sign out and retry
    if (profileTimedOut) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
          <div className="max-w-sm w-full bg-white rounded-3xl shadow-xl border border-outline-variant/10 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-error font-black text-lg mb-3">Profile Not Found</p>
            <p className="text-sm text-on-surface-variant mb-2">
              Your account exists but your profile could not be loaded.
            </p>
            <p className="text-xs text-on-surface-variant mb-8">
              This can happen if account setup didn't complete. Sign out and try logging in again, or contact your administrator.
            </p>
            <button
              onClick={handleLogout}
              className="w-full bg-primary text-white font-black py-3 rounded-2xl uppercase tracking-widest text-xs hover:bg-primary-dim transition-colors"
            >
              Sign Out &amp; Try Again
            </button>
          </div>
        </div>
      );
    }

    // Still loading — brief spinner
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-surface">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-on-surface-variant">Loading your profile…</p>
      </div>
    );
  }

  // ── Account suspended guard ───────────────────────────────────────────
  if (company && !company.isActive) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-outline-variant/10 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error">
              <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Account Suspended</h2>
          <p className="text-on-surface-variant font-medium mb-2">
            <span className="font-black text-on-surface">{company.name}</span> has been suspended.
          </p>
          <p className="text-sm text-on-surface-variant mb-8">
            Please contact support to reactivate your account.
          </p>
          <button
            onClick={handleLogout}
            className="w-full bg-surface-container text-on-surface font-black py-3 rounded-2xl uppercase tracking-widest text-xs hover:bg-surface-container-high transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ── Routing helpers ───────────────────────────────────────────────────
  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return user.role === 'admin' ? 'Admin Dashboard' : 'Employee Dashboard';
      case 'calendar':  return 'Attendance Calendar';
      case 'team':      return 'Team Directory';
      case 'ceo':       return 'CEO Dashboard';
      case 'reports':   return 'Business Reports';
      case 'rules':     return 'Policy Rules';
      case 'holidays':  return 'Holiday Calendar';
      case 'settings':  return 'Settings';
      default:          return 'Dashboard';
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard user={user} />;
      case 'calendar':  return <AttendanceCalendar user={user} />;
      case 'team':      return user.role === 'admin' ? <TeamDirectory user={user} /> : <Dashboard user={user} />;
      case 'ceo':       return user.role === 'admin' ? <CEODashboard /> : <Dashboard user={user} />;
      case 'reports':   return user.role === 'admin' ? <ExportReports /> : <Dashboard user={user} />;
      case 'rules':     return <RulesSettings user={user} />;
      case 'holidays':  return <HolidayCalendar user={user} />;
      case 'settings':  return <Settings user={user} />;
      default:          return <Dashboard user={user} />;
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={user}
      title={getTitle()}
      onLogout={handleLogout}
    >
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {renderContent()}
      </motion.div>
    </Layout>
  );
}
