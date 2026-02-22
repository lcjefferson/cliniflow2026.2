# Rodar o sistema localmente

Use dois terminais: um para o **backend** e outro para o **frontend**.

## 1. Backend (FastAPI – porta 8000)

```bash
cd backend
python3 -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

- **Sem MongoDB:** o backend entra em **DEMO_MODE** (dados em memória; usuário admin padrão).
- **Com MongoDB:** crie um arquivo `backend/.env` com:
  ```env
  MONGO_URL=mongodb://localhost:27017
  DB_NAME=clinicflow
  ```

API: http://localhost:8000  
Docs: http://localhost:8000/docs  

## 2. Frontend (React – porta 3000)

```bash
cd frontend
yarn install   # ou: npm install
yarn start    # ou: npm run start
```

O frontend em desenvolvimento usa a API em **http://localhost:8000** automaticamente.

App: http://localhost:3000  

## Resumo

| Serviço   | Porta | URL              |
|----------|--------|------------------|
| Backend  | 8000   | http://localhost:8000 |
| Frontend | 3000   | http://localhost:3000 |

## Login (DEMO_MODE)

- **Admin:** `admin@cliniflow.com` / `admin@123`
- **Superadmin:** `superadmin@cliniflow.com` / `qwe123`
