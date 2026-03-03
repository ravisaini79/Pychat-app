# AI Chat

A chat application with **React** frontend, **FastAPI** backend, and **MongoDB**. Users register and sign in with a **single mobile number** (no password).

## Features

- **Register** with mobile number (+ optional display name)
- **Login** with mobile number
- **Chat** with other users: search by mobile/name, send and receive messages
- **Conversation list** with last message preview

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **MongoDB** running locally (or a connection string)

## Backend (FastAPI)

1. Create a virtual environment and install dependencies:

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

2. Copy environment file and set your MongoDB URL and secret:

```bash
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
```

Edit `.env` and set `MONGODB_URL` (e.g. `mongodb://localhost:27017`) and `SECRET_KEY`.

3. Run the API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://127.0.0.1:8000/docs

## Frontend (React)

1. Install and run:

```bash
cd frontend
npm install
npm run dev
```

2. Open http://localhost:5173

The frontend is configured to proxy `/api` to the backend (port 8000), so use the same origin in development.

## Usage

1. **Register**: Open the app → Register → enter mobile number (and optional name) → Register.
2. **Login**: Enter your registered mobile number → Sign in.
3. **Chat**: Use the search box to find users by mobile or name, click a user to open the conversation, type and send messages. Your conversations appear in the sidebar with the latest message.

## Project structure

```
backend/
  app/
    main.py       # FastAPI app, CORS, lifespan
    config.py     # Settings (MongoDB, JWT)
    db.py         # MongoDB connection
    auth.py       # JWT create/verify, get_current_user
    models.py     # Serialization, conversation_id
    schemas.py    # Pydantic request/response models
    routers/
      auth.py     # POST /auth/register, /auth/login
      chat.py     # /chat/users, /chat/conversations, /chat/messages
  requirements.txt
  .env.example

frontend/
  src/
    main.jsx, App.jsx, index.css
    api.js           # API helpers (register, login, chat)
    AuthContext.jsx  # Auth state, login/register/logout
    pages/
      Login.jsx, Register.jsx, Chat.jsx, Chat.css
  index.html, vite.config.js, package.json
```

## Environment variables (backend)

| Variable         | Description                    | Default              |
|------------------|--------------------------------|----------------------|
| `MONGODB_URL`    | MongoDB connection string      | `mongodb://localhost:27017` |
| `MONGODB_DB`     | Database name                  | `aichat`             |
| `SECRET_KEY`     | JWT signing key (change in prod) | (see .env.example) |
