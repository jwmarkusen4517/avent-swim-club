import { sendMessage } from './api.js';
import { renderWorkoutCard } from './workout.js';

const scrollEl = document.getElementById('chat-scroll');
const inputEl = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let isStreaming = false;

// ── Rendering ──────────────────────────────────────────

export function appendBubble(role, content, animate = true) {
  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${role === 'user' ? 'user' : 'ai'}`;
  if (!animate) bubble.style.animation = 'none';
  bubble.textContent = content;
  scrollEl.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

export function appendWorkout(workoutData) {
  const card = renderWorkoutCard(workoutData);
  scrollEl.appendChild(card);
  scrollToBottom();
}

function showTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typing-indicator';
  el.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  scrollEl.appendChild(el);
  scrollToBottom();
  return el;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function scrollToBottom() {
  scrollEl.scrollTop = scrollEl.scrollHeight;
}

// ── Streaming ──────────────────────────────────────────

async function streamResponse(userText) {
  if (isStreaming) return;
  isStreaming = true;
  sendBtn.disabled = true;
  inputEl.disabled = true;

  appendBubble('user', userText);

  const typingEl = showTypingIndicator();
  let aiBubble = null;
  let fullText = '';

  try {
    const response = await sendMessage(userText);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;

        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        if (event.type === 'text') {
          if (!aiBubble) {
            removeTypingIndicator();
            aiBubble = appendBubble('ai', '');
          }
          fullText += event.text;
          aiBubble.textContent = fullText;
          scrollToBottom();
        } else if (event.type === 'done') {
          break;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }
  } catch (err) {
    removeTypingIndicator();
    if (!aiBubble) {
      appendBubble('ai', 'Something went wrong. Please try again.');
    }
    console.error('[chat] Stream error:', err.message);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
    adjustInputHeight();
  }
}

// ── Input handling ─────────────────────────────────────

function adjustInputHeight() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

export function initChat() {
  inputEl.addEventListener('input', adjustInputHeight);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);
}

function handleSend() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  inputEl.value = '';
  adjustInputHeight();
  streamResponse(text);
}

// ── Load history ───────────────────────────────────────

export function loadHistoryMessages(messages) {
  for (const msg of messages) {
    appendBubble(msg.role, msg.content, false);
  }
}
