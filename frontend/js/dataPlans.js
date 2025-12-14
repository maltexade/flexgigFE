//dataPlans.js

let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v9';  // v4 so it clears old cache

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

// Fetch latest from your Supabase backend
// dataPlans.js – Updated fetchPlans (permanent fix)
export const fetchPlans = async () => {
  try {
    const base = (window.__SEC_API_BASE || 'https://api.flexgig.com.ng').replace(/\/+$/, '');
    const url = `${base}/api/dataPlans`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store'  // Prevent browser-level caching
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const fresh = await res.json();

    // Properly calculate the latest updated_at using Date objects
    const latestUpdate = fresh.reduce((maxDate, p) => {
      if (!p.updated_at) return maxDate;
      const current = new Date(p.updated_at);
      return maxDate === null || current > maxDate ? current : maxDate;
    }, null);

    const latestUpdateStr = latestUpdate ? latestUpdate.toISOString() : null;

    // Compare properly
    const cachedDate = cacheUpdatedAt ? new Date(cacheUpdatedAt) : null;
    const hasNewerData = latestUpdate && (!cachedDate || latestUpdate > cachedDate);

    if (hasNewerData) {
      plansCache = fresh;
      cacheUpdatedAt = latestUpdateStr;

      // Save to localStorage
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        plans: fresh,
        updatedAt: latestUpdateStr
      }));

      console.log('✅ Data plans updated from server (newer data detected)');
      
      // Trigger UI update without reload (more on this below)
      dispatchPlansUpdateEvent();

      return fresh;
    } else {
      console.log('No new data – using existing cache');
    }
  } catch (err) {
    console.warn('Failed to fetch plans, using cache', err);
  }

  return plansCache;
};
window.fetchPlans = window.fetchPlans || fetchPlans;

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
window.getPlansByProvider = window.getPlansByProvider || getPlansByProvider;

// Get specific category (AWOOF, CG, GIFTING, etc.)
export const getPlans = async (provider, category = null) => {
  const all = await getAllPlans();
  let result = all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
  if (category) {
    result = result.filter(p => p.category === category.toUpperCase());
  }
  return result.sort((a, b) => Number(a.price) - Number(b.price));
};
window.getPlans = window.getPlans || getPlans;

// Load cache immediately when app starts
loadCachedPlans();

window.getAllPlans = getAllPlans;

// Dispatch a custom event so your UI components can react instantly
const dispatchPlansUpdateEvent = () => {
  window.dispatchEvent(new Event('plansUpdated'));
};