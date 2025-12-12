// src/utils/dataPlans.js
// FINAL VERSION — 2025 READY — WORKS OFFLINE + ONLINE + STATIC FALLBACK

let plansCache = [];
let cacheUpdatedAt = null;
const CACHE_KEY = 'cached_data_plans_v5'; // bump to v5 to clear old broken cache

// =====================================================================
// 1. YOUR STATIC PLANS (NEVER FAILS) =====================================================================
const STATIC_PLANS = [
  // MTN
  ...[
    { price: 50, data: '50MB', duration: '1 DAY' },
    { price: 100, data: '250MB', duration: '1 DAY' },
    { price: 200, data: '500MB', duration: '3 DAYS' },
    { price: 300, data: '1GB', duration: '7 DAYS' },
    { price: 400, data: '1.5GB', duration: '7 DAYS' },
    { price: 500, data: '2GB', duration: '14 DAYS' },
    { price: 800, data: '3GB', duration: '14 DAYS' },
    { price: 1000, data: '4.5GB', duration: '30 DAYS' },
    { price: 1200, data: '6GB', duration: '30 DAYS' },
    { price: 1500, data: '8GB', duration: '30 DAYS' }
  ].map(p => ({ ...p, provider: 'mtn', category: 'AWOOF', plan_id: `mtn_awoof_${p.price}` })),

  ...[
    { price: 2000, data: '11GB', duration: '30 DAYS' },
    { price: 2500, data: '15GB', duration: '30 DAYS' },
    { price: 3000, data: '20GB', duration: '30 DAYS' },
    { price: 3500, data: '25GB', duration: '30 DAYS' },
    { price: 5000, data: '40GB', duration: '30 DAYS' },
    { price: 10000, data: '75GB', duration: '90 DAYS' },
    { price: 15000, data: '120GB', duration: '90 DAYS' },
    { price: 20000, data: '200GB', duration: '120 DAYS' },
    { price: 30000, data: '400GB', duration: '180 DAYS' },
    { price: 50000, data: '1TB', duration: '365 DAYS' }
  ].map(p => ({ ...p, provider: 'mtn', category: 'GIFTING', plan_id: `mtn_gifting_${p.price}` })),

  // AIRTEL
  ...[
    { price: 100, data: '200MB', duration: '1 DAY' },
    { price: 200, data: '500MB', duration: '2 DAYS' },
    { price: 300, data: '750MB', duration: '3 DAYS' },
    { price: 500, data: '1.5GB', duration: '7 DAYS' },
    { price: 1000, data: '3GB', duration: '14 DAYS' },
    { price: 1500, data: '6GB', duration: '30 DAYS' },
    { price: 2000, data: '9GB', duration: '30 DAYS' },
    { price: 2500, data: '12GB', duration: '30 DAYS' },
    { price: 3000, data: '15GB', duration: '30 DAYS' },
    { price: 3500, data: '20GB', duration: '30 DAYS' }
  ].map(p => ({ ...p, provider: 'airtel', category: 'AWOOF', plan_id: `airtel_awoof_${p.price}` })),

  ...[
    { price: 4000, data: '24GB', duration: '30 DAYS' },
    { price: 5000, data: '40GB', duration: '30 DAYS' },
    { price: 8000, data: '75GB', duration: '60 DAYS' },
    { price: 10000, data: '120GB', duration: '90 DAYS' },
    { price: 15000, data: '200GB', duration: '90 DAYS' },
    { price: 20000, data: '280GB', duration: '120 DAYS' },
    { price: 25000, data: '400GB', duration: '180 DAYS' },
    { price: 30000, data: '500GB', duration: '180 DAYS' },
    { price: 40000, data: '1TB', duration: '365 DAYS' },
    { price: 50000, data: '2TB', duration: '365 DAYS' }
  ].map(p => ({ ...p, provider: 'airtel', category: 'CG', plan_id: `airtel_cg_${p.price}` })),

  // GLO
  ...[
    { price: 50, data: '50MB', duration: '1 DAY' },
    { price: 100, data: '150MB', duration: '1 DAY' },
    { price: 200, data: '500MB', duration: '2 DAYS' },
    { price: 300, data: '1GB', duration: '5 DAYS' },
    { price: 500, data: '2GB', duration: '7 DAYS' },
    { price: 800, data: '3GB', duration: '14 DAYS' },
    { price: 1000, data: '4GB', duration: '15 DAYS' },
    { price: 1500, data: '7GB', duration: '30 DAYS' },
    { price: 2000, data: '10GB', duration: '30 DAYS' },
    { price: 2500, data: '12GB', duration: '30 DAYS' }
  ].map(p => ({ ...p, provider: 'glo', category: 'CG', plan_id: `glo_cg_${p.price}` })),

  ...[
    { price: 3000, data: '18GB', duration: '30 DAYS' },
    { price: 4000, data: '24GB', duration: '30 DAYS' },
    { price: 5000, data: '32GB', duration: '30 DAYS' },
    { price: 8000, data: '55GB', duration: '60 DAYS' },
    { price: 10000, data: '75GB', duration: '90 DAYS' },
    { price: 15000, data: '150GB', duration: '90 DAYS' },
    { price: 20000, data: '250GB', duration: '120 DAYS' },
    { price: 30000, data: '500GB', duration: '180 DAYS' },
    { price: 40000, data: '800GB', duration: '365 DAYS' },
    { price: 50000, data: '1.5TB', duration: '365 DAYS' }
  ].map(p => ({ ...p, provider: 'glo', category: 'GIFTING', plan_id: `glo_gifting_${p.price}` })),

  // 9MOBILE
  ...[
    { price: 100, data: '100MB', duration: '1 DAY' },
    { price: 200, data: '300MB', duration: '2 DAYS' },
    { price: 300, data: '500MB', duration: '3 DAYS' },
    { price: 500, data: '1GB', duration: '7 DAYS' },
    { price: 800, data: '2GB', duration: '14 DAYS' },
    { price: 1000, data: '3GB', duration: '14 DAYS' },
    { price: 1200, data: '4GB', duration: '30 DAYS' },
    { price: 1500, data: '5GB', duration: '30 DAYS' },
    { price: 2000, data: '7GB', duration: '30 DAYS' },
    { price: 2500, data: '10GB', duration: '30 DAYS' },
    { price: 3000, data: '12GB', duration: '30 DAYS' },
    { price: 3500, data: '15GB', duration: '30 DAYS' },
    { price: 4000, data: '20GB', duration: '30 DAYS' },
    { price: 5000, data: '30GB', duration: '30 DAYS' },
    { price: 8000, data: '50GB', duration: '60 DAYS' },
    { price: 10000, data: '80GB', duration: '90 DAYS' },
    { price: 15000, data: '150GB', duration: '90 DAYS' },
    { price: 20000, data: '250GB', duration: '120 DAYS' },
    { price: 30000, data: '400GB', duration: '180 DAYS' },
    { price: 50000, data: '1TB', duration: '365 DAYS' }
  ].map(p => ({ ...p, provider: '9mobile', category: 'STANDARD', plan_id: `9mobile_${p.price}` }))
];

