export const APP_ROUTES = {
  Splash: 'splash',
  Login: 'login',
  Home: 'home',
  Navigate: 'navigate',
  Navigate2: 'navigate2',
  Trip: 'trip',
  Sos: 'sos',
  Comm: 'comm',
  Nearby: 'nearby',
  Offline: 'offline',
  RouteDetails: 'route',
  Profile: 'profile',
  Accident: 'accident',
  Community: 'community',
  Settings: 'settings',
  Emergency: 'emergency',
} as const;

export type Screen = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

export const SCREEN_ORDER = Object.values(APP_ROUTES);
