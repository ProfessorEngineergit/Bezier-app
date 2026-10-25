addEventListener('message', (e) => {
  document.getElementById('out').textContent = 'inline script in srcdoc frame: ' + e.data;
});
setTimeout(() => {
  const o = document.getElementById('out');
  if (o.textContent === 'waiting') o.textContent = 'inline script in srcdoc frame: BLOCKED';
}, 1500);
