import LiveMap, { NearbyPlace, PlannedRoute, RouteSummary } from './LiveMap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { Screen } from './src/navigation/routes';
import {
  addNearbyBluetoothListener,
  nearbyBluetooth,
  requestNearbyBluetoothPermissions,
  type BlePeerConnection,
  type BleReceivedMessage,
  type NearbyBlePeer,
} from './src/services/nearbyBluetooth';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  PermissionsAndroid,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafePathSms } from './modules/safepath-sms';

/* ───────────────────────── Theme ───────────────────────── */
const C = {
  bg: '#0D1028',
  bg2: '#11142E',
  panel: '#191D38',
  panel2: '#222640',
  blue: '#4B54DD',
  blueLight: '#8790FF',
  purple: '#7435C7',
  red: '#EB3C43',
  redDark: '#3A1A26',
  orange: '#F6A85A',
  green: '#48D6A0',
  yellow: '#F2B249',
  white: '#F7F7FC',
  muted: '#A7ABC0',
  border: '#303552',
};

/* ───────────────────────── Types ───────────────────────── */
type User = { id: string; email: string; display_name?: string | null; phone_number?: string | null };
type EmergencyContact = { id: string; name: string; phone: string };
type SavedPlace = { name: string; lat: number; lng: number };
type SavedBlePeer = NearbyBlePeer & { connected: boolean };
type ApiOptions = { method?: string; body?: unknown };
type CommunityReport = {
  id: number;
  created_at: string;
  incident_type: string;
  severity: string;
  lat: number;
  lng: number;
  description: string | null;
  media_url: string | null;
  credibility: number;
  validated: boolean;
  upvotes: number;
  downvotes: number;
  user_id: string | null;
};
type ReportType = 'pothole' | 'traffic_jam' | 'accident' | 'flooded_road';
type TripVehicle = 'bike' | 'car' | 'ev' | 'bus';
type TripPreference = 'best' | 'safest' | 'fuel_saver' | 'less_traffic';
type TripPlace = { name: string; lat: number; lng: number };
type TripStop = { id: number; place: TripPlace | null };
type TripLeg = { origin_name: string; destination_name: string; distance_m: number; duration_s: number };
type TripRoute = {
  rank: number;
  points: { lat: number; lng: number }[];
  legs: TripLeg[];
  distance_m: number;
  duration_s: number;
  safety_score: number | null;
  fuel_litres: number | null;
  energy_kwh: number | null;
  estimated_cost: number | null;
  explanation: string;
};
type TripPlan = {
  provider: string;
  active_hazards: number;
  vehicle_type: TripVehicle;
  preference: TripPreference;
  traffic_data_available: boolean;
  routes: TripRoute[];
  ranking_note: string;
  estimation_note: string;
};
type SavedRoute = {
  id: number;
  created_at: string;
  user_id: string;
  origin_name: string;
  destination_name: string;
  distance_km: number;
  duration_minutes: number;
  safety_score: number;
  route_type: string;
  provider: string;
  is_saved: boolean;
};

function parseBackendUtcTimestamp(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
}

function sanitizeContactName(value: string) {
  return Array.from(value)
    .filter((character) => /[\p{Letter}\p{Mark}\p{Extended_Pictographic}\u200d\ufe0f\s]/u.test(character))
    .join('')
    .replace(/\s{2,}/g, ' ');
}

let nextTripStopId = 0;

const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const developmentHost = expoHost && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(expoHost)
  ? expoHost
  : Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${developmentHost}:8000/api/v1`;
const SAVED_BLE_PEERS_KEY = 'safepath-nearby-bluetooth-peers';
const SAVED_PLACES_KEY = 'safepath-saved-places';
const PROFILE_PHOTO_KEY = 'safepath-profile-photo';
const MAX_SAVED_BLE_PEERS = 5;

function isSavedBlePeer(value: unknown): value is SavedBlePeer {
  if (!value || typeof value !== 'object') return false;
  const peer = value as Record<string, unknown>;
  return typeof peer.id === 'string'
    && typeof peer.name === 'string'
    && Number.isFinite(peer.rssi)
    && typeof peer.connected === 'boolean';
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? ` ${error.message}` : '';
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'The SafePath API did not respond within 10 seconds.'
      : `Could not reach the SafePath API at ${API_URL}. Start the backend and set EXPO_PUBLIC_API_URL to its address if you are using a physical device.${reason}`;
    throw new Error(
      message,
    );
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
        const apiDetail = parsed.detail;
        if (typeof apiDetail === 'string') {
          detail = apiDetail;
        } else if (Array.isArray(apiDetail)) {
          detail = apiDetail
            .map((item) => item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string'
              ? item.msg
              : null)
            .filter((message): message is string => message !== null)
            .join(' ');
        }
      }
    } catch {
      // Keep the response body as-is when the server does not return JSON.
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function formatTripDistance(distanceM: number) {
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(distanceM)} m`;
}

