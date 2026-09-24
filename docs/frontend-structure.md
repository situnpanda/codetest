# Frontend structure

The frontend is a **Vite + React** single-page application with a
feature-based folder layout.

```
frontend/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx           App bootstrap
    ├── App.jsx            Root component / routing
    ├── authConfig.js      MSAL (Azure AD) configuration
    ├── environment.js     API base URL (http://127.0.0.1:5000/api/)
    └── Components/
        ├── features/      One folder per feature/domain UI
        ├── shared/        Reusable UI components + API clients
        └── Static/        Static assets
```

## Conventions

- **features/** — each UI feature lives in its own folder, keeping features
  clearly separated.
- **shared/** — cross-feature UI components and the API client layer.
- API calls target the base URL defined in `environment.js`.

## Commands

```powershell
cd frontend
npm install     # install dependencies
npm start       # dev server (port 3000)
npm run build   # production build -> dist/
```
