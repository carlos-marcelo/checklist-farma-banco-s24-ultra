import json

for fname in ["debug_output.json", "debug_output_2.json", "users_dump.json"]:
    try:
        with open(fname, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                print(f"{fname}: list of {len(data)} items. First item keys: {list(data[0].keys()) if data else 'empty'}")
            elif isinstance(data, dict):
                print(f"{fname}: dict with keys: {list(data.keys())}")
            else:
                print(f"{fname}: type {type(data)}")
    except Exception as e:
        print(f"Error reading {fname}: {e}")
