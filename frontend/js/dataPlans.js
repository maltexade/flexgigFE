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
      .eq('active', true)  // ONLY fetch active plans
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
    
    // Filter to only active plans
    const activePlans = fresh.filter(p => p.active === true);

    const latestUpdate = activePlans.reduce((maxDate, p) => {
      if (!p.updated_at) return maxDate;
      const current = new Date(p.updated_at);
      return maxDate === null || current > maxDate ? current : maxDate;
    }, null);

    const latestUpdateStr = latestUpdate ? latestUpdate.toISOString() : null;
    const cachedDate = cacheUpdatedAt ? new Date(cacheUpdatedAt) : null;
    const hasNewerData = latestUpdate && (!cachedDate || latestUpdate > cachedDate);

    if (hasNewerData) {
      updateCache(activePlans);
      return activePlans;
    } else {
      console.log('No new data – using existing cache');
    }
  } catch (err) {
    console.warn('Failed to fetch plans via API, using cache', err);
  }

  return plansCache;
};

// Replace the realtime subscription section in your dataPlans.js

// Replace the realtime subscription section in your dataPlans.js

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
    console.log('Unsubscribing from old channel...');
    realtimeSubscription.unsubscribe();
  }

  console.log('🔴 Subscribing to dataplans realtime updates (ALL events, NO filters)...');

  realtimeSubscription = supabase
    .channel('dataplans-all-changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to ALL events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'data_plans'
        // NO FILTERS - This ensures we catch active:true AND active:false changes
      },
      (payload) => {
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:cyan');
        console.log('%c🔴 Realtime change detected:', 'color:lime;font-weight:bold', payload.eventType);
        
        // Log the active status for debugging
        if (payload.new) {
          console.log(`Plan: ${payload.new.name || 'Unknown'} | Active: ${payload.new.active} | Price: ₦${payload.new.price}`);
        }

        if (payload.eventType === 'INSERT') {
          // Only add if active is true
          if (payload.new.active === true) {
            plansCache.push(payload.new);
            updateCache(plansCache);
            console.log('%c✅ New active plan added to cache', 'color:lime;font-weight:bold');
          } else {
            console.log('%cℹ️ Inactive plan inserted - not adding to cache', 'color:gray');
          }
        } 
        else if (payload.eventType === 'UPDATE') {
          const index = plansCache.findIndex(p => p.id === payload.new.id);
          const wasInCache = index !== -1;
          
          console.log(`Cache check: ${wasInCache ? 'Found in cache at index ' + index : 'NOT in cache'}`);
          
          // CRITICAL: Check if the plan was set to inactive
          if (payload.new.active === false) {
            console.log('%c🔴 Plan set to INACTIVE (active: false)', 'color:red;font-weight:bold');
            
            if (wasInCache) {
              // Remove from cache since it's now inactive
              plansCache.splice(index, 1);
              console.log(`%c🗑️ REMOVED from cache (was at index ${index})`, 'color:red;font-weight:bold');
              console.log(`Cache size: ${plansCache.length + 1} → ${plansCache.length}`);
              
              // Force update to trigger UI refresh
              updateCache(plansCache);
            } else {
              console.log('%cℹ️ Plan was not in cache (already removed or never added)', 'color:gray');
            }
          } 
          // Plan is active
          else if (payload.new.active === true) {
            console.log('%c✅ Plan is ACTIVE (active: true)', 'color:lime;font-weight:bold');
            
            if (wasInCache) {
              // Update existing plan
              plansCache[index] = payload.new;
              console.log(`%c✅ Updated in cache at index ${index}`, 'color:lime');
              updateCache(plansCache);
            } else {
              // Not in cache but is active - add it
              plansCache.push(payload.new);
              console.log(`%c✅ Added to cache (new index: ${plansCache.length - 1})`, 'color:lime');
              updateCache(plansCache);
            }
          }
        } 
        else if (payload.eventType === 'DELETE') {
          // Remove plan from cache
          const initialLength = plansCache.length;
          plansCache = plansCache.filter(p => p.id !== payload.old.id);
          
          if (plansCache.length < initialLength) {
            console.log(`%c🗑️ Plan deleted - removed from cache (${initialLength} → ${plansCache.length})`, 'color:red;font-weight:bold');
            updateCache(plansCache);
          } else {
            console.log('%cℹ️ Plan deleted - was not in cache', 'color:gray');
          }
        }
        
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:cyan');
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('%c✅ Realtime subscription active! Listening for ALL changes (including active:false)', 'color:lime;font-size:14px;font-weight:bold');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('%c❌ Realtime subscription error!', 'color:red;font-weight:bold');
        console.log('%cTroubleshooting:', 'color:orange');
        console.log('1. Check Database → Replication in Supabase');
        console.log('2. Ensure Realtime is enabled for data_plans');
        console.log('3. Check RLS policies allow SELECT');
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
  // Filter cache to ensure only active plans
  return plansCache.filter(p => p.active === true);
};

// Get plans for one network
export const getPlansByProvider = async (provider) => {
  const all = await getAllPlans();
  return all.filter(p => 
    p.provider.toLowerCase() === provider.toLowerCase() && 
    p.active === true  // Extra safety check
  );
};

