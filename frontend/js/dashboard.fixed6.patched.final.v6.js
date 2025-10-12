
// === WebAuthn Prefetch + UX Enhancements v6 ===
// This script improves biometric speed and adds loader + PIN fill during verification.

(function(){
  console.log('%c[webauthn-ux] prefetch helper installed','color:limegreen');

  // Utility to prefetch authentication options early
  async function prefetchAuthOptionsSafe(){
    try {
      if(window.prefetchAuthOptions){
        console.log('[webauthn-ux] prefetchAuthOptions called early');
        await window.prefetchAuthOptions();
      } else if(window.getAuthOptionsWithCache){
        console.log('[webauthn-ux] getAuthOptionsWithCache called early');
        await window.getAuthOptionsWithCache();
      } else {
        console.warn('[webauthn-ux] no prefetchAuthOptions or getAuthOptionsWithCache found');
      }
    } catch(err){
      console.warn('[webauthn-ux] prefetch error', err);
    }
  }

  // Run prefetch early and also when DOM ready
  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    prefetchAuthOptionsSafe();
  } else {
    document.addEventListener('DOMContentLoaded', prefetchAuthOptionsSafe);
  }

  // Reauth modal biometric visibility booster
  const bioHintKeys = ['credentialId','webauthn-cred-id','webauthn_cred','biometricsEnabled'];
  function showBiometricQuickly(){
    const hasBio = bioHintKeys.some(k=>localStorage.getItem(k));
    if(hasBio){
      const btn = document.querySelector('[data-action="biometric"], .biometric-btn, .bio-verify-btn');
      if(btn){
        btn.style.display='block';
        btn.disabled=false;
        btn.classList.add('visible','ready');
        console.log('[webauthn-ux] biometric button forced visible');
      }
    }
  }
  document.addEventListener('DOMContentLoaded', showBiometricQuickly);

  // Prefetch again once modal shows (if you emit such event)
  document.addEventListener('reauth-modal-open', prefetchAuthOptionsSafe);
  document.addEventListener('pointerdown', prefetchAuthOptionsSafe, {once:true});

  // Patch fetch to inject loader + fake PIN fill during WebAuthn verify
  const origFetch = window.fetch;
  window.fetch = async function(resource, config){
    const url = typeof resource === 'string' ? resource : resource.url || '';
    const isVerify = url.includes('/webauthn/auth/verify');
    if(!isVerify){
      return origFetch.apply(this, arguments);
    }

    console.log('[webauthn-ux] wrapping verify fetch with loader & fake pin fill');

    // Fill reauth PIN inputs visually
    try{
      if(window.getReauthInputs){
        const inputs = window.getReauthInputs();
        if(inputs && inputs.length){
          inputs.forEach(inp => inp.value = '●');
        }
      }
    }catch(e){ console.warn('[webauthn-ux] pin fill failed', e); }

    let resp;
    if(window.withLoader){
      resp = await window.withLoader(()=>origFetch.apply(this, arguments));
    } else {
      resp = await origFetch.apply(this, arguments);
    }

    // Clear inputs afterwards
    try{
      if(window.resetReauthInputs){
        window.resetReauthInputs();
      } else if(window.getReauthInputs){
        const inputs = window.getReauthInputs();
        if(inputs && inputs.length){
          inputs.forEach(inp => inp.value = '');
        }
      }
    }catch(e){ console.warn('[webauthn-ux] pin clear failed', e); }

    return resp;
  };

})();
