// dataPlans.js with Supabase Realtime

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL'; // Replace with your Supabase URL
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your anon/public key
const supabase = createClient(supabaseUrl, supabaseKey);

let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v12';
let realtimeSubscription = null;

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

  try {
    const { data, error } = await supabase
      .from('dataplans')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    updateCache(data);
    return data;
  } catch (err) {
    console.warn('Failed to fetch plans from Supabase, using cache', err);
    return plansCache;
  }
};

// Set up realtime subscription
export const subscribeToPlans = () => {
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
          }
        } else if (payload.eventType === 'DELETE') {
          // Remove plan from cache
          plansCache = plansCache.filter(p => p.id !== payload.old.id);
          updateCache(plansCache);
        }
      }
    )
    .subscribe((status) => {
      console.log('Realtime subscription status:', status);
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
subscribeToPlans(); // Start listening to realtime changes immediately

// Export for global access
window.getAllPlans = getAllPlans;
window.getPlans = getPlans;
window.getPlansByProvider = getPlansByProvider;
window.fetchPlans = fetchPlans;
window.subscribeToPlans = subscribeToPlans;
window.unsubscribeFromPlans = unsubscribeFromPlans;