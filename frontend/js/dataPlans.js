// ================================
// dataPlans.js — Supabase Realtime + UI Updates
// ================================

// --------------------
// Cache & constants
// --------------------
let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v12';
let realtimeSubscription = null;

// --------------------
// Get Supabase client
// --------------------
const getSupabaseClient = () => {
  if (!window.supabaseClient) {
    console.warn('Supabase client not initialized yet');
    return null;
  }
  return window.supabaseClient;
};

// --------------------
// Load cached plans (offline-first)
// --------------------
export const loadCachedPlans = () => {
  try {
    const saved = localStorage.getItem(CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      plansCache = parsed.plans || [];
      cacheUpdatedAt = parsed.updatedAt || null;
    }
  } catch (e) {
    console.warn('Failed to load plan cache');
  }
  return plansCache;
};

// --------------------
// Dispatch custom event to notify UI
// --------------------
const dispatchPlansUpdateEvent = () => {
  window.dispatchEvent(new Event('plansUpdated'));
};

// --------------------
// Update cache & trigger UI
// --------------------
const updateCache = (plans) => {
  const latestUpdate = plans.reduce((maxDate, p) => {
    if (!p.updated_at) return maxDate;
    const current = new Date(p.updated_at);
    return maxDate === null || current > maxDate ? current : maxDate;
  }, null);

  const latestUpdateStr = latestUpdate ? latestUpdate.toISOString() : new Date().toISOString();

  plansCache = plans;
  cacheUpdatedAt = latestUpdateStr;

  localStorage.setItem(CACHE_KEY, JSON.stringify({
    plans: plans,
    updatedAt: latestUpdateStr
  }));

  console.log('✅ Data plans cache updated');
  dispatchPlansUpdateEvent(); // 🔔 Trigger UI
};

// --------------------
// Fetch plans from Supabase
// --------------------
export const fetchPlans = async () => {
  if (window.__REAUTH_LOCKED__ === true) return plansCache;

  const supabase = getSupabaseClient();
  if (!supabase) return fetchPlansViaAPI();

  try {
    const { data, error } = await supabase
      .from('data_plans')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    updateCache(data);
    return data;
  } catch (err) {
    console.warn('Failed to fetch plans from Supabase, trying API fallback', err);
    return fetchPlansViaAPI();
  }
};

// --------------------
// Fallback HTTP API fetch
// --------------------
const fetchPlansViaAPI = async () => {
  try {
    const base = (window.__SEC_API_BASE || 'https://api.flexgig.com.ng').replace(/\/+$/, '');
    const url = `${base}/api/dataPlans`;

    const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const fresh = await res.json();

    // Only update cache if there’s new data
    const latestUpdate = fresh.reduce((maxDate, p) => {
      if (!p.updated_at) return maxDate;
      const current = new Date(p.updated_at);
      return maxDate === null || current > maxDate ? current : maxDate;
    }, null);

    const cachedDate = cacheUpdatedAt ? new Date(cacheUpdatedAt) : null;
    if (latestUpdate && (!cachedDate || latestUpdate > cachedDate)) {
      updateCache(fresh);
      return fresh;
    } else {
      console.log('No new data – using existing cache');
    }
  } catch (err) {
    console.warn('Failed to fetch plans via API, using cache', err);
  }

  return plansCache;
};

// --------------------
// Subscribe to Supabase realtime
// --------------------
export const subscribeToPlans = () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('Cannot subscribe: Supabase client not ready. Retrying in 2s...');
    setTimeout(subscribeToPlans, 2000);
    return null;
  }

  // Unsubscribe previous
  if (realtimeSubscription) realtimeSubscription.unsubscribe();

  console.log('🔴 Subscribing to data_plans realtime updates...');

  realtimeSubscription = supabase
    .channel('dataplans-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'data_plans' }, payload => {
      console.log('🔴 Realtime change detected:', payload);

      if (payload.eventType === 'INSERT') {
        plansCache.push(payload.new);
        updateCache(plansCache);
      } else if (payload.eventType === 'UPDATE') {
        const idx = plansCache.findIndex(p => p.id === payload.new.id);
        if (idx !== -1) plansCache[idx] = payload.new;
        else plansCache.push(payload.new);
        updateCache(plansCache);
      } else if (payload.eventType === 'DELETE') {
        plansCache = plansCache.filter(p => p.id !== payload.old.id);
        updateCache(plansCache);
      }
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.log('✅ Realtime subscription active!');
      else console.log('Realtime subscription status:', status);
    });

  return realtimeSubscription;
};

// --------------------
// Unsubscribe from realtime
// --------------------
export const unsubscribeFromPlans = () => {
  if (realtimeSubscription) {
    realtimeSubscription.unsubscribe();
    realtimeSubscription = null;
    console.log('Unsubscribed from data_plans realtime');
  }
};

// --------------------
// Plan getters
// --------------------
export const getAllPlans = async () => {
  if (plansCache.length === 0) loadCachedPlans();
  await fetchPlans(); // refresh in background
  return plansCache;
};

export const getPlansByProvider = async (provider) => {
  const all = await getAllPlans();
  return all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
};

export const getPlans = async (provider, category = null) => {
  const all = await getAllPlans();
  let filtered = all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
  if (category) filtered = filtered.filter(p => p.category === category.toUpperCase());
  return filtered.sort((a, b) => Number(a.price) - Number(b.price));
};

// --------------------
// Initialize cache & realtime on load
// --------------------
loadCachedPlans();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribeToPlans);
} else {
  subscribeToPlans();
}

// --------------------
// Expose functions globally
// --------------------
window.getAllPlans = getAllPlans;
window.getPlans = getPlans;
window.getPlansByProvider = getPlansByProvider;
window.fetchPlans = fetchPlans;
window.subscribeToPlans = subscribeToPlans;
window.unsubscribeFromPlans = unsubscribeFromPlans;
