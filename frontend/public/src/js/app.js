import { initSession, getSessionState, STATE } from './session.js';
import { initAuth, showLoginButton } from './auth.js';
import { initChat, appendBubble, loadHistoryMessages } from './chat.js';
import { fetchHistory } from './api.js';

// ── Boot ───────────────────────────────────────────────

async function boot() {
  // 1. Initialize session (creates guest session if needed)
  const sessionState = await initSession();

  // 2. Run logo animation
  runLogoAnimation();

  // 3. Init chat input
  initChat();

  // 4. Init auth modal
  initAuth({
    onMemberLogin: (member) => {
      // Conversation continues seamlessly — just acknowledge
      appendBubble('ai', `Welcome back${member?.display_name ? `, ${member.display_name}` : ''}. You're now logged in. Let's pick up where we left off.`);
    },
  });

  // 5. Show login button (fades in with chat — CSS handles timing)
  if (sessionState !== STATE.MEMBER) {
    showLoginButton();
  }

  // 6. Load chat history for members, or show opening message for guests
  if (sessionState === STATE.MEMBER) {
    try {
      const { messages } = await fetchHistory(20);
      if (messages?.length) {
        loadHistoryMessages(messages);
      } else {
        appendBubble('ai', openingMessage(), false);
      }
    } catch {
      appendBubble('ai', openingMessage(), false);
    }
  } else {
    // Guest: show opening message
    appendBubble('ai', openingMessage(), false);
  }
}

// ── Logo animation ─────────────────────────────────────

function runLogoAnimation() {
  const logo = document.getElementById('logo');
  const line = document.getElementById('logo-line');
  const chatScroll = document.getElementById('chat-scroll');
  const inputWrap = document.getElementById('input-bar-wrap');

  setTimeout(() => {
    logo.classList.add('settled');
    line.classList.add('contracted');
    chatScroll.classList.add('visible');
    inputWrap.classList.add('visible');
  }, 1200);
}

// ── Opening message ────────────────────────────────────

function openingMessage() {
  const greetings = [
    'Good to see you. What are we doing today?',
    'Hey. Ready to get in the water?',
    'You showed up. That\'s half the battle. What\'s the plan?',
    'Morning. Let\'s talk swimming.',
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

// ── Service Worker ─────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch(err => console.warn('[sw] Registration failed:', err));
  });
}

// ── Start ──────────────────────────────────────────────

boot().catch(err => {
  console.error('[app] Boot failed:', err);
  document.getElementById('chat-scroll')?.classList.add('visible');
  document.getElementById('input-bar-wrap')?.classList.add('visible');
});
