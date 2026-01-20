// dataPlans.js with Supabase Realtime

let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v12';
let realtimeSubscription = null;

// Get Supabase client from window (initialized in dashboard.js)
const getSupabaseClient = () => {
  if (!window.supabaseClient) {
    console.warn('Supabase client not initialized yet');
    return null;
  }
  return window.supabaseClient;
};

// Load cached plans instantly (offline-first)
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

// Update cache and dispatch event
const updateCache = (plans) => {
  const latestUpdate = plans.reduce((maxDate, p) => {
    if (!p.updated_at) return maxDate;
    const current = new Date(p.updated_at);
    return maxDate === null || current > maxDate ? current : maxDate;
  }, null);

  const latestUpdateStr = latestUpdate ? latestUpdate.toISOString() : new Date().toISOString();

  plansCache = plans;
  cacheUpdatedAt = latestUpdateStr;

  // Save to localStorage
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    plans: plans,
    updatedAt: latestUpdateStr
  }));

  console.log('✅ Data plans cache updated');
  dispatchPlansUpdateEvent();
};

// Fetch latest from Supabase directly
export const fetchPlans = async () => {
  if (window.__REAUTH_LOCKED__ === true) {
    return plansCache;
  }

  const supabase = getSupabaseClient();
  
  // If Supabase isn't ready, fall back to HTTP API
  if (!supabase) {
    return fetchPlansViaAPI();
  }

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

// Fallback to your existing API endpoint
const fetchPlansViaAPI = async () => {
  try {
    const base = (window.__SEC_API_BASE || 'https://api.flexgig.com.ng').replace(/\/+$/, '');
    const url = `${base}/api/dataPlans`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const fresh = await res.json();

    const latestUpdate = fresh.reduce((maxDate, p) => {
      if (!p.updated_at) return maxDate;
      const current = new Date(p.updated_at);
      return maxDate === null || current > maxDate ? current : maxDate;
    }, null);

    const latestUpdateStr = latestUpdate ? latestUpdate.toISOString() : null;
    const cachedDate = cacheUpdatedAt ? new Date(cacheUpdatedAt) : null;
    const hasNewerData = latestUpdate && (!cachedDate || latestUpdate > cachedDate);

    if (hasNewerData) {
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

// Set up realtime subscription
export const subscribeToPlans = () => {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    console.warn('Cannot subscribe: Supabase client not ready. Will retry in 2s...');
    setTimeout(subscribeToPlans, 2000);
    return null;
  }

  // Unsubscribe if already subscribed
  if (realtimeSubscription) {
    realtimeSubscription.unsubscribe();
  }

  console.log('🔴 Subscribing to dataplans realtime updates...');

  realtimeSubscription = supabase
    .channel('dataplans-changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'dataplans'
      },
      (payload) => {
        console.log('🔴 Realtime change detected:', payload);

        if (payload.eventType === 'INSERT') {
          // Add new plan to cache
          plansCache.push(payload.new);
          updateCache(plansCache);
        } else if (payload.eventType === 'UPDATE') {
          // Update existing plan in cache
          const index = plansCache.findIndex(p => p.id === payload.new.id);
          if (index !== -1) {
            plansCache[index] = payload.new;
            updateCache(plansCache);
          } else {
            // If not found in cache, add it
            plansCache.push(payload.new);
            updateCache(plansCache);
          }
        } else if (payload.eventType === 'DELETE') {
          // Remove plan from cache
          plansCache = plansCache.filter(p => p.id !== payload.old.id);
          updateCache(plansCache);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Realtime subscription active!');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Realtime subscription error');
      } else {
        console.log('Realtime subscription status:', status);
      }
    });

  return realtimeSubscription;
};

// Unsubscribe from realtime (call this on cleanup)
export const unsubscribeFromPlans = () => {
  if (realtimeSubscription) {
    realtimeSubscription.unsubscribe();
    realtimeSubscription = null;
    console.log('Unsubscribed from dataplans realtime');
  }
};

// Get all active plans
export const getAllPlans = async () => {
  if (plansCache.length === 0) loadCachedPlans();
  await fetchPlans(); // background refresh
  return plansCache;
};

// Get plans for one network
export const getPlansByProvider = async (provider) => {
  const all = await getAllPlans();
  return all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
};

// Get specific category (AWOOF, CG, GIFTING, etc.)
export const getPlans = async (provider, category = null) => {
  const all = await getAllPlans();
  let result = all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
  if (category) {
    result = result.filter(p => p.category === category.toUpperCase());
  }
  return result.sort((a, b) => Number(a.price) - Number(b.price));
};

// Dispatch a custom event so your UI components can react instantly
const dispatchPlansUpdateEvent = () => {
  window.dispatchEvent(new Event('plansUpdated'));
};

// Initialize on load
loadCachedPlans();

// Start realtime subscription when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribeToPlans);
} else {
  subscribeToPlans();
}

// Export for global access
window.getAllPlans = getAllPlans;
window.getPlans = getPlans;
window.getPlansByProvider = getPlansByProvider;
window.fetchPlans = fetchPlans;
window.subscribeToPlans = subscribeToPlans;
window.unsubscribeFromPlans = unsubscribeFromPlans;