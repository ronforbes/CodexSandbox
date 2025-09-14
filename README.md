# CodexSandbox

Just a sandbox environment for playing around with ChatGPT Codex.

## Todo List API

This repository contains a simple Todo List API built with [Express](https://expressjs.com/).

### Running

```bash
npm install
node index.js
```

The server will start on port 3000 (or the port specified in the `PORT` environment variable).

### API Endpoints

- `GET /todos` – list all todos
- `POST /todos` – create a todo by sending JSON `{ "title": "My task" }`
- `POST /todos/:id/toggle` – toggle the `completed` state of the todo with the given `id`

Todos are stored in memory and will reset each time the server restarts.

### Frontend

A minimal frontend is available. After starting the server, open `http://localhost:3000/` in your browser to manage todos.

### Example

```bash
# Create a todo
curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"My task"}'

# List todos
curl http://localhost:3000/todos

# Toggle todo completion
curl -X POST http://localhost:3000/todos/1/toggle
```
