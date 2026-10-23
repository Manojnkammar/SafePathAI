import LiveMap from './LiveMap';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

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
type Screen =
  | 'splash' | 'login' | 'home' | 'navigate' | 'navigate2' | 'trip' | 'sos' | 'comm'
  | 'nearby' | 'offline' | 'route' | 'profile' | 'accident' | 'community' | 'settings' | 'emergency';

type User = { id: string; email: string; display_name?: string | null; phone_number?: string | null };
type ApiOptions = { method?: string; body?: unknown };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
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

function Field({ label, value, onChangeText, placeholder, secure, keyboardType, icon }: {
  label?: string; value: string; onChangeText?: (v: string) => void; placeholder?: string;
  secure?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad'; icon?: string;
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
          autoCapitalize="none"
          style={s.input}
        />
      </View>
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

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('Rohan Kumar');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [search, setSearch] = useState('');

  // trip state
  const [stops, setStops] = useState(['Bangalore, Karnataka', 'Ramanagara', 'Mandya', 'Mysuru, Karnataka']);
  const [vehicle, setVehicle] = useState('Car');
  const [routePref, setRoutePref] = useState('Safest');

  // misc ui state
  const [routeTab, setRouteTab] = useState('Overview');
  const [reportFilter, setReportFilter] = useState('All');
  const [foodFilter, setFoodFilter] = useState<'Veg' | 'Non-Veg'>('Veg');
  const [darkMode, setDarkMode] = useState<'Off' | 'On' | 'System'>('System');
  const [shareInfo, setShareInfo] = useState(true);
  const [bloodGroup, setBloodGroup] = useState('');
  const [notes, setNotes] = useState('Allergic to peanuts\nAsthma');
  const [countdown, setCountdown] = useState(5);
  const [dl, setDl] = useState(45);

  const destination = stops[stops.length - 1];

  /* navigation helpers */
  const go = useCallback((next: Screen) => setStack((st) => [...st, next]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const tab = useCallback((next: Screen) => setStack(['home'].concat(next === 'home' ? [] : [next]) as Screen[]), []);

  /* splash → login */
  useEffect(() => {
    if (screen !== 'splash') return;
    const t = setTimeout(() => setStack(['login']), 1500);
    return () => clearTimeout(t);
  }, [screen]);

  /* API actions */
  async function login() {
    if (!email.trim()) {
      Alert.alert('Missing details', 'Enter your email or phone to continue.');
      return;
    }
    setLoading(true);
    try {
      let u: User;
      try {
        u = await api<User>(`/users/by-email?email=${encodeURIComponent(email)}`);
      } catch {
        u = await api<User>('/users', {
          method: 'POST',
          body: { email, display_name: name, phone_number: phone, auth_provider: 'mobile' },
        });
      }
      setUser(u);
      setStack(['home']);
    } catch (e) {
      Alert.alert('Unable to connect', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function saveRoute() {
    if (!user) {
      Alert.alert('Sign in required', 'Please log in to save routes.');
      return;
    }
    setLoading(true);
    try {
      await api('/routes', {
        method: 'POST',
        body: {
          user_id: user.id,
          origin_name: stops[0],
          destination_name: destination,
          distance_km: 120,
          duration_minutes: 165,
          safety_score: routePref === 'Safest' ? 4.8 : 4.1,
          route_type: routePref.toLowerCase().replace(' ', '_'),
          provider: 'safepath',
          is_saved: true,
        },
      });
      Alert.alert('Route saved', `${destination} has been added to your trips.`);
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
      await api('/sos', {
        method: 'POST',
        body: {
          user_id: user.id,
          latitude: 12.9716,
          longitude: 77.5946,
          trigger,
          message: trigger === 'accident' ? 'Possible accident detected.' : 'Emergency SOS activated from SafePath AI.',
        },
      });
      Alert.alert('SOS activated', 'Your emergency alert and live location were sent.');
    } catch (e) {
      Alert.alert('SOS could not be sent', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  /* accident countdown */
  useEffect(() => {
    if (screen !== 'accident') return;
    setCountdown(5);
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

  const displayName = user?.display_name ?? name;
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
    return (
      <View>
        <View style={[s.center, { paddingTop: 30, paddingBottom: 14 }]}>
          <Text style={[s.shield, { fontSize: 54 }]}>🛡️</Text>
          <Text style={s.h1}>Welcome Back!</Text>
          <Text style={s.white12}>Login to continue</Text>
        </View>
        <Field value={email} onChangeText={setEmail} placeholder="Email or Phone" icon="✉" keyboardType="email-address" />
        <Field value={password} onChangeText={setPassword} placeholder="Password" icon="🔒" secure />
        <Text style={s.link}>Forgot Password?</Text>
        <Btn title={loading ? 'Connecting…' : 'Login'} onPress={login} disabled={loading} />
        <Text style={[s.muted, { textAlign: 'center', marginVertical: 18 }]}>or continue with</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn title="G  Google" outline onPress={() => Alert.alert('Google sign-in', 'Connect your Google OAuth provider here.')} /></View>
          <View style={{ flex: 1 }}><Btn title="📞  Phone" outline onPress={() => Alert.alert('Phone sign-in', 'Connect your OTP provider here.')} /></View>
        </View>
        <Btn title="Continue as Guest" outline onPress={() => setStack(['home'])} />
        <Text style={[s.white12, { textAlign: 'center', marginTop: 40 }]}>
          Don't have an account? <Text style={{ color: C.blueLight }} onPress={login}>Sign Up</Text>
        </Text>
      </View>
    );
  }

  function renderHome() {
    return (
      <>
        <View style={s.rowBetween}>
          <View>
            <Text style={s.greeting}>Hello, {displayName.split(' ')[0]} 😊</Text>
            <Text style={s.muted}>Drive Safe, Stay Safe</Text>
          </View>
          <Text style={{ fontSize: 20 }} onPress={() => tab('community')}>🔔</Text>
        </View>
        <Pressable style={s.search} onPress={() => go('navigate')}>
          <Text style={s.muted}>⌕  Where do you want to go?</Text>
        </Pressable>

        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>AI Recommendation</Text>
            <Text style={s.heroSub}>Safest route available</Text>
            <Text style={[s.heroSub, { fontWeight: '700', color: C.white }]}>Bengaluru → Mysuru</Text>
            <Pressable style={s.heroBtn} onPress={() => go('route')}><Text style={s.heroBtnText}>View</Text></Pressable>
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
        <Group>
          <Row icon="●" title="Bengaluru → Mysuru" value="Today" onPress={() => go('route')} />
          <Row icon="●" title="College → Home" value="Yesterday" onPress={() => go('route')} last />
        </Group>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Btn title="Offline Maps" outline small onPress={() => go('offline')} /></View>
          <View style={{ flex: 1 }}><Btn title="Simulate Accident" outline small onPress={() => go('accident')} /></View>
        </View>
      </>
    );
  }

  function renderNavigate(variant: 1 | 2) {
    return (
      <View>
        <View style={s.turn}>
          <Text style={s.turnArrow}>{variant === 1 ? '↰' : '↱'}</Text>
          <View>
            <Text style={s.turnTitle}>{variant === 1 ? 'Turn Left' : '100 m'}</Text>
            <Text style={s.turnTitle}>{variant === 1 ? '200 m' : 'Turn Right'}</Text>
          </View>
          {variant === 2 ? <Text style={[s.mini, { marginLeft: 'auto', color: C.orange }]}>46 km/h</Text> : null}
        </View>

        <MapMock variant={variant} hazards={variant === 2} />

        {variant === 2 ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            {[['Pothole', '250 m ahead'], ['Accident', '160 m ahead'], ['Traffic Jam', '']].map(([t, d]) => (
              <View key={t} style={s.alertChip}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <View style={{ marginLeft: 8 }}>
                  <Text style={s.rowTitle}>{t}</Text>
                  {d ? <Text style={s.muted}>{d}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.etaBar}>
          <View>
            <Text style={s.etaBig}>2h 45m</Text>
            <Text style={s.muted}>120 km</Text>
          </View>
          <View>
            <Text style={s.etaBig}>10:30 AM</Text>
            <Text style={s.muted}>Arrival</Text>
          </View>
          <Pressable style={s.exit} onPress={back}><Text style={s.btnText}>Exit</Text></Pressable>
        </View>

        <View style={s.actionRow}>
          {[['🧭', 'Route Info', () => go('route')], ['🗺️', 'Maps', () => go(variant === 1 ? 'navigate2' : 'navigate')], ['⤴', 'Share', () => Alert.alert('Share', 'Live trip link copied.')], ['⛔', 'Stop', back]].map(([i, l, fn]) => (
            <Pressable key={l as string} style={s.actionBtn} onPress={fn as () => void}>
              <Text style={{ fontSize: 20 }}>{i as string}</Text>
              <Text style={s.mini}>{l as string}</Text>
            </Pressable>
          ))}
        </View>
        <Btn title="Save Safe Route" outline onPress={saveRoute} disabled={loading} />
      </View>
    );
  }

  function renderTrip() {
    return (
      <>
        <Group>
          {stops.map((st, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.rowIcon, { color: i === 0 ? C.blueLight : i === stops.length - 1 ? C.red : C.orange }]}>●</Text>
              <TextInput
                value={st}
                onChangeText={(v) => setStops((arr) => arr.map((x, j) => (j === i ? v : x)))}
                style={[s.rowTitle, { flex: 1, padding: 0 }]}
                placeholderTextColor={C.muted}
              />
              {stops.length > 2 && i > 0 && i < stops.length - 1 ? (
                <Text style={{ color: C.red, fontSize: 16 }} onPress={() => setStops((arr) => arr.filter((_, j) => j !== i))}>✕</Text>
              ) : <Text style={s.arrow}>›</Text>}
            </View>
          ))}
        </Group>
        <Pressable
          style={s.addBtn}
          onPress={() => setStops((arr) => [...arr.slice(0, -1), `Stop ${arr.length - 1}`, arr[arr.length - 1]])}
        >
          <Text style={{ color: C.blueLight }}>＋  Add Destination</Text>
        </Pressable>

        <Section>Vehicle Type</Section>
        <View style={s.vehicleRow}>
          {[['🏍️', 'Bike'], ['🚗', 'Car'], ['🔌', 'EV'], ['🚌', 'Bus']].map(([i, l]) => (
            <Pressable key={l} onPress={() => setVehicle(l)} style={[s.vehicle, vehicle === l && { borderColor: C.blue, backgroundColor: C.panel2 }]}>
              <Text style={{ fontSize: 22 }}>{i}</Text>
              <Text style={s.white12}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <Section>Route Preference</Section>
        <View style={s.chipRow}>
          {['Best', 'Safest', 'Fuel Saver', 'Less Traffic'].map((p) => (
            <Chip key={p} label={p} active={routePref === p} onPress={() => setRoutePref(p)} />
          ))}
        </View>

        <Btn title="Generate Route" onPress={() => go('route')} />
        <View style={[s.rowBetween, { marginTop: 18 }]}>
          <View><Text style={s.mini}>Total Distance</Text><Text style={s.etaBig}>120 km</Text></View>
          <View><Text style={s.mini}>Est. Time</Text><Text style={s.etaBig}>2h 45m</Text></View>
          <View><Text style={s.mini}>Est. Fuel</Text><Text style={s.etaBig}>₹650</Text></View>
        </View>
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
            <Text style={{ color: C.orange, fontWeight: '700' }}>65%</Text>
          </View>
          <Row icon="📍" title="Live Location Sharing" value="Active" valueColor={C.green} />
          <Row icon="👤" title="Taal" onPress={() => go('emergency')} last />
        </View>
        <Pressable style={s.addBtn} onPress={() => go('emergency')}><Text style={{ color: C.blueLight }}>＋  Add Contact</Text></Pressable>

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
    const peers = [
      ["Rohit's Phone", '120 m', 'Strong', C.green],
      ["Anita's Phone", '200 m', 'Strong', C.green],
      ["Vikram's Phone", '250 m', 'Medium', C.yellow],
      ["Sneha's Phone", '400 m', 'Weak', C.red],
    ];
    return (
      <>
        <View style={s.comms}>
          <Text style={{ fontSize: 28 }}>📶</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.rowTitle}>Mesh Network</Text>
            <Text style={s.muted}>Connected</Text>
            <Text style={s.muted}>5 Peers Nearby</Text>
          </View>
          <Text style={{ fontSize: 24 }}>🛜</Text>
        </View>
        <View style={[s.group, { padding: 14, marginTop: 12 }]}>
          <Text style={s.rowTitle}>My Status</Text>
          <View style={[s.rowBetween, { marginTop: 8 }]}>
            <Text style={{ color: C.orange }}>● Online</Text>
            <Text style={s.white12}>Battery: 78%</Text>
          </View>
        </View>
        <Section>Nearby Peers</Section>
        <Group>
          {peers.map(([n, d, q, col], i) => (
            <Row key={n} icon="📍" title={`${n}  ·  ${d}`} value={q} valueColor={col} last={i === peers.length - 1} />
          ))}
        </Group>
        <Btn title="Broadcast Message" onPress={() => Alert.alert('Broadcast', 'Message sent to 5 nearby peers.')} />
      </>
    );
  }

  function renderNearby() {
    const cats = [['🏥', 'Hospitals'], ['⛽', 'Fuel'], ['🏨', 'Hotels'], ['🍴', 'Restaurants'], ['➕', 'Medical'], ['👮', 'Police'], ['🏧', 'ATM'], ['⋯', 'More']];
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
          {cats.map(([i, l]) => (
            <Pressable key={l} style={s.cat} onPress={() => Alert.alert(l, `Searching ${l.toLowerCase()} near you…`)}>
              <Text style={{ fontSize: 24 }}>{i}</Text>
              <Text style={s.mini}>{l}</Text>
            </Pressable>
          ))}
        </View>
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
    const rows: [string, string, string, string?][] = [
      ['🌐', 'Total Distance', '120 km'],
      ['⏱️', 'Estimated Time', '2h 45m'],
      ['⛽', 'Fuel Estimation', '₹650 (6.5 L)'],
      ['🛡️', 'Safety Score', '4.6 / 5', C.orange],
      ['🚦', 'Traffic Status', 'Moderate', C.orange],
      ['🛣️', 'Road Quality', 'Good', C.orange],
    ];
    return (
      <>
        <View style={s.tabs}>
          {['Overview', 'Steps', 'Traffic', 'Reviews'].map((t) => (
            <Pressable key={t} onPress={() => setRouteTab(t)} style={[s.tabBtn, routeTab === t && { borderBottomColor: C.blueLight }]}>
              <Text style={[s.white12, routeTab === t && { color: C.blueLight }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {routeTab === 'Overview' ? (
          <Group>{rows.map(([i, l, v, col], idx) => <Row key={l} icon={i} title={l} value={v} valueColor={col} last={idx === rows.length - 1} />)}</Group>
        ) : routeTab === 'Steps' ? (
          <Group>
            {['Head south on MG Road', 'Merge onto NH 275', 'Continue through Ramanagara', 'Pass Mandya bypass', 'Arrive at Mysuru'].map((t, i, a) => (
              <Row key={t} icon={`${i + 1}.`} title={t} last={i === a.length - 1} />
            ))}
          </Group>
        ) : routeTab === 'Traffic' ? (
          <Group>
            <Row icon="🟢" title="Bengaluru outskirts" value="Light" valueColor={C.green} />
            <Row icon="🟠" title="Ramanagara" value="Moderate" valueColor={C.orange} />
            <Row icon="🔴" title="Mandya bypass" value="Heavy" valueColor={C.red} last />
          </Group>
        ) : (
          <Group>
            <Row icon="★" title="Smooth highway, well lit" value="4.8" />
            <Row icon="★" title="Watch for potholes near Mandya" value="4.1" last />
          </Group>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Btn title="Save Route" outline onPress={saveRoute} disabled={loading} /></View>
          <View style={{ flex: 1 }}><Btn title="Download" onPress={() => go('offline')} /></View>
        </View>
      </>
    );
  }

  function renderProfile() {
    return (
      <>
        <View style={[s.center, { paddingVertical: 18 }]}>
          <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
          <Text style={[s.h1, { marginTop: 10 }]}>{displayName}</Text>
          <Text style={s.muted}>{user?.email ?? 'rohan.kumar@gmail.com'}</Text>
        </View>
        <Group>
          <Row icon="🚗" title="My Vehicle" value="KA 01 AB 1234" onPress={() => Alert.alert('My Vehicle', 'Edit vehicle details.')} />
          <Row icon="📞" title="Emergency Contacts" value="3 Contacts" onPress={() => go('emergency')} />
          <Row icon="📍" title="Saved Places" value="12 Places" onPress={() => Alert.alert('Saved Places', '12 saved places.')} />
          <Row icon="🕘" title="Route History" value="8 Trips" onPress={() => go('route')} />
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
    const reports = [
      { t: 'Hazards', n: 'Pothole', w: 'Hosur Road, Bengaluru', a: '2 min ago', i: '⚠️' },
      { t: 'Traffic', n: 'Traffic Jam', w: 'Nice Road, Bengaluru', a: '50 min ago', i: '🚗' },
      { t: 'Accidents', n: 'Accident', w: 'Mysuru Road', a: '25 min ago', i: '🚨' },
      { t: 'Hazards', n: 'Flooded Road', w: 'Mandya, Karnataka', a: '80 min ago', i: '🌊' },
    ].filter((r) => reportFilter === 'All' || r.t === reportFilter);
    return (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {['All', 'Hazards', 'Traffic', 'Accidents'].map((f) => <Chip key={f} label={f} active={reportFilter === f} onPress={() => setReportFilter(f)} />)}
        </ScrollView>
        {reports.map((r) => (
          <View key={r.n} style={s.report}>
            <Text style={{ fontSize: 30 }}>{r.i}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.rowTitle}>{r.n}</Text>
              <Text style={s.muted}>{r.w}</Text>
              <Text style={s.muted}>{r.a}</Text>
            </View>
            <Text style={{ color: C.red, fontSize: 18 }}>▲</Text>
          </View>
        ))}
        <Pressable style={s.fab} onPress={() => Alert.alert('Report', 'Report submitted to the community.')}>
          <Text style={s.btnText}>＋ Report</Text>
        </Pressable>
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
        <Text style={[s.white12, { textAlign: 'center', fontSize: 14, marginTop: 4 }]}>Fill only if you want to share{'\n'}during emergency</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
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
        <Btn title="Save" onPress={() => { Alert.alert('Saved', 'Emergency details updated.'); back(); }} />
      </>
    );
  }

  function content() {
    switch (screen) {
      case 'splash': return renderSplash();
      case 'login': return renderLogin();
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

  const showHeader = !['splash', 'login', 'home', 'accident', 'navigate', 'navigate2'].includes(screen);
  const showTabs = TAB_SCREENS.includes(screen);
  const activeTab: Screen =
    screen === 'navigate2' ? 'navigate' : screen === 'route' ? 'trip' : TABS.some((t) => t.key === screen) ? screen : 'home';
  const isDanger = screen === 'accident' || screen === 'sos';

  return (
    <View style={[s.outer, isDanger && { backgroundColor: '#1D1426' }]}>
    <SafeAreaView style={[s.safe, s.phone, isDanger && { backgroundColor: '#1D1426' }]}>
      <StatusBar barStyle="light-content" backgroundColor={isDanger ? '#1D1426' : C.bg} />
      {showHeader ? (
        <View style={s.header}>
          <Pressable onPress={back} hitSlop={12}><Text style={s.backArrow}>←</Text></Pressable>
          <Text style={s.headerTitle}>{TITLES[screen]}</Text>
          <View style={{ width: 24 }} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={[s.content, showTabs && { paddingBottom: 96 }]} keyboardShouldPersistTaps="handled">
        {content()}
      </ScrollView>
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

  shield: { fontSize: 84 },
  brand: { color: C.white, fontSize: 34, fontWeight: '700', marginTop: 12 },
  tagline: { color: C.white, fontSize: 18, textAlign: 'center', marginTop: 8, lineHeight: 26 },
  h1: { color: C.white, fontSize: 24, fontWeight: '700', marginTop: 8 },
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

  section: { color: C.white, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  group: { backgroundColor: C.panel, borderRadius: 11, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginTop: 12 },
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

  turn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 14 },
  turnArrow: { color: C.white, fontSize: 34 },
  turnTitle: { color: C.white, fontSize: 20, fontWeight: '500' },
  alertChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, alignSelf: 'flex-start', minWidth: 160 },
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

  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#4B4F6D' },
  avatarText: { color: C.white, fontSize: 32, fontWeight: '700' },

  countOuter: { width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(170,46,49,0.12)', alignItems: 'center', justifyContent: 'center', marginVertical: 30 },
  countInner: { width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: '#8A323E', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1822' },
  countText: { color: C.red, fontSize: 60, fontWeight: '500' },

  report: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 11, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 10 },
  fab: { alignSelf: 'flex-end', backgroundColor: '#6B44DB', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },

  segment: { flexDirection: 'row', backgroundColor: C.bg2, borderRadius: 8, marginTop: 10, padding: 3 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6 },
  skip: { backgroundColor: C.panel, borderRadius: 9, borderWidth: 1, borderColor: C.border, paddingHorizontal: 18, justifyContent: 'center' },

  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, backgroundColor: C.bg2, borderTopWidth: 1, borderTopColor: '#282D49', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  navItem: { alignItems: 'center', padding: 4 },
  navIconWrap: { width: 42, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navIcon: { color: C.muted, fontSize: 20 },
  navLabel: { color: C.muted, fontSize: 10, marginTop: 2 },
});

function MapMock(_props: { variant?: 1 | 2; hazards?: boolean }) {
  return <LiveMap apiUrl={API_URL} style={{ height: 420 }} />;
}