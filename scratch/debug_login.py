import httpx
import json

try:
    # 1. Login with the user we just registered
    login_response = httpx.post(
        "http://127.0.0.1:8000/api/v1/auth/login",
        json={
            "email": "test_prod_ready@gmail.com",
            "password": "SecretTestPassword123!"
        },
        timeout=10.0
    )
    print("LOGIN STATUS:", login_response.status_code)
    login_data = login_response.json()
    print("LOGIN RESPONSE:")
    print(json.dumps(login_data, indent=2))

    if login_response.status_code == 200:
        # 2. Get the access token
        token = login_data["access_token"]
        
        # 3. Request /auth/me profile info with the token
        me_response = httpx.get(
            "http://127.0.0.1:8000/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0
        )
        print("GET ME STATUS:", me_response.status_code)
        print("GET ME RESPONSE:")
        print(json.dumps(me_response.json(), indent=2))
        
except Exception as e:
    print("TEST FAILED:", e)
