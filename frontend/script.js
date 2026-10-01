const sidebar = document.querySelector('.sidebar');
const assistantInput = document.querySelector('#assistant-input');
const assistantResponse = document.querySelector('#assistant-response');

function respond(message) {
  const replies = [
    `Great question. Let’s turn “${message}” into your next focused revision step.`,
    `AURA is ready to help with “${message}”. Start with a 25-minute focus session.`,
    `For “${message}”, begin with your current priority topic and build from there.`
  ];
  assistantResponse.textContent = replies[Math.floor(Math.random() * replies.length)];
}

document.querySelector('.menu-button').addEventListener('click', () => sidebar.classList.toggle('open'));
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('.nav-link.active').classList.remove('active');
  link.classList.add('active');
  sidebar.classList.remove('open');
}));
document.querySelectorAll('[data-scroll-target]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(`#${button.dataset.scrollTarget}`).scrollIntoView({ behavior: 'smooth' });
  assistantInput.focus({ preventScroll: true });
}));
document.querySelector('#start-revision').addEventListener('click', () => {
  document.querySelector('#subjects').scrollIntoView({ behavior: 'smooth' });
  assistantResponse.textContent = 'Choose a subject below to begin your focused revision session.';
});
document.querySelectorAll('.continue-button').forEach((button) => button.addEventListener('click', () => {
  assistantResponse.textContent = `${button.dataset.subject} is selected. You’re ready for a focused session.`;
  document.querySelector('#assistant').scrollIntoView({ behavior: 'smooth' });
}));
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => {
  assistantInput.value = button.dataset.prompt;
  respond(button.dataset.prompt);
}));
document.querySelector('.assistant-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const message = assistantInput.value.trim();
  if (!message) return;
  respond(message);
  assistantInput.value = '';
});
document.querySelector('#add-subject').addEventListener('click', () => {
  assistantResponse.textContent = 'Subject setup will be available in a future AURA update.';
  document.querySelector('#assistant').scrollIntoView({ behavior: 'smooth' });
});