function formatTripDuration(durationS: number) {
  const minutes = Math.max(1, Math.round(durationS / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

const TABS: { key: Screen; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'navigate', label: 'Map', icon: '⌖' },
  { key: 'trip', label: 'Trips', icon: '▣' },
  { key: 'community', label: 'Alerts', icon: '🔔' },
  { key: 'profile', label: 'Profile', icon: '◉' },
];
const TAB_SCREENS: Screen[] = ['home', 'navigate', 'navigate2', 'trip', 'route', 'community', 'profile', 'settings', 'nearby', 'offline', 'comm', 'emergency', 'sos'];
const TITLES: Partial<Record<Screen, string>> = {
  trip: 'Trip Planner', sos: 'Emergency SOS', comm: 'Communication', nearby: 'Nearby Services',
  offline: 'Offline Maps', route: 'Route Details', profile: 'Profile', community: 'Community Reports',
  settings: 'Settings', emergency: 'Emergency User Details',
};

/* ───────────────────────── Small components ───────────────────────── */
function Btn({ title, onPress, outline, danger, pill, disabled, small }: {
  title: string; onPress: () => void; outline?: boolean; danger?: boolean; pill?: boolean; disabled?: boolean; small?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        small && { minHeight: 38 },
        outline && s.btnOutline,
        danger && { backgroundColor: C.red },
        pill && { borderRadius: 30 },
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={s.btnText}>{title}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, secure, keyboardType, icon, maxLength }: {
  label?: string; value: string; onChangeText?: (v: string) => void; placeholder?: string;
  secure?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad'; icon?: string; maxLength?: number;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.inputWrap}>
        {icon ? <Text style={s.inputIcon}>{icon}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={C.muted}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize="none"
          style={s.input}
        />
      </View>
    </View>
  );
}

const COUNTRY_CODES = [
  { country: 'India', code: '+91' },
  { country: 'United States', code: '+1' },
  { country: 'United Kingdom', code: '+44' },
  { country: 'United Arab Emirates', code: '+971' },
  { country: 'Australia', code: '+61' },
  { country: 'Canada', code: '+1' },
] as const;

function CountryPhoneField({ label, countryCode, onCountryCodeChange, value, onChangeText }: {
  label: string;
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[s.inputWrap, { width: 110, justifyContent: 'center' }]} onPress={() => setPickerOpen(true)}>
          <Text style={s.input}>{countryCode}  ▾</Text>
        </Pressable>
        <View style={[s.inputWrap, { flex: 1 }]}>
          <TextInput
            value={value}
            onChangeText={(input) => onChangeText(input.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit number"
            placeholderTextColor={C.muted}
            keyboardType="phone-pad"
            maxLength={10}
            style={s.input}
          />
        </View>
      </View>
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={s.modalCard}>
            <Text style={s.h2}>Select country code</Text>
            {COUNTRY_CODES.map((option) => (
              <Pressable
                key={`${option.country}-${option.code}`}
                style={s.row}
                onPress={() => {
                  onCountryCodeChange(option.code);
                  setPickerOpen(false);
                }}
              >
                <Text style={s.rowTitle}>{option.country}</Text>
                <Text style={s.rowValue}>{option.code}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ icon, title, value, onPress, valueColor, last }: {
  icon?: string; title: string; value?: string; onPress?: () => void; valueColor?: string; last?: boolean;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[s.row, last && { borderBottomWidth: 0 }]}>
      {icon ? <Text style={s.rowIcon}>{icon}</Text> : null}
      <Text style={s.rowTitle}>{title}</Text>
      {value ? <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text> : null}
      {onPress ? <Text style={s.arrow}>›</Text> : null}
    </Pressable>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: C.blue, borderColor: C.blue }]}>
      <Text style={s.white12}>{icon ? `${icon} ` : ''}{label}</Text>
    </Pressable>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

function TripPlaceField({ label, value, onChange }: {
  label: string;
  value: TripPlace | null;
  onChange: (place: TripPlace | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [suggestions, setSuggestions] = useState<TripPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function searchPlaces() {
    if (query.trim().length < 2) {
      setError('Enter at least 2 characters to search.');
      return;
    }
    setLoading(true);
    setError('');
    setSuggestions([]);
    try {
      const results = await api<TripPlace[]>(`/routes/places/search?q=${encodeURIComponent(query.trim())}`);
      setSuggestions(results);
      if (results.length === 0) setError('No matching places found.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Place search failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputWrap}>
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setSuggestions([]);
            setError('');
            onChange(null);
          }}
          placeholder="Search a place"
          placeholderTextColor={C.muted}
          style={s.input}
          returnKeyType="search"
          onSubmitEditing={searchPlaces}
        />
        <Pressable onPress={searchPlaces} disabled={loading} accessibilityRole="button">
          {loading ? <ActivityIndicator color={C.blueLight} /> : <Text style={{ color: C.blueLight, fontWeight: '700' }}>Search</Text>}
        </Pressable>
      </View>
      {value ? <Text style={s.mini}>Selected: {value.name}</Text> : null}
      {suggestions.map((place, index) => (
        <Pressable
          key={`${place.lat},${place.lng},${index}`}
          style={s.placeSuggestion}
          onPress={() => {
            setQuery(place.name);
            setSuggestions([]);
            setError('');
            onChange(place);
          }}
        >
          <Text style={s.white12}>{place.name}</Text>
        </Pressable>
      ))}
      {error ? <Text style={{ color: C.orange, fontSize: 12, marginTop: 6 }}>{error}</Text> : null}
    </View>
  );
}

/* ───────────────────────── Stylised map ───────────────────────── */
type Pt = [number, number]; // fractions of map width/height (0..1)

function MapMockOld({ variant = 1, hazards = false }: { variant?: 1 | 2; hazards?: boolean }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  // draws a straight segment between two fractional points
  const seg = (a: Pt, b: Pt, thick: number, color: string, key: string, glow = false) => {
    const x1 = a[0] * size.w, y1 = a[1] * size.h, x2 = b[0] * size.w, y2 = b[1] * size.h;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          width: len,
          height: thick,
          left: (x1 + x2) / 2 - len / 2,
          top: (y1 + y2) / 2 - thick / 2,
          backgroundColor: color,
          borderRadius: thick / 2,
          transform: [{ rotate: `${ang}deg` }],
          ...(glow ? { opacity: 0.95 } : null),
        }}
      />
    );
  };

  const roads: [Pt, Pt, number][] = [
    [[0, 0.1], [1, 0.55], 10],
    [[0, 0.85], [1, 0.25], 8],
    [[0.3, 0], [0.45, 1], 6],
    [[0.7, 0], [0.6, 1], 6],
    [[0, 0.5], [1, 0.62], 5],
    [[0, 0.3], [1, 0.12], 5],
  ];
  const route: Pt[] =
    variant === 1
      ? [[0.5, 0.82], [0.52, 0.6], [0.4, 0.45], [0.46, 0.28], [0.36, 0.12]]
      : [[0.5, 0.82], [0.6, 0.62], [0.72, 0.42], [0.82, 0.2]];

  const pins: Pt[] = [[0.22, 0.1], [0.72, 0.06], [0.88, 0.5], [0.12, 0.45]];

  return (
    <View style={s.map} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? (
        <>
          {roads.map(([a, b, t], i) => seg(a, b, t, '#2B3553', `r${i}`))}
          {route.slice(0, -1).map((p, i) => seg(p, route[i + 1], 8, '#493CFF', `rt${i}`, true))}
          {pins.map((p, i) => (
            <Text key={`p${i}`} style={[s.pin, { left: p[0] * size.w - 10, top: p[1] * size.h - 20 }]}>📍</Text>
          ))}
          {hazards ? <Text style={[s.pin, { left: 0.55 * size.w - 10, top: 0.5 * size.h - 12 }]}>⚠️</Text> : null}
          <View style={[s.userDot, { left: 0.5 * size.w - 23, top: 0.82 * size.h - 23, bottom: undefined }]}>
            <Text style={{ color: C.white, fontSize: 18 }}>➤</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/* ───────────────────────── App ───────────────────────── */
export default function App() {
  const [stack, setStack] = useState<Screen[]>(['splash']);
  const screen = stack[stack.length - 1];
  const [sosPosition, setSosPosition] = useState<{ x: number; y: number } | null>(null);
  const sosPositionRef = useRef<{ x: number; y: number } | null>(null);
  const sosBoundsRef = useRef({ width: 430, height: 800 });
  const sosDragStart = useRef({ x: 0, y: 0 });
  const sosDragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sosDragging = useRef(false);
  const sosHoldActive = useRef(false);
  const sosResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      sosHoldActive.current = false;
      sosDragging.current = false;
      sosDragTimer.current = setTimeout(() => {
        sosHoldActive.current = true;
      }, 350);
    },
    onPanResponderMove: (_, gesture) => {
      if (!sosHoldActive.current) return;
      if (!sosDragging.current) {
        sosDragging.current = true;
        sosDragStart.current = sosPositionRef.current ?? { x: 0, y: 0 };
      }
      const bounds = sosBoundsRef.current;
      setSosPosition({
        x: Math.max(0, Math.min(bounds.width - 58, sosDragStart.current.x + gesture.dx)),
        y: Math.max(0, Math.min(bounds.height - 58, sosDragStart.current.y + gesture.dy)),
      });
      sosPositionRef.current = {
        x: Math.max(0, Math.min(bounds.width - 58, sosDragStart.current.x + gesture.dx)),
        y: Math.max(0, Math.min(bounds.height - 58, sosDragStart.current.y + gesture.dy)),
      };
    },
    onPanResponderRelease: () => {
      if (sosDragTimer.current) clearTimeout(sosDragTimer.current);
      if (!sosHoldActive.current && !sosDragging.current) setStack((current) => [...current, 'sos']);
      sosHoldActive.current = false;
      sosDragging.current = false;
    },
    onPanResponderTerminate: () => {
      if (sosDragTimer.current) clearTimeout(sosDragTimer.current);
      sosHoldActive.current = false;
      sosDragging.current = false;
    },
  }), []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleNumberDraft, setVehicleNumberDraft] = useState('');
  const [vehicleNumberLoading, setVehicleNumberLoading] = useState(true);
  const [vehicleEditorOpen, setVehicleEditorOpen] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [savedPlacesLoading, setSavedPlacesLoading] = useState(true);
  const [savedPlacesPickerOpen, setSavedPlacesPickerOpen] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [savedRoutesLoading, setSavedRoutesLoading] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [batteryLoading, setBatteryLoading] = useState(true);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [contactPhoneDraft, setContactPhoneDraft] = useState('');
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [savedBlePeers, setSavedBlePeers] = useState<SavedBlePeer[]>([]);
  const savedBlePeersRef = useRef<SavedBlePeer[]>([]);
  const [savedBlePeersLoaded, setSavedBlePeersLoaded] = useState(false);
  const nearbyBlePeersRef = useRef<NearbyBlePeer[]>([]);
  const pendingBlePeerIdsRef = useRef<Set<string>>(new Set());
  const [nearbyBlePeers, setNearbyBlePeers] = useState<NearbyBlePeer[]>([]);
  const [bleStatus, setBleStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [bleError, setBleError] = useState('');
  const [peerPickerOpen, setPeerPickerOpen] = useState(false);
  const [bleScanning, setBleScanning] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastDraft, setBroadcastDraft] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  // form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [signUpMode, setSignUpMode] = useState(false);
  const [search, setSearch] = useState('');

  // trip state
  const [tripOrigin, setTripOrigin] = useState<TripPlace | null>(null);
  const [tripDestination, setTripDestination] = useState<TripPlace | null>(null);
  const [tripStops, setTripStops] = useState<TripStop[]>([]);
  const [vehicle, setVehicle] = useState<TripVehicle | null>(null);
  const [navigationVehicle, setNavigationVehicle] = useState<TripVehicle>('car');
  const [navigationVehiclePickerOpen, setNavigationVehiclePickerOpen] = useState(false);
  const [routePref, setRoutePref] = useState<TripPreference>('best');
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [tripRouteIndex, setTripRouteIndex] = useState(0);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState('');

  // misc ui state
  const [routeTab, setRouteTab] = useState('Overview');
  const [reportFilter, setReportFilter] = useState('All');
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState('');
  const [selectedReportDetails, setSelectedReportDetails] = useState<CommunityReport | null>(null);
  const [reportSelectionMode, setReportSelectionMode] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('pothole');
  const [reportDescription, setReportDescription] = useState('');
  const [reportPhotoUri, setReportPhotoUri] = useState<string | null>(null);
  const [reportLocation, setReportLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [foodFilter, setFoodFilter] = useState<'Veg' | 'Non-Veg'>('Veg');
  const [darkMode, setDarkMode] = useState<'Off' | 'On' | 'System'>('System');
  const [shareInfo, setShareInfo] = useState(true);
  const [bloodGroup, setBloodGroup] = useState('');
  const [notes, setNotes] = useState('');
  const [countdown, setCountdown] = useState(10);
  const [dl, setDl] = useState(45);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [sharedLocation, setSharedLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [sosLocation, setSosLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyCategory, setNearbyCategory] = useState('');
  const [nearbyError, setNearbyError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('safepath-vehicle-number')
      .then((savedNumber) => {
        if (savedNumber) setVehicleNumber(savedNumber);
      })
      .catch((error) => {
        Alert.alert('Vehicle details unavailable', error instanceof Error ? error.message : 'Could not load the saved vehicle number.');
      })
      .finally(() => setVehicleNumberLoading(false));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('safepath-emergency-contacts')
      .then((savedContacts) => {
        if (!savedContacts) return;
        const parsed: unknown = JSON.parse(savedContacts);
        if (!Array.isArray(parsed) || !parsed.every((item) =>
          item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.phone === 'string'
        )) {
          throw new Error('Saved emergency contacts have an invalid format.');
        }
        setEmergencyContacts(parsed as EmergencyContact[]);
      })
      .catch((error) => {
        Alert.alert('Emergency contacts unavailable', error instanceof Error ? error.message : 'Could not load saved contacts.');
      })
      .finally(() => setContactsLoading(false));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_PLACES_KEY)
      .then((savedPlacesJson) => {
        if (!savedPlacesJson) return;
        const parsed: unknown = JSON.parse(savedPlacesJson);
        if (!Array.isArray(parsed) || !parsed.every(isSavedPlace)) {
          throw new Error('Saved places have an invalid format.');
        }
        setSavedPlaces(parsed);
      })
      .catch((error) => {
        Alert.alert('Saved places unavailable', error instanceof Error ? error.message : 'Could not load saved places.');
      })
      .finally(() => setSavedPlacesLoading(false));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_PHOTO_KEY)
      .then(setProfilePhotoUri)
      .catch((error) => {
        Alert.alert('Profile photo unavailable', error instanceof Error ? error.message : 'Could not load your profile photo.');
      });
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedRoutes([]);
      setSavedRoutesLoading(false);
      return;
    }

    setSavedRoutesLoading(true);
    api<SavedRoute[]>(`/routes?user_id=${encodeURIComponent(user.id)}`)
      .then(setSavedRoutes)
      .catch((error) => {
        Alert.alert('Route history unavailable', error instanceof Error ? error.message : 'Could not load route history.');
        setSavedRoutes([]);
      })
      .finally(() => setSavedRoutesLoading(false));
  }, [user]);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_BLE_PEERS_KEY)
      .then((savedPeers) => {
        if (!savedPeers) return;
        const parsed: unknown = JSON.parse(savedPeers);
        if (!Array.isArray(parsed) || !parsed.every(isSavedBlePeer)) {
          throw new Error('Saved Bluetooth connections have an invalid format.');
        }
        const peers = parsed.slice(0, MAX_SAVED_BLE_PEERS);
        savedBlePeersRef.current = peers;
        setSavedBlePeers(peers);
      })
      .catch((error) => {
        Alert.alert('Bluetooth connections unavailable', error instanceof Error ? error.message : 'Could not load saved devices.');
      })
      .finally(() => setSavedBlePeersLoaded(true));
  }, []);

  useEffect(() => {
    let active = true;
    let subscription: Battery.Subscription | undefined;

    async function readBatteryLevel() {
      try {
        const available = await Battery.isAvailableAsync();
        if (!active) return;
        if (!available) {
          setBatteryLevel(null);
          return;
        }

        const level = await Battery.getBatteryLevelAsync();
        if (!active) return;
        setBatteryLevel(level >= 0 ? Math.round(level * 100) : null);
        subscription = Battery.addBatteryLevelListener(({ batteryLevel: updatedLevel }) => {
          if (active) setBatteryLevel(updatedLevel >= 0 ? Math.round(updatedLevel * 100) : null);
        });
      } catch (error) {
        if (!active) return;
        setBatteryLevel(null);
        Alert.alert('Battery level unavailable', error instanceof Error ? error.message : 'Could not read the device battery level.');
      } finally {
        if (active) setBatteryLoading(false);
      }
    }

    void readBatteryLevel();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const selectedTripRoute = tripPlan?.routes[tripRouteIndex] ?? tripPlan?.routes[0] ?? null;
  const tripMapRoutes = useMemo<PlannedRoute[]>(
    () => tripPlan?.routes.map((route) => ({
      points: route.points,
      distanceM: route.distance_m,
      durationS: route.duration_s,
    })) ?? [],
    [tripPlan],
  );
  const tripMapWaypoints = useMemo(
    () => tripOrigin && tripDestination
      ? [tripOrigin, ...tripStops.flatMap((stop) => stop.place ? [stop.place] : []), tripDestination]
          .map(({ lat, lng }) => ({ lat, lng }))
      : [],
    [tripOrigin, tripStops, tripDestination],
  );

  /* navigation helpers */
  const go = useCallback((next: Screen) => setStack((st) => [...st, next]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const tab = useCallback((next: Screen) => setStack(['home'].concat(next === 'home' ? [] : [next]) as Screen[]), []);

  async function persistSavedBlePeers(peers: SavedBlePeer[]) {
    const limitedPeers = peers.slice(0, MAX_SAVED_BLE_PEERS);
    await AsyncStorage.setItem(SAVED_BLE_PEERS_KEY, JSON.stringify(limitedPeers));
    savedBlePeersRef.current = limitedPeers;
    setSavedBlePeers(limitedPeers);
  }

  async function scanForBluetoothPeers() {
    if (savedBlePeers.length >= MAX_SAVED_BLE_PEERS) {
      Alert.alert('Connection limit reached', `You can connect up to ${MAX_SAVED_BLE_PEERS} nearby devices.`);
      return;
    }
    setBleError('');
    setNearbyBlePeers([]);
    setBleScanning(true);
    try {
      await requestNearbyBluetoothPermissions();
      await nearbyBluetooth.startScan(12_000);
      setTimeout(() => setBleScanning(false), 12_000);
    } catch (error) {
      setBleScanning(false);
      setBleError(error instanceof Error ? error.message : 'Bluetooth scan could not be started.');
    }
  }

  async function connectToBluetoothPeer(peer: NearbyBlePeer) {
    if (savedBlePeers.some((savedPeer) => savedPeer.id === peer.id)) return;
    if (savedBlePeers.length + pendingBlePeerIdsRef.current.size >= MAX_SAVED_BLE_PEERS) {
      Alert.alert('Connection limit reached', `You can connect up to ${MAX_SAVED_BLE_PEERS} nearby devices.`);
      return;
    }
    try {
      pendingBlePeerIdsRef.current.add(peer.id);
      await nearbyBluetooth.connect(peer.id);
    } catch (error) {
      pendingBlePeerIdsRef.current.delete(peer.id);
      setBleError(error instanceof Error ? error.message : 'Could not connect to that device.');
    }
  }

  async function removeBluetoothPeer(peerId: string) {
    try {
      await nearbyBluetooth.disconnect(peerId);
      await persistSavedBlePeers(savedBlePeersRef.current.filter((peer) => peer.id !== peerId));
    } catch (error) {
      setBleError(error instanceof Error ? error.message : 'Could not remove that Bluetooth device.');
    }
  }

  async function sendBroadcastMessage() {
    const message = broadcastDraft.trim();
    const connectedPeers = savedBlePeers.filter((peer) => peer.connected);
    if (!message) {
      Alert.alert('Message required', 'Type a short message asking for help.');
      return;
    }

    useEffect(() => {
      if (screen !== 'comm') return;
      if (!savedBlePeersLoaded) return;
      let active = true;
      let subscriptions: { remove: () => void }[] = [];

      const startCommunication = async () => {
        setBleStatus('starting');
        setBleError('');
        try {
          await requestNearbyBluetoothPermissions();
          if (!active) return;
          subscriptions = [
            addNearbyBluetoothListener('onBluetoothStatus', (status) => {
              if (status.ready) {
                setBleStatus('ready');
                setBleError('');
              } else {
                setBleStatus('error');
                setBleError(status.error ?? 'Bluetooth advertising failed.');
              }
            }),
            addNearbyBluetoothListener('onPeerFound', (peer) => {
              setNearbyBlePeers((currentPeers) => {
                const nextPeers = currentPeers.filter((currentPeer) => currentPeer.id !== peer.id);
                const sortedPeers = [...nextPeers, peer].sort((a, b) => b.rssi - a.rssi);
                nearbyBlePeersRef.current = sortedPeers;
                return sortedPeers;
              });
            }),
            addNearbyBluetoothListener('onPeerConnection', (connection: BlePeerConnection & { error?: string; name?: string }) => {
              if (connection.error) {
                setBleError(`Bluetooth error: ${connection.error}`);
                return;
              }
              const existing = savedBlePeersRef.current;
              const pending = pendingBlePeerIdsRef.current.has(connection.id);
              const existingPeer = existing.find((peer) => peer.id === connection.id);
              if (!connection.connected) {
                if (existingPeer) {
                  void persistSavedBlePeers(existing.map((peer) =>
                    peer.id === connection.id ? { ...peer, connected: false } : peer
                  )).catch((error) => {
                    setBleError(error instanceof Error ? error.message : 'Could not update the Bluetooth connection.');
                  });
                } else if (pending) {
                  pendingBlePeerIdsRef.current.delete(connection.id);
                  setBleError('Bluetooth connection failed. Check that the other device is still available.');
                }
                return;
              }
              if (!existingPeer && !pending) return;
              const discovered = nearbyBlePeersRef.current.find((peer) => peer.id === connection.id);
              const updatedPeer: SavedBlePeer = {
                id: connection.id,
                name: connection.name ?? discovered?.name ?? existingPeer?.name ?? 'SafePath device',
                rssi: discovered?.rssi ?? existingPeer?.rssi ?? -100,
                connected: true,
              };
              const nextPeers = existingPeer
                ? existing.map((peer) => peer.id === connection.id ? updatedPeer : peer)
                : [...existing, updatedPeer].slice(0, MAX_SAVED_BLE_PEERS);
              pendingBlePeerIdsRef.current.delete(connection.id);
              void persistSavedBlePeers(nextPeers).catch((error) => {
                setBleError(error instanceof Error ? error.message : 'Could not save this Bluetooth connection.');
              });
              if (connection.connected && pending) setPeerPickerOpen(false);
            }),
            addNearbyBluetoothListener('onMessageReceived', (message: BleReceivedMessage) => {
              const peer = savedBlePeersRef.current.find((savedPeer) => savedPeer.id === message.id);
              Alert.alert(`Help message${peer ? ` from ${peer.name}` : ''}`, message.text);
            }),
          ];
          await nearbyBluetooth.start(user?.display_name ?? name);
          if (!active) {
            await nearbyBluetooth.stop();
            return;
          }
          for (const peer of savedBlePeersRef.current) {
            try {
              await nearbyBluetooth.connect(peer.id);
            } catch (error) {
              setBleError(error instanceof Error ? error.message : `Could not reconnect to ${peer.name}.`);
            }
          }
        } catch (error) {
          if (active) {
            setBleStatus('error');
            setBleError(error instanceof Error ? error.message : 'Bluetooth communication could not be started.');
          }
        }
      };

      void startCommunication();
      return () => {
        active = false;
        subscriptions.forEach((subscription) => subscription.remove());
        if (Platform.OS === 'android') {
          void nearbyBluetooth.stop().catch(() => {
            setBleError('Bluetooth could not be stopped cleanly.');
          });
        }
        pendingBlePeerIdsRef.current.clear();
        nearbyBlePeersRef.current = [];
        setNearbyBlePeers([]);
        setBleScanning(false);
        const disconnectedPeers = savedBlePeersRef.current.map((peer) => ({ ...peer, connected: false }));
        savedBlePeersRef.current = disconnectedPeers;
        setSavedBlePeers(disconnectedPeers);
      };
    }, [screen, savedBlePeersLoaded]);
    if (connectedPeers.length === 0) {
      Alert.alert('No connected devices', 'Connect to nearby SafePath devices before broadcasting a message.');
      return;
    }
    setBroadcastSending(true);
    const results = await Promise.allSettled(
      connectedPeers.map((peer) => Promise.resolve().then(() => nearbyBluetooth.sendMessage(peer.id, message))),
    );
    setBroadcastSending(false);
    const sentCount = results.filter((result) => result.status === 'fulfilled').length;
    const failedCount = results.length - sentCount;
    setBroadcastModalOpen(false);
    setBroadcastDraft('');
    if (failedCount === 0) {
      Alert.alert('Message delivered', `Your message was delivered to ${sentCount} connected SafePath device${sentCount === 1 ? '' : 's'}.`);
    } else {
      Alert.alert('Some messages were not delivered', `Delivered to ${sentCount}; failed for ${failedCount}.`);
    }
  }

  function clearTripResult() {
    setTripPlan(null);
    setTripRouteIndex(0);
    setTripError('');
  }

  function openVehicleEditor() {
    setVehicleNumberDraft(vehicleNumber);
    setVehicleEditorOpen(true);
  }

  async function saveVehicleNumber() {
    const number = vehicleNumberDraft.trim();
    if (!number) {
      Alert.alert('Vehicle number required', 'Enter a vehicle registration number to save.');
      return;
    }
    if (number.length > 20) {
      Alert.alert('Vehicle number too long', 'Vehicle registration numbers must be 20 characters or fewer.');
      return;
    }
    try {
      await AsyncStorage.setItem('safepath-vehicle-number', number);
      setVehicleNumber(number);
      setVehicleEditorOpen(false);
    } catch (error) {
      Alert.alert('Could not save vehicle number', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  function openContactEditor() {
    setContactNameDraft('');
    setContactPhoneDraft('');
    setContactEditorOpen(true);
  }

  async function saveEmergencyContact() {
    const contactName = contactNameDraft.trim();
    const contactPhone = contactPhoneDraft.trim();
    const phoneDigits = contactPhone.replace(/\D/g, '');
    if (!contactName) {
      Alert.alert('Name required', 'Enter the contact’s name.');
      return;
    }
    if (phoneDigits.length !== 10) {
      Alert.alert('Valid phone number required', 'Enter exactly 10 digits.');
      return;
    }
    if (contactName !== sanitizeContactName(contactName)) {
      Alert.alert('Invalid contact name', 'Use only alphabets, spaces, or emoji.');
      return;
    }

    const updatedContacts = [
      ...emergencyContacts,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: contactName, phone: phoneDigits },
    ];
    try {
      await AsyncStorage.setItem('safepath-emergency-contacts', JSON.stringify(updatedContacts));
      setEmergencyContacts(updatedContacts);
      setContactEditorOpen(false);
    } catch (error) {
      Alert.alert('Could not save contact', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function removeEmergencyContact(contactId: string) {
    const updatedContacts = emergencyContacts.filter((contact) => contact.id !== contactId);
    try {
      await AsyncStorage.setItem('safepath-emergency-contacts', JSON.stringify(updatedContacts));
      setEmergencyContacts(updatedContacts);
    } catch (error) {
      Alert.alert('Could not remove contact', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function generateTrip() {
    clearTripResult();
    if (!tripOrigin) {
      setTripError('Search for and select a starting point.');
      return;
    }
    if (!tripDestination) {
      setTripError('Search for and select a destination.');
      return;
    }
    if (!vehicle) {
      setTripError('Select a vehicle type before generating a route.');
      return;
    }
    const orderedStops: TripPlace[] = [];
    for (const stop of tripStops) {
      if (!stop.place) {
        setTripError('Search for and select a location for every stop, or remove the empty stop.');
        return;
      }
      orderedStops.push(stop.place);
    }
    const locations = [tripOrigin, ...orderedStops, tripDestination];
    if (new Set(locations.map((place) => `${place.lat},${place.lng}`)).size !== locations.length) {
      setTripError('Choose a different location for each point in the trip.');
      return;
    }

    setTripLoading(true);
    try {
      const result = await api<TripPlan>('/routes/plan', {
        method: 'POST',
        body: {
          origin: tripOrigin,
          destination: tripDestination,
          stops: orderedStops,
          vehicle_type: vehicle,
          preference: routePref,
        },
      });
      if (result.routes.length === 0) throw new Error('The routing service returned no route options.');
      setTripPlan(result);
      setTripRouteIndex(0);
    } catch (error) {
      setTripError(error instanceof Error ? error.message : 'Could not generate this trip.');
    } finally {
      setTripLoading(false);
    }
  }

  /* splash → login */
  useEffect(() => {
    if (screen !== 'splash') return;
    const t = setTimeout(() => setStack(['login']), 1500);
    return () => clearTimeout(t);
  }, [screen]);

  useEffect(() => {
    const openResetLink = (url: string | null | undefined) => {
      if (!url || !url.startsWith('safepath://reset-password')) return;
      const token = url.match(/[?&]token=([^&]+)/)?.[1];
      if (!token) return;
      setResetToken(decodeURIComponent(token));
      setStack(['reset-password']);
    };
    void Linking.getInitialURL().then(openResetLink);
    const subscription = Linking.addEventListener('url', ({ url }) => openResetLink(url));
    return () => subscription.remove();
  }, []);

  /* API actions */
  async function login() {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password to continue.');
      return;
    }
    setLoading(true);
    try {
      const u = await api<User>('/users/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      setUser(u);
      setStack(['home']);
    } catch (e) {
      Alert.alert('Unable to connect', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter the email address linked to your account.');
      return;
    }
    setLoading(true);
    try {
      await api<{ message: string }>('/users/request-password-reset', {
        method: 'POST',
        body: { email: email.trim() },
      });
      Alert.alert('Check your email', 'If an account exists for that address, we sent a password reset link.');
    } catch (error) {
      Alert.alert('Unable to send reset link', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function completePasswordReset() {
    if (!resetToken) {
      Alert.alert('Invalid link', 'This password reset link is missing its token.');
      return;
    }
    if (!resetPassword || resetPassword !== resetPasswordConfirmation) {
      Alert.alert('Passwords do not match', 'Enter the same new password in both fields.');
      return;
    }
    setLoading(true);
    try {
      const result = await api<{ message: string }>('/users/reset-password', {
        method: 'POST',
        body: {
          token: resetToken,
          password: resetPassword,
          password_confirmation: resetPasswordConfirmation,
        },
      });
      Alert.alert('Password updated', result.message, [{
        text: 'Sign in',
        onPress: () => {
          setResetPassword('');
          setResetPasswordConfirmation('');
          setResetToken('');
          setStack(['login']);
        },
      }]);
    } catch (error) {
      Alert.alert('Unable to reset password', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function shareCurrentRoute() {
    try {
      let locationToShare = sharedLocation;
      if (!locationToShare) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Location permission required', 'Allow location access to share your current location.');
          return;
        }

        const position = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          15000,
          'Could not determine your current location.',
        );
        locationToShare = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: 'Current location',
        };
        setSharedLocation(locationToShare);
      }

      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${locationToShare.lat},${locationToShare.lng}`;
      await Share.share({
        title: locationToShare.name,
        message: mapUrl,
        url: mapUrl,
      });
    } catch (error) {
      Alert.alert('Could not share location', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function saveSearchedPlace() {
    if (!sharedLocation) {
      Alert.alert('Place unavailable', 'Search for a place first, then tap Save Place.');
      return;
    }

    if (savedPlaces.some((place) => place.lat === sharedLocation.lat && place.lng === sharedLocation.lng)) {
      Alert.alert('Already saved', `${sharedLocation.name} is already in your saved places.`);
      return;
    }

    const updatedPlaces = [...savedPlaces, sharedLocation];
    try {
      await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(updatedPlaces));
      setSavedPlaces(updatedPlaces);
      Alert.alert('Place saved', `${sharedLocation.name} was added to your saved places.`);
    } catch (error) {
      Alert.alert('Could not save place', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  function selectNavigationVehicle() {
    setNavigationVehiclePickerOpen(true);
  }

  function openSavedPlace(place: SavedPlace) {
    setSharedLocation(place);
    setSavedPlacesPickerOpen(false);
    go('navigate');
  }

  async function signUp() {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing details', 'Enter your name and email to create an account.');
      return;
    }
    if (phone && phone.length !== 10) {
      Alert.alert('Invalid phone number', 'Enter exactly 10 digits. The +91 country code will be added automatically.');
      return;
    }
    const commonPasswords = new Set(['123!', '12345678', 'password', 'password1!', 'password123!', '12345678aa!', '123456789aa!', 'qwerty123!', 'letmein1!', 'admin123!', 'welcome1!', 'iloveyou1!', 'abc12345!', 'changeme1!', 'passw0rd!', 'monkey123!', 'dragon123!', 'sunshine1!', 'football1!', 'safepath1!']);
    const hasAllowedSpecialCharacter = /[@#$%!*]/.test(password);
    if (password.length < 8 || password.length > 64 || /\s/.test(password)
      || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)
      || !hasAllowedSpecialCharacter || commonPasswords.has(password.toLowerCase())) {
      Alert.alert('Password does not meet requirements', 'Choose a password that satisfies every listed rule.');
      return;
    }
    if (password !== passwordConfirmation) {
      Alert.alert('Passwords do not match', 'Enter the same password in both password fields.');
      return;
    }
    setLoading(true);
    try {
      const createdUser = await api<User>('/users', {
        method: 'POST',
        body: {
          email: email.trim(),
          display_name: name.trim(),
          phone_number: phone ? `${countryCode}${phone}` : null,
          auth_provider: 'mobile',
          password,
          password_confirmation: passwordConfirmation,
        },
      });
      setUser(createdUser);
      setStack(['home']);
    } catch (error) {
      Alert.alert('Could not create account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadCommunityReports() {
    setCommunityLoading(true);
    setCommunityError('');
    try {
      const reports = await api<CommunityReport[]>('/reports?validated_only=false&limit=100');
      setCommunityReports(reports);
    } catch (error) {
      setCommunityError(error instanceof Error ? error.message : 'Could not load community reports.');
    } finally {
      setCommunityLoading(false);
    }

  }

  async function deleteSelectedCommunityReports() {
    if (!user?.id || selectedReportIds.length === 0) return;
    const selectedReports = communityReports.filter((report) =>
      selectedReportIds.includes(report.id) && report.user_id === user.id
    );
    if (selectedReports.length === 0) {
      Alert.alert('No reports selected', 'Select one of your reports to delete.');
      return;
    }
    Alert.alert(
      'Delete selected reports?',
      `This will permanently delete ${selectedReports.length} report${selectedReports.length === 1 ? '' : 's'} and any attached images.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await Promise.all(selectedReports.map((report) =>
                  api(`/reports/${report.id}?user_id=${encodeURIComponent(user.id)}`, { method: 'DELETE' })
                ));
                setSelectedReportIds([]);
                setReportSelectionMode(false);
                await loadCommunityReports();
              } catch (error) {
                Alert.alert('Delete failed', error instanceof Error ? error.message : 'Some reports could not be deleted.');
              }
            })();
          },
        },
      ],
    );
  }

  async function captureReportPhoto(source: 'camera' | 'gallery') {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to capture a hazard photograph.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75, allowsEditing: true });
      if (!result.canceled) setReportPhotoUri(result.assets[0].uri);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Gallery permission required', 'Allow photo access to choose a hazard photograph.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, allowsEditing: true });
    if (!result.canceled) setReportPhotoUri(result.assets[0].uri);
  }

  async function chooseProfilePhoto(source: 'camera' | 'gallery') {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission required', 'Allow camera access to take a profile photo.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Gallery permission required', 'Allow photo access to choose a profile photo.');
          return;
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });

      if (result.canceled) return;
      const uri = result.assets[0]?.uri;
      if (!uri) {
        Alert.alert('Profile photo unavailable', 'The selected image could not be read.');
        return;
      }
      await AsyncStorage.setItem(PROFILE_PHOTO_KEY, uri);
      setProfilePhotoUri(uri);
    } catch (error) {
      Alert.alert('Profile photo failed', error instanceof Error ? error.message : 'Could not save your profile photo.');
    }
  }

  function removeProfilePhoto() {
    Alert.alert('Remove profile photo?', 'Your initials will be shown instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void AsyncStorage.removeItem(PROFILE_PHOTO_KEY)
            .then(() => setProfilePhotoUri(null))
            .catch((error) => {
              Alert.alert('Profile photo failed', error instanceof Error ? error.message : 'Could not remove your profile photo.');
            });
        },
      },
    ]);
  }

  function openProfilePhotoActions() {
    Alert.alert('Profile photo', profilePhotoUri ? 'Choose an action.' : 'Add a profile photo.', [
      { text: 'Take photo', onPress: () => { void chooseProfilePhoto('camera'); } },
      { text: 'Choose from gallery', onPress: () => { void chooseProfilePhoto('gallery'); } },
      ...(profilePhotoUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: removeProfilePhoto }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function openReportForm() {
    setReportPhotoUri(null);
    setReportDescription('');
    setReportType('pothole');
    setReportLocation(null);
    setReportFormOpen(true);
    const locationPermission = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      15000,
      'Location permission request timed out.',
    );
    if (locationPermission.status !== 'granted') {
      Alert.alert('Location permission required', 'The report can be submitted without GPS, but location accuracy will be reduced.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    setReportLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
  }

  async function submitCommunityReport() {
    setReportSubmitting(true);
    try {
      const permission = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        15000,
        'Location permission request timed out.',
      );
      if (permission.status !== 'granted') {
        throw new Error('Allow location access before submitting the report.');
      }
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }),
        15000,
        'Could not determine your current location.',
      );
      const currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      setReportLocation(currentLocation);

      let mediaUrl: string | null = null;
      if (reportPhotoUri) {
        const formData = new FormData();
        const photoFile = new File(reportPhotoUri);
        formData.append('file', photoFile);
        const upload = await fetch(`${API_URL}/reports/upload`, { method: 'POST', body: formData });
        if (!upload.ok) throw new Error(await upload.text() || 'Photo upload failed.');
        mediaUrl = (await upload.json()).media_url;
      }

      await api('/reports', {
        method: 'POST',
        body: {
          user_id: user?.id ?? null,
          incident_type: reportType,
          severity: reportType === 'accident' ? 'high' : reportType === 'traffic_jam' ? 'medium' : 'medium',
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          description: reportDescription.trim() || null,
          media_url: mediaUrl,
        },
      });
      setReportFormOpen(false);
      Alert.alert('Report submitted', 'Your community report has been submitted for validation.');
      await loadCommunityReports();
    } catch (error) {
      Alert.alert('Submission failed', error instanceof Error ? error.message : 'Could not submit the report.');
    } finally {
      setReportSubmitting(false);
    }
  }

  async function saveRoute() {
    if (!user) {
      Alert.alert('Sign in required', 'Please log in to save routes.');
      return;
    }
    if (!selectedTripRoute || !tripOrigin || !tripDestination) {
      Alert.alert('Route unavailable', 'Generate a route before saving it.');
      return;
    }
    setLoading(true);
    try {
      const savedRoute = await api<SavedRoute>('/routes', {
        method: 'POST',
        body: {
          user_id: user.id,
          origin_name: tripOrigin.name,
          destination_name: tripDestination.name,
          distance_km: selectedTripRoute.distance_m / 1000,
          duration_minutes: selectedTripRoute.duration_s / 60,
          safety_score: selectedTripRoute.safety_score === null ? 0 : selectedTripRoute.safety_score / 20,
          route_type: routePref,
          provider: 'osrm',
          is_saved: true,
        },
      });
      setSavedRoutes((routes) => [savedRoute, ...routes]);
      Alert.alert('Route saved', `${tripDestination.name} has been added to your trips.`);
    } catch (e) {
      Alert.alert('Could not save route', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function triggerSos(trigger: 'manual' | 'accident' = 'manual') {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in before activating SOS.');
      return;
    }
    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Location permission is required to activate SOS and share your location.');
      }
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }),
        15000,
        'Could not determine your current location.',
      );
      const currentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setSosLocation(currentLocation);
      await withTimeout(
        api('/sos', {
          method: 'POST',
          body: {
            user_id: user.id,
            latitude: currentLocation.lat,
            longitude: currentLocation.lng,
            trigger,
            message: trigger === 'accident' ? 'Possible accident detected.' : 'Emergency SOS activated from SafePath AI.',
          },
        }),
        15000,
        'The emergency server did not respond. Please try again.',
      );
      const mapLink = `https://www.google.com/maps/search/?api=1&query=${currentLocation.lat},${currentLocation.lng}`;
      const recipients = emergencyContacts
        .map((contact) => {
          const digits = contact.phone.replace(/\D/g, '');
          return digits.length === 10 ? `+91${digits}` : contact.phone;
        })
        .filter(Boolean);
      if (!recipients.length) {
        Alert.alert('SOS activated', `Your emergency alert was sent, but no emergency contacts are saved.\n\n${mapLink}`);
        return;
      }
      const message = [
        'Emergency SOS from SafePath AI.',
        'Please contact me or emergency services immediately.',
        `Location: ${mapLink}`,
      ].join('\n');
      if (Platform.OS === 'android') {
        let nativeSmsAvailable = false;
        try {
          const smsPermission = await withTimeout(
            PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
              title: 'Send emergency SMS',
              message: 'SafePath AI needs permission to send the SOS location directly to your emergency contacts.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            }),
            5000,
            'SMS permission request timed out.',
          );
          nativeSmsAvailable = smsPermission === PermissionsAndroid.RESULTS.GRANTED;
        } catch {
          nativeSmsAvailable = false;
        }
        if (nativeSmsAvailable) {
          try {
            await Promise.all(recipients.map((recipient) => withTimeout(
              SafePathSms.sendSms(recipient, message),
              10000,
              'Native SMS sending timed out.',
            )));
            Alert.alert('SOS activated', `Emergency SMS sent to ${recipients.length} contact${recipients.length === 1 ? '' : 's'}.\n\n${mapLink}`);
            return;
          } catch (error) {
            if (!(error instanceof Error)
              || (!error.message.includes('Cannot find native module') && !error.message.includes('timed out'))) {
              throw error;
            }
          }
        }
      }
      const smsUrl = `sms:${recipients.join(',')}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
      if (!(await Linking.canOpenURL(smsUrl))) {
        throw new Error('No SMS application is available to notify your emergency contacts.');
      }
      await Linking.openURL(smsUrl);
      Alert.alert('SOS activated', `Emergency SMS prepared for ${recipients.length} contact${recipients.length === 1 ? '' : 's'}.\n\n${mapLink}`);
    } catch (e) {
      Alert.alert('SOS could not be sent', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  /* community reports */
  useEffect(() => {
    if (screen === 'community') loadCommunityReports();
  }, [screen]);

  /* accident countdown */
  useEffect(() => {
    if (screen !== 'accident') return;
    setCountdown(10);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [screen]);

  useEffect(() => {
    if (screen === 'accident' && countdown === 0) {
      triggerSos('accident');
      setStack(['home']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, screen]);

  const displayName = user?.display_name?.trim() || user?.email.split('@')[0] || 'Profile';
  const initials = useMemo(() => displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(), [displayName]);

  /* ───────────── Screens ───────────── */
  function renderSplash() {
    return (
      <View style={[s.center, { flex: 1, paddingTop: 110 }]}>
        <Text style={s.shield}>🛡️</Text>
        <Text style={s.brand}>SafePath AI</Text>
        <Text style={s.tagline}>Smart Emergency &{'\n'}Intelligent Navigation</Text>
        <Text style={[s.muted, { marginTop: 10, fontSize: 13 }]}>Your Safety, Our Priority</Text>
        <ActivityIndicator color={C.blueLight} style={{ marginTop: 40 }} />
      </View>
    );
  }

  function renderLogin() {
    const commonPasswords = new Set(['123!', '12345678', 'password', 'password1!', 'password123!', '12345678aa!', '123456789aa!', 'qwerty123!', 'letmein1!', 'admin123!', 'welcome1!', 'iloveyou1!', 'abc12345!', 'changeme1!', 'passw0rd!', 'monkey123!', 'dragon123!', 'sunshine1!', 'football1!', 'safepath1!']);
    const passwordRules = [
      ['At least 8 characters', password.length >= 8],
      ['No more than 64 characters', password.length <= 64],
      ['At least one uppercase letter (A–Z)', /[A-Z]/.test(password)],
      ['At least one lowercase letter (a–z)', /[a-z]/.test(password)],
      ['At least one number (0–9)', /[0-9]/.test(password)],
      ['At least one of @ # $ % ! *', /[@#$%!*]/.test(password)],
      ['No spaces', !/\s/.test(password)],
      ['Not a common password', !commonPasswords.has(password.toLowerCase())],
      ['Confirmation matches', passwordConfirmation.length > 0 && password === passwordConfirmation],
    ] as const;
    return (
      <View>
        <View style={[s.center, { paddingTop: 30, paddingBottom: 14 }]}>
          <Text style={[s.shield, { fontSize: 54 }]}>🛡️</Text>
          <Text style={s.h1}>{signUpMode ? 'Create Account' : 'Welcome Back!'}</Text>
          <Text style={s.white12}>{signUpMode ? 'Enter your details to get started' : 'Login to continue'}</Text>
        </View>
        {signUpMode ? (
          <>
            <Field label="Full Name" value={name} onChangeText={setName} placeholder="Your name" icon="☺" />
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" icon="✉" keyboardType="email-address" />
            <CountryPhoneField label="Phone (optional)" countryCode={countryCode} onCountryCodeChange={setCountryCode} value={phone} onChangeText={setPhone} />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="Set a password" icon="🔒" secure maxLength={64} />
            <Field label="Confirm password" value={passwordConfirmation} onChangeText={setPasswordConfirmation} placeholder="Enter password again" icon="🔒" secure maxLength={64} />
            <View style={{ marginTop: 10 }}>
              {passwordRules.map(([rule, passed]) => (
                <Text key={rule} style={[s.muted, { color: passed ? C.green : C.muted, fontSize: 12, marginTop: 3 }]}>
                  {passed ? '✓' : '·'} {rule}
                </Text>
              ))}
            </View>
          </>
        ) : (
          <>
            <Field value={email} onChangeText={setEmail} placeholder="Email" icon="✉" keyboardType="email-address" />
            <Field value={password} onChangeText={setPassword} placeholder="Password" icon="🔒" secure />
            <Text style={s.link} onPress={requestPasswordReset}>Forgot Password?</Text>
          </>
        )}
        <Btn
          title={loading ? (signUpMode ? 'Creating…' : 'Connecting…') : signUpMode ? 'Create Account' : 'Login'}
          onPress={signUpMode ? signUp : login}
          disabled={loading}
        />
        {!signUpMode ? (
          <>
            <Text style={[s.muted, { textAlign: 'center', marginVertical: 18 }]}>or continue with</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Btn title="G  Google" outline onPress={() => Alert.alert('Google sign-in', 'Connect your Google OAuth provider here.')} /></View>
              <View style={{ flex: 1 }}><Btn title="📞  Phone" outline onPress={() => Alert.alert('Phone sign-in', 'Connect your OTP provider here.')} /></View>
            </View>
            <Btn title="Continue as Guest" outline onPress={() => setStack(['home'])} />
          </>
        ) : null}
        <Text style={[s.white12, { textAlign: 'center', marginTop: 40 }]}>
            {signUpMode ? 'Already have an account? ' : "Don't have an account? "}
            <Text
              style={{ color: C.blueLight }}
              onPress={() => {
                const enteringSignUp = !signUpMode;
                setPassword('');
                setPasswordConfirmation('');
                if (enteringSignUp) {
                  setName('');
                  setPhone('');
                }

                setSignUpMode(enteringSignUp);
              }}
            >
              {signUpMode ? 'Log in' : 'Sign up'}
            </Text>
        </Text>
      </View>
    );
  }

  function renderResetPassword() {
    return (
      <View>
        <View style={[s.center, { paddingTop: 30, paddingBottom: 14 }]}>
          <Text style={[s.shield, { fontSize: 54 }]}>🛡️</Text>
          <Text style={s.h1}>Reset Password</Text>
          <Text style={s.white12}>Choose a new password for your account</Text>
        </View>
        <Field label="New password" value={resetPassword} onChangeText={setResetPassword} placeholder="New password" icon="🔒" secure maxLength={64} />
        <Field label="Confirm password" value={resetPasswordConfirmation} onChangeText={setResetPasswordConfirmation} placeholder="Enter password again" icon="🔒" secure maxLength={64} />
        <Btn title={loading ? 'Updating…' : 'Update Password'} onPress={completePasswordReset} disabled={loading} />
        <Btn title="Back to Login" outline onPress={() => setStack(['login'])} />
      </View>
    );
  }

  function renderHome() {
    return (
      <View style={{ paddingTop: 18 }}>
        <View style={s.rowBetween}>
          <View style={s.greetingBlock}>
            <Pressable
              style={s.homeAvatar}
              onPress={() => tab('profile')}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={s.homeAvatarImage} resizeMode="cover" />
              ) : (
                <Text style={s.homeAvatarText}>{initials}</Text>
              )}
            </Pressable>
            <View>
            <Text style={s.greeting}>Hello, {displayName.split(' ')[0]} 😊</Text>
            <Text style={s.muted}>Drive Safe, Stay Safe</Text>
            </View>
          </View>
          <Text style={{ fontSize: 20 }} onPress={() => tab('community')}>🔔</Text>
        </View>
        <Pressable style={s.search} onPress={() => go('navigate')}>
          <Text style={s.muted}>⌕  Where do you want to go?</Text>
        </Pressable>

        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>Trip Planner</Text>
            <Text style={s.heroSub}>Build a route from your selected places</Text>
            <Pressable style={s.heroBtn} onPress={() => go('trip')}><Text style={s.heroBtnText}>Plan Trip</Text></Pressable>
          </View>
          <Text style={{ fontSize: 56 }}>🚘</Text>
        </View>

        <View style={s.tileRow}>
          {[['🧭', 'Navigation', 'navigate'], ['🗒️', 'Trip Planner', 'trip'], ['⚙️', 'Nearby services', 'nearby']].map(([i, l, t]) => (
            <Pressable key={l} style={s.tile} onPress={() => go(t as Screen)}>
              <Text style={{ fontSize: 26 }}>{i}</Text>
              <Text style={s.tileLabel}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={s.comms} onPress={() => go('comm')}>
          <Text style={{ fontSize: 28 }}>📶</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.rowTitle}>Communication</Text>
            <Text style={s.muted}>Connected</Text>
            <Text style={s.muted}>6 Peers Nearby</Text>
          </View>
          <Text style={{ fontSize: 24 }}>🛜</Text>
        </Pressable>

        <Section>Recent Trips</Section>
        <Text style={s.muted}>No saved trips yet. Generated routes you save will appear here.</Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Btn title="Offline Maps" outline small onPress={() => go('offline')} /></View>
          <View style={{ flex: 1 }}><Btn title="Simulate Accident" outline small onPress={() => go('accident')} /></View>
        </View>
      </View>
    );
  }

  function renderNavigate(variant: 1 | 2) {
    const navigationVehicleIcon: Record<TripVehicle, string> = {
      bike: '🏍️',
      car: '🚗',
      ev: '🔌',
      bus: '🚌',
    };
    const distanceText = routeSummary
      ? routeSummary.distanceM >= 1000
        ? `${(routeSummary.distanceM / 1000).toFixed(1)} km`
        : `${Math.round(routeSummary.distanceM)} m`
      : 'Searching route';
    const durationMinutes = routeSummary ? Math.max(1, Math.round(routeSummary.durationS / 60)) : null;
    const durationText = durationMinutes === null
      ? 'Calculating'
      : durationMinutes >= 60
        ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
        : `${durationMinutes}m`;
    const arrivalText = routeSummary
      ? new Date(Date.now() + routeSummary.durationS * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Calculating';

    return (
      <View style={{ flex: 1, paddingTop: 38 }}>
        <MapMock
          variant={variant}
          hazards={variant === 2}
          initialCenter={sharedLocation ? { lat: sharedLocation.lat, lng: sharedLocation.lng } : undefined}
          destination={sharedLocation ? { lat: sharedLocation.lat, lng: sharedLocation.lng } : null}
          nearbyPlaces={nearbyPlaces}
          onDestinationChange={(point, name) => setSharedLocation({
            ...point,
            name: name ?? 'Selected location',
          })}
          onRouteSummary={setRouteSummary}
        />

        <View style={s.etaBar}>
          <View>
            <Text style={s.etaBig}>{durationText}</Text>
            <Text style={s.muted}>{distanceText}</Text>
          </View>
          <View>
            <Text style={s.etaBig}>{arrivalText}</Text>
            <Text style={s.muted}>Arrival</Text>
          </View>
          <Pressable style={s.exit} onPress={back}><Text style={s.btnText}>Exit</Text></Pressable>
        </View>

        <View style={s.actionRow}>
          {[
            ['🧭', 'Route Info', () => go('route')],
            [navigationVehicleIcon[navigationVehicle], 'Vehicle', selectNavigationVehicle],
            ['⤴', 'Share', () => { void shareCurrentRoute(); }],
            ['🔖', 'Save Place', saveSearchedPlace],
          ].map(([i, l, fn]) => (
            <Pressable key={l as string} style={s.actionBtn} onPress={fn as () => void}>
              <Text style={{ fontSize: 20 }}>{i as string}</Text>
              <Text style={s.mini}>{l as string}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  function renderTrip() {
    return (
      <>
        <Section>Starting Point — Place A</Section>
        <TripPlaceField
          label="Starting point"
          value={tripOrigin}
          onChange={(place) => { setTripOrigin(place); clearTripResult(); }}
        />
        <Section>Intermediate Stops</Section>
        {tripStops.map((stop, index) => (
          <View key={stop.id} style={s.tripStop}>
            <View style={{ flex: 1 }}>
              <TripPlaceField
                label={`Stop ${index + 1}`}
                value={stop.place}
                onChange={(place) => {
                  setTripStops((current) => current.map((item) => item.id === stop.id ? { ...item, place } : item));
                  clearTripResult();
                }}
              />
            </View>
            <View style={s.tripStopActions}>
              <Pressable
                disabled={index === 0}
                onPress={() => {
                  setTripStops((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  });
                  clearTripResult();
                }}
              ><Text style={[s.tripAction, index === 0 && s.disabledText]}>↑</Text></Pressable>
              <Pressable
                disabled={index === tripStops.length - 1}
                onPress={() => {
                  setTripStops((current) => {
                    const next = [...current];
                    [next[index + 1], next[index]] = [next[index], next[index + 1]];
                    return next;
                  });
                  clearTripResult();
                }}
              ><Text style={[s.tripAction, index === tripStops.length - 1 && s.disabledText]}>↓</Text></Pressable>
              <Pressable
                onPress={() => {
                  setTripStops((current) => current.filter((item) => item.id !== stop.id));
                  clearTripResult();
                }}
              ><Text style={[s.tripAction, { color: C.red }]}>×</Text></Pressable>
            </View>
          </View>
        ))}
        <Pressable
          style={s.addBtn}
          onPress={() => {
            setTripStops((current) => [...current, { id: nextTripStopId++, place: null }]);
            clearTripResult();
          }}
        >
          <Text style={{ color: C.blueLight }}>＋  Add Stop</Text>
        </Pressable>
        <Section>Destination — Place B</Section>
        <TripPlaceField
          label="Destination"
          value={tripDestination}
          onChange={(place) => { setTripDestination(place); clearTripResult(); }}
        />

        <Section>Vehicle Type</Section>
        <View style={s.vehicleGrid}>
          {([
            ['🏍️', 'Bike', 'bike'],
            ['🚗', 'Car', 'car'],
            ['🔌', 'EV', 'ev'],
            ['🚌', 'Bus', 'bus'],
          ] as const).map(([icon, label, value]) => (
            <Pressable
              key={value}
              onPress={() => { setVehicle(value); clearTripResult(); }}
              style={[s.tripChoice, vehicle === value && s.tripChoiceActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: vehicle === value }}
            >
              <Text style={{ fontSize: 22 }}>{icon}</Text>
              <Text style={s.white12}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Section>Route Preference</Section>
        <View style={s.preferenceGrid}>
          {([
            ['best', 'Best', 'Balances distance, provider duration, and available hazard data.'],
            ['safest', 'Safest', 'Ranks using active reported hazard exposure when data exists.'],
            ['fuel_saver', 'Fuel Saver', 'Ranks shorter distance first; cost data is not configured.'],
            ['less_traffic', 'Less Traffic', 'Ranks provider duration; live traffic is unavailable.'],
          ] as const).map(([value, label, description]) => (
            <Pressable
              key={value}
              onPress={() => { setRoutePref(value); clearTripResult(); }}
              style={[s.preferenceChoice, routePref === value && s.tripChoiceActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: routePref === value }}
            >
              <Text style={[s.rowTitle, { color: routePref === value ? C.blueLight : C.white }]}>{label}</Text>
              <Text style={s.mini}>{description}</Text>
            </Pressable>
          ))}
        </View>

        {tripError ? <Text style={s.tripError}>{tripError}</Text> : null}
        {tripLoading ? <ActivityIndicator color={C.blueLight} style={{ marginTop: 16 }} /> : null}
        <Btn title={tripLoading ? 'Generating Route…' : 'Generate Route'} disabled={tripLoading} onPress={generateTrip} />

        {tripPlan && selectedTripRoute && tripOrigin && tripDestination ? (
          <>
            <Section>Selected Route — {tripRouteIndex === 0 ? 'Recommended' : `Alternative ${tripRouteIndex}`} · {tripPlan.provider}</Section>
            <View style={s.tripMap}>
              <LiveMap
                apiUrl={API_URL}
                style={{ height: 320 }}
                showSearch={false}
                showRoutePanel={false}
                initialCenter={{ lat: tripOrigin.lat, lng: tripOrigin.lng }}
                destination={{ lat: tripDestination.lat, lng: tripDestination.lng }}
                plannedRoutes={tripMapRoutes}
                plannedWaypoints={tripMapWaypoints}
                selectedRouteIndex={tripRouteIndex}
              />
            </View>
            <View style={[s.group, { padding: 14 }]}>
              <Text style={s.rowTitle}>Trip Summary</Text>
              <Text style={s.muted}>Total distance: {formatTripDistance(selectedTripRoute.distance_m)}</Text>
              <Text style={s.muted}>Estimated time: {formatTripDuration(selectedTripRoute.duration_s)}</Text>
              <Text style={s.muted}>
                {vehicle === 'ev' ? 'Estimated energy / charging cost: ' : 'Estimated fuel / cost: '}
                {selectedTripRoute.estimated_cost === null
                  ? vehicle === 'ev' && selectedTripRoute.energy_kwh !== null
                    ? `${selectedTripRoute.energy_kwh.toFixed(1)} kWh; charging cost unavailable`
                    : selectedTripRoute.fuel_litres !== null
                      ? `${selectedTripRoute.fuel_litres.toFixed(1)} L; cost unavailable`
                      : 'Unavailable'
                  : `₹${selectedTripRoute.estimated_cost.toFixed(2)} (estimate)`}
              </Text>
              <Text style={s.muted}>
                Hazard score: {selectedTripRoute.safety_score === null ? 'Unavailable — no active hazard data' : `${selectedTripRoute.safety_score}/100`}
              </Text>
              <Text style={[s.mini, { marginTop: 8 }]}>{tripPlan.ranking_note}</Text>
              <Text style={s.mini}>{tripPlan.estimation_note}</Text>
            </View>
            <Section>Route Alternatives</Section>
            {tripPlan.routes.map((route, index) => (
              <Pressable
                key={`${route.rank}-${index}`}
                onPress={() => setTripRouteIndex(index)}
                style={[s.routeOption, tripRouteIndex === index && s.tripChoiceActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: tripRouteIndex === index }}
              >
                <Text style={s.rowTitle}>{index === 0 ? 'Recommended' : `Alternative ${index}`}</Text>
                <Text style={s.muted}>{formatTripDistance(route.distance_m)} · {formatTripDuration(route.duration_s)}</Text>
              </Pressable>
            ))}
            <Btn title="Route Details" outline onPress={() => go('route')} />
          </>
        ) : null}
      </>
    );
  }

  function renderSos() {
    return (
      <>
        <Pressable onPress={() => triggerSos('manual')} style={s.sosOuter}>
          <View style={s.sosInner}>
            <Text style={s.sosText}>SOS</Text>
            <Text style={s.white12}>Tap to Activate</Text>
          </View>
        </Pressable>
        <Text style={[s.muted, { textAlign: 'center', marginVertical: 14 }]}>Share live location and{'\n'}alert your contacts</Text>

        <View style={s.group}>
          <View style={[s.rowBetween, { padding: 14 }]}>
            <Text style={s.rowTitle}>Battery Level</Text>
            <Text style={{ color: C.orange, fontWeight: '700' }}>
              {batteryLoading ? 'Checking…' : batteryLevel === null ? 'Unavailable' : `${batteryLevel}%`}
            </Text>
          </View>
          <Row
            icon="📍"
            title="Live Location Sharing"
            value={sosLocation ? `${sosLocation.lat.toFixed(5)}, ${sosLocation.lng.toFixed(5)}` : 'Ready after SOS'}
            valueColor={sosLocation ? C.green : C.orange}
          />
          {contactsLoading ? (
            <Row icon="👤" title="Emergency contacts" value="Loading…" last />
          ) : emergencyContacts.length ? (
            emergencyContacts.map((contact, index) => (
              <Row
                key={contact.id}
                icon="👤"
                title={contact.name}
                value={contact.phone}
                last={index === emergencyContacts.length - 1}
              />
            ))
          ) : (
            <Row icon="👤" title="No emergency contacts added" last />
          )}
        </View>
        <Pressable style={s.addBtn} onPress={openContactEditor}><Text style={{ color: C.blueLight }}>＋  Add Contact</Text></Pressable>

        <View style={s.tileRow}>
          {[['🏥', 'Emergency Contacts'], ['👮', 'Police station'], ['🚑', 'Ambulance']].map(([i, l]) => (
            <Pressable key={l} style={s.tile} onPress={() => Alert.alert(l, 'Calling nearest service…')}>
              <Text style={{ fontSize: 26 }}>{i}</Text>
              <Text style={s.tileLabel}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Btn title={loading ? 'Sending…' : 'Activate Emergency SOS'} danger pill onPress={() => triggerSos('manual')} disabled={loading} />
      </>
    );
  }

  function renderComm() {
    const signalStrength = (rssi: number) => rssi >= -60
      ? { label: 'Strong', color: C.green }
      : rssi >= -75
        ? { label: 'Medium', color: C.yellow }
        : { label: 'Weak', color: C.red };
    return (
      <>
        <View style={s.comms}>
          <Text style={{ fontSize: 28 }}>📶</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.rowTitle}>Bluetooth Help Network</Text>
            <Text style={s.muted}>{bleStatus === 'ready' ? 'Advertising and ready' : bleStatus === 'starting' ? 'Starting Bluetooth…' : 'Bluetooth unavailable'}</Text>
            <Text style={s.muted}>{savedBlePeers.filter((peer) => peer.connected).length} connected · {savedBlePeers.length}/{MAX_SAVED_BLE_PEERS} saved</Text>
          </View>
          <Text style={{ fontSize: 24 }}>ᛒ</Text>
        </View>
        <View style={[s.group, { padding: 14, marginTop: 12 }]}>
          <Text style={s.rowTitle}>My Status</Text>
          <View style={[s.rowBetween, { marginTop: 8 }]}>
            <Text style={{ color: bleStatus === 'ready' ? C.green : C.orange }}>
              ● {bleStatus === 'ready' ? 'Available to SafePath devices nearby' : bleStatus === 'starting' ? 'Connecting…' : 'Not available'}
            </Text>
            <Text style={s.white12}>
              Battery: {batteryLoading ? 'Checking…' : batteryLevel === null ? 'Unavailable' : `${batteryLevel}%`}
            </Text>
          </View>
        </View>
        <Section>Nearby SafePath Devices</Section>
        <Group>
          {savedBlePeers.length === 0 ? (
            <Row icon="📍" title="No devices connected yet" value="Add a nearby device to get started" last />
          ) : savedBlePeers.map((peer, index) => {
            const signal = signalStrength(peer.rssi);
            return (
              <View key={peer.id} style={[s.row, index === savedBlePeers.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.rowIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{peer.name}</Text>
                  <Text style={s.muted}>{peer.connected ? 'Connected by Bluetooth' : 'Not connected'}</Text>
                </View>
                <Text style={{ color: peer.connected ? signal.color : C.muted, fontSize: 12 }}>
                  {peer.connected ? signal.label : 'Offline'}
                </Text>
                <Pressable onPress={() => { void removeBluetoothPeer(peer.id); }} hitSlop={10} style={{ marginLeft: 12 }}>
                  <Text style={{ color: C.red, fontSize: 13 }}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </Group>
        <Pressable
          style={s.addBtn}
          disabled={savedBlePeers.length >= MAX_SAVED_BLE_PEERS || bleStatus !== 'ready'}
          onPress={() => {
            setPeerPickerOpen(true);
            void scanForBluetoothPeers();
          }}
        >
          <Text style={{ color: C.blueLight }}>
            ＋  {savedBlePeers.length >= MAX_SAVED_BLE_PEERS ? 'Maximum devices added' : 'Add Nearby Device'}
          </Text>
        </Pressable>
        {bleError ? <Text style={[s.muted, { color: C.red, marginTop: 8 }]}>{bleError}</Text> : null}
        <Text style={[s.muted, { marginTop: 10 }]}>
          Only SafePath AI devices with Bluetooth enabled can connect. Messages are sent only to connected devices; avoid sharing sensitive personal information.
        </Text>
        <Btn
          title="Broadcast Message"
          disabled={savedBlePeers.every((peer) => !peer.connected)}
          onPress={() => setBroadcastModalOpen(true)}
        />
      </>
    );
  }

  function renderNearby() {
    const cats = [
      ['🏥', 'Hospitals', 'hospital'],
      ['⛽', 'Fuel', 'fuel'],
      ['🏨', 'Hotels', 'hotel'],
      ['🍴', 'Restaurants', 'restaurant'],
      ['➕', 'Medical', 'medical'],
      ['👮', 'Police', 'police'],
      ['🏧', 'ATM', 'atm'],
    ] as const;
    const places = [
      { n: 'Green Leaf Restaurant', t: 'Veg', d: '0.6 km', r: 4.2 },
      { n: 'Spicy Hub Restaurant', t: 'Non-Veg', d: '0.8 km', r: 4.1 },
      { n: 'Food Corner', t: 'Veg', d: '1.6 km', r: 4.5 },
      { n: 'Biryani House', t: 'Non-Veg', d: '2.1 km', r: 4.3 },
    ].filter((p) => p.t === foodFilter && p.n.toLowerCase().includes(search.toLowerCase()));
    return (
      <>
        <Field value={search} onChangeText={setSearch} placeholder="Search services" icon="⌕" />
        <View style={s.catGrid}>
          {cats.map(([i, l, category]) => (
            <Pressable key={l} style={[s.cat, nearbyCategory === category && s.tripChoiceActive]} disabled={nearbyLoading} onPress={() => {
              setNearbyLoading(true);
              setNearbyCategory(category);
              setNearbyError('');
              Location.requestForegroundPermissionsAsync()
                .then(async (permission) => {
                  if (permission.status !== 'granted') throw new Error('Location permission is required to find nearby services.');
                  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  const response = await fetch(`${API_URL}/routes/nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}&category=${category}`);
                  if (!response.ok) throw new Error('Nearby services could not be loaded.');
                  const results: unknown = await response.json();
                  if (!Array.isArray(results)) throw new Error('Nearby services returned an invalid response.');
                  const places = results.filter((item): item is NearbyPlace => (
                    !!item && typeof item === 'object'
                    && typeof (item as NearbyPlace).name === 'string'
                    && typeof (item as NearbyPlace).lat === 'number'
                    && typeof (item as NearbyPlace).lng === 'number'
                    && typeof (item as NearbyPlace).distance_m === 'number'
                  ));
                  setNearbyPlaces(places);
                  go('navigate');
                })
                .catch((error) => {
                  const message = error instanceof Error ? error.message : 'Nearby services could not be loaded.';
                  setNearbyError(message);
                  Alert.alert('Nearby services unavailable', message);
                })
                .finally(() => setNearbyLoading(false));
            }}>
              <Text style={{ fontSize: 24 }}>{i}</Text>
              <Text style={s.mini}>{nearbyLoading && nearbyCategory === category ? 'Loading…' : l}</Text>
            </Pressable>
          ))}
        </View>
        {nearbyError ? <Text style={[s.tripError, { marginTop: 12 }]}>{nearbyError}</Text> : null}
        {nearbyCategory && nearbyPlaces.length === 0 && !nearbyLoading
          ? <Text style={[s.muted, { marginTop: 14 }]}>No {nearbyCategory} services found within 5 km.</Text>
          : null}
        <Section>Restaurants</Section>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn title="🌿 Veg Only" small outline={foodFilter !== 'Veg'} onPress={() => setFoodFilter('Veg')} /></View>
          <View style={{ flex: 1 }}><Btn title="🔺 Non-Veg Only" small outline={foodFilter !== 'Non-Veg'} danger={foodFilter === 'Non-Veg'} onPress={() => setFoodFilter('Non-Veg')} /></View>
        </View>
        {places.length === 0 ? <Text style={[s.muted, { marginTop: 14 }]}>No results found.</Text> : null}
        {places.map((p) => (
          <View key={p.n} style={s.place}>
            <Text style={{ fontSize: 30 }}>🍽️</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.rowTitle}>{p.n}</Text>
              <Text style={[s.muted, { color: p.t === 'Veg' ? C.green : C.red }]}>{p.t} / {p.d}</Text>
            </View>
            <Text style={{ color: C.yellow }}>★ {p.r}</Text>
          </View>
        ))}
      </>
    );
  }

  function renderOffline() {
    return (
      <>
        <Section>Downloaded Maps</Section>
        <Group>
          <Row icon="🗺️" title="Bengaluru City" value="450 MB" onPress={() => Alert.alert('Bengaluru City', 'Map opened offline.')} />
          <Row icon="🗺️" title="Mysuru District" value="220 MB" onPress={() => Alert.alert('Mysuru District', 'Map opened offline.')} />
          <View style={[s.row, { flexDirection: 'column', alignItems: 'stretch', borderBottomWidth: 0 }]}>
            <View style={s.rowBetween}>
              <Text style={s.rowTitle}>Karnataka State</Text>
              <Text style={s.muted}>0.1 GB · Downloading, {dl}%</Text>
            </View>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${dl}%` }]} /></View>
          </View>
        </Group>
        <Section>Download New Map</Section>
        <Field value={search} onChangeText={setSearch} placeholder="Search in the field to maps" icon="⌕" />
        <Group>
          {['Hassan District|310 MB', 'Chikmagalur District|260 MB', 'Coorg District|180 MB']
            .filter((x) => x.toLowerCase().includes(search.toLowerCase()))
            .map((x, i, arr) => {
              const [n, sz] = x.split('|');
              return <Row key={n} icon="🗺️" title={n} value={`${sz}  ⬇`} onPress={() => setDl(Math.min(100, dl + 10))} last={i === arr.length - 1} />;
            })}
        </Group>
      </>
    );
  }

  function renderRoute() {
    const route = selectedTripRoute;
    const costLabel = vehicle === 'ev' ? 'Estimated Energy / Charging Cost' : 'Estimated Fuel / Cost';
    const estimatedCost = route?.estimated_cost === null || route?.estimated_cost === undefined
      ? 'Unavailable'
      : `₹${route.estimated_cost.toFixed(2)} (estimate)`;
    return (
      <>
        {!route ? <Text style={s.muted}>Generate a trip route to see real journey details here.</Text> : null}
        <View style={s.tabs}>
          {['Overview', 'Steps', 'Traffic', 'Reviews'].map((t) => (
            <Pressable key={t} onPress={() => setRouteTab(t)} style={[s.tabBtn, routeTab === t && { borderBottomColor: C.blueLight }]}>
              <Text style={[s.white12, routeTab === t && { color: C.blueLight }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {routeTab === 'Overview' ? (
          <Group>
            <Row icon="🌐" title="Total Distance" value={route ? formatTripDistance(route.distance_m) : 'Unavailable'} />
            <Row icon="⏱️" title="Estimated Time" value={route ? formatTripDuration(route.duration_s) : 'Unavailable'} />
            <Row icon="⛽" title={costLabel} value={estimatedCost} />
            <Row
              icon="🛡️"
              title="Hazard Score"
              value={route?.safety_score === null || !route ? 'Unavailable' : `${route.safety_score}/100`}
              last
            />
            {tripPlan ? <Text style={[s.mini, { padding: 12 }]}>{tripPlan.estimation_note}</Text> : null}
          </Group>
        ) : routeTab === 'Steps' ? (
          route ? (
            <Group>
              {route.legs.map((leg, index) => (
                <Row
                  key={`${leg.origin_name}-${leg.destination_name}-${index}`}
                  icon={`${index + 1}.`}
                  title={`${leg.origin_name} → ${leg.destination_name}`}
                  value={`${formatTripDistance(leg.distance_m)} · ${formatTripDuration(leg.duration_s)}`}
                  last={index === route.legs.length - 1}
                />
              ))}
            </Group>
          ) : <Text style={s.muted}>No route leg data available.</Text>
        ) : routeTab === 'Traffic' ? (
          <Group>
            <Row
              icon="🚦"
              title="Live traffic data"
              value={tripPlan?.traffic_data_available ? 'Available' : 'Unavailable'}
              last
            />
            <Text style={[s.mini, { padding: 12 }]}>The selected routing provider supplies route duration estimates, not live traffic conditions.</Text>
          </Group>
        ) : (
          <Text style={s.muted}>No trip reviews are available.</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn title="Save Route" outline onPress={saveRoute} disabled={loading || !route} /></View>
          <View style={{ flex: 1 }}><Btn title="Download" onPress={() => go('offline')} disabled={!route} /></View>
        </View>
      </>
    );
  }

  function renderProfile() {
    return (
      <>
        <View style={[s.center, { paddingVertical: 18 }]}>
          <Pressable
            style={s.avatar}
            onPress={openProfilePhotoActions}
            accessibilityRole="button"
            accessibilityLabel={profilePhotoUri ? 'Change or remove profile photo' : 'Add profile photo'}
          >
            {profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={s.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={s.avatarText}>{initials}</Text>
            )}
          </Pressable>
          <Pressable onPress={openProfilePhotoActions} accessibilityRole="button">
            <Text style={s.profilePhotoAction}>{profilePhotoUri ? 'Change photo' : 'Add profile photo'}</Text>
          </Pressable>
          <Text style={[s.h1, { marginTop: 10 }]}>{displayName}</Text>
          <Text style={s.muted}>{user?.email ?? ''}</Text>
        </View>
        <Group>
          <Row
            icon="🚗"
            title="My Vehicle"
            value={vehicleNumberLoading ? 'Loading…' : vehicleNumber || 'Add vehicle number'}
            onPress={openVehicleEditor}
          />
          <Row icon="📞" title="Emergency Contacts" value={`${emergencyContacts.length} Contacts`} onPress={() => go('emergency')} />
          <Row
            icon="📍"
            title="Saved Places"
            value={savedPlacesLoading ? 'Loading…' : `${savedPlaces.length} Places`}
            onPress={() => {
              if (savedPlaces.length === 0) {
                Alert.alert('Saved Places', 'You have no saved places yet.');
                return;
              }
              setSavedPlacesPickerOpen(true);
            }}
          />
          <Row
            icon="🕘"
            title="Route History"
            value={savedRoutesLoading ? 'Loading…' : `${savedRoutes.length} ${savedRoutes.length === 1 ? 'Trip' : 'Trips'}`}
            onPress={() => go('route')}
          />
          <Row icon="⚙️" title="Settings" onPress={() => go('settings')} />
          <Row icon="🚪" title="Logout" onPress={() => { setUser(null); setStack(['login']); }} last />
        </Group>
      </>
    );
  }

  function renderAccident() {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={[s.h1, { marginTop: 20 }]}>Accident Detected</Text>
        <Text style={[s.muted, { textAlign: 'center', marginTop: 10, fontSize: 13 }]}>
          We've detected a possible accident. Are you okay?
        </Text>
        <View style={s.countOuter}>
          <View style={s.countInner}>
            <Text style={s.countText}>{String(countdown).padStart(2, '0')}</Text>
            <Text style={{ color: C.orange }}>Seconds</Text>
          </View>
        </View>
        <View style={{ width: '100%' }}>
          <Btn title="I Need Help" danger pill onPress={() => { triggerSos('accident'); setStack(['home']); }} />
          <Btn title="I'm Fine, Cancel" outline pill onPress={() => setStack(['home'])} />
        </View>
        <Text style={[s.muted, { marginTop: 24, textAlign: 'center' }]}>🌐 Your location will be shared with emergency contacts.</Text>
      </View>
    );
  }

  function renderCommunity() {
    const reportIcon: Record<string, string> = {
      pothole: '⚠️', traffic_jam: '🚗', accident: '🚨', flooded_road: '🌊',
      flood: '🌊', fire: '🔥', blockage: '🚧',
    };
    const reportCategory: Record<string, string> = {
      pothole: 'Hazards', traffic_jam: 'Traffic', accident: 'Accidents', flooded_road: 'Hazards',
      flood: 'Hazards', fire: 'Hazards', blockage: 'Hazards',
    };
    const visibleReports = communityReports.filter((report) =>
      reportFilter === 'All' || reportCategory[report.incident_type] === reportFilter
    );
    const relativeTime = (createdAt: string) => {
      const elapsed = Math.max(0, Date.now() - parseBackendUtcTimestamp(createdAt).getTime());
      const minutes = Math.floor(elapsed / 60000);
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes} min ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} hr ago`;
      return `${Math.floor(hours / 24)} day ago`;
    };

    return (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {['All', 'Hazards', 'Traffic', 'Accidents'].map((f) => <Chip key={f} label={f} active={reportFilter === f} onPress={() => setReportFilter(f)} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Btn
              title={reportSelectionMode ? 'Cancel Selection' : 'Select Reports'}
              outline
              small
              onPress={() => {
                setReportSelectionMode((active) => !active);
                setSelectedReportIds([]);
              }}
            />
          </View>
          {reportSelectionMode ? (
            <View style={{ flex: 1 }}>
              <Btn
                title={`Delete Selected${selectedReportIds.length ? ` (${selectedReportIds.length})` : ''}`}
                danger
                small
                disabled={selectedReportIds.length === 0}
                onPress={() => { void deleteSelectedCommunityReports(); }}
              />
            </View>
          ) : null}
        </View>
        {communityLoading ? <Text style={[s.muted, { textAlign: 'center', marginVertical: 16 }]}>Loading reports…</Text> : null}
        {communityError ? <Text style={[s.muted, { color: C.red, textAlign: 'center', marginVertical: 16 }]}>{communityError}</Text> : null}
        {!communityLoading && !communityError && visibleReports.length === 0 ? <Text style={[s.muted, { textAlign: 'center', marginVertical: 16 }]}>No community reports in this category.</Text> : null}
        {visibleReports.map((report) => (
          <Pressable
            key={report.id}
            style={s.report}
            onPress={() => {
              if (reportSelectionMode) {
                if (user?.id !== report.user_id) return;
                setSelectedReportIds((current) => current.includes(report.id)
                  ? current.filter((id) => id !== report.id)
                  : [...current, report.id]);
                return;
              }
              setSelectedReportDetails(report);
            }}
          >
            {reportSelectionMode ? (
              <Text style={{ color: user?.id === report.user_id ? C.blueLight : C.muted, fontSize: 24, width: 28 }}>
                {selectedReportIds.includes(report.id) ? '☑' : '☐'}
              </Text>
            ) : null}
            {report.media_url ? (
              <Image source={{ uri: report.media_url }} style={{ width: 44, height: 44, borderRadius: 8 }} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 30 }}>{reportIcon[report.incident_type] ?? '⚠️'}</Text>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.rowTitle}>{report.incident_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
              <Text style={s.muted}>{report.lat.toFixed(4)}, {report.lng.toFixed(4)}</Text>
              {report.description ? <Text style={s.muted}>{report.description}</Text> : null}
              <Text style={s.muted}>{relativeTime(report.created_at)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <Pressable onPress={async () => {
                try {
                  await api(`/reports/${report.id}/vote`, { method: 'POST', body: { user_id: user?.id ?? null, vote: 'up' } });
                  await loadCommunityReports();
                } catch (error) {
                  Alert.alert('Vote could not be saved', error instanceof Error ? error.message : 'Please try again.');
                }
              }}><Text style={{ color: C.red, fontSize: 18 }}>▲ {report.upvotes}</Text></Pressable>
            </View>
          </Pressable>
        ))}
        <Pressable style={s.fab} onPress={openReportForm}>
          <Text style={s.btnText}>＋ Report</Text>
        </Pressable>

        <Modal
          visible={selectedReportDetails !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedReportDetails(null)}
        >
          <View style={s.vehicleModalBackdrop}>
            <View style={s.vehicleModal}>
              {selectedReportDetails ? (
                <>
                  <Text style={s.h1}>
                    {selectedReportDetails.incident_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                  {selectedReportDetails.media_url ? (
                    <Image
                      source={{ uri: selectedReportDetails.media_url }}
                      style={[s.reportPhoto, { marginTop: 14 }]}
                      resizeMode="cover"
                    />
                  ) : <Text style={[s.muted, { marginTop: 14 }]}>No image attached.</Text>}
                  <Text style={[s.white12, { marginTop: 12 }]}>
                    Date and time: {parseBackendUtcTimestamp(selectedReportDetails.created_at).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })} IST
                  </Text>
                  <Text style={[s.white12, { marginTop: 8 }]}>
                    Uploaded by: {selectedReportDetails.user_id ?? 'Guest user'}
                  </Text>
                  <Text style={[s.white12, { marginTop: 8 }]}>
                    Location: {selectedReportDetails.lat.toFixed(5)}, {selectedReportDetails.lng.toFixed(5)}
                  </Text>
                  {selectedReportDetails.description ? (
                    <Text style={[s.muted, { marginTop: 8 }]}>{selectedReportDetails.description}</Text>
                  ) : null}
                  <Btn title="Close" outline onPress={() => setSelectedReportDetails(null)} />
                </>
              ) : null}
            </View>
          </View>
        </Modal>

        {reportFormOpen ? (
          <View style={s.reportModalBackdrop}>
            <View style={s.reportModal}>
              <Text style={s.h1}>Create Community Report</Text>
              <Text style={s.muted}>Incident type</Text>
              <View style={s.reportTypeGrid}>
                {([['pothole', '⚠️ Pothole'], ['traffic_jam', '🚗 Traffic Jam'], ['accident', '🚨 Accident'], ['flooded_road', '🌊 Flooded Road']] as [ReportType, string][]).map(([type, label]) => (
                  <Pressable key={type} onPress={() => setReportType(type)} style={[s.reportTypeChip, reportType === type && { backgroundColor: C.blue, borderColor: C.blue }]}>
                    <Text style={s.white12}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {reportPhotoUri ? (
                <>
                  {/* eslint-disable-next-line @typescript-eslint/no-var-requires */}
                  <Image source={{ uri: reportPhotoUri }} style={s.reportPhoto} resizeMode="cover" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}><Btn title="Retake" outline onPress={() => captureReportPhoto('camera')} /></View>
                    <View style={{ flex: 1 }}><Btn title="Replace" outline onPress={() => captureReportPhoto('gallery')} /></View>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Btn title="📷 Camera" outline onPress={() => captureReportPhoto('camera')} /></View>
                  <View style={{ flex: 1 }}><Btn title="🖼 Gallery" outline onPress={() => captureReportPhoto('gallery')} /></View>
                </View>
              )}
              <Text style={[s.muted, { marginTop: 12 }]}>Location: {reportLocation ? `${reportLocation.lat.toFixed(5)}, ${reportLocation.lng.toFixed(5)}` : 'Fetching GPS…'}</Text>
              <TextInput value={reportDescription} onChangeText={setReportDescription} placeholder="Optional description" placeholderTextColor={C.muted} multiline style={s.reportDescription} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Btn title="Cancel" outline disabled={reportSubmitting} onPress={() => setReportFormOpen(false)} /></View>
                <View style={{ flex: 1 }}><Btn title={reportSubmitting ? 'Submitting…' : 'Submit Report'} disabled={reportSubmitting} onPress={() => {
                  Alert.alert(
                    'Submit report?',
                    'Confirm that the hazard details and location are accurate before submitting.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Submit', onPress: submitCommunityReport },
                    ]
                  );
                }} /></View>
              </View>
            </View>
          </View>
        ) : null}
      </>
    );
  }

  function renderSettings() {
    return (
      <>
        <View style={[s.group, { padding: 14 }]}>
          <Text style={s.rowTitle}>Dark Mode</Text>
          <View style={s.segment}>
            {(['Off', 'On', 'System'] as const).map((o) => (
              <Pressable key={o} onPress={() => setDarkMode(o)} style={[s.seg, darkMode === o && { backgroundColor: C.blue }]}>
                <Text style={s.white12}>{o}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Group>
          <Row icon="📶" title="Communication" value="Mesh, Wi-Fi Direct" onPress={() => go('comm')} />
          <Row icon="🗺️" title="Offline Maps" value="Manage maps" onPress={() => go('offline')} />
          <Row icon="🧭" title="Navigation" value="Route preferences" onPress={() => go('trip')} />
          <Row icon="🆘" title="Emergency SOS" value="Contacts" onPress={() => go('emergency')} />
          <Row icon="🔔" title="Notifications" value="Alerts & Updates" onPress={() => Alert.alert('Notifications', 'Notification preferences.')} />
          <Row icon="🔐" title="Privacy & Security" onPress={() => Alert.alert('Privacy & Security', 'Privacy settings.')} last />
        </Group>
        <Group>
          <Row icon="ℹ️" title="About SafePath AI" value="Version 2.0.0" onPress={() => Alert.alert('SafePath AI', `Version 2.0.0\nAPI: ${API_URL}`)} />
          <Row icon="🚪" title="Logout" onPress={() => { setUser(null); setStack(['login']); }} last />
        </Group>
      </>
    );
  }

  function renderEmergency() {
    return (
      <>
        <Section>Emergency Contacts</Section>
        {contactsLoading ? <Text style={s.muted}>Loading saved contacts…</Text> : null}
        {!contactsLoading && emergencyContacts.length === 0 ? (
          <Text style={s.muted}>No emergency contacts added yet.</Text>
        ) : null}
        {emergencyContacts.map((contact) => (
          <View key={contact.id} style={[s.contactCard, s.rowBetween]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{contact.name}</Text>
              <Text style={s.muted}>{contact.phone}</Text>
            </View>
            <Pressable
              onPress={() => Alert.alert('Remove contact?', `Remove ${contact.name} from emergency contacts?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => { void removeEmergencyContact(contact.id); } },
              ])}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${contact.name}`}
            >
              <Text style={{ color: C.red, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={s.addBtn} onPress={openContactEditor}>
          <Text style={{ color: C.blueLight }}>＋  Add Contact</Text>
        </Pressable>
        <Text style={[s.white12, { textAlign: 'center', fontSize: 14, marginTop: 4 }]}>Fill only if you want to share{'\n'}during emergency</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <CountryPhoneField label="Phone" countryCode={countryCode} onCountryCodeChange={setCountryCode} value={phone} onChangeText={setPhone} />
        <View style={{ marginTop: 12 }}>
          <Text style={s.label}>Blood Group <Text style={s.muted}>(Optional)</Text></Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[s.inputWrap, { flex: 1 }]}>
              <TextInput value={bloodGroup} onChangeText={setBloodGroup} style={s.input} placeholder="e.g. O+" placeholderTextColor={C.muted} autoCapitalize="characters" />
            </View>
            <Pressable style={s.skip} onPress={() => setBloodGroup('')}><Text style={s.white12}>Skip</Text></Pressable>
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <Text style={s.label}>Medical Notes <Text style={s.muted}>(Optional)</Text></Text>
          <View style={[s.inputWrap, { minHeight: 80, alignItems: 'flex-start' }]}>
            <TextInput value={notes} onChangeText={setNotes} multiline style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholderTextColor={C.muted} />
          </View>
        </View>
        <View style={[s.group, s.rowBetween, { padding: 14, marginTop: 12 }]}>
          <Text style={[s.rowTitle, { flex: 1 }]}>Share this info with{'\n'}emergency contacts</Text>
          <Switch value={shareInfo} onValueChange={setShareInfo} trackColor={{ true: C.yellow, false: C.border }} thumbColor={C.white} />
        </View>
        <Btn title="Save" onPress={() => {
          if (phone && phone.length !== 10) {
            Alert.alert('Invalid phone number', 'Enter exactly 10 digits after the +91 country code.');
            return;
          }
          Alert.alert('Saved', 'Emergency details updated.');
          back();
        }} />
      </>
    );
  }

  function content() {
    switch (screen) {
      case 'splash': return renderSplash();
      case 'login': return renderLogin();
      case 'reset-password': return renderResetPassword();
      case 'home': return renderHome();
      case 'navigate': return renderNavigate(1);
      case 'navigate2': return renderNavigate(2);
      case 'trip': return renderTrip();
      case 'sos': return renderSos();
      case 'comm': return renderComm();
      case 'nearby': return renderNearby();
      case 'offline': return renderOffline();
      case 'route': return renderRoute();
      case 'profile': return renderProfile();
      case 'accident': return renderAccident();
      case 'community': return renderCommunity();
      case 'settings': return renderSettings();
      case 'emergency': return renderEmergency();
    }
  }

  const showHeader = !['splash', 'login', 'reset-password', 'home', 'accident', 'navigate', 'navigate2'].includes(screen);
  const showTabs = TAB_SCREENS.includes(screen);
  const activeTab: Screen =
    screen === 'navigate2' ? 'navigate' : screen === 'route' ? 'trip' : TABS.some((t) => t.key === screen) ? screen : 'home';
  const isDanger = screen === 'accident' || screen === 'sos';

  return (
    <View style={[s.outer, isDanger && { backgroundColor: '#1D1426' }]}>
    <SafeAreaView
      style={[s.safe, s.phone, isDanger && { backgroundColor: '#1D1426' }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        const bounds = { width, height };
        sosBoundsRef.current = bounds;
        setSosPosition((current) => {
          if (current) return current;
          const initial = { x: width - 76, y: height - 142 };
          sosPositionRef.current = initial;
          return initial;
        });
      }}
    >
      <StatusBar barStyle="light-content" />
      <Modal
        visible={savedPlacesPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSavedPlacesPickerOpen(false)}
      >
        <View style={s.vehicleModalBackdrop}>
          <View style={s.vehicleModal}>
            <Text style={s.h1}>Saved Places</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>Select a place to show it on the map.</Text>
            {savedPlaces.map((place) => (
              <Pressable
                key={`${place.name}-${place.lat}-${place.lng}`}
                style={s.savedPlaceOption}
                onPress={() => openSavedPlace(place)}
              >
                <Text style={s.navigationVehicleIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{place.name}</Text>
                  <Text style={s.mini}>{place.lat.toFixed(5)}, {place.lng.toFixed(5)}</Text>
                </View>
                <Text style={s.arrow}>›</Text>
              </Pressable>
            ))}
            <Btn title="Cancel" outline onPress={() => setSavedPlacesPickerOpen(false)} />
          </View>
        </View>
      </Modal>
      <Modal
        visible={navigationVehiclePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNavigationVehiclePickerOpen(false)}
      >
        <View style={s.vehicleModalBackdrop}>
          <View style={s.vehicleModal}>
            <Text style={s.h1}>Vehicle type</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>Select the vehicle for live navigation.</Text>
            {([
              ['bike', '🏍️', 'Bike'],
              ['car', '🚗', 'Car'],
              ['ev', '🔌', 'EV'],
              ['bus', '🚌', 'Bus'],
            ] as [TripVehicle, string, string][]).map(([value, icon, label]) => (
              <Pressable
                key={value}
                style={[s.navigationVehicleOption, navigationVehicle === value && s.navigationVehicleOptionActive]}
                onPress={() => {
                  setNavigationVehicle(value);
                  setNavigationVehiclePickerOpen(false);
                }}
              >
                <Text style={s.navigationVehicleIcon}>{icon}</Text>
                <Text style={s.rowTitle}>{label}</Text>
                {navigationVehicle === value ? <Text style={s.navigationVehicleSelected}>✓</Text> : null}
              </Pressable>
            ))}
            <Btn title="Cancel" outline onPress={() => setNavigationVehiclePickerOpen(false)} />
          </View>
        </View>
      </Modal>
      <Modal
        visible={vehicleEditorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVehicleEditorOpen(false)}
      >
        <View style={s.vehicleModalBackdrop}>
          <View style={s.vehicleModal}>
            <Text style={s.rowTitle}>My Vehicle</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>Enter your vehicle registration number.</Text>
            <View style={[s.inputWrap, { marginTop: 14 }]}>
              <TextInput
                value={vehicleNumberDraft}
                onChangeText={setVehicleNumberDraft}
                placeholder="Vehicle number"
                placeholderTextColor={C.muted}
                maxLength={20}
                autoCapitalize="characters"
                autoCorrect={false}
                style={s.input}
                returnKeyType="done"
                onSubmitEditing={saveVehicleNumber}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Btn title="Cancel" outline onPress={() => setVehicleEditorOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn title="Save" onPress={saveVehicleNumber} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={contactEditorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setContactEditorOpen(false)}
      >
        <View style={s.vehicleModalBackdrop}>
          <View style={s.vehicleModal}>
            <Text style={s.rowTitle}>Add Emergency Contact</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>Add someone to contact in an emergency.</Text>
            <View style={{ marginTop: 14 }}>
              <Text style={s.label}>Name</Text>
              <View style={s.inputWrap}>
                <TextInput
                  value={contactNameDraft}
                  onChangeText={(value) => setContactNameDraft(sanitizeContactName(value))}
                  placeholder="Contact name"
                  placeholderTextColor={C.muted}
                  maxLength={120}
                  autoCapitalize="words"
                  style={s.input}
                  returnKeyType="next"
                />
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <Text style={s.label}>Phone number</Text>
              <View style={s.inputWrap}>
                <TextInput
                  value={contactPhoneDraft}
                  placeholder="Phone number"
                  placeholderTextColor={C.muted}
                  maxLength={10}
                  keyboardType="phone-pad"
                  onChangeText={(value) => setContactPhoneDraft(value.replace(/\D/g, '').slice(0, 10))}
                  style={s.input}
                  returnKeyType="done"
                  onSubmitEditing={saveEmergencyContact}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Btn title="Cancel" outline onPress={() => setContactEditorOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn title="Save Contact" onPress={saveEmergencyContact} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={peerPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPeerPickerOpen(false);
          void nearbyBluetooth.stopScan();
          setBleScanning(false);
        }}
      >
        <View style={s.vehicleModalBackdrop}>
          <View style={[s.vehicleModal, { maxHeight: '80%' }]}>
            <Text style={s.rowTitle}>Add Nearby Device</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>
              Select a SafePath AI device that is currently advertising over Bluetooth.
            </Text>
            {Platform.OS !== 'android' ? (
              <Text style={[s.muted, { color: C.orange, marginTop: 12 }]}>
                Bluetooth connections require the Android app build.
              </Text>
            ) : null}
            {bleError ? <Text style={[s.muted, { color: C.red, marginTop: 10 }]}>{bleError}</Text> : null}
            {bleScanning ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
                <ActivityIndicator color={C.blueLight} />
                <Text style={s.muted}>Searching nearby for 12 seconds…</Text>
              </View>
            ) : nearbyBlePeers.length === 0 ? (
              <Text style={[s.muted, { marginTop: 16 }]}>No compatible devices found. Both phones must have this screen open.</Text>
            ) : null}
            <ScrollView style={{ marginTop: 10, flexGrow: 0 }}>
              {nearbyBlePeers
                .filter((peer) => !savedBlePeers.some((savedPeer) => savedPeer.id === peer.id))
                .map((peer) => (
                  <View key={peer.id} style={s.row}>
                    <Text style={s.rowIcon}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{peer.name}</Text>
                      <Text style={s.muted}>Bluetooth signal {peer.rssi} dBm</Text>
                    </View>
                    <Pressable onPress={() => { void connectToBluetoothPeer(peer); }} hitSlop={8}>
                      <Text style={{ color: C.blueLight }}>Connect</Text>
                    </Pressable>
                  </View>
                ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Btn
                  title={bleScanning ? 'Searching…' : 'Scan Again'}
                  outline
                  disabled={bleScanning || Platform.OS !== 'android'}
                  onPress={() => { void scanForBluetoothPeers(); }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Btn
                  title="Done"
                  onPress={() => {
                    setPeerPickerOpen(false);
                    void nearbyBluetooth.stopScan();
                    setBleScanning(false);
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={broadcastModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBroadcastModalOpen(false)}
      >
        <View style={s.vehicleModalBackdrop}>
          <View style={s.vehicleModal}>
            <Text style={s.rowTitle}>Broadcast Message</Text>
            <Text style={[s.muted, { marginTop: 6 }]}>
              Send a help message to {savedBlePeers.filter((peer) => peer.connected).length} connected SafePath device(s).
            </Text>
            <View style={[s.inputWrap, { minHeight: 110, alignItems: 'flex-start', marginTop: 14 }]}>
              <TextInput
                value={broadcastDraft}
                onChangeText={setBroadcastDraft}
                placeholder="Type a message asking for help"
                placeholderTextColor={C.muted}
                maxLength={1000}
                multiline
                textAlignVertical="top"
                style={[s.input, { minHeight: 92 }]}
              />
            </View>
            <Text style={[s.muted, { marginTop: 8 }]}>Sent directly over Bluetooth. Avoid including passwords or sensitive personal information.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Btn title="Cancel" outline onPress={() => setBroadcastModalOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn
                  title={broadcastSending ? 'Sending…' : 'Send Help Message'}
                  disabled={broadcastSending}
                  danger
                  onPress={() => { void sendBroadcastMessage(); }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {showHeader ? (
        <View style={[s.header, ['trip', 'offline', 'profile', 'community', 'sos', 'comm', 'route', 'emergency', 'nearby'].includes(screen) && { marginTop: 24 }, screen === 'settings' && { marginTop: 36 }]}>
          <Pressable onPress={back} hitSlop={12}><Text style={s.backArrow}>←</Text></Pressable>
          <Text style={s.headerTitle}>{TITLES[screen]}</Text>
          <View style={{ width: 24 }} />
        </View>
      ) : null}
      {screen === 'navigate' || screen === 'navigate2' ? (
        <View style={[s.content, { flex: 1, paddingBottom: 96 }]}>
          {content()}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, showTabs && { paddingBottom: 96 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={screen === 'community' ? <RefreshControl refreshing={communityLoading} onRefresh={loadCommunityReports} tintColor={C.blueLight} /> : undefined}
        >
          {content()}
        </ScrollView>
      )}
      {!['splash', 'login', 'reset-password', 'sos', 'accident'].includes(screen) ? (
        <View
          {...sosResponder.panHandlers}
          style={[s.sosFab, sosPosition ? { left: sosPosition.x, top: sosPosition.y, right: undefined, bottom: undefined } : null]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Emergency SOS. Tap to open, or press and hold to drag."
        >
          <Text style={s.sosFabText}>SOS</Text>
        </View>
      ) : null}
      {showTabs ? (
        <View style={s.bottomNav}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <Pressable key={t.key} onPress={() => tab(t.key)} style={s.navItem}>
                <View style={[s.navIconWrap, active && { backgroundColor: C.panel2 }]}>
                  <Text style={[s.navIcon, active && { color: C.white }]}>{t.icon}</Text>
                </View>
                <Text style={[s.navLabel, active && { color: C.blueLight }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
    </View>
  );
}

/* ───────────────────────── Styles ───────────────────────── */
const s = StyleSheet.create({
  outer: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  phone: { width: '100%', maxWidth: 430, position: 'relative' },
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, paddingBottom: 30 },
  center: { alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  homeAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#4B4F6D', overflow: 'hidden' },
  homeAvatarImage: { width: '100%', height: '100%' },
  homeAvatarText: { color: C.white, fontSize: 15, fontWeight: '700' },

  shield: { fontSize: 84 },
  brand: { color: C.white, fontSize: 34, fontWeight: '700', marginTop: 12 },
  tagline: { color: C.white, fontSize: 18, textAlign: 'center', marginTop: 8, lineHeight: 26 },
  h1: { color: C.white, fontSize: 24, fontWeight: '700', marginTop: 8 },
  h2: { color: C.white, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  muted: { color: C.muted, fontSize: 12, marginTop: 2 },
  mini: { color: C.muted, fontSize: 10, marginTop: 2 },
  white12: { color: C.white, fontSize: 12 },
  link: { color: C.blueLight, fontSize: 12, textAlign: 'right', marginTop: 8, marginBottom: 6 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '600' },
  backArrow: { color: C.white, fontSize: 24 },

  btn: { backgroundColor: C.blue, borderRadius: 9, minHeight: 46, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3F4BA5' },
  btnText: { color: C.white, fontWeight: '700', fontSize: 14 },

  label: { color: '#B9BAD0', fontSize: 12, marginBottom: 6 },
  inputWrap: { backgroundColor: C.panel, borderColor: C.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 13, minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  inputIcon: { color: C.muted, marginRight: 8, fontSize: 14 },
  input: { flex: 1, color: C.white, fontSize: 14, paddingVertical: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: C.panel, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },

  section: { color: C.white, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  group: { backgroundColor: C.panel, borderRadius: 11, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginTop: 12 },
  placeSuggestion: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, marginTop: 6 },
  tripStop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tripStopActions: { flexDirection: 'row', gap: 10, marginTop: 42, alignItems: 'center' },
  tripAction: { color: C.blueLight, fontSize: 20, fontWeight: '700', paddingHorizontal: 2 },
  disabledText: { opacity: 0.3 },
  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tripChoice: { width: '48%', minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10 },
  tripChoiceActive: { borderColor: C.blue, backgroundColor: C.panel2 },
  preferenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preferenceChoice: { width: '48%', minHeight: 86, backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10 },
  tripError: { color: '#FF9A9A', fontSize: 13, marginTop: 12 },
  tripMap: { height: 320, borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  routeOption: { backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 8 },
  row: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon: { color: C.orange, fontSize: 16, width: 30 },
  rowTitle: { color: C.white, fontSize: 14, fontWeight: '500' },
  rowValue: { color: C.muted, fontSize: 12, marginLeft: 'auto', marginRight: 6 },
  arrow: { color: C.muted, fontSize: 22, marginLeft: 'auto' },

  chip: { backgroundColor: C.panel, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingVertical: 9, paddingHorizontal: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  greeting: { color: C.white, fontSize: 19, fontWeight: '600' },
  search: { backgroundColor: C.panel, borderRadius: 10, padding: 15, marginTop: 16, borderWidth: 1, borderColor: C.border },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5A3BC4', borderRadius: 14, padding: 16, marginTop: 14 },
  heroTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  heroSub: { color: '#DDD6FF', fontSize: 12, marginTop: 3 },
  heroBtn: { backgroundColor: C.white, alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 6, marginTop: 10 },
  heroBtnText: { color: C.blue, fontWeight: '700', fontSize: 12 },
  tileRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: C.panel, borderRadius: 11, borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center' },
  tileLabel: { color: C.white, fontSize: 11, marginTop: 6, textAlign: 'center' },
  comms: { backgroundColor: '#252845', borderRadius: 11, padding: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center' },

  map: { height: 300, backgroundColor: '#161B34', borderRadius: 14, marginTop: 12, overflow: 'hidden', position: 'relative' },
  road: { position: 'absolute', backgroundColor: '#2B3553' },
  route: { position: 'absolute', height: 8, backgroundColor: '#493CFF', borderRadius: 4 },
  pin: { position: 'absolute', fontSize: 20 },
  userDot: { position: 'absolute', bottom: 40, left: '44%', width: 46, height: 46, borderRadius: 23, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#B7BCFF' },

  etaBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 12 },
  etaBig: { color: C.white, fontSize: 19, fontWeight: '700' },
  exit: { backgroundColor: C.red, borderRadius: 8, paddingHorizontal: 22, paddingVertical: 12 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', paddingVertical: 10 },

  addBtn: { alignItems: 'center', backgroundColor: C.panel, borderRadius: 9, borderWidth: 1, borderColor: C.border, padding: 13, marginTop: 10 },
  vehicleRow: { flexDirection: 'row', gap: 8 },
  vehicle: { flex: 1, alignItems: 'center', backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingVertical: 10 },

  sosOuter: { alignSelf: 'center', width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(235,60,67,0.15)', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  sosInner: { width: 180, height: 180, borderRadius: 90, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 12, borderColor: '#7A2A3C' },
  sosText: { color: C.white, fontWeight: '800', fontSize: 40 },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, rowGap: 14 },
  cat: { width: '25%', alignItems: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 11, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10 },

  progressTrack: { height: 6, backgroundColor: C.border, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.blue, borderRadius: 3 },

  tabs: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },

  avatar: { width: 144, height: 144, borderRadius: 72, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#4B4F6D', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: C.white, fontSize: 36, fontWeight: '700' },
  profilePhotoAction: { color: C.blueLight, fontSize: 12, fontWeight: '700', marginTop: 8 },

  countOuter: { width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(170,46,49,0.12)', alignItems: 'center', justifyContent: 'center', marginVertical: 30 },
  countInner: { width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: '#8A323E', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1822' },
  countText: { color: C.red, fontSize: 60, fontWeight: '500' },

  report: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 11, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 10 },
  vehicleModalBackdrop: { flex: 1, backgroundColor: 'rgba(4,7,20,0.82)', justifyContent: 'center', padding: 20 },
  vehicleModal: { backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16 },
  navigationVehicleOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 9, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10 },
  navigationVehicleOptionActive: { borderColor: C.blueLight, backgroundColor: C.panel2 },
  navigationVehicleIcon: { fontSize: 24, width: 34, textAlign: 'center' },
  navigationVehicleSelected: { color: C.green, fontSize: 18, fontWeight: '700', marginLeft: 'auto' },
  savedPlaceOption: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderRadius: 9, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10 },
  contactCard: { backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 8 },
  reportModalBackdrop: { position: 'absolute', left: -18, right: -18, top: -18, bottom: 0, backgroundColor: 'rgba(4,7,20,0.82)', justifyContent: 'center', padding: 18 },
  reportModal: { backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginTop: 204 },
  reportTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 12 },
  reportTypeChip: { width: '48%', backgroundColor: C.panel, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingVertical: 10, alignItems: 'center' },
  reportPhoto: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8, backgroundColor: C.panel },
  reportDescription: { minHeight: 72, marginVertical: 12, borderRadius: 9, borderWidth: 1, borderColor: C.border, backgroundColor: C.panel, color: C.white, padding: 12, textAlignVertical: 'top' },
  fab: { alignSelf: 'flex-end', backgroundColor: '#6B44DB', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },

  segment: { flexDirection: 'row', backgroundColor: C.bg2, borderRadius: 8, marginTop: 10, padding: 3 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6 },
  skip: { backgroundColor: C.panel, borderRadius: 9, borderWidth: 1, borderColor: C.border, paddingHorizontal: 18, justifyContent: 'center' },

  sosFab: { position: 'absolute', right: 18, bottom: 84, width: 58, height: 58, borderRadius: 29, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FF8A8A', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  sosFabText: { color: C.white, fontSize: 14, fontWeight: '800' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, backgroundColor: C.bg2, borderTopWidth: 1, borderTopColor: '#282D49', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  navItem: { alignItems: 'center', padding: 4 },
  navIconWrap: { width: 42, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navIcon: { color: C.muted, fontSize: 20 },
  navLabel: { color: C.muted, fontSize: 10, marginTop: 2 },
});

function MapMock(props: {
  variant?: 1 | 2;
  hazards?: boolean;
  initialCenter?: { lat: number; lng: number };
  destination?: { lat: number; lng: number } | null;
  nearbyPlaces?: NearbyPlace[];
  onDestinationChange?: (point: { lat: number; lng: number }, name?: string) => void;
  onRouteSummary?: (summary: RouteSummary | null) => void;
}) {
  return (
    <LiveMap
      apiUrl={API_URL}
      style={{ height: 585 }}
      showRoutePanel
      initialCenter={props.initialCenter}
      destination={props.destination}
      nearbyPlaces={props.nearbyPlaces}
      onDestinationChange={props.onDestinationChange}
      onRouteSummary={props.onRouteSummary}
    />
  );
}

function isSavedPlace(value: unknown): value is SavedPlace {
  if (!value || typeof value !== 'object') return false;
  const place = value as Record<string, unknown>;
  return typeof place.name === 'string'
    && Number.isFinite(place.lat)
    && Number.isFinite(place.lng);
}