/**
 * Supabase Edge Function: create-employee
 *
 * Called by admin clients to create new Supabase Auth users + profiles.
 * Uses SERVICE_ROLE_KEY (server-only) so the admin's session is never replaced.
 *
 * Deploy with:
 *   supabase functions deploy create-employee --no-verify-jwt
 *
 * Environment variables required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify caller is an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: callerUser }, error: callerError } = await anonClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller is admin
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request body
    const body = await req.json();
    const {
      email,
      password,
      name,
      employeeId,
      code,
      department,
      role,
      shiftId,
      fieldTrackingEnabled,
      lateThresholdMinutes,
      minHoursForFullDay,
      companyId,
      existingAuthId,  // if updating an existing user
    } = body;

    // Validate required fields
    if (!email || !name || !employeeId || !code || !department || !role || !shiftId || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let authUserId: string;

    if (existingAuthId) {
      // Update existing user
      authUserId = existingAuthId;
      if (password) {
        await adminClient.auth.admin.updateUserById(authUserId, { email, password });
      } else {
        await adminClient.auth.admin.updateUserById(authUserId, { email });
      }
    } else {
      // Create new auth user (requires password for new users)
      if (!password) {
        return new Response(JSON.stringify({ error: 'Password required for new employee' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,  // Skip email confirmation for internal users
      });

      if (createError || !newUser.user) {
        return new Response(JSON.stringify({ error: createError?.message || 'Failed to create user' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authUserId = newUser.user.id;
    }

    // 3. Upsert profile
    const profileData = {
      id: authUserId,
      company_id: companyId,
      employee_id: employeeId,
      code,
      name,
      email,
      role,
      department,
      shift_id: shiftId,
      field_tracking_enabled: fieldTrackingEnabled ?? false,
      late_threshold_minutes: lateThresholdMinutes ?? null,
      min_hours_for_full_day: minHoursForFullDay ?? null,
    };

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Log shift change if applicable
    if (body.oldShiftId && body.oldShiftId !== shiftId) {
      await adminClient.from('shift_change_logs').insert({
        id: `log-${Date.now()}`,
        user_id: authUserId,
        old_shift_id: body.oldShiftId,
        new_shift_id: shiftId,
        changed_by: callerUser.id,
      });
    }

    return new Response(
      JSON.stringify({ success: true, userId: authUserId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
