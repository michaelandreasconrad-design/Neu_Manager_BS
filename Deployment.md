# Deployment

Frontend (Next.js) und Backend (FastAPI) laufen als zwei getrennte Vercel-Projekte im Team `michael-conrad` (Hobby, kostenlos).

| Teil | Vercel-Projekt | URL |
| --- | --- | --- |
| Frontend | `frontend` | https://frontend-tan-theta-32.vercel.app |
| Backend | `business-translator-api` | https://business-translator-api.vercel.app |

CORS läuft über `FRONTEND_ORIGIN` (Backend), die API-URL im Frontend über `NEXT_PUBLIC_API_URL`.

Es gibt kein Auto-Deploy bei `git push` (Vercel-GitHub-App ohne Zugriff). Deployt wird per CLI aus dem jeweiligen Ordner.

## 1. Backend (zuerst, damit die URL bekannt ist)

FastAPI wird von Vercel ohne weitere Konfiguration erkannt. `backend/vercel.json` legt `main.py` als Einstiegspunkt fest und leitet alle Pfade dorthin. Die Python-Version steht in `backend/.python-version`.

```bash
cd backend
npx vercel login                                      # einmalig, Browser-Login
npx vercel link --yes --project business-translator-api
printf 'https://frontend-tan-theta-32.vercel.app' | npx vercel env add FRONTEND_ORIGIN production
npx vercel env add OPENROUTER_API_KEY production --sensitive   # Wert wird abgefragt
npx vercel deploy --prod --yes
```

- `backend/.env` nicht committen, Werte nur als Env-Variablen im Vercel-Projekt setzen. Optional: `OPENROUTER_MODEL`, `RATE_LIMIT`.
- Änderungen an Env-Variablen gelten erst nach einem neuen Deploy.
- Test: `curl https://business-translator-api.vercel.app/api/health`
- Das `slowapi`-Limit (`RATE_LIMIT`) zählt im Speicher der jeweiligen Funktionsinstanz. Auf Vercel läuft jede Instanz für sich, das Limit schützt dort daher schwächer als auf einem einzelnen Server.

## 2. Frontend

```bash
cd frontend
npx vercel login                      # einmalig, Browser-Login
npx vercel link --yes --project frontend
printf 'https://business-translator-api.vercel.app' | npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel deploy --prod --yes
```

`NEXT_PUBLIC_*` wird beim Build eingebacken. Nach einer Änderung der Variable muss neu deployt werden. Die URL ohne Slash am Ende angeben.

Alternativ per Dashboard: Repo importieren, **Root Directory** auf `frontend` bzw. `backend` setzen und die Variablen eintragen.

## 3. Verbinden prüfen

```bash
# CORS-Preflight (muss Access-Control-Allow-Origin mit der Frontend-Domain liefern)
curl -i -X OPTIONS \
  -H "Origin: https://frontend-tan-theta-32.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  https://business-translator-api.vercel.app/api/translate
```

Mehrere Origins (z. B. zusätzlich eine Custom Domain) gehen kommagetrennt in `FRONTEND_ORIGIN`.

## Updates

- Backend: `npx vercel deploy --prod --yes` in `backend/`
- Frontend: `npx vercel deploy --prod --yes` in `frontend/`

## Hinweis zu früheren Deployments

Frühere Versionen dieses Projekts liefen auf Heroku (`business-translator-api-75a8fdbc26c1.herokuapp.com`) und unter `business-translator.vercel.app`. Beide URLs sind nicht mehr erreichbar. `backend/Procfile` stammt noch aus dieser Zeit und wird von Vercel nicht benötigt.
