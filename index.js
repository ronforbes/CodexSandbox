const express = require('express');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 3000;
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// In-memory store for todos
let todos = [];
let nextId = 1;

nextApp.prepare().then(() => {
  const app = express();

  app.use(express.json());

  // API: Get all todos
  app.get('/todos', (req, res) => {
    res.json(todos);
  });

  // API: Add a new todo: {"title": "My task"}
  app.post('/todos', (req, res) => {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const todo = { id: nextId++, title, completed: false, completedAt: null };
    todos.push(todo);
    res.status(201).json(todo);
  });

  // API: Toggle completion status of a todo
  app.post('/todos/:id/toggle', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const todo = todos.find((t) => t.id === id);
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? new Date().toISOString() : null;
    res.json(todo);
  });

  // API: Reorder todos by an array of ids in desired order
  // Body: { ids: number[] }
  app.post('/todos/reorder', (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }
    const currentIds = new Set(todos.map((t) => t.id));
    const incomingIds = new Set(ids);
    if (currentIds.size !== incomingIds.size) {
      return res.status(400).json({ error: 'ids length mismatch' });
    }
    for (const id of currentIds) {
      if (!incomingIds.has(id)) {
        return res.status(400).json({ error: 'ids do not match current todos' });
      }
    }
    const byId = new Map(todos.map((t) => [t.id, t]));
    todos = ids.map((id) => byId.get(id));
    return res.json({ ok: true, todos });
  });

  // Let Next.js handle all other routes (Express 5: avoid '*' path)
  app.use((req, res) => handle(req, res));

  app.listen(port, () => {
    console.log(`App ready at http://localhost:${port}`);
  });
});
