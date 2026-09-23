import os
import uvicorn
from app.seed_data import seed_database

if __name__ == "__main__":
    # Seed database if needed on startup
    try:
        seed_database()
    except Exception as e:
        print(f"Seed note: {e}")
        
    port = int(os.environ.get("PORT", 8000))
    print(f"Iniciando servidor W&P en puerto {port}...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
