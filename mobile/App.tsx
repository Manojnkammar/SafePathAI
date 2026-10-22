import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const C = {
  bg: '#090D20',
  panel: '#151B32',
  panel2: '#202844',
  blue: '#5663F2',
  blueLight: '#8790FF',
  red: '#F04452',
  orange: '#FF9B57',
  green: '#48D6A0',
  white: '#F5F6FF',
  muted: '#A1A9C5',
  border: '#303955',
};

type Screen = 'splash' | 'login' | 'home' | 'navigate' | 'trip' | 'sos' | 'nearby' | 'profile' | 'settings';
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

const screens: { key: Screen; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'navigate', label: 'Map', icon: '⌖' },
  { key: 'trip', label: 'Trips', icon: '▣' },
  { key: 'sos', label: 'SOS', icon: '!' },
  { key: 'profile', label: 'Profile', icon: '○' },
];

function Button({ title, onPress, outline = false, danger = false, disabled = false }: {
  title: string;
  onPress: () => void;
  outline?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        outline && styles.buttonOutline,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function Card({ title, subtitle, icon = '◇', onPress }: {
  title: string;
  subtitle?: string;
  icon?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.cardIcon}>{icon}</Text>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Text style={styles.arrow}>›</Text> : null}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>{content}</Pressable>
  ) : <View style={styles.card}>{content}</View>;
}

function Field({ label, value, onChangeText, placeholder }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={C.muted}
        style={styles.input}
        autoCapitalize="none"
      />
    </View>
  );
}

