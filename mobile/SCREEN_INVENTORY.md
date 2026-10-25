# SafePathAI Mobile Screen Inventory

The Expo application implements all 16 Lovable screens as native views.

| No. | Lovable screen | Application route | Main native implementation |
|---:|---|---|---|
| 1 | Loading Screen | `splash` | `App.tsx` |
| 2 | Login/Welcome Back Screen | `login` | `App.tsx` |
| 3 | Home Dashboard | `home` | `App.tsx` |
| 4 | Navigation GPS Map 1 | `navigate` | `App.tsx`, `LiveMap.tsx` |
| 5 | Navigation GPS Map 2 | `navigate2` | `App.tsx`, `LiveMap.tsx` |
| 6 | Trip Planner | `trip` | `App.tsx` |
| 7 | Emergency SOS | `sos` | `App.tsx` |
| 8 | Communication Screen | `comm` | `App.tsx` |
| 9 | Nearby Services | `nearby` | `App.tsx` |
| 10 | Offline Maps | `offline` | `App.tsx` |
| 11 | Route Details | `route` | `App.tsx` |
| 12 | Profile Screen | `profile` | `App.tsx` |
| 13 | Accident Detected Screen | `accident` | `App.tsx` |
| 14 | Community Reports | `community` | `App.tsx` |
| 15 | Settings Screen | `settings` | `App.tsx` |
| 16 | Emergency User Details | `emergency` | `App.tsx` |

## Native assets preserved from Lovable

- `assets/city.jpg`
- `assets/car.jpg`
- `assets/avatar.jpg`

## Configuration

- Expo Android package: `com.safepathai.mobile`
- API base URL: `EXPO_PUBLIC_API_URL`, defaulting to `http://localhost:8000/api/v1`
- Android run command: `npm.cmd run android`
- TypeScript check: `npm.cmd run typecheck`
- Android export: `npm.cmd run export:android`