// ===================================================================== 2. CACHING & FETCHING =====================================================================

// Load from localStorage on import
const loadCachedPlans = () => {
  try {
    const saved = localStorage.getItem(CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      plansCache = parsed.plans || [];
      cacheUpdatedAt = parsed.updatedAt || null;
      console.log('[PLANS] Loaded from cache:', plansCache.length);
    }
  } catch (e) {
    console.warn('[PLANS] Cache corrupt — using static');
  }

  // Always ensure we have data
  if (plansCache.length === 0) {
    plansCache = STATIC_PLANS;
    console.log('[PLANS] No cache — using static plans');
  }
};

// Try to update from your backend
const fetchPlans = async () => {
  try {
    const base = (window.__SEC_API_BASE || 'https://api.flexgig.com.ng').replace(/\/+$/, '');
    const url = `${base}/api/dataPlans`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const fresh = await res.json();

    if (Array.isArray(fresh) && fresh.length > 0) {
      plansCache = fresh;
      cacheUpdatedAt = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ plans: fresh, updatedAt: cacheUpdatedAt }));
      console.log('[PLANS] Updated from server:', fresh.length, 'plans');
      return fresh;
    }
  } catch (err) {
    console.warn('[PLANS] Server fetch failed — using cache/static', err.message);
  }
  return plansCache;
};

// ===================================================================== 3. EXPORTS =====================================================================

export const getAllPlans = async () => {
  if (plansCache.length === 0) loadCachedPlans();
  // Background refresh — never blocks UI
  fetchPlans();
  return plansCache;
};

export const getPlansByProvider = async (provider) => {
  const all = await getAllPlans();
  return all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
};

export const getPlans = async (provider, category = null) => {
  const all = await getAllPlans();
  let result = all.filter(p => p.provider.toLowerCase() === provider.toLowerCase());
  if (category) {
    result = result.filter(p => p.category === category.toUpperCase());
  }
  return result.sort((a, b) => a.price - b.price);
};

// Auto-load cache on import
loadCachedPlans();

// Optional: Force refresh from console
window.forceRefreshPlans = async () => {
  plansCache = [];
  cacheUpdatedAt = null;
  localStorage.removeItem(CACHE_KEY);
  await fetchPlans();
  location.reload();
};