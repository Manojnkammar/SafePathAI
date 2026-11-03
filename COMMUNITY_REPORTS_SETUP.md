# Community Reports Setup

## Implemented

- FastAPI report create/list/get/area/vote/verify/resolve API.
- Report lifecycle fields and duplicate-vote protection in SQLite/PostgreSQL models.
- Validated community reports excluded when resolved or expired.
- Multipart JPEG/PNG/WebP upload endpoint with a 10 MB limit.
- Expo camera, gallery, location, loading, error, refresh, confirmation, and thumbnail support.
- Android permissions for camera, media images, and location.
- PostGIS migration path for production PostgreSQL.

## Verified

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_smoke.py -q
```

```powershell
cd mobile
npm.cmd run typecheck
npx.cmd expo install --check
```

The backend smoke test passes. Expo Android export reached Metro bundling but could not be confirmed complete in this device/SDK environment; use the development-build workflow for final APK validation.

## Environment

Mobile:

```text
EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:8000/api/v1
```

Backend development:

```text
DATABASE_URL=sqlite+aiosqlite:///./safepath.db
HAZARD_TTL_HOURS=6
```

When testing on a physical Android device, start the API on all network
interfaces so the phone can reach the computer:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Set `EXPO_PUBLIC_API_URL` to the computer's LAN IPv4 address, for example
`http://192.168.1.25:8000/api/v1`. The phone and computer must be on the
same Wi-Fi network, and Windows Firewall must allow inbound TCP port 8000.
After changing `app.json`, rebuild the Android development build; Expo Go
cannot apply native manifest changes to an already-installed build.

Production PostgreSQL example:

```text
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/safepath
```

## Migration

```powershell
cd backend
alembic upgrade head
```

The migration adds report lifecycle support and enables PostGIS only for PostgreSQL. SQLite remains supported for development.

## Object storage

The current implementation stores files under `backend/media/` and saves the public URL in PostgreSQL/SQLite. Before internet deployment, replace it with S3, Azure Blob Storage, or another object store and return a restricted object-storage reference.

## Android testing

1. Install and run a development build, because camera and location native modules require it.
2. Grant camera, photo, and foreground-location permissions.
3. Open Community Reports and tap `+ Report`.
4. Select a category, choose or capture an image, confirm GPS, submit, and confirm the returned report.
5. Pull down to refresh and test upvote duplicate prevention.
6. Verify resolved and expired reports disappear from active hazards.

If place search reports a Nominatim DNS error, fix the backend connection
first. Mobile place search uses the backend proxy before attempting the
direct OpenStreetMap fallback, so an unreachable API causes both errors to
appear together.
