# Quick Start Guide

## Prerequisites

- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- Redis 6+

## Setup

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Prepare environments
cd apps/backend
cp .env.example .env
cd ../../

cd apps/frontend
cp .env.example .env
cd ../../

cd apps/worker
# Create Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ../../
```

### 2. Database Setup

```bash
# Update .env with your DATABASE_URL
# Then run migrations
cd apps/backend
npx prisma migrate dev --name init
cd ../../
```

### 3. Start Services

**Terminal 1 - Backend:**
```bash
cd apps/backend
npm run start:dev
# http://localhost:4000
```

**Terminal 2 - Frontend:**
```bash
cd apps/frontend
npm run dev
# http://localhost:5173
```

**Terminal 3 - Worker:**
```bash
cd apps/worker
# With venv activated:
python app.py
# http://localhost:5000
```

## End-to-End Flow

### 1. Upload File
```bash
curl -X POST http://localhost:4000/migration/upload \
  -F "file=@invoice_data.xlsx"
```

### 2. Analyze
```bash
curl -X POST http://localhost:4000/migration/analyze \
  -H "Content-Type: application/json" \
  -d '{"filePath": "uploads/invoice_data.xlsx", "sourceType": "excel"}'
```

### 3. Validate
```bash
curl -X POST http://localhost:4000/migration/validate \
  -H "Content-Type: application/json" \
  -d '{"data": [...], "schema": {}}'
```

### 4. Simulate
```bash
curl -X POST http://localhost:4000/migration/simulate \
  -H "Content-Type: application/json" \
  -d '{"data": [...], "mappings": {}}'
```

### 5. Execute
```bash
curl -X POST http://localhost:4000/migration/execute \
  -H "Content-Type: application/json" \
  -d '{"data": [...], "mappings": {}, "destination": "stan_jay_erp"}'
```

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/tme
REDIS_URL=redis://localhost:6379
PORT=4000
STAN_JAY_API_URL=http://localhost:3000/api
STAN_JAY_API_KEY=your-api-key
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:4000
```

## Testing

### Sample Excel File
Create `test-data.xlsx` with columns:
- Customer Name
- Invoice Number
- Invoice Date
- Product
- Quantity
- Unit Price
- Total Amount

Upload via the frontend UI at http://localhost:5173

## Troubleshooting

**PostgreSQL connection error:**
- Ensure PostgreSQL is running
- Check DATABASE_URL format
- Run `npx prisma db push` to create tables

**Worker not responding:**
- Check Python venv is activated
- Verify port 5000 is available
- Check worker logs for pandas/openpyxl errors

**Frontend can't reach backend:**
- Verify backend is running on port 4000
- Check VITE_API_URL is correct
- Check CORS settings in backend

## Next Steps

1. Implement file upload handler in backend
2. Add database persistence
3. Wire worker API calls for Excel parsing
4. Implement Stan Jay ERP connector
5. Add authentication layer
6. Deploy to production
