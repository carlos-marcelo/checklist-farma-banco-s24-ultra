import urllib.request
import json

url = "https://checklist-api.marcelo.far.br/audit_sessions"
headers = {
    "apikey": "local-key-to-bypass-auth",
    "Authorization": "Bearer local-key-to-bypass-auth"
}
req = urllib.request.Request(url, headers=headers)

try:
    with urllib.request.urlopen(req) as response:
        data = response.read()
        sessions = json.loads(data.decode('utf-8'))
        print(f"Success! Fetched {len(sessions)} sessions.")
        with open("scratch/sessions_debug.json", "w", encoding="utf-8") as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)
except Exception as e:
    print("Error:", e)
