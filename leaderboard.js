/**
 * Do you have brains - Leaderboard & Auth controller
 * ------------------------------------------------------------------
 * Wraps the Supabase JS client and exposes a small, promise-based API
 * the game can call. Responsibilities:
 *   - Google OAuth sign-in + anonymous "guest" sign-in
 *   - Claiming / changing a unique public username
 *   - Submitting finished runs through the server-validated RPC
 *   - Fetching and live-subscribing to the global leaderboard
 *
 * Everything degrades gracefully: if the Supabase SDK fails to load
 * (offline, blocked CDN) the game still plays, it just runs in a local
 * "offline" mode and the leaderboard UI says so.
 */
const Leaderboard = (() => {
  let client = null;
  let session = null;
  let profile = null;          // { user_id, username, is_guest, avatar_url, best_score }
  let ready = false;
  let realtimeChannel = null;
  const listeners = { auth: [], board: [] };

  function emit(kind, payload) {
    (listeners[kind] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }

  function on(kind, fn) {
    if (!listeners[kind]) listeners[kind] = [];
    listeners[kind].push(fn);
    return () => {
      listeners[kind] = listeners[kind].filter(f => f !== fn);
    };
  }

  /** True once the SDK + config are wired up and a session check has run. */
  function isReady() { return ready; }
  function isOnline() { return !!client; }
  function getSession() { return session; }
  function getProfile() { return profile; }
  function isSignedIn() { return !!(session && session.user); }
  function needsUsername() { return isSignedIn() && !profile; }

  /** Initialise the Supabase client and restore any existing session. */
  async function init() {
    const cfg = window.DYHB_SUPABASE;
    const sb = window.supabase;
    if (!cfg || !sb || typeof sb.createClient !== 'function') {
      console.warn('[Leaderboard] Supabase SDK/config unavailable — offline mode.');
      ready = true;
      emit('auth', { session: null, profile: null, online: false });
      return;
    }

    client = sb.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    });

    // Pull an existing session (handles the OAuth redirect return too).
    const { data } = await client.auth.getSession();
    session = data.session || null;

    if (session) {
      await loadProfile();
    }

    // React to future auth changes (sign-in, sign-out, token refresh).
    client.auth.onAuthStateChange(async (_event, newSession) => {
      session = newSession;
      if (session) {
        await loadProfile();
      } else {
        profile = null;
      }
      emit('auth', { session, profile, online: true });
    });

    ready = true;
    emit('auth', { session, profile, online: true });
  }

  /** Load this user's profile row (null if they haven't picked a name yet). */
  async function loadProfile() {
    if (!client || !session) { profile = null; return null; }
    const { data, error } = await client
      .from('dyhb_profiles')
      .select('user_id, username, is_guest, avatar_url, best_score, total_runs')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) { console.warn('[Leaderboard] loadProfile', error.message); }
    profile = data || null;
    return profile;
  }

  /** Kick off Google OAuth. Returns to the current page when complete. */
  async function signInWithGoogle() {
    if (!client) throw new Error('OFFLINE');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) throw error;
  }

  /** Anonymous guest session — gives a real JWT so RLS works uniformly. */
  async function signInAsGuest() {
    if (!client) throw new Error('OFFLINE');
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
    return session;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    session = null;
    profile = null;
    if (realtimeChannel) { client.removeChannel(realtimeChannel); realtimeChannel = null; }
  }

  /**
   * Claim or change the caller's public username. Server enforces the
   * 2–24 char rule and case-insensitive uniqueness; we surface friendly
   * errors for the two cases the UI cares about.
   */
  async function setUsername(name, opts = {}) {
    if (!client) throw new Error('OFFLINE');
    if (!session) throw new Error('AUTH_REQUIRED');

    const isGuest = opts.isGuest !== undefined
      ? opts.isGuest
      : !!(session.user && session.user.is_anonymous);

    // Prefer Google avatar/name metadata when present.
    const meta = (session.user && session.user.user_metadata) || {};
    const avatar = opts.avatarUrl || meta.avatar_url || meta.picture || null;

    const { data, error } = await client.rpc('dyhb_upsert_profile', {
      p_username: name,
      p_is_guest: isGuest,
      p_avatar_url: avatar
    });

    if (error) {
      const msg = (error.message || '').toUpperCase();
      if (msg.includes('USERNAME_TAKEN')) throw new Error('USERNAME_TAKEN');
      if (msg.includes('BAD_USERNAME')) throw new Error('BAD_USERNAME');
      throw error;
    }
    profile = Array.isArray(data) ? data[0] : data;
    emit('auth', { session, profile, online: true });
    return profile;
  }

  /** Suggest a default callsign from Google metadata or a random handle. */
  function suggestedUsername() {
    const meta = (session && session.user && session.user.user_metadata) || {};
    const fromGoogle = meta.full_name || meta.name || meta.user_name;
    if (fromGoogle) return String(fromGoogle).slice(0, 24);
    const tag = Math.floor(1000 + Math.random() * 9000);
    return `anon_${tag}`;
  }

  /**
   * Submit a completed run. The server validates plausibility, stores the
   * row, updates lifetime stats, and returns the fresh global rank.
   * @returns {Promise<{score:number, rank:number, best_score:number, total_runs:number}|null>}
   */
  async function submitRun(run) {
    if (!client || !session || !profile) return null;
    const { data, error } = await client.rpc('dyhb_submit_run', {
      p_score: Math.round(run.score) || 0,
      p_accuracy: run.accuracy || 0,
      p_best_streak: run.bestStreak || 0,
      p_rounds: run.rounds || 0,
      p_correct: run.correct || 0,
      p_wrong: run.wrong || 0,
      p_mode: run.mode || null,
      p_max_premises: run.maxPremises || null,
      p_modifiers: run.modifiers || {}
    });
    if (error) { console.warn('[Leaderboard] submitRun', error.message); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    // Keep the local profile's best score fresh.
    if (row && profile) profile.best_score = row.best_score;
    return row;
  }

  /** Fetch the top N rows of the global leaderboard. */
  async function fetchTop(limit = 100) {
    if (!client) return [];
    const { data, error } = await client
      .from('dyhb_leaderboard')
      .select('user_id, username, is_guest, avatar_url, score, accuracy, best_streak, rounds_played, rank')
      .order('rank', { ascending: true })
      .limit(limit);
    if (error) { console.warn('[Leaderboard] fetchTop', error.message); return []; }
    return data || [];
  }

  /** Subscribe to live score inserts; calls back with the refreshed board. */
  function subscribeLive(onUpdate) {
    if (!client) return () => {};
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    realtimeChannel = client
      .channel('dyhb-scores-live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dyhb_scores' },
        async () => {
          const rows = await fetchTop(100);
          onUpdate(rows);
        })
      .subscribe();
    return () => { if (realtimeChannel) { client.removeChannel(realtimeChannel); realtimeChannel = null; } };
  }

  return {
    init, isReady, isOnline, on,
    signInWithGoogle, signInAsGuest, signOut,
    setUsername, suggestedUsername, needsUsername,
    isSignedIn, getSession, getProfile, loadProfile,
    submitRun, fetchTop, subscribeLive
  };
})();

window.Leaderboard = Leaderboard;
