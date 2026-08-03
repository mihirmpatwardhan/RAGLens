import httpx
import json

try:
    response = httpx.post(
        "http://127.0.0.1:8000/api/v1/auth/register",
        json={
            "email": "test_prod_ready@gmail.com",
            "password": "SecretTestPassword123!",
            "full_name": "Test User",
            "organization": "Debug Integration"
        },
        timeout=10.0
    )
    print("STATUS:", response.status_code)
    print("RESPONSE BODY:")
    try:
        print(json.dumps(response.json(), indent=2))
    except Exception:
        print(response.text)
except Exception as e:
    print("REQUEST FAILED:", e)
