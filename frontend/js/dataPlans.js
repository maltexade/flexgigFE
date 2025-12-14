//dataPlans.js

let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v5';  // v4 so it clears old cache

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
      cache: 'no-store'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const fresh = await res.json();

    // FIX 1: Properly find the latest updated_at using Date objects
    const latestUpdate = fresh.reduce((maxDate, p) => {
      if (!p.updated_at) return maxDate;
      const currentDate = new Date(p.updated_at);
      return (!maxDate || currentDate > maxDate) ? currentDate : maxDate;
    }, null);

    const latestUpdateStr = latestUpdate ? latestUpdate.toISOString() : null;

    // FIX 2: Compare properly (both as ISO strings or Dates)
    const cacheDate = cacheUpdatedAt ? new Date(cacheUpdatedAt) : null;
    const shouldUpdate = latestUpdate && (!cacheDate || latestUpdate > cacheDate);

    if (shouldUpdate) {
      plansCache = fresh;
      cacheUpdatedAt = latestUpdateStr;  // Store as ISO string
      localStorage.setItem(CACHE_KEY, JSON.stringify({ 
        plans: fresh, 
        updatedAt: latestUpdateStr 
      }));
      console.log('Data plans updated from server');
      return fresh;
    }
  } catch (err) {
    console.warn('Using cached/offline plans', err.message || err);
  }
  return plansCache;
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

// Load cache immediately when app starts
loadCachedPlans();

window.getAllPlans = getAllPlans;