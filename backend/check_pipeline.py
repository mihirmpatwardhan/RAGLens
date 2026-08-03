import requests
import time

BASE = "http://localhost:8000/api/v1"

# Login
r = requests.post(f"{BASE}/auth/login", json={"email": "demo@raglens.dev", "password": "Demo@1234"})
token = r.json()["access_token"]
H = {"Authorization": f"Bearer {token}"}

print("Waiting 15s for embedding pipeline to finish...")
time.sleep(15)

# Check pipeline runs
r = requests.get(f"{BASE}/documents/pipeline-runs/recent", headers=H)
runs = r.json()
print(f"Pipeline runs: {len(runs['items'])} found")
for run in runs["items"]:
    doc_name = run.get("document_name", "?")
    status = run.get("status", "?")
    progress = run.get("progress", 0)
    chunks = run.get("total_chunks", 0)
    err = run.get("error_message", "")
    print(f"  Doc: {doc_name} | Status: {status} | Progress: {progress}% | Chunks: {chunks}")
    if err:
        print(f"  ERROR: {err}")

# Analytics
r2 = requests.get(f"{BASE}/analytics/overview", headers=H)
a = r2.json()
print(f"Docs: {a['total_documents']} | Chunks: {a['total_chunks']} | Tokens: {a['total_tokens_used']}")
