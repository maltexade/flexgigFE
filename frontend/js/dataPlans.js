// src/utils/dataPlans.js  ← NEW & FINAL VERSION (2025 READY)

let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v4';  // v4 so it clears old cache

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
    const res = await fetch('/api/dataPlans');
    if (!res.ok) throw new Error('Network error');
    const fresh = await res.json();

    const latestUpdate = fresh.reduce((max, p) => 
      p.updated_at && p.updated_at > max ? p.updated_at : max, ''
    );

    if (latestUpdate && latestUpdate !== cacheUpdatedAt) {
      plansCache = fresh;
      cacheUpdatedAt = latestUpdate;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ plans: fresh, updatedAt: latestUpdate }));
      console.log('Data plans updated from server');
      return fresh;
    }
  } catch (err) {
    console.warn('Using cached plans (offline)', err.message);
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