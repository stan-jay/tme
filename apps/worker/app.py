#!/usr/bin/env python3
"""
TME Worker - File parsing and AI processing
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
from pathlib import Path

app = FastAPI(title="TME Worker", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.get("/health")
def health():
    return {"status": "ok", "service": "worker"}

@app.post("/parse-file")
async def parse_file(file: UploadFile = File(...)):
    """Parse Excel or CSV file and return structure"""
    try:
        file_ext = Path(file.filename).suffix.lower()
        
        if file_ext in ['.csv']:
            df = pd.read_csv(file.file)
        elif file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file.file)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
        
        return {
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "sample": df.head(5).to_dict(orient='records'),
            "dtypes": {col: str(df[col].dtype) for col in df.columns},
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/detect-columns")
async def detect_columns(columns: list[str], context: str = ""):
    """Detect column types and suggest mappings"""
    mappings = []
    
    # Simple rules-based detection
    type_keywords = {
        'customer': ['customer', 'client', 'debtor', 'account', 'name'],
        'invoice': ['invoice', 'doc', 'number', 'bill', 'reference'],
        'date': ['date', 'invoice date', 'created', 'posted'],
        'amount': ['amount', 'total', 'price', 'cost', 'value', 'amt'],
        'qty': ['qty', 'quantity', 'units', 'count'],
    }
    
    for col in columns:
        col_lower = col.lower()
        target_field = col_lower.replace(' ', '_')
        confidence = 0.5
        
        for field_type, keywords in type_keywords.items():
            if any(kw in col_lower for kw in keywords):
                target_field = field_type
                confidence = 0.85
                break
        
        mappings.append({
            "sourceColumn": col,
            "targetField": target_field,
            "confidence": confidence,
        })
    
    return {"mappings": mappings}

@app.post("/validate-data")
async def validate_data(file: UploadFile = File(...)):
    """Validate data quality"""
    try:
        df = pd.read_excel(file.file) if file.filename.endswith('.xlsx') else pd.read_csv(file.file)
        
        issues = []
        
        # Check for missing values
        for col in df.columns:
            missing = df[col].isna().sum()
            if missing > 0:
                issues.append({
                    "type": "warning",
                    "column": col,
                    "message": f"{missing} missing values",
                    "count": int(missing),
                })
        
        # Check for duplicates
        duplicates = df.duplicated().sum()
        if duplicates > 0:
            issues.append({
                "type": "warning",
                "message": f"{duplicates} duplicate rows found",
                "count": int(duplicates),
            })
        
        # Calculate health score
        health_score = max(0, 100 - (len(issues) * 5))
        
        return {
            "rows": len(df),
            "issues": issues,
            "healthScore": health_score,
            "readyToImport": health_score >= 70,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
