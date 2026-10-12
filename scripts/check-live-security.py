"""Non-destructive production checks. Never prints credentials or response bodies."""
import json, pathlib, re, urllib.parse, urllib.request, urllib.error
root = pathlib.Path(__file__).resolve().parents[1]
checks = []
def check(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as error:
        response = error
    data = response.read()
    return response.status, dict(response.headers), data

for base, routes in [
    ('https://myscheduleltd.com', ['/', '/.env', '/.git/config', '/world/server/index.mjs', '/world/server/festival-state.json', '/moth/.env', '/moth/deploy-manifest.json', '/moth/haptics-test.html', '/moth/sfx-test.html']),
    ('https://myschedule-festival.onrender.com', ['/api/config', '/api/admin/state', '/api/admin/offerings', '/.env', '/.git/config', '/server/festival-state.json', '/%2e%2e%2fserver/index.mjs'])
]:
    for route in routes:
        status, headers, data = check(base + route)
        item = {'url': base + route, 'status': status, 'headers': {key: value for key, value in headers.items() if key.lower() in ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'strict-transport-security', 'access-control-allow-origin', 'server']}}
        if route == '/api/config':
            payload = json.loads(data)
            def secret_keys(value):
                if isinstance(value, dict):
                    return [key for key, child in value.items() if re.search('hashKey|hashIV|password|secret|adminKey|apiKey|sessionToken', key, re.I)] + [key for child in value.values() for key in secret_keys(child)]
                if isinstance(value, list):
                    return [key for child in value for key in secret_keys(child)]
                return []
            item['credentialFieldNames'] = secret_keys(payload)
        checks.append(item)
for origin in ['https://myscheduleltd.com', 'https://untrusted.invalid']:
    status, headers, data = check('https://myschedule-festival.onrender.com/api/config', {'Origin': origin})
    checks.append({'check': 'API origin enforcement', 'origin': origin, 'status': status, 'allowOrigin': headers.get('access-control-allow-origin')})
status, headers, data = check('https://myschedule-festival.onrender.com/api/admin/state', {'x-festival-admin-key': 'moth-security-invalid-key'})
checks.append({'check': 'Invalid admin key', 'status': status})

source = (root / 'world/src/data/immersiveVideoSources.ts').read_text()
match = re.search(r"const driveApiKey = '([^']+)'", source)
if match and match.group(1):
    api_url = 'https://www.googleapis.com/drive/v3/files/1y1oR_RYNXob0NBuB4QiLgywV5IEJzDXT?' + urllib.parse.urlencode({'fields': 'id,mimeType', 'key': match.group(1)})
    for referer in [None, 'https://untrusted.invalid/', 'https://myscheduleltd.com/']:
        status, headers, data = check(api_url, {'Referer': referer} if referer else {})
        payload = json.loads(data)
        reasons = [detail.get('reason') for detail in payload.get('error', {}).get('details', []) if 'reason' in detail]
        checks.append({'check': 'Existing browser Drive key restrictions', 'referer': referer, 'status': status, 'reasons': reasons})

(root / '.qa/moth/live-security.json').write_text(json.dumps(checks, indent=2) + '\n')
print(json.dumps(checks, indent=2))
