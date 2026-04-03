/* ==========================================================================
   learning-to-course  --  main.js
   Complete interactive engine for PWA course websites.
   Copied verbatim into every generated course's website/ directory.
   AI never regenerates this file; HTML references documented class names
   and data-* attributes only.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     0. PROGRESS TRACKING (localStorage)
     Schema: { userId, courseId, progress: { completedSections[], quizScores{},
               flashcardProgress{}, reflections{}, currentSection, streak, lastVisit } }
     ------------------------------------------------------------------ */
  const STORAGE_KEY = 'courseProgress';

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultProgress();
    } catch { return defaultProgress(); }
  }

  function defaultProgress() {
    return {
      userId: 'local-user',
      courseId: document.title || 'course',
      progress: {
        completedSections: [],
        quizScores: {},
        flashcardProgress: {},
        reflections: {},
        currentSection: null,
        streak: 0,
        lastVisit: null
      }
    };
  }

  function saveProgress(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function updateStreak(data) {
    const now = new Date();
    const last = data.progress.lastVisit ? new Date(data.progress.lastVisit) : null;
    if (last) {
      const diffDays = Math.floor((now - last) / 86400000);
      if (diffDays === 1) data.progress.streak += 1;
      else if (diffDays > 1) data.progress.streak = 1;
    } else {
      data.progress.streak = 1;
    }
    data.progress.lastVisit = now.toISOString();
    saveProgress(data);
  }

  const progressData = loadProgress();
  updateStreak(progressData);

  /* ------------------------------------------------------------------
     1. NAVIGATION & PROGRESS BAR
     ------------------------------------------------------------------ */
  function initNavigation() {
    const modules = document.querySelectorAll('[data-module]');
    const progressBar = document.querySelector('.progress-bar-fill, #progress-bar');
    const dotsContainer = document.querySelector('.nav-dots');
    if (!modules.length) return;

    // Build dots
    if (dotsContainer) {
      modules.forEach(function (mod, i) {
        const dot = document.createElement('button');
        dot.className = 'nav-dot';
        dot.setAttribute('aria-label', 'Jump to ' + (mod.dataset.module || 'module ' + (i + 1)));
        dot.dataset.index = i;
        dot.addEventListener('click', function () {
          modules[i].scrollIntoView({ behavior: 'smooth' });
        });
        dotsContainer.appendChild(dot);
      });
    }

    var dots = dotsContainer ? dotsContainer.querySelectorAll('.nav-dot') : [];
    var visited = new Set(progressData.progress.completedSections || []);

    function updateOnScroll() {
      var scrollY = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docHeight > 0 ? Math.min(scrollY / docHeight, 1) : 0;
      if (progressBar) progressBar.style.width = (pct * 100) + '%';

      var currentIdx = -1;
      modules.forEach(function (mod, i) {
        var rect = mod.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.5) currentIdx = i;
      });

      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === currentIdx);
        var modId = modules[i].dataset.module || modules[i].id;
        if (modId && visited.has(modId)) d.classList.add('visited');
      });

      if (currentIdx >= 0) {
        var modId = modules[currentIdx].dataset.module || modules[currentIdx].id;
        if (modId) {
          progressData.progress.currentSection = modId;
          saveProgress(progressData);
        }
      }
    }

    window.addEventListener('scroll', updateOnScroll, { passive: true });
    updateOnScroll();

    // Mark section complete helper
    window._markSectionComplete = function (id) {
      if (!visited.has(id)) {
        visited.add(id);
        progressData.progress.completedSections = Array.from(visited);
        saveProgress(progressData);
        updateOnScroll();
      }
    };

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement || {}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement && document.activeElement.isContentEditable) return;

      var currentIdx = -1;
      modules.forEach(function (mod, i) {
        if (mod.getBoundingClientRect().top <= window.innerHeight * 0.5) currentIdx = i;
      });

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        var next = Math.min(currentIdx + 1, modules.length - 1);
        modules[next].scrollIntoView({ behavior: 'smooth' });
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = Math.max(currentIdx - 1, 0);
        modules[prev].scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  /* ------------------------------------------------------------------
     2. SCROLL-TRIGGERED ANIMATIONS
     ------------------------------------------------------------------ */
  function initAnimations() {
    var els = document.querySelectorAll('.animate-in');
    if (!els.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Stagger children
          var children = entry.target.querySelectorAll('[data-stagger]');
          children.forEach(function (child, i) {
            child.style.setProperty('--stagger-delay', (i * 0.1) + 's');
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    els.forEach(function (el) { observer.observe(el); });
  }

  /* ------------------------------------------------------------------
     3. GLOSSARY TOOLTIPS
     ------------------------------------------------------------------ */
  function initGlossary() {
    var terms = document.querySelectorAll('.term[data-definition]');
    if (!terms.length) return;

    var tooltip = document.createElement('div');
    tooltip.className = 'glossary-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.cssText = 'position:fixed;z-index:10000;opacity:0;pointer-events:none;transition:opacity .2s;';
    var arrow = document.createElement('div');
    arrow.className = 'glossary-arrow';
    tooltip.appendChild(arrow);
    var content = document.createElement('div');
    content.className = 'glossary-content';
    tooltip.appendChild(content);
    document.body.appendChild(tooltip);

    var activeEl = null;

    function show(el) {
      content.textContent = el.dataset.definition;
      tooltip.style.opacity = '1';
      position(el);
      activeEl = el;
    }

    function hide() {
      tooltip.style.opacity = '0';
      activeEl = null;
    }

    function position(el) {
      var rect = el.getBoundingClientRect();
      tooltip.style.display = 'block';
      var tw = tooltip.offsetWidth;
      var th = tooltip.offsetHeight;
      var left = rect.left + rect.width / 2 - tw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));

      var above = rect.top - th - 8;
      if (above < 8) {
        // flip below
        tooltip.style.top = (rect.bottom + 8) + 'px';
        tooltip.classList.add('below');
        tooltip.classList.remove('above');
      } else {
        tooltip.style.top = above + 'px';
        tooltip.classList.add('above');
        tooltip.classList.remove('below');
      }
      tooltip.style.left = left + 'px';
    }

    var isMobile = 'ontouchstart' in window;

    terms.forEach(function (el) {
      if (isMobile) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          if (activeEl === el) hide(); else show(el);
        });
      } else {
        el.addEventListener('mouseenter', function () { show(el); });
        el.addEventListener('mouseleave', hide);
      }
    });

    // Dismiss on tap elsewhere (mobile)
    if (isMobile) {
      document.addEventListener('click', function (e) {
        if (activeEl && !e.target.closest('.term[data-definition]')) hide();
      });
    }
  }

  /* ------------------------------------------------------------------
     4. QUIZ ENGINE
     ------------------------------------------------------------------ */
  function selectOption(btn) {
    var card = btn.closest('.quiz-card');
    if (!card) return;
    card.querySelectorAll('.quiz-option').forEach(function (o) {
      o.classList.remove('selected');
    });
    btn.classList.add('selected');
  }

  function checkQuiz(containerId) {
    var card = document.getElementById(containerId);
    if (!card) return;
    var selected = card.querySelector('.quiz-option.selected');
    if (!selected) return;
    var correct = selected.dataset.correct === 'true';
    var feedback = card.querySelector('.quiz-feedback');
    if (feedback) {
      feedback.textContent = correct
        ? (selected.dataset.explanationRight || card.dataset.explanationRight || 'Correct!')
        : (selected.dataset.explanationWrong || card.dataset.explanationWrong || 'Not quite. Try again!');
      feedback.className = 'quiz-feedback ' + (correct ? 'correct' : 'incorrect');
      feedback.style.display = 'block';
    }
    selected.classList.add(correct ? 'correct' : 'incorrect');

    // Track score
    if (correct) {
      var prev = progressData.progress.quizScores[containerId] || { score: 0, total: 0, attempts: 0 };
      prev.score += 1;
      prev.total = card.querySelectorAll('.quiz-option[data-correct="true"]').length || 1;
      prev.attempts += 1;
      progressData.progress.quizScores[containerId] = prev;
      saveProgress(progressData);
      launchConfetti();
    }
  }

  function resetQuiz(containerId) {
    var card = document.getElementById(containerId);
    if (!card) return;
    card.querySelectorAll('.quiz-option').forEach(function (o) {
      o.classList.remove('selected', 'correct', 'incorrect');
    });
    var fb = card.querySelector('.quiz-feedback');
    if (fb) { fb.style.display = 'none'; fb.textContent = ''; }
  }

  function initQuizzes() {
    document.querySelectorAll('.quiz-card').forEach(function (card) {
      card.querySelectorAll('.quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () { selectOption(btn); });
      });
    });
  }

  /* ------------------------------------------------------------------
     5. FLASHCARD ENGINE
     ------------------------------------------------------------------ */
  function initFlashcards() {
    var decks = document.querySelectorAll('.flashcard-deck');
    decks.forEach(function (deck) {
      var cards = deck.querySelectorAll('.flashcard');
      if (!cards.length) return;
      var idx = 0;
      var reviewed = 0;
      var correctCount = 0;
      var deckId = deck.id || 'deck';

      function showCard(i) {
        cards.forEach(function (c, ci) {
          c.style.display = ci === i ? '' : 'none';
          c.classList.remove('flipped');
        });
        idx = i;
        updateCounter();
      }

      function updateCounter() {
        var counter = deck.querySelector('.flashcard-counter');
        if (counter) counter.textContent = (idx + 1) + ' / ' + cards.length;
        var prog = deck.querySelector('.flashcard-progress');
        if (prog) prog.textContent = reviewed + ' reviewed, ' + correctCount + ' correct';
      }

      function flip() {
        cards[idx].classList.toggle('flipped');
        if (cards[idx].classList.contains('flipped')) {
          var cardId = cards[idx].id || deckId + '-' + idx;
          reviewed++;
          var prev = progressData.progress.flashcardProgress[cardId] || { correct: 0, incorrect: 0, lastReviewed: '' };
          prev.lastReviewed = new Date().toISOString().slice(0, 10);
          progressData.progress.flashcardProgress[cardId] = prev;
          saveProgress(progressData);
        }
        updateCounter();
      }

      cards.forEach(function (c) {
        c.addEventListener('click', flip);
      });

      // Mark correct / incorrect buttons
      deck.querySelectorAll('.fc-correct').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cardId = cards[idx].id || deckId + '-' + idx;
          var prev = progressData.progress.flashcardProgress[cardId] || { correct: 0, incorrect: 0, lastReviewed: '' };
          prev.correct += 1;
          prev.lastReviewed = new Date().toISOString().slice(0, 10);
          progressData.progress.flashcardProgress[cardId] = prev;
          correctCount++;
          saveProgress(progressData);
          if (idx < cards.length - 1) showCard(idx + 1);
          else updateCounter();
        });
      });
      deck.querySelectorAll('.fc-incorrect').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cardId = cards[idx].id || deckId + '-' + idx;
          var prev = progressData.progress.flashcardProgress[cardId] || { correct: 0, incorrect: 0, lastReviewed: '' };
          prev.incorrect += 1;
          prev.lastReviewed = new Date().toISOString().slice(0, 10);
          progressData.progress.flashcardProgress[cardId] = prev;
          saveProgress(progressData);
          if (idx < cards.length - 1) showCard(idx + 1);
          else updateCounter();
        });
      });

      // Keyboard
      deck.setAttribute('tabindex', '0');
      deck.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Space') { e.preventDefault(); flip(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < cards.length - 1) showCard(idx + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx > 0) showCard(idx - 1); }
      });

      showCard(0);
    });
  }

  /* ------------------------------------------------------------------
     6. DRAG-AND-DROP MATCHING
     ------------------------------------------------------------------ */
  function initDragDrop() {
    document.querySelectorAll('.drag-match').forEach(function (container) {
      var chips = container.querySelectorAll('.drag-chip[data-answer]');
      var zones = container.querySelectorAll('.drop-zone[data-correct]');

      // Desktop HTML5 Drag API
      chips.forEach(function (chip) {
        chip.setAttribute('draggable', 'true');
        chip.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', chip.dataset.answer);
          e.dataTransfer.effectAllowed = 'move';
          chip.classList.add('dragging');
        });
        chip.addEventListener('dragend', function () { chip.classList.remove('dragging'); });
      });

      zones.forEach(function (zone) {
        zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', function (e) {
          e.preventDefault();
          zone.classList.remove('drag-over');
          var answer = e.dataTransfer.getData('text/plain');
          evaluateDrop(container, zone, answer);
        });
      });

      // Mobile touch handlers
      var ghost = null;
      var activeChip = null;

      function onTouchStart(e) {
        var chip = e.target.closest('.drag-chip[data-answer]');
        if (!chip) return;
        activeChip = chip;
        ghost = chip.cloneNode(true);
        ghost.className = 'drag-chip drag-ghost';
        ghost.style.cssText = 'position:fixed;z-index:10001;pointer-events:none;opacity:0.85;';
        document.body.appendChild(ghost);
        moveGhost(e.touches[0]);
      }

      function moveGhost(touch) {
        if (!ghost) return;
        ghost.style.left = (touch.clientX - ghost.offsetWidth / 2) + 'px';
        ghost.style.top = (touch.clientY - ghost.offsetHeight / 2) + 'px';
      }

      function onTouchMove(e) {
        if (!ghost) return;
        e.preventDefault();
        moveGhost(e.touches[0]);
      }

      function onTouchEnd(e) {
        if (!ghost || !activeChip) return;
        ghost.remove();
        var touch = e.changedTouches[0];
        var target = document.elementFromPoint(touch.clientX, touch.clientY);
        var zone = target ? target.closest('.drop-zone[data-correct]') : null;
        if (zone) evaluateDrop(container, zone, activeChip.dataset.answer);
        ghost = null;
        activeChip = null;
      }

      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: true });
    });
  }

  function evaluateDrop(container, zone, answer) {
    var correct = zone.dataset.correct === answer;
    if (correct) {
      zone.classList.add('matched');
      zone.textContent = answer;
      // Remove chip
      var chip = container.querySelector('.drag-chip[data-answer="' + answer + '"]');
      if (chip) chip.style.display = 'none';
    } else {
      zone.classList.add('shake');
      setTimeout(function () { zone.classList.remove('shake'); }, 600);
    }
  }

  /* ------------------------------------------------------------------
     7. CHAT ANIMATION
     ------------------------------------------------------------------ */
  function initChatWindows() {
    document.querySelectorAll('.chat-window').forEach(function (win) {
      var messages = Array.from(win.querySelectorAll('[data-msg]'));
      messages.sort(function (a, b) { return (+a.dataset.msg) - (+b.dataset.msg); });
      var currentMsg = 0;

      messages.forEach(function (m) { m.style.display = 'none'; });

      var typingEl = win.querySelector('.typing-indicator');

      function showTyping(sender) {
        if (!typingEl) return;
        typingEl.dataset.sender = sender || '';
        typingEl.style.display = '';
      }

      function hideTyping() {
        if (typingEl) typingEl.style.display = 'none';
      }

      function showNext() {
        if (currentMsg >= messages.length) { hideTyping(); return; }
        var msg = messages[currentMsg];
        showTyping(msg.dataset.sender);
        setTimeout(function () {
          hideTyping();
          msg.style.display = '';
          msg.classList.add('chat-enter');
          currentMsg++;
        }, 800);
      }

      function showAll() {
        hideTyping();
        messages.forEach(function (m) {
          m.style.display = '';
          m.classList.add('chat-enter');
        });
        currentMsg = messages.length;
      }

      function resetChat() {
        currentMsg = 0;
        hideTyping();
        messages.forEach(function (m) {
          m.style.display = 'none';
          m.classList.remove('chat-enter');
        });
      }

      var nextBtn = win.querySelector('.chat-next-btn');
      var allBtn = win.querySelector('.chat-all-btn');
      var resetBtn = win.querySelector('.chat-reset-btn');
      if (nextBtn) nextBtn.addEventListener('click', showNext);
      if (allBtn) allBtn.addEventListener('click', showAll);
      if (resetBtn) resetBtn.addEventListener('click', resetChat);

      hideTyping();
    });
  }

  /* ------------------------------------------------------------------
     8. DATA FLOW ANIMATION
     ------------------------------------------------------------------ */
  function initFlowAnimations() {
    document.querySelectorAll('.flow-animation').forEach(function (container) {
      var stepsData;
      try { stepsData = JSON.parse(container.dataset.steps); } catch { return; }
      var stepIdx = 0;
      var actors = {};
      container.querySelectorAll('[data-actor]').forEach(function (el) {
        actors[el.dataset.actor] = el;
      });
      var descEl = container.querySelector('.flow-desc');

      function runStep(s) {
        // Highlight
        container.querySelectorAll('.flow-highlight').forEach(function (h) { h.classList.remove('flow-highlight'); });
        if (s.highlight && actors[s.highlight]) actors[s.highlight].classList.add('flow-highlight');
        if (descEl && s.label) descEl.textContent = s.label;

        // Packet animation
        if (s.from && s.to && actors[s.from] && actors[s.to]) {
          animatePacket(container, actors[s.from], actors[s.to], s.packet || '');
        }
      }

      function animatePacket(parent, fromEl, toEl, text) {
        var fromRect = fromEl.getBoundingClientRect();
        var parentRect = parent.getBoundingClientRect();
        var toRect = toEl.getBoundingClientRect();
        var pkt = document.createElement('div');
        pkt.className = 'flow-packet';
        pkt.textContent = text;
        pkt.style.cssText = 'position:absolute;z-index:100;transition:all .8s ease;';
        pkt.style.left = (fromRect.left - parentRect.left + fromRect.width / 2) + 'px';
        pkt.style.top = (fromRect.top - parentRect.top + fromRect.height / 2) + 'px';
        parent.style.position = 'relative';
        parent.appendChild(pkt);
        requestAnimationFrame(function () {
          pkt.style.left = (toRect.left - parentRect.left + toRect.width / 2) + 'px';
          pkt.style.top = (toRect.top - parentRect.top + toRect.height / 2) + 'px';
        });
        setTimeout(function () { pkt.remove(); }, 1000);
      }

      function nextStep() {
        if (stepIdx >= stepsData.length) return;
        runStep(stepsData[stepIdx]);
        stepIdx++;
      }

      function playAll() {
        stepIdx = 0;
        (function loop() {
          if (stepIdx >= stepsData.length) return;
          runStep(stepsData[stepIdx]);
          stepIdx++;
          setTimeout(loop, 1200);
        })();
      }

      function resetFlow() {
        stepIdx = 0;
        container.querySelectorAll('.flow-highlight').forEach(function (h) { h.classList.remove('flow-highlight'); });
        container.querySelectorAll('.flow-packet').forEach(function (p) { p.remove(); });
        if (descEl) descEl.textContent = '';
      }

      var nextBtn = container.querySelector('.flow-next-btn');
      var allBtn = container.querySelector('.flow-play-btn');
      var resetBtn = container.querySelector('.flow-reset-btn');
      if (nextBtn) nextBtn.addEventListener('click', nextStep);
      if (allBtn) allBtn.addEventListener('click', playAll);
      if (resetBtn) resetBtn.addEventListener('click', resetFlow);
    });
  }

  /* ------------------------------------------------------------------
     9. ARCHITECTURE DIAGRAM
     ------------------------------------------------------------------ */
  function initArchDiagram() {
    document.querySelectorAll('[data-desc]').forEach(function (comp) {
      comp.addEventListener('click', function () {
        var desc = document.getElementById('arch-desc');
        if (desc) desc.textContent = comp.dataset.desc;
        document.querySelectorAll('[data-desc]').forEach(function (c) { c.classList.remove('arch-active'); });
        comp.classList.add('arch-active');
      });
    });
  }

  /* ------------------------------------------------------------------
     10. SPOT-THE-BUG CHALLENGE
     ------------------------------------------------------------------ */
  function checkBugLine(el, isBug) {
    if (isBug) {
      el.classList.add('bug-correct');
      var expl = el.dataset.explanation;
      if (expl) {
        var tip = document.createElement('div');
        tip.className = 'bug-explanation';
        tip.textContent = expl;
        el.appendChild(tip);
      }
    } else {
      el.classList.add('bug-incorrect');
      setTimeout(function () { el.classList.remove('bug-incorrect'); }, 2000);
    }
  }

  /* ------------------------------------------------------------------
     11. LAYER TOGGLE
     ------------------------------------------------------------------ */
  function showLayer(id) {
    document.querySelectorAll('.layer').forEach(function (l) {
      l.style.display = l.id === id ? '' : 'none';
    });
    document.querySelectorAll('.layer-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.layer === id);
    });
    var desc = document.getElementById('layer-desc');
    var active = document.getElementById(id);
    if (desc && active && active.dataset.layerDesc) {
      desc.textContent = active.dataset.layerDesc;
    }
  }

  /* ------------------------------------------------------------------
     13. CONFETTI CELEBRATION
     ------------------------------------------------------------------ */
  function launchConfetti() {
    var colors = ['#c4825a', '#4a7c59', '#f4d35e', '#5b8fa3', '#c86b5a'];
    var container = document.createElement('div');
    container.className = 'confetti-container';
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;overflow:hidden;';
    document.body.appendChild(container);

    for (var i = 0; i < 50; i++) {
      var p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:8px;height:8px;border-radius:50%;opacity:0.9;';
      p.style.background = colors[i % colors.length];
      p.style.left = Math.random() * 100 + '%';
      p.style.top = '-10px';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      var dur = 1.5 + Math.random() * 1.5;
      var drift = (Math.random() - 0.5) * 200;
      p.style.transition = 'all ' + dur + 's cubic-bezier(.25,.46,.45,.94)';
      container.appendChild(p);
      (function (el, d) {
        requestAnimationFrame(function () {
          el.style.top = '110%';
          el.style.left = 'calc(' + el.style.left + ' + ' + d + 'px)';
          el.style.opacity = '0';
        });
      })(p, drift);
    }

    setTimeout(function () { container.remove(); }, 3000);
  }

  /* ------------------------------------------------------------------
     14. REFLECTION SAVE
     ------------------------------------------------------------------ */
  function initReflections() {
    document.querySelectorAll('.save-reflection').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var textarea = btn.closest('.reflection-card, .reflection-block, [data-reflection]');
        if (!textarea) return;
        var ta = textarea.querySelector('textarea');
        if (!ta) return;
        var key = textarea.dataset.reflection || textarea.id || 'reflect-' + Date.now();
        progressData.progress.reflections[key] = ta.value;
        saveProgress(progressData);

        // Visual confirmation
        var orig = btn.textContent;
        btn.textContent = 'Saved!';
        btn.classList.add('save-success');
        setTimeout(function () {
          btn.textContent = orig;
          btn.classList.remove('save-success');
        }, 2000);
      });
    });

    // Restore saved reflections
    document.querySelectorAll('[data-reflection]').forEach(function (block) {
      var key = block.dataset.reflection;
      var saved = progressData.progress.reflections[key];
      if (saved) {
        var ta = block.querySelector('textarea');
        if (ta) ta.value = saved;
      }
    });
  }

  /* ------------------------------------------------------------------
     15. PWA INSTALL PROMPT
     ------------------------------------------------------------------ */
  function initInstallPrompt() {
    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;

      if (localStorage.getItem('pwa-install-dismissed')) {
        // Check 7-day cooldown
        try {
          var dismissed = new Date(localStorage.getItem('pwa-install-dismissed-date'));
          if (Date.now() - dismissed.getTime() < 7 * 86400000) return;
        } catch { return; }
      }

      if (window.matchMedia('(display-mode: standalone)').matches) return;

      var banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'flex';
    });

    var acceptBtn = document.getElementById('install-accept');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        var choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        var banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'none';
      });
    }

    var dismissBtn = document.getElementById('install-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        var banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'none';
        localStorage.setItem('pwa-install-dismissed', 'true');
        localStorage.setItem('pwa-install-dismissed-date', new Date().toISOString());
      });
    }

    // iOS detection
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    var isStandalone = window.navigator.standalone === true;
    if (isIOS && !isStandalone) {
      var iosBanner = document.getElementById('ios-install-banner');
      if (iosBanner) {
        if (!localStorage.getItem('pwa-install-dismissed')) {
          iosBanner.style.display = 'flex';
        }
      }
    }
  }

  /* ------------------------------------------------------------------
     16. COPY CODE BUTTON
     ------------------------------------------------------------------ */
  function copyCode(btn) {
    var block = btn.closest('.code-block, pre');
    if (!block) return;
    var code = block.querySelector('code');
    var text = (code || block).textContent;
    navigator.clipboard.writeText(text).then(function () {
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(function () {
      // Fallback for older browsers
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = orig; }, 2000);
    });
  }

  /* ------------------------------------------------------------------
     17. SERVICE WORKER REGISTRATION
     ------------------------------------------------------------------ */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  /* ------------------------------------------------------------------
     EXPOSE FUNCTIONS FOR INLINE ONCLICK HANDLERS
     ------------------------------------------------------------------ */
  window.selectOption = selectOption;
  window.checkQuiz = checkQuiz;
  window.resetQuiz = resetQuiz;
  window.checkBugLine = checkBugLine;
  window.showLayer = showLayer;
  window.copyCode = copyCode;
  window.launchConfetti = launchConfetti;

  /* ------------------------------------------------------------------
     AUTO-INITIALIZE ON DOM READY
     ------------------------------------------------------------------ */
  function init() {
    initNavigation();
    initAnimations();
    initGlossary();
    initQuizzes();
    initFlashcards();
    initDragDrop();
    initChatWindows();
    initFlowAnimations();
    initArchDiagram();
    initReflections();
    initInstallPrompt();
    registerSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
