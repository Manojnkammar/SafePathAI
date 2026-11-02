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
