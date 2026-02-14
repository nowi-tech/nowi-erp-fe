# NOWI ERP - Frontend

React + Vite frontend for the NOWI ERP production tracking system.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Update `VITE_API_URL` if backend is not on localhost:3001.

### 3. Start Development Server
```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

## Build for Production
```bash
npm run build
```

## Deploy to Vercel
```bash
vercel
```

## Pages

### Authentication
- `/login` - Login page

### Cutting Master
- `/cutting` - Dashboard with lot list
- `/cutting/create` - Create new lot

### Stage Workers (Stitching, Finishing, Warehouse)
- `/stage/stitching` - Stitching dashboard
- `/stage/finishing` - Finishing dashboard
- `/stage/dispatch` - Dispatch/warehouse dashboard
- `/stage/:stageName/receive/:lotNo` - Receive lot at stage

### Operator
- `/operator` - Dashboard with search and summary
- `/operator/users` - User management

## Roles
- `operator` - Full access, sees all dashboards
- `cutting_master` - Create lots at cutting stage
- `stitching_master` - Receive at stitching stage
- `finishing` - Receive at finishing stage
- `warehouse` - Receive at dispatch stage