// Get specific category (AWOOF, CG, GIFTING, etc.)
export const getPlans = async (provider, category = null) => {
  const all = await getAllPlans();
  let result = all.filter(p => 
    p.provider.toLowerCase() === provider.toLowerCase() &&
    p.active === true  // Extra safety check
  );
  if (category) {
    result = result.filter(p => p.category === category.toUpperCase());
  }
  return result.sort((a, b) => Number(a.price) - Number(b.price));
};

// Add this improved version to your dataPlans.js
// Replace the existing dispatchPlansUpdateEvent function

// Dispatch a custom event so your UI components can react instantly
const dispatchPlansUpdateEvent = () => {
  console.log('%c[EVENT] Dispatching plansUpdated event...', 'color:yellow;font-weight:bold');
  
  const event = new CustomEvent('plansUpdated', { 
    detail: { 
      timestamp: new Date().toISOString(),
      cacheSize: plansCache.length,
      updatedAt: cacheUpdatedAt
    } 
  });
  
  window.dispatchEvent(event);
  console.log('%c[EVENT] plansUpdated event dispatched!', 'color:lime;font-weight:bold', event.detail);
};

// Initialize on load
loadCachedPlans();

// Start realtime subscription when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribeToPlans);
} else {
  subscribeToPlans();
}

// --- Ensure global exposure immediately ---
window.refreshActiveProviderUI = window.refreshActiveProviderUI || function () {
  console.warn('refreshActiveProviderUI() called before dashboard functions are ready');
};

// --- Now define the real function later ---
setTimeout(() => {
  const realHandler = () => {
    const activeProvider = ['mtn','airtel','glo','ninemobile'].find(p =>
      document.querySelector(`.provider-box.${p}.active`)
    ) || 'mtn';

    if (activeProvider) {
      if (typeof renderDashboardPlans === 'function') renderDashboardPlans(activeProvider);
      if (typeof renderModalPlans === 'function') renderModalPlans(activeProvider);
      if (typeof attachPlanListeners === 'function') attachPlanListeners();
      if (typeof window.showRealtimeUpdateNotification === 'function') window.showRealtimeUpdateNotification();
      console.log('✨ UI REFRESH COMPLETE!');
    } else {
      console.log('⚠️ No active provider selected');
    }
  };

  // Replace the temporary global with the real one
  window.refreshActiveProviderUI = realHandler;

  // Attach listener
  window.addEventListener('plansUpdated', window.refreshActiveProviderUI);
  console.log('✅ Realtime UI handler fully ready!');
}, 500); // small delay to ensure render functions exist


// ===============================
// REALTIME UI UPDATE HANDLER
// ===============================

// --- Notification function ---
window.showRealtimeUpdateNotification = window.showRealtimeUpdateNotification || function () {
  if (document.querySelector('.realtime-update-notification')) return;

  const notification = document.createElement('div');
  notification.className = 'realtime-update-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideInRight 0.3s ease-out;
    ">
      <span style="font-size: 18px;">🔄</span>
      <span>Plans updated in real-time</span>
    </div>
  `;

  if (!document.querySelector('#realtime-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'realtime-notification-styles';
    style.textContent = `
      @keyframes slideInRight { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.firstElementChild.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
};

// --- Global UI refresh handler ---
window.refreshActiveProviderUI = window.refreshActiveProviderUI || function () {
  console.log('%c[REALTIME] Plans updated - refreshing UI...', 'color:lime;font-weight:bold');

  const activeProvider = ['mtn','airtel','glo','ninemobile'].find(p =>
    document.querySelector(`.provider-box.${p}.active`)
  ) || 'mtn'; // fallback

  if (activeProvider) {
    console.log(`[REALTIME] Refreshing plans for ${activeProvider.toUpperCase()}`);

    if (typeof renderDashboardPlans === 'function') {
      renderDashboardPlans(activeProvider);
      console.log('✅ renderDashboardPlans() called');
    } else console.warn('❌ renderDashboardPlans() not found');

    if (typeof renderModalPlans === 'function') {
      renderModalPlans(activeProvider);
      console.log('✅ renderModalPlans() called');
    } else console.warn('❌ renderModalPlans() not found');

    if (typeof attachPlanListeners === 'function') {
      attachPlanListeners();
      console.log('✅ attachPlanListeners() called');
    } else console.warn('❌ attachPlanListeners() not found');

    if (typeof showRealtimeUpdateNotification === 'function') {
      showRealtimeUpdateNotification();
    }

    console.log('%c✨ UI REFRESH COMPLETE!', 'color:lime;font-size:14px;font-weight:bold');
  } else {
    console.log('%c⚠️ No active provider selected', 'color:yellow');
  }
};

// --- Attach plansUpdated listener only once ---
if (!window.__realtimeUIHandlerAttached__) {
  window.addEventListener('plansUpdated', window.refreshActiveProviderUI);
  window.__realtimeUIHandlerAttached__ = true;
  console.log('%c✅ Realtime UI update handler active!', 'color:lime;font-weight:bold');
  console.log('%cℹ️ Call window.refreshActiveProviderUI() manually to test', 'color:cyan');
}

// Export for global access
window.getAllPlans = getAllPlans;
window.getPlans = getPlans;
window.getPlansByProvider = getPlansByProvider;
window.fetchPlans = fetchPlans;
window.subscribeToPlans = subscribeToPlans;
window.unsubscribeFromPlans = unsubscribeFromPlans;