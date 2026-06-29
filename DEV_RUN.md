Quick Local Run (short)

# Prereqs
- Node.js (18+)
- Python 3.11+

# Setup
npm install

# Worker venv
cd apps/worker
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt
cd ../..

# Start services
npm run dev:backend   # backend on http://localhost:4000
npm run dev:frontend  # frontend on http://localhost:5173
npm run dev:worker    # worker on http://localhost:5000

# Smoke test (upload sample file)
curl -i -F "file=@apps/worker/sample.csv" http://127.0.0.1:4000/migration/upload
