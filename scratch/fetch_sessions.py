import urllib.request
import json

url = "http://localhost:3000/api/audit_sessions"
req = urllib.request.Request(url)

try:
    with urllib.request.urlopen(req) as response:
        data = response.read()
        sessions = json.loads(data.decode('utf-8'))
        print(f"Fetched {len(sessions)} sessions.")
        
        # Save to a temporary file for analysis
        with open("scratch/sessions_debug.json", "w", encoding="utf-8") as f:
            json.dump(sessions, f, indent=2, ensure_ascii=False)
        print("Saved sessions to scratch/sessions_debug.json")
except Exception as e:
    print("Error fetching sessions:", e)
