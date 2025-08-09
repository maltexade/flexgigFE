console.log('main.js: Starting execution');

try {
  console.log('main.js: Initializing Firebase');
  const firebaseConfig = {
    apiKey: "AIzaSyDygHaTcYyR5hBL3NY9Kl8IaAqbUImLSyc",
    authDomain: "myauthapp-954b4.firebaseapp.com",
    projectId: "myauthapp-954b4",
    storageBucket: "myauthapp-954b4.firebasestorage.app",
    messagingSenderId: "424977780033",
    appId: "1:424977780033:web:40882e7f6003bc386ee5c0",
    measurementId: "G-0Y35JDXM20"
  };
  try {
    if (typeof firebase !== 'undefined') {
      firebase.initializeApp(firebaseConfig);
      console.log('main.js: Firebase initialized successfully');
    } else {
      console.error('main.js: Firebase SDK not loaded');
    }
  } catch (error) {
    console.error('main.js: Firebase init error:', error);
  }

  let deferredPrompt = null;
  let modalMode = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('main.js: beforeinstallprompt event fired:', e);
    e.preventDefault();
    deferredPrompt = e;
    const openBtn = document.querySelector('.install-app-button');
    if (openBtn) {
      console.log('main.js: Setting install button display to flex');
      openBtn.style.display = 'flex';
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('main.js: PWA installed successfully');
    deferredPrompt = null;
  });

  function showInstallProgress(show) {
    console.log(`main.js: Toggling install progress: ${show}`);
    document.getElementById('install-progress').classList.toggle('hidden', !show);
    document.getElementById('install-app-confirm-desktop')?.classList.toggle('hidden', show);
    document.getElementById('install-app-cancel-desktop')?.classList.toggle('hidden', show);
    document.getElementById('install-app-confirm-mobile')?.classList.toggle('hidden', show);
  }

  function showInstallSuccess() {
    console.log('main.js: Showing install success');
    document.getElementById('install-progress').classList.add('hidden');
    document.getElementById('install-success').classList.remove('hidden');
  }

  function hideInstallSuccessUI() {
    console.log('main.js: Hiding install success UI');
    document.getElementById('install-progress').classList.add('hidden');
    document.getElementById('install-success').classList.add('hidden');
    document.getElementById('install-app-confirm-desktop')?.classList.remove('hidden');
    document.getElementById('install-app-cancel-desktop')?.classList.remove('hidden');
    document.getElementById('install-app-confirm-mobile')?.classList.remove('hidden');
  }

  function isDesktopOrTablet() {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    console.log(`main.js: isDesktopOrTablet: ${isDesktop}`);
    return isDesktop;
  }

  function updateModalBox() {
    console.log(`main.js: Updating modal box to ${modalMode}`);
    const mob = document.getElementById('install-modal-mobile');
    const desk = document.getElementById('install-modal-desktop');
    if (modalMode === 'desktop') {
      if (mob) mob.classList.add('hidden');
      if (desk) {
        desk.classList.remove('hidden');
        desk.classList.add('flex');
        setTimeout(() => desk.classList.add('show'), 10);
      }
    } else {
      if (desk) {
        desk.classList.add('hidden');
        desk.classList.remove('flex');
        desk.classList.remove('show');
      }
      if (mob) mob.classList.remove('hidden');
    }
  }

  function showInstallModal() {
    console.log('main.js: Showing install modal');
    modalMode = isDesktopOrTablet() ? 'desktop' : 'mobile';
    document.getElementById('install-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    updateModalBox();
    hideInstallSuccessUI();
  }

  function hideInstallModal() {
    console.log('main.js: Hiding install modal');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    hideInstallSuccessUI();
    const modalBackdrop = document.getElementById('install-modal');
    if (modalMode === 'desktop') {
      const desk = document.getElementById('install-modal-desktop');
      desk.classList.remove('show');
      setTimeout(() => {
        modalBackdrop.classList.add('hidden');
        modalMode = null;
      }, 300);
    } else {
      setTimeout(() => {
        modalBackdrop.classList.add('hidden');
        modalMode = null;
      }, 300);
    }
  }

  function showEmailLoginModal() {
    console.log('main.js: Showing email login modal');
    document.getElementById('email-login-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }

  function hideEmailLoginModal() {
    console.log('main.js: Hiding email login modal');
    document.getElementById('email-login-modal').classList.add('hidden');
    document.getElementById('email-error').classList.add('hidden');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    console.log('main.js: DOMContentLoaded fired');

    const openBtn = document.querySelector('.install-app-button');
    if (openBtn) {
      console.log('main.js: Setting install button display to flex');
      openBtn.style.display = 'flex';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('main.js: Install button clicked');
        showInstallModal();
      });
    } else {
      console.error('main.js: Install button not found');
    }

    const emailLoginBtn = document.getElementById('email-login-button');
    if (emailLoginBtn) {
      emailLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('main.js: Email login button clicked');
        showEmailLoginModal();
      });
    } else {
      console.error('main.js: Email login button not found');
    }

    const emailLoginForm = document.getElementById('email-login-form');
    if (emailLoginForm) {
      emailLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('main.js: Email login form submitted');
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('email-error');
        try {
          if (typeof firebase !== 'undefined' && firebase.auth) {
            console.log('main.js: Attempting Firebase email sign-in');
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            console.log('main.js: Email sign-in successful:', userCredential.user.uid);
            hideEmailLoginModal();
            window.location.href = '/dashboard.html?token=' + await userCredential.user.getIdToken();
          } else {
            console.error('main.js: Firebase auth not loaded');
            errorElement.textContent = 'Authentication service unavailable. Please try again later.';
            errorElement.classList.remove('hidden');
          }
        } catch (error) {
          console.error('main.js: Email sign-in error:', error);
          errorElement.textContent = error.message;
          errorElement.classList.remove('hidden');
        }
      });
    }

    const emailCancelBtn = document.getElementById('email-login-cancel');
    if (emailCancelBtn) {
      emailCancelBtn.addEventListener('click', () => {
        console.log('main.js: Email login cancel clicked');
        hideEmailLoginModal();
      });
    }

    const modalBackdrop = document.getElementById('install-modal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          console.log('main.js: Modal backdrop clicked, closing modal');
          hideInstallModal();
        }
      });
    }

    const confirmBtnMobile = document.getElementById('install-app-confirm-mobile');
    if (confirmBtnMobile) {
      confirmBtnMobile.addEventListener('click', async () => {
        console.log('main.js: Mobile confirm clicked, deferredPrompt:', deferredPrompt);
        if (!('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window)) {
          console.error('main.js: Browser does not support PWA installation');
          alert('This browser does not support app installation. Try Chrome or Edge on an HTTPS connection.');
          return;
        }
        if (deferredPrompt) {
          console.log('main.js: Showing install prompt');
          showInstallProgress(true);
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('main.js: Install prompt outcome:', outcome);
          deferredPrompt = null;
          setTimeout(() => {
            showInstallProgress(false);
            if (outcome === 'accepted') {
              console.log('main.js: User accepted install prompt');
              showInstallSuccess();
            } else {
              console.log('main.js: User dismissed install prompt');
            }
          }, 600);
        } else {
          console.error('main.js: No deferredPrompt available');
          alert('Installation not available. Please try again or ensure you are using Chrome with HTTPS.');
        }
      });
    }

    const confirmBtnDesktop = document.getElementById('install-app-confirm-desktop');
    if (confirmBtnDesktop) {
      confirmBtnDesktop.addEventListener('click', async () => {
        console.log('main.js: Desktop confirm clicked, deferredPrompt:', deferredPrompt);
        if (!('serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window)) {
          console.error('main.js: Browser does not support PWA installation');
          alert('This browser does not support app installation. Try Chrome or Edge on an HTTPS connection.');
          return;
        }
        if (deferredPrompt) {
          console.log('main.js: Showing install prompt');
          showInstallProgress(true);
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('main.js: Install prompt outcome:', outcome);
          deferredPrompt = null;
          setTimeout(() => {
            showInstallProgress(false);
            if (outcome === 'accepted') {
              console.log('main.js: User accepted install prompt');
              showInstallSuccess();
            } else {
              console.log('main.js: User dismissed install prompt');
            }
          }, 600);
        } else {
          console.error('main.js: No deferredPrompt available');
          alert('Installation not available. Please try again or ensure you are using Chrome with HTTPS.');
        }
      });
    }

    const cancelBtnDesktop = document.getElementById('install-app-cancel-desktop');
    if (cancelBtnDesktop) {
      cancelBtnDesktop.addEventListener('click', () => {
        console.log('main.js: Desktop cancel clicked');
        hideInstallModal();
      });
    }

    const box = document.getElementById('install-modal-mobile');
    const handle = document.getElementById('modal-drag-handle');
    if (handle && box) {
      let startY = null, isDragging = false;
      handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('main.js: Touch start:', e.touches[0].clientY);
        isDragging = true;
        startY = e.touches[0].clientY;
        box.style.transition = 'none';
      });
      handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        let dy = Math.max(0, e.touches[0].clientY - startY);
        console.log('main.js: Touch move:', dy);
        box.style.transform = `translateY(${dy}px)`;
      });
      handle.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        let dy = Math.max(0, e.changedTouches[0].clientY - startY);
        console.log('main.js: Touch end:', dy);
        isDragging = false;
        box.style.transition = 'transform .25s';
        if (dy > 100) {
          console.log('main.js: Drag-to-close triggered');
          hideInstallModal();
          setTimeout(() => { box.style.transform = ''; }, 250);
        } else {
          console.log('main.js: Resetting mobile modal transform');
          box.style.transform = '';
        }
      });
    }
  });

  window.addEventListener('resize', () => {
    const modal = document.getElementById('install-modal');
    if (!modal.classList.contains('hidden')) {
      console.log('main.js: Window resized, updating modal box');
      updateModalBox();
    }
  });
} catch (error) {
  console.error('main.js: Uncaught error:', error);
}