function MapPanel({ hazards = false }: { hazards?: boolean }) {
  return (
    <View style={styles.map}>
      <View style={styles.roadOne} /><View style={styles.roadTwo} /><View style={styles.roadThree} />
      <View style={styles.routeLine} />
      <Text style={[styles.mapPin, { top: 42, left: '20%' }]}>●</Text>
      <Text style={[styles.mapPin, { top: 112, right: '18%' }]}>●</Text>
      <Text style={[styles.mapPin, { bottom: 56, left: '44%' }]}>▲</Text>
      {hazards ? <><Text style={[styles.hazard, { top: 78, left: '50%' }]}>!</Text><Text style={[styles.hazard, { top: 150, right: '18%' }]}>!</Text></> : null}
      <View style={styles.locationPill}><Text style={styles.smallText}>Current location</Text></View>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [user, setUser] = useState<User | null>(null);
  const [destination, setDestination] = useState('Mysuru, Karnataka');
  const [email, setEmail] = useState('rohan@example.com');
  const [name, setName] = useState('Rohan Kumar');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [routePreference, setRoutePreference] = useState('Safest');
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setScreen('login'), 900);
    return () => clearTimeout(timer);
  }, []);

  const title = useMemo(() => ({
    splash: 'SafePath AI', login: 'Welcome Back', home: 'SafePath AI', navigate: 'Navigation',
    trip: 'Trip Planner', sos: 'Emergency SOS', nearby: 'Nearby Services', profile: 'Profile', settings: 'Settings',
  }[screen]), [screen]);

  async function login() {
    setLoading(true);
    try {
      const existing = await api<User>(`/users/by-email?email=${encodeURIComponent(email)}`);
      setUser(existing);
    } catch {
      try {
        const created = await api<User>('/users', {
          method: 'POST',
          body: { email, display_name: name, phone_number: phone, auth_provider: 'mobile' },
        });
        setUser(created);
      } catch (error) {
        Alert.alert('Unable to connect', error instanceof Error ? error.message : 'Please try again.');
        return;
      }
    } finally {
      setLoading(false);
    }
    setScreen('home');
  }

  async function saveRoute() {
    if (!user) {
      setScreen('login');
      return;
    }
    setLoading(true);
    try {
      await api('/routes', {
        method: 'POST',
        body: {
          user_id: user.id,
          origin_name: 'Bengaluru, Karnataka',
          destination_name: destination,
          distance_km: 120,
          duration_minutes: 165,
          safety_score: routePreference === 'Safest' ? 4.8 : 4.1,
          route_type: routePreference.toLowerCase().replace(' ', '_'),
          provider: 'safepath',
          is_saved: true,
        },
      });
      Alert.alert('Route saved', `${destination} has been added to your trips.`);
    } catch (error) {
      Alert.alert('Could not save route', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function triggerSos() {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in before activating SOS.');
      return;
    }
    setLoading(true);
    try {
      await api('/sos', {
        method: 'POST',
        body: { user_id: user.id, latitude: 12.9716, longitude: 77.5946, trigger: 'manual', message: 'Emergency SOS activated from SafePath AI.' },
      });
      Alert.alert('SOS activated', 'Your emergency event has been sent to SafePath AI.');
    } catch (error) {
      Alert.alert('SOS could not be sent', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function content() {
    if (screen === 'splash') return <View style={styles.center}><Text style={styles.logo}>⬡</Text><Text style={styles.brand}>SafePath AI</Text><Text style={styles.subtitle}>Smart Emergency & Intelligent Navigation</Text><Text style={styles.muted}>Your Safety, Our Priority</Text></View>;
    if (screen === 'login') return (
      <View>
        <View style={styles.center}><Text style={styles.logo}>⬡</Text><Text style={styles.title}>Welcome Back!</Text><Text style={styles.muted}>Login to continue</Text></View>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
        <Field label="Phone" value={phone} onChangeText={setPhone} />
        <Button title={loading ? 'Connecting…' : 'Login'} onPress={login} disabled={loading} />
        <Button title="Continue as Guest" outline onPress={() => setScreen('home')} />
        <Text style={styles.note}>Your account is created securely through the SafePath AI API.</Text>
      </View>
    );
    if (screen === 'home') return (
      <>
        <Text style={styles.greeting}>Hello, {user?.display_name ?? name} 👋</Text><Text style={styles.muted}>Drive Safe, Stay Safe</Text>
        <Pressable style={styles.searchBox} onPress={() => setScreen('navigate')}><Text style={styles.muted}>⌕  Where do you want to go?</Text></Pressable>
        <View style={styles.hero}><Text style={styles.heroTitle}>AI Safety Recommendation</Text><Text style={styles.heroSubtitle}>A safer route is available for your journey.</Text><Button title="Explore Route" onPress={() => setScreen('navigate')} /></View>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>{[['⌖', 'Navigation', 'navigate'], ['▣', 'Trip Planner', 'trip'], ['♧', 'Nearby Services', 'nearby'], ['◉', 'Emergency SOS', 'sos']].map(([icon, label, target]) => <Pressable key={label} style={styles.quickItem} onPress={() => setScreen(target as Screen)}><Text style={styles.quickIcon}>{icon}</Text><Text style={styles.quickLabel}>{label}</Text></Pressable>)}</View>
        <Card title="Emergency SOS" subtitle="Tap to access emergency assistance" icon="🆘" onPress={() => setScreen('sos')} />
        <Card title="Recent Trips" subtitle="Bengaluru → Mysuru" icon="🚗" onPress={() => setScreen('trip')} />
        <Card title="Community Reports" subtitle="Check nearby hazards" icon="⚠" onPress={() => setScreen('navigate')} />
      </>
    );
    if (screen === 'navigate') return (
      <>
        <Field label="Destination" value={destination} onChangeText={setDestination} /><MapPanel />
        <View style={styles.statsRow}><View style={styles.stat}><Text style={styles.statValue}>2h 45m</Text><Text style={styles.muted}>Estimated time</Text></View><View style={styles.stat}><Text style={styles.statValue}>120 km</Text><Text style={styles.muted}>Distance</Text></View></View>
        <Button title="Save Safe Route" onPress={saveRoute} disabled={loading} /><Button title="Show Road Hazards" outline onPress={() => Alert.alert('Road alerts', 'Accident reported 160 m ahead. Drive carefully.')} /><Button title="Trip Planner" outline onPress={() => setScreen('trip')} />
      </>
    );
    if (screen === 'trip') return (
      <>
        <Text style={styles.sectionTitle}>Plan Your Trip</Text><Field label="Starting Point" value="Bengaluru, Karnataka" onChangeText={() => {}} /><Field label="Destination" value={destination} onChangeText={setDestination} />
        <Text style={styles.label}>Vehicle Type</Text><View style={styles.chipRow}>{['Bike', 'Car', 'EV', 'Bus'].map((item) => <Pressable key={item} style={[styles.chip, item === 'Car' && styles.selectedChip]}><Text style={styles.whiteText}>{item}</Text></Pressable>)}</View>
        <Text style={styles.label}>Route Preference</Text><View style={styles.chipRow}>{['Best', 'Safest', 'Fuel Saver'].map((item) => <Pressable key={item} onPress={() => setRoutePreference(item)} style={[styles.chip, routePreference === item && styles.selectedChip]}><Text style={styles.whiteText}>{item}</Text></Pressable>)}</View>
        <Button title="Generate & Save Route" onPress={saveRoute} disabled={loading} /><Card title="120 km  ·  2h 45m" subtitle="Estimated fuel ₹650 · safest available route" icon="✓" />
      </>
    );
    if (screen === 'sos') return (
      <>
        <Pressable onPress={triggerSos} style={styles.sos}><Text style={styles.sosText}>SOS</Text><Text style={styles.smallText}>Tap to Activate</Text></Pressable><Text style={styles.centerMuted}>Share live location and alert your contacts</Text>
        <Card title="Battery Level" subtitle="65% · Live location sharing ready" icon="⌁" /><Card title="Emergency Contacts" subtitle="Add trusted people to receive alerts" icon="☎" /><Button title={loading ? 'Sending…' : 'Activate Emergency SOS'} danger onPress={triggerSos} disabled={loading} />
      </>
    );
    if (screen === 'nearby') return <><Field label="Search" value="" onChangeText={() => {}} placeholder="Search nearby services" /><View style={styles.serviceGrid}>{['Hospitals', 'Fuel', 'Hotels', 'Restaurants', 'Police', 'ATM'].map((item) => <View key={item} style={styles.service}><Text style={styles.serviceIcon}>●</Text><Text style={styles.smallText}>{item}</Text></View>)}</View><Card title="Green Leaf Restaurant" subtitle="Veg · 0.6 km · ★ 4.2" icon="⌖" /><Card title="City Care Hospital" subtitle="Emergency care · 1.2 km" icon="✚" /></>;
    if (screen === 'settings') return <><Card title="Dark mode" subtitle="Keep the SafePath dark theme" icon="☾" onPress={() => setDarkMode(!darkMode)} /><Card title="API connection" subtitle={API_URL} icon="⌁" /><Button title="Sign out" outline onPress={() => { setUser(null); setScreen('login'); }} /></>;
    return <><View style={styles.profile}><Text style={styles.avatar}>RK</Text><Text style={styles.title}>{user?.display_name ?? name}</Text><Text style={styles.muted}>{user?.email ?? email}</Text></View><Card title="Saved routes" subtitle="Your safest journeys" icon="☆" onPress={() => setScreen('trip')} /><Card title="Settings" subtitle="Preferences and account" icon="⚙" onPress={() => setScreen('settings')} /><Card title="Emergency contacts" subtitle="Manage trusted contacts" icon="☎" onPress={() => setScreen('sos')} /></>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {screen !== 'splash' && screen !== 'login' ? <View style={styles.header}><Text style={styles.headerTitle}>{title}</Text><Text style={styles.headerSubtitle}>SafePath AI</Text></View> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{content()}</ScrollView>
      {screen !== 'splash' && screen !== 'login' ? <View style={styles.bottomNav}>{screens.map((item) => <Pressable key={item.key} onPress={() => setScreen(item.key)} style={styles.navItem}><Text style={[styles.navIcon, screen === item.key && styles.active]}>{item.icon}</Text><Text style={[styles.navLabel, screen === item.key && styles.active]}>{item.label}</Text></Pressable>)}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 18, paddingBottom: 90 }, center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 42 },
  logo: { color: C.blueLight, fontSize: 64 }, brand: { color: C.white, fontSize: 30, fontWeight: '700', marginTop: 12 }, title: { color: C.white, fontSize: 21, fontWeight: '700' },
  subtitle: { color: C.white, fontSize: 14, textAlign: 'center', marginTop: 8 }, muted: { color: C.muted, fontSize: 12, marginTop: 4 }, centerMuted: { color: C.muted, fontSize: 12, textAlign: 'center', marginVertical: 18 },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: C.border }, headerTitle: { color: C.white, fontSize: 19, fontWeight: '700' }, headerSubtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  greeting: { color: C.white, fontSize: 18, fontWeight: '600' }, searchBox: { backgroundColor: C.panel, borderRadius: 10, padding: 15, marginTop: 18, borderWidth: 1, borderColor: C.border },
  hero: { backgroundColor: C.blue, borderRadius: 14, padding: 16, marginTop: 14 }, heroTitle: { color: C.white, fontSize: 16, fontWeight: '700' }, heroSubtitle: { color: '#DDE0FF', marginVertical: 6, fontSize: 12 },
  button: { backgroundColor: C.blue, borderRadius: 9, minHeight: 46, justifyContent: 'center', alignItems: 'center', marginTop: 14 }, buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border }, buttonDanger: { backgroundColor: C.red }, buttonDisabled: { opacity: 0.5 }, buttonText: { color: C.white, fontWeight: '700', fontSize: 13 }, pressed: { opacity: 0.75 },
  fieldWrap: { marginTop: 14 }, label: { color: C.muted, fontSize: 11, marginBottom: 6 }, input: { backgroundColor: C.panel, color: C.white, borderColor: C.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 13, minHeight: 46, fontSize: 13 },
  sectionTitle: { color: C.white, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quickItem: { width: '47%', backgroundColor: C.panel, padding: 14, borderRadius: 11, alignItems: 'center' }, quickIcon: { color: C.blueLight, fontSize: 26 }, quickLabel: { color: C.white, fontSize: 12, marginTop: 6 },
  card: { backgroundColor: C.panel, borderRadius: 11, padding: 14, marginTop: 10, flexDirection: 'row', alignItems: 'center' }, cardIcon: { color: C.orange, fontSize: 22, width: 34, textAlign: 'center' }, cardBody: { flex: 1, marginLeft: 10 }, cardTitle: { color: C.white, fontSize: 13, fontWeight: '600' }, arrow: { color: C.muted, fontSize: 24 }, note: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 20 },
  map: { height: 290, backgroundColor: '#1A2544', borderRadius: 14, marginTop: 16, overflow: 'hidden', position: 'relative' }, roadOne: { position: 'absolute', width: 500, height: 12, backgroundColor: '#2A385B', transform: [{ rotate: '35deg' }], top: 100, left: -100 }, roadTwo: { position: 'absolute', width: 500, height: 8, backgroundColor: '#2A385B', transform: [{ rotate: '-28deg' }], top: 170, left: -90 }, roadThree: { position: 'absolute', width: 500, height: 6, backgroundColor: '#2A385B', transform: [{ rotate: '72deg' }], top: 90, left: -100 }, routeLine: { position: 'absolute', width: 210, height: 6, backgroundColor: C.blueLight, transform: [{ rotate: '-28deg' }], top: 145, left: 25, borderRadius: 4 }, mapPin: { position: 'absolute', color: C.red, fontSize: 18 }, hazard: { position: 'absolute', backgroundColor: C.red, color: C.white, borderRadius: 12, width: 24, height: 24, textAlign: 'center', paddingTop: 3, fontWeight: '700' }, locationPill: { position: 'absolute', bottom: 12, left: 12, backgroundColor: C.bg, padding: 8, borderRadius: 8 }, smallText: { color: C.white, fontSize: 10 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 }, stat: { flex: 1, backgroundColor: C.panel, padding: 14, borderRadius: 10 }, statValue: { color: C.white, fontWeight: '700', fontSize: 17 }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }, chip: { backgroundColor: C.panel, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 15 }, selectedChip: { backgroundColor: C.blue }, whiteText: { color: C.white, fontSize: 12 },
  sos: { width: 180, height: 180, borderRadius: 90, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 25, borderWidth: 18, borderColor: '#6B293C' }, sosText: { color: C.white, fontWeight: '800', fontSize: 34 }, serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 18 }, service: { width: '30%', alignItems: 'center', padding: 10, backgroundColor: C.panel, borderRadius: 10 }, serviceIcon: { color: C.orange, fontSize: 22, marginBottom: 6 }, profile: { alignItems: 'center', paddingVertical: 25 }, avatar: { backgroundColor: C.blue, color: C.white, width: 76, height: 76, borderRadius: 38, textAlign: 'center', paddingTop: 23, fontSize: 24, fontWeight: '700', overflow: 'hidden' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, navItem: { alignItems: 'center', padding: 6 }, navIcon: { color: C.muted, fontSize: 22 }, navLabel: { color: C.muted, fontSize: 10, marginTop: 2 }, active: { color: C.blueLight },
});
