import { loginWithUSMS, logout } from './api.js';
import { upgradeTOMember } from './session.js';

const overlay = document.getElementById('auth-overlay');
const usmsInput = document.getElementById('usms-input');
const submitBtn = document.getElementById('auth-submit-btn');
const errorEl = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const closeBtn = document.getElementById('auth-close-btn');

export function initAuth({ onMemberLogin }) {
  loginBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  submitBtn.addEventListener('click', handleSubmit);
  usmsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });

  usmsInput.addEventListener('input', () => {
    errorEl.textContent = '';
  });

  // Store callback
  overlay._onMemberLogin = onMemberLogin;
}

export function openModal() {
  overlay.classList.add('open');
  setTimeout(() => usmsInput.focus(), 300);
}

export function closeModal() {
  overlay.classList.remove('open');
  errorEl.textContent = '';
  usmsInput.value = '';
}

export function showLoginButton() {
  loginBtn.classList.add('visible');
}

export function hideLoginButton() {
  loginBtn.style.display = 'none';
}

async function handleSubmit() {
  const raw = usmsInput.value.trim();
  if (!raw) {
    errorEl.textContent = 'Please enter your USMS membership number.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying…';
  errorEl.textContent = '';

  try {
    const data = await loginWithUSMS(raw);
    upgradeTOMember(data.access_token, data.member?.id);
    closeModal();
    hideLoginButton();
    overlay._onMemberLogin?.(data.member);
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed. Please check your USMS number.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Continue';
  }
}

export async function handleLogout() {
  await logout();
  window.location.reload();
}
