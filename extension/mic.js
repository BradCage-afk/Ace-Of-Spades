document.getElementById('go').onclick = async () => {
  const out = document.getElementById('out');
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    out.textContent = 'Done. You can close this tab.';
  } catch {
    out.textContent = 'Microphone not allowed. You can still type.';
  }
};
