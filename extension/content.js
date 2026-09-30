/**
 * Digital Behavioral Fingerprinting & Web Analytics System
 * Content Script (content.js)
 * Captures in-page interaction telemetry: scroll velocity, focus/blur timing, mouse/keyboard activity.
 */

(function () {
  let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop;
  let lastScrollTime = performance.now();
  let totalScrollDistance = 0;
  let totalScrollDuration = 0; // in milliseconds
  let scrollEventsCount = 0;

  let keyPressCount = 0;
  let mouseClickCount = 0;
  let mouseMoveCount = 0;

  let focusStartTime = Date.now();
  let totalActiveTime = 0;
  let totalBlurTime = 0;
  let blurStartTime = null;
  let isFocused = true;

  // Track window scroll velocity
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const currentTime = performance.now();
    const distance = Math.abs(currentScrollTop - lastScrollTop);
    const timeDelta = currentTime - lastScrollTime;

    if (timeDelta > 0 && distance > 0) {
      totalScrollDistance += distance;
      totalScrollDuration += timeDelta;
      scrollEventsCount++;
    }

    lastScrollTop = currentScrollTop;
    lastScrollTime = currentTime;

    // Reset idle scroll calculation after inactivity
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      lastScrollTime = performance.now();
    }, 200);
  }, { passive: true });

  // Track key presses & mouse clicks
  window.addEventListener('keydown', () => {
    keyPressCount++;
  }, { passive: true });

  window.addEventListener('click', () => {
    mouseClickCount++;
  }, { passive: true });

  window.addEventListener('mousemove', () => {
    mouseMoveCount++;
  }, { passive: true });

  // Track focus and blur states
  window.addEventListener('focus', () => {
    const now = Date.now();
    if (!isFocused && blurStartTime) {
      totalBlurTime += (now - blurStartTime);
    }
    isFocused = true;
    focusStartTime = now;
  });

  window.addEventListener('blur', () => {
    const now = Date.now();
    if (isFocused) {
      totalActiveTime += (now - focusStartTime);
    }
    isFocused = false;
    blurStartTime = now;
  });

  // Calculate composite scroll velocity in px/sec
  function getScrollVelocity() {
    if (totalScrollDuration <= 0) return 0;
    // velocity in pixels per second
    const velocity = (totalScrollDistance / totalScrollDuration) * 1000;
    return parseFloat(velocity.toFixed(2));
  }

  // Calculate interaction intensity score
  function getMouseActivityScore() {
    // Weighted combination of interactions
    const score = (mouseClickCount * 3) + (keyPressCount * 2) + Math.min(mouseMoveCount * 0.1, 50);
    return parseFloat(score.toFixed(2));
  }

  // Periodically send metrics payload to background service worker
  const TELEMETRY_INTERVAL_MS = 5000; // send every 5s

  setInterval(() => {
    const now = Date.now();
    let activeDuration = totalActiveTime;
    if (isFocused) {
      activeDuration += (now - focusStartTime);
    }

    const payload = {
      type: 'CONTENT_TELEMETRY',
      scrollVelocity: getScrollVelocity(),
      mouseActivityScore: getMouseActivityScore(),
      activeWindowTimeSec: parseFloat((activeDuration / 1000).toFixed(2)),
      blurTimeSec: parseFloat((totalBlurTime / 1000).toFixed(2)),
      url: window.location.href,
      domain: window.location.hostname
    };

    // Send payload to background script safely
    if (chrome && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage(payload, () => {
        if (chrome.runtime.lastError) {
          // Extension context reloaded or background script unreachable
        }
      });
    }

    // Reset window interaction counters for next window frame
    totalScrollDistance = 0;
    totalScrollDuration = 0;
    keyPressCount = 0;
    mouseClickCount = 0;
    mouseMoveCount = 0;
  }, TELEMETRY_INTERVAL_MS);

})();
