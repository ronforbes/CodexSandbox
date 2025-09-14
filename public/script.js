async function fetchTodos() {
  const res = await fetch('/todos');
  const data = await res.json();
  renderTodos(data);
}

function renderTodos(todos) {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';
  todos.forEach(todo => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = todo.title;
    if (todo.completed) {
      span.style.textDecoration = 'line-through';
    }
    span.addEventListener('click', () => toggleTodo(todo.id));
    li.appendChild(span);
    list.appendChild(li);
  });
}

async function addTodo(title) {
  await fetch('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  celebrate('Added task! 🎉');
  fetchTodos();
}

async function toggleTodo(id) {
  const res = await fetch(`/todos/${id}/toggle`, { method: 'POST' });
  const todo = await res.json();
  if (todo.completed) {
    celebrate('Completed! ✅');
  }
  fetchTodos();
}

const form = document.getElementById('new-todo-form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('new-todo-title');
  const title = input.value.trim();
  if (title) {
    addTodo(title);
    input.value = '';
  }
});

window.addEventListener('DOMContentLoaded', fetchTodos);

function celebrate(message) {
  const banner = document.getElementById('celebration');
  if (banner) {
    banner.textContent = message;
    banner.style.display = 'block';
    confetti({ spread: 100, ticks: 60 });
    setTimeout(() => {
      banner.style.display = 'none';
    }, 2000);
  }
}
