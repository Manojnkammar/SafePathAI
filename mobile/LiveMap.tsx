import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Navigation, Volume2, VolumeX } from 'lucide-react-native';
import { ActivityIndicator, Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { WebView } from 'react-native-webview';

type Pt = { lat: number; lng: number };
type Hazard = { id: string; incident_type: string; severity: string; lat: number; lng: number; radius_m: number };
type RouteStep = { instruction: string; distance_m: number; location: Pt; modifier?: string };
type RawRoute = { points: Pt[]; distance_m: number; duration_s: number; steps: RouteStep[] };
type DisplayRoute = RawRoute & { safety: number; hit: string[]; label: string; color: string };
type PlaceResult = { lat: number; lng: number; name: string };
export type NearbyPlace = { lat: number; lng: number; name: string; distance_m: number; category: string };

function formatRouteStep(step: any, coordinates: Pt[]): RouteStep[] {
  const modifier = typeof step.maneuver?.modifier === 'string' ? step.maneuver.modifier : undefined;
  const roadName = typeof step.name === 'string' && step.name ? ` onto ${step.name}` : '';
  const maneuverType = step.maneuver?.type;
  let instruction: string;

  if (maneuverType === 'arrive') instruction = 'You have arrived at your destination';
  else if (maneuverType === 'depart') instruction = `Head ${modifier ?? 'straight'}${roadName}`;
  else if (maneuverType === 'roundabout' || maneuverType === 'rotary') instruction = `Enter the roundabout${roadName}`;
  else if (maneuverType === 'merge' || maneuverType === 'on ramp' || maneuverType === 'off ramp') instruction = `${maneuverType}${modifier ? ` ${modifier}` : ''}${roadName}`;
  else if (maneuverType === 'continue' || maneuverType === 'new name') instruction = `Continue ${modifier ?? 'straight'}${roadName}`;
  else if (maneuverType === 'fork' || maneuverType === 'end of road') instruction = `Keep ${modifier ?? 'straight'}${roadName}`;
  else if (maneuverType === 'turn') instruction = `Turn ${modifier ?? 'ahead'}${roadName}`;
  else instruction = `Continue${roadName}`;

  const maneuverLocation = step.maneuver?.location;
  const location = Array.isArray(maneuverLocation) && maneuverLocation.length >= 2
    ? { lat: Number(maneuverLocation[1]), lng: Number(maneuverLocation[0]) }
    : coordinates[0];
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
  return [{
    instruction: instruction.charAt(0).toUpperCase() + instruction.slice(1),
    distance_m: Number(step.distance) || 0,
    location,
    modifier,
  }];
}

function NextDirectionCard({ instruction, distance, modifier }: { instruction: string; distance: string; modifier?: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;
  const DirectionIcon = modifier?.includes('left')
    ? ArrowLeft
    : modifier?.includes('right')
      ? ArrowRight
      : modifier === 'uturn'
        ? ArrowDown
        : Navigation;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(-10);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [distance, instruction, opacity, translateY]);

  return (
    <Animated.View style={[st.directionCard, { opacity, transform: [{ translateY }] }]}>
      <DirectionIcon color="#fff" size={23} strokeWidth={2.5} />
      <View style={st.directionTextWrap}>
        <Text style={st.directionInstruction} numberOfLines={1}>{instruction}</Text>
        <Text style={st.directionDistance} numberOfLines={1}>{distance}</Text>
      </View>
    </Animated.View>
  );
}

function isBackendPlace(value: unknown): value is PlaceResult {
  if (!value || typeof value !== 'object') return false;
  return 'lat' in value
    && typeof value.lat === 'number'
    && 'lng' in value
    && typeof value.lng === 'number'
    && 'name' in value
    && typeof value.name === 'string';
}

function isNominatimPlace(value: unknown): value is { lat: string; lon: string; display_name: string } {
  if (!value || typeof value !== 'object') return false;
  return 'lat' in value
    && typeof value.lat === 'string'
    && 'lon' in value
    && typeof value.lon === 'string'
    && 'display_name' in value
    && typeof value.display_name === 'string';
}

export type PlannedRoute = {
  points: Pt[];
  distanceM: number;
  durationS: number;
};

export type RouteSummary = {
  distanceM: number;
  durationS: number;
};

type Props = {
  apiUrl: string;
  style?: ViewStyle;
  dark?: boolean;
  initialCenter?: Pt;
  destination?: Pt | null;
  onDestinationChange?: (p: Pt, name?: string) => void;
  onRouteSummary?: (summary: RouteSummary | null) => void;
  showSearch?: boolean;
  showRoutePanel?: boolean;
  routePanelBottomInset?: number;
  mapControlsBottomInset?: number;
  plannedRoutes?: PlannedRoute[];
  plannedWaypoints?: Pt[];
  selectedRouteIndex?: number;
  nearbyPlaces?: NearbyPlace[];
};

const BENGALURU: Pt = { lat: 12.9716, lng: 77.5946 };

/* ---------- geometry helpers ---------- */
function hav(a: Pt, b: Pt) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function analyse(points: Pt[], hazards: Hazard[]) {
  let total = 0;
  let exposed = 0;
  const hit = new Set<string>();
  for (let i = 1; i < points.length; i++) {
    const seg = hav(points[i - 1], points[i]);
    total += seg;
    const mid = { lat: (points[i - 1].lat + points[i].lat) / 2, lng: (points[i - 1].lng + points[i].lng) / 2 };
    let inside = false;
    for (const h of hazards) {
      if (hav(mid, h) < h.radius_m) {
        inside = true;
        hit.add(h.incident_type + ' (' + h.severity + ')');
      }
    }
    if (inside) exposed += seg;
  }
  return { total, exposed, hit: Array.from(hit) };
}

const fmtDur = (s: number) =>
  s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min' : Math.max(1, Math.round(s / 60)) + ' min';
const fmtDist = (m: number) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
const ROUTE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b'];

function normalized(value: number, values: number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return high === low ? 0 : (value - low) / (high - low);
}

function rankAlternatives(raw: RawRoute[], hazards: Hazard[]): DisplayRoute[] {
  const analysed = raw.map((route) => {
    const analysis = analyse(route.points, hazards);
    const safety = analysis.total ? Math.round(100 * (1 - analysis.exposed / analysis.total)) : 100;
    return { ...route, safety, hit: analysis.hit };
  });
  if (!analysed.length) return [];

  const distances = analysed.map((route) => route.distance_m);
  const durations = analysed.map((route) => route.duration_s);
  const suitability = analysed.map((route) => (
    0.45 * (route.safety / 100)
    + 0.30 * (1 - normalized(route.duration_s, durations))
    + 0.25 * (1 - normalized(route.distance_m, distances))
  ));
  const shortest = distances.indexOf(Math.min(...distances));
  const longest = distances.lastIndexOf(Math.max(...distances));
  const best = suitability.indexOf(Math.max(...suitability));
  const order: number[] = [];
  for (const index of [shortest, best, longest, ...suitability.map((_, index) => index).sort((a, b) => suitability[b] - suitability[a])]) {
    if (!order.includes(index)) order.push(index);
  }

  return order.slice(0, 3).map((index, displayIndex) => ({
    ...analysed[index],
    label: ['Shortest', 'Best', 'Longest'][displayIndex] ?? `Alternative ${displayIndex + 1}`,
    color: ROUTE_COLORS[displayIndex] ?? '#94a3b8',
  }));
}

/* ---------- route sources ---------- */
async function osrmRoutes(a: Pt, b: Pt): Promise<RawRoute[]> {
  const url =
    'https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat +
    '?overview=full&geometries=geojson&alternatives=3&steps=true';
  const r = await fetch(url);
  if (!r.ok) throw new Error('osrm');
  const j = await r.json();
  if (j.code !== 'Ok' || !Array.isArray(j.routes) || j.routes.length === 0) {
    throw new Error('OSRM returned no routes');
  }
  return j.routes.map((x: any) => {
    const points: Pt[] = x.geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] }));
    const steps: RouteStep[] = (x.legs ?? []).flatMap((leg: any) => (
      (leg.steps ?? []).flatMap((step: any) => formatRouteStep(step, points))
    ));
    return {
      points,
      distance_m: x.distance,
      duration_s: x.duration,
      steps,
    };
  });
}

async function backendRoutes(apiUrl: string, a: Pt, b: Pt): Promise<RawRoute[]> {
  const r = await fetch(apiUrl + '/routes/safe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: a, destination: b, k: 3 }),
  });
  if (!r.ok) throw new Error('backend');
  const j = await r.json();
  if (!Array.isArray(j.routes)) throw new Error('Invalid routes response from backend');

  return j.routes.map((x: any) => {
    const points: Pt[] = Array.isArray(x.points)
      ? x.points.map((p: any) => {
          // Accept either {lat, lng} objects or [lat, lng] coordinate pairs.
          if (Array.isArray(p)) return { lat: Number(p[0]), lng: Number(p[1]) };
          return { lat: Number(p.lat), lng: Number(p.lng) };
        })
      : [];

    if (points.length < 2) throw new Error('Backend route has insufficient points');

    return {
      points,
      distance_m: Number(x.distance_m ?? 0),
      duration_s: Number(x.eta_s ?? x.duration_s ?? 0),
      steps: [],
    };
  });
}

function addRoadDurations(routes: RawRoute[], roadRoutes: RawRoute[]): RawRoute[] {
  const fastestRoadDuration = roadRoutes.reduce(
    (fastest, route) => Math.min(fastest, route.duration_s),
    Number.POSITIVE_INFINITY,
  );
  const shortestDijkstraDistance = routes.reduce(
    (shortest, route) => Math.min(shortest, route.distance_m),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(fastestRoadDuration) || !Number.isFinite(shortestDijkstraDistance) || shortestDijkstraDistance <= 0) {
    return routes;
  }
  return routes.map((route) => ({
    ...route,
    // Keep Dijkstra's hazard-aware distance, but calibrate ETA with a real road estimate.
    duration_s: fastestRoadDuration * Math.max(1, route.distance_m / shortestDijkstraDistance),
  }));
}

async function searchPlaces(apiUrl: string, query: string): Promise<PlaceResult[]> {
  let backendError: unknown;
  try {
    const response = await fetch(`${apiUrl}/routes/places/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`Place search failed (${response.status}).`);
    const results: unknown = await response.json();
    if (!Array.isArray(results)) throw new Error('Place search returned an invalid response.');
    const places = results.filter(isBackendPlace);
    if (places.length) return places;
  } catch (error) {
    backendError = error;
  }

  try {
    const response = await fetch(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q='
        + encodeURIComponent(query),
      { headers: { 'Accept-Language': 'en' } },
    );
    if (!response.ok) throw new Error(`Place search failed (${response.status}).`);
    const results: unknown = await response.json();
    if (!Array.isArray(results)) throw new Error('Place search returned an invalid response.');
    return results
      .filter(isNominatimPlace)
      .map((place) => ({
        lat: Number(place.lat),
        lng: Number(place.lon),
        name: place.display_name.split(',').slice(0, 2).join(',').trim(),
      }))
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Place search is unavailable.';
    if (backendError instanceof Error) {
      throw new Error(`${reason} Backend search: ${backendError.message}`);
    }
    throw error;
  }
}

/* ---------- the map page (Leaflet + OpenStreetMap data) ---------- */
function buildHtml(dark: boolean) {
  const tile = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
html,body,#map{height:100%;margin:0;background:#0b1220}
.leaflet-container{font-family:-apple-system,Roboto,sans-serif}
.leaflet-bottom.leaflet-left{bottom:112px;left:10px}
.me{width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.3)}
.pin{width:22px;height:22px;border-radius:50% 50% 50% 0;background:#ef4444;border:2px solid #fff;transform:rotate(-45deg)}
.waypoint{width:26px;height:26px;border-radius:13px;background:#16a34a;border:2px solid #fff;color:#fff;font-weight:700;font-size:12px;line-height:22px;text-align:center;box-shadow:0 1px 5px #000}
.nearby{width:24px;height:24px;border-radius:50%;background:#f59e0b;border:2px solid #fff;color:#111827;font-weight:700;font-size:14px;line-height:20px;text-align:center;box-shadow:0 1px 5px #000}
</style></head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false,zoomAnimation:true}).setView([12.9716,77.5946],13);
L.control.zoom({position:'bottomleft'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:'abcd',attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
var layer=L.layerGroup().addTo(map),userMk=null,startMk=null,centered=false,lastFocus=0,lastKey='';
var COLORS={low:'#facc15',medium:'#fb923c',high:'#ef4444',critical:'#b91c1c'};
function post(o){var s=JSON.stringify(o);
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}
  else if(window.parent!==window){window.parent.postMessage(s,'*');}}
map.on('click',function(e){post({type:'tap',lat:e.latlng.lat,lng:e.latlng.lng});});
window.__update=function(s){
  layer.clearLayers();
  (s.hazards||[]).forEach(function(h){
    var c=COLORS[h.severity]||'#ef4444';
    L.circle([h.lat,h.lng],{radius:h.radius_m,color:c,weight:2,fillColor:c,fillOpacity:.2})
      .bindPopup('<b>'+h.incident_type+'</b><br>Severity: '+h.severity).addTo(layer);
    L.circleMarker([h.lat,h.lng],{radius:6,color:'#fff',weight:2,fillColor:c,fillOpacity:1}).addTo(layer);
  });
  var routes=s.routes||[],bounds=null;
  routes.forEach(function(r,i){
    if(i===s.sel)return;
    L.polyline(r.points,{color:r.color||'#94a3b8',weight:5,opacity:.65}).addTo(layer);
  });
  if(routes[s.sel]){
    var pl=L.polyline(routes[s.sel].points,{color:routes[s.sel].color||'#3b82f6',weight:7,opacity:1}).addTo(layer);
    bounds=pl.getBounds();
  }
  if(s.dest&&!(s.waypoints||[]).length){
    L.marker([s.dest.lat,s.dest.lng],{icon:L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[22,22],iconAnchor:[11,22]})}).addTo(layer);
  }
  (s.nearbyPlaces||[]).forEach(function(p){
    L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="nearby">+</div>',iconSize:[24,24],iconAnchor:[12,12]})})
      .bindPopup('<b>'+p.name+'</b><br>'+Math.round(p.distance_m)+' m away').addTo(layer);
  });
  (s.waypoints||[]).forEach(function(p,i){
    var label=i===0?'A':i===s.waypoints.length-1?'B':String(i);
    L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="waypoint">'+label+'</div>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(layer);
  });
  if(s.user){
    if(userMk){userMk.setLatLng([s.user.lat,s.user.lng]);}
    else{userMk=L.marker([s.user.lat,s.user.lng],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[18,18]})}).addTo(map);}
    if(!centered){
      if(!(s.waypoints||[]).length){map.setView([s.user.lat,s.user.lng],14);}
      centered=true;
    }
  }
  if(s.start){
    if(startMk){startMk.setLatLng([s.start.lat,s.start.lng]);}
    else{startMk=L.marker([s.start.lat,s.start.lng],{icon:L.divIcon({className:'',html:'<div class="waypoint">A</div>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map);}
  }
  var selected=routes[s.sel],start=selected&&selected.points[0],end=selected&&selected.points[selected.points.length-1];
  var key=routes.length+':'+s.sel+':'+(selected?selected.points.length:0)+':'+(start?start.join(','):'')+':'+(end?end.join(','):'');
  if(bounds&&key!==lastKey){map.fitBounds(bounds,{padding:[50,50]});}
  lastKey=key;
  if(s.focus!==lastFocus){lastFocus=s.focus;if(s.user){map.setView([s.user.lat,s.user.lng],16);}}
};
function onMsg(e){try{window.__update(JSON.parse(e.data));}catch(x){}}
window.addEventListener('message',onMsg);
document.addEventListener('message',onMsg);
</script></body></html>`;
}

/* ---------- component ---------- */
export default function LiveMap({
  apiUrl,
  style,
  dark = true,
  initialCenter = BENGALURU,
  destination = null,
  onDestinationChange,
  onRouteSummary,
  showSearch = true,
  showRoutePanel = true,
  routePanelBottomInset = 10,
  mapControlsBottomInset,
  plannedRoutes,
  plannedWaypoints = [],
  selectedRouteIndex = 0,
  nearbyPlaces = [],
}: Props) {
  const html = useMemo(() => buildHtml(dark), [dark]);
  const webRef = useRef<any>(null);
  const frameRef = useRef<any>(null);
  const cbRef = useRef(onDestinationChange);
  cbRef.current = onDestinationChange;

  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [user, setUser] = useState<Pt | null>(null);
  const [navigationPosition, setNavigationPosition] = useState<Pt | null>(null);
  const [voiceAlertsEnabled, setVoiceAlertsEnabled] = useState(false);
  const hazardsRef = useRef(hazards);
  const destinationRef = useRef(destination);
  const voiceAlertsEnabledRef = useRef(voiceAlertsEnabled);
  const announcedHazardsRef = useRef(new Set<string>());
  const announcedDestinationRef = useRef<string | null>(null);
  hazardsRef.current = hazards;
  voiceAlertsEnabledRef.current = voiceAlertsEnabled;
  const [startMode, setStartMode] = useState<'current' | 'custom'>('current');
  const [startSelected, setStartSelected] = useState(false);
  const [startPlace, setStartPlace] = useState<PlaceResult | null>(null);
  const [startQuery, setStartQuery] = useState('');
  const [startSearching, setStartSearching] = useState(false);
  const [dest, setDest] = useState<Pt | null>(destination);
  destinationRef.current = dest;
  const [destName, setDestName] = useState('');
  const [raw, setRaw] = useState<RawRoute[]>([]);
  const [sel, setSel] = useState(0);
  const [focus, setFocus] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [routePanelDismissed, setRoutePanelDismissed] = useState(false);

  const origin = !startSelected
    ? null
    : startMode === 'custom'
      ? startPlace
      : user;
  const originKey = origin ? origin.lat.toFixed(4) + ',' + origin.lng.toFixed(4) : 'unset';

  useEffect(() => {
    if (destination) {
      setDest(destination);
      setRoutePanelDismissed(false);
    }
  }, [destination?.lat, destination?.lng]);

  useEffect(() => {
    announcedHazardsRef.current.clear();
    announcedDestinationRef.current = null;
  }, [destination?.lat, destination?.lng]);

  /* GPS */
  useEffect(() => {
    (async () => {
      try {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== 'granted') {
          Alert.alert('Location permission required', 'Choose a starting point manually or allow location access to use your current location.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        setUser({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch (error) {
        Alert.alert(
          'Current location unavailable',
          error instanceof Error ? `${error.message} Choose a starting point manually.` : 'Choose a starting point manually.',
        );
      }
    })();
  }, []);

  /* live hazards from the backend */
  const loadHazards = useCallback(async () => {
    try {
      const r = await fetch(apiUrl + '/hazards/active');
      if (r.ok) setHazards(await r.json());
    } catch {
      /* backend offline: keep the last known hazards */
    }
  }, [apiUrl]);
  useEffect(() => {
    loadHazards();
    const id = setInterval(loadHazards, 15000);
    return () => clearInterval(id);
  }, [loadHazards]);

  useEffect(() => {
    if (!voiceAlertsEnabled) {
      void Speech.stop();
      return;
    }

    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    const announce = (message: string) => {
      if (!voiceAlertsEnabledRef.current) return;
      void Speech.speak(message, { language: 'en-IN', rate: 0.95 });
    };

    async function startVoiceAlerts() {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!active) return;
        if (permission.status !== 'granted') {
          setVoiceAlertsEnabled(false);
          Alert.alert('Location permission required', 'Allow location access to enable spoken navigation alerts.');
          return;
        }
        announce(destinationRef.current ? 'Voice alerts enabled.' : 'Voice alerts enabled. Select a destination to begin.');
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 25,
          },
          ({ coords }) => {
            if (!active || !voiceAlertsEnabledRef.current) return;
            const position = { lat: coords.latitude, lng: coords.longitude };
            setUser(position);

            const currentDestination = destinationRef.current;
            if (currentDestination && hav(position, currentDestination) <= 150) {
              const destinationKey = `${currentDestination.lat.toFixed(5)},${currentDestination.lng.toFixed(5)}`;
              if (announcedDestinationRef.current !== destinationKey) {
                announcedDestinationRef.current = destinationKey;
                announce('You are approaching your destination.');
              }
            }

            const nearbyHazard = hazardsRef.current.find((hazard) => (
              hav(position, hazard) <= Math.max(150, hazard.radius_m + 75)
              && !announcedHazardsRef.current.has(hazard.id)
            ));
            if (nearbyHazard) {
              announcedHazardsRef.current.add(nearbyHazard.id);
              announce(`Caution. ${nearbyHazard.severity} ${nearbyHazard.incident_type} reported nearby.`);
            }
          },
        );
        if (!active) subscription.remove();
      } catch (error) {
        if (!active) return;
        setVoiceAlertsEnabled(false);
        Alert.alert(
          'Voice alerts unavailable',
          error instanceof Error ? error.message : 'Could not start location updates for navigation alerts.',
        );
      }
    }

    void startVoiceAlerts();
    return () => {
      active = false;
      subscription?.remove();
      void Speech.stop();
    };
  }, [voiceAlertsEnabled]);

  /* fetch road routes when the destination changes */
  useEffect(() => {
    if (!dest || (!origin && plannedRoutes === undefined)) {
      setRaw([]);
      return;
    }
    if (plannedRoutes !== undefined) {
      setRaw(plannedRoutes.map((route) => ({
        points: route.points,
        distance_m: route.distanceM,
        duration_s: route.durationS,
        steps: [],
      })));
      setSel(selectedRouteIndex);
      setError('');
      setBusy(false);
      return;
    }
    if (!origin) {
      setRaw([]);
      return;
    }
    const routeOrigin = origin;
    let cancel = false;
    setBusy(true);
    setError('');
    (async () => {
      try {
        let r: RawRoute[];
        try {
          r = await osrmRoutes(routeOrigin, dest);
        } catch {
          if (!cancel) {
            setRaw([]);
            setError('Accurate road routing is unavailable. Please check your connection and try again.');
          }
          return;
        }
        if (!cancel) {
          setRaw(r);
          setSel(0);
        }
      } catch {
        if (!cancel) {
          setRaw([]);
          setError('Could not compute a route.');
        }
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [dest?.lat, dest?.lng, originKey, apiUrl, plannedRoutes, selectedRouteIndex]);

  /* score every route against the active hazards; safest first */
  const routes = useMemo(() => {
    if (plannedRoutes === undefined) return rankAlternatives(raw, hazards);
    return raw.map((route, index) => {
      const analysis = analyse(route.points, hazards);
      return {
        ...route,
        safety: analysis.total ? Math.round(100 * (1 - analysis.exposed / analysis.total)) : 100,
        hit: analysis.hit,
        label: index === 0 ? 'Best' : `Alternative ${index}`,
        color: ROUTE_COLORS[index] ?? '#94a3b8',
      };
    });
  }, [raw, hazards, plannedRoutes]);
  const displayedRoutes = useMemo(() => routes, [routes]);
  const cur = Math.min(plannedRoutes === undefined ? sel : selectedRouteIndex, Math.max(0, displayedRoutes.length - 1));
  const chosen = displayedRoutes[cur];
  const chosenSteps = chosen?.steps;

  useEffect(() => {
    if (!dest || !chosenSteps?.length || Platform.OS === 'web') {
      setNavigationPosition(user);
      return;
    }

    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
      ({ coords }) => {
        if (active) setNavigationPosition({ lat: coords.latitude, lng: coords.longitude });
      },
    ).then((watcher) => {
      if (active) subscription = watcher;
      else watcher.remove();
    }).catch((error: unknown) => {
      if (!active) return;
      setNavigationPosition(user);
      Alert.alert(
        'Live directions unavailable',
        error instanceof Error ? error.message : 'Could not track your location for upcoming directions.',
      );
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [chosenSteps, dest?.lat, dest?.lng, user]);

  const nextDirection = useMemo(() => {
    if (!chosenSteps?.length) {
      return { instruction: 'Follow the highlighted route', distance: 'Turn-by-turn guidance unavailable', modifier: undefined };
    }
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    if (navigationPosition) {
      chosenSteps.forEach((step, index) => {
        const distance = hav(navigationPosition, step.location);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
    } else {
      const departureIndex = chosenSteps.findIndex((step) => !step.instruction.startsWith('Head '));
      if (departureIndex >= 0) closestIndex = departureIndex;
    }

    if (navigationPosition && closestDistance <= 40 && closestIndex < chosenSteps.length - 1) {
      closestIndex += 1;
    }
    const step = chosenSteps[closestIndex];
    const distance = navigationPosition ? hav(navigationPosition, step.location) : step.distance_m;
    return {
      instruction: step.instruction,
      distance: distance <= 40 ? 'Now' : `In ${fmtDist(distance)}`,
      modifier: step.modifier,
    };
  }, [chosenSteps, navigationPosition]);

  useEffect(() => {
    onRouteSummary?.(!busy && chosen ? {
      distanceM: chosen.distance_m,
      durationS: chosen.duration_s,
    } : null);
  }, [busy, chosen?.distance_m, chosen?.duration_s, onRouteSummary]);

  const note = useMemo(() => {
    if (!chosen) return '';
    const fastest = [...displayedRoutes].sort((a, b) => a.duration_s - b.duration_s)[0];
    if (chosen.hit.length === 0) {
      if (fastest !== chosen && fastest.hit.length) {
        const extra = Math.max(0, Math.round((chosen.duration_s - fastest.duration_s) / 60));
        return 'Avoids ' + fastest.hit.join(', ') + ' on the fastest route (+' + extra + ' min).';
      }
      return hazards.length ? 'No active hazard zones on this route.' : 'No active hazards reported.';
    }
    return 'Passes through ' + chosen.hit.join(', ') + '. No safer road alternative was found.';
  }, [chosen, displayedRoutes, hazards.length]);

  /* send state to the map */
  const mapState = useMemo(
    () => ({
      hazards,
      user,
      start: origin,
      dest,
      routes: displayedRoutes.map((r) => ({
        points: r.points.map((p) => [p.lat, p.lng]),
        safety: r.safety,
        color: r.color,
      })),
      waypoints: plannedWaypoints,
      sel: cur,
      focus,
      nearbyPlaces,
    }),
    [hazards, user, origin, dest, displayedRoutes, plannedWaypoints, cur, focus, nearbyPlaces],
  );
  const push = useCallback(() => {
    const json = JSON.stringify(mapState);
    if (Platform.OS === 'web') frameRef.current?.contentWindow?.postMessage(json, '*');
    else webRef.current?.injectJavaScript('window.__update&&window.__update(' + json + ');true;');
  }, [mapState]);
  useEffect(() => {
    push();
  }, [push]);

  /* taps coming back from the map */
  const handleMsg = useCallback((data: any) => {
    try {
      const m = JSON.parse(data);
      if (m.type === 'tap') {
        const p = { lat: m.lat, lng: m.lng };
        setDest(p);
        setDestName('Dropped pin');
        setRoutePanelDismissed(false);
        cbRef.current?.(p, 'Dropped pin');
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const g: any = globalThis;
    const h = (e: any) => {
      if (e.source === frameRef.current?.contentWindow) handleMsg(e.data);
    };
    g.addEventListener('message', h);
    return () => g.removeEventListener('message', h);
  }, [handleMsg]);

  async function search() {
    const searchQuery = query.trim();
    if (searchQuery.length < 2 || searching) return;
    setSearching(true);
    setError('');
    try {
      const places = await searchPlaces(apiUrl, searchQuery);
      if (!places.length) {
        setError('Place not found.');
        Alert.alert('Place not found', `No location matched "${searchQuery}".`);
        return;
      }
      const { lat, lng, name } = places[0];
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError('Place search returned invalid coordinates.');
        return;
      }
      const p = { lat, lng };
      setDest(p);
      setDestName(name);
      setRoutePanelDismissed(false);
      setQuery(name);
      setRaw([]);
      setSel(0);
      onRouteSummary?.(null);
      cbRef.current?.(p, name);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed. Check your internet connection.';
      setError(message);
      Alert.alert('Search failed', message);
    } finally {
      setSearching(false);
    }
  }

  async function searchStart() {
    const searchQuery = startQuery.trim();
    if (searchQuery.length < 2 || startSearching) return;
    setStartSearching(true);
    setError('');
    try {
      const places = await searchPlaces(apiUrl, searchQuery);
      if (!places.length) {
        setError('Starting location not found.');
        Alert.alert('Starting location not found', `No location matched "${searchQuery}".`);
        return;
      }
      const place = places[0];
      setStartPlace(place);
      setStartMode('custom');
      setStartSelected(true);
      setStartQuery(place.name);
      setDest(null);
      setDestName('');
      setQuery('');
      setRaw([]);
      onRouteSummary?.(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Starting location search failed.';
      setError(message);
      Alert.alert('Starting location search failed', message);
    } finally {
      setStartSearching(false);
    }
  }

  function chooseStartingPoint() {
    setStartMode('custom');
    setStartSelected(false);
    setStartPlace(null);
    setStartQuery('');
    setDest(null);
    setDestName('');
    setQuery('');
    setRaw([]);
    setError('');
    onRouteSummary?.(null);
  }

  async function useCurrentLocation() {
    try {
      let current = user;
      if (!current) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          throw new Error('Location permission is required to use your current location.');
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        current = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUser(current);
      }
      setStartMode('current');
      setStartPlace(null);
      setStartQuery('');
      setStartSelected(true);
      setError('');
      setDest(null);
      setDestName('');
      setQuery('');
      setRaw([]);
      onRouteSummary?.(null);
    } catch (error) {
      Alert.alert(
        'Current location unavailable',
        error instanceof Error ? error.message : 'Allow location access and try again.',
      );
    }
  }

  function clearRoute() {
    setDest(null);
    setDestName('');
    setRaw([]);
    setQuery('');
    setRoutePanelDismissed(false);
  }

  return (
    <View style={[st.box, style]}>
      {Platform.OS === 'web' ? (
        React.createElement('iframe', {
          ref: frameRef,
          srcDoc: html,
          onLoad: push,
          title: 'map',
          style: { border: 0, width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
        } as any)
      ) : (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://localhost/' }}
          onLoad={push}
          onMessage={(e) => handleMsg(e.nativeEvent.data)}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          style={st.web}
        />
      )}

      {showSearch && (!startSelected || !dest) && (
        <View style={st.searchPanel}>
          <View style={st.startChoiceRow}>
            <Pressable
              style={[st.startChoice, startMode === 'current' && st.startChoiceActive]}
              onPress={useCurrentLocation}
            >
              <Text style={st.startChoiceText}>Use current location</Text>
            </Pressable>
            <Pressable
              style={[st.startChoice, startMode === 'custom' && st.startChoiceActive]}
              onPress={chooseStartingPoint}
            >
              <Text style={st.startChoiceText}>Choose starting point</Text>
            </Pressable>
          </View>
          {!startSelected && startMode === 'custom' ? (
            <View style={st.searchRow}>
              <TextInput
                value={startQuery}
                onChangeText={setStartQuery}
                onSubmitEditing={searchStart}
                placeholder="Enter starting location"
                placeholderTextColor="#94a3b8"
                style={st.input}
                returnKeyType="search"
                editable={!startSearching}
              />
              <Pressable style={[st.goBtn, startSearching && { opacity: 0.6 }]} onPress={searchStart} disabled={startSearching}>
                <Text style={st.goTxt}>{startSearching ? '...' : 'Set start'}</Text>
              </Pressable>
            </View>
          ) : null}
          {startSelected && !dest ? (
            <View style={st.searchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={search}
                placeholder="Enter destination"
                placeholderTextColor="#94a3b8"
                style={st.input}
                returnKeyType="search"
                editable={!searching}
              />
              <Pressable style={[st.goBtn, searching && { opacity: 0.6 }]} onPress={search} disabled={searching}>
                <Text style={st.goTxt}>{searching ? '...' : 'Go'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

      {dest && chosen && !busy ? (
        <NextDirectionCard
          instruction={nextDirection.instruction}
          distance={nextDirection.distance}
          modifier={nextDirection.modifier}
        />
      ) : null}

      <View style={[st.side, mapControlsBottomInset === undefined ? st.sideTop : { bottom: mapControlsBottomInset }]}>
        <Pressable style={st.roundBtn} onPress={() => setFocus((f) => f + 1)}>
          <Text style={st.roundTxt}>Me</Text>
        </Pressable>
        <Pressable style={st.roundBtn} onPress={loadHazards}>
          <Text style={st.roundTxt}>Sync</Text>
        </Pressable>
        <Pressable
          style={[st.roundBtn, voiceAlertsEnabled && st.voiceAlertsEnabled]}
          onPress={() => {
            setVoiceAlertsEnabled((enabled) => {
              const nextEnabled = !enabled;
              if (!nextEnabled) void Speech.stop();
              return nextEnabled;
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={voiceAlertsEnabled ? 'Mute voice navigation alerts' : 'Unmute voice navigation alerts'}
          accessibilityState={{ checked: voiceAlertsEnabled }}
        >
          {voiceAlertsEnabled
            ? <Volume2 color="#fff" size={19} />
            : <VolumeX color="#fff" size={19} />}
        </Pressable>
      </View>

      {(busy || searching || startSearching) && (
        <View style={st.busy}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {showRoutePanel && !routePanelDismissed && (error || chosen) ? (
        <View style={[st.panel, { bottom: routePanelBottomInset }]}>
          {error ? <Text style={st.err}>{error}</Text> : null}
          {chosen ? (
            <>
              <View style={st.panelHead}>
                <Text style={st.title} numberOfLines={1}>
                  {destName ? 'To ' + destName : 'Route'}
                </Text>
                <Pressable onPress={clearRoute}>
                  <Text style={st.clear}>Clear</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                {displayedRoutes.map((r, i) => (
                  <Pressable
                    key={i}
                    onPress={() => {
                      setSel(i);
                      setRoutePanelDismissed(true);
                    }}
                    style={[st.chip, i === cur && st.chipOn]}
                  >
                    <Text style={[st.chipTxt, i === cur && st.chipTxtOn]}>
                      {r.label + ': ' + fmtDur(r.duration_s)}
                    </Text>
                    <Text style={[st.chipSub, i === cur && st.chipTxtOn]}>
                      {fmtDist(r.distance_m) + ' | Safety ' + r.safety}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={st.note}>{note}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: { minHeight: 300, overflow: 'hidden', borderRadius: 16, backgroundColor: '#0b1220' },
  web: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  searchPanel: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 10,
    elevation: 10,
    gap: 6,
  },
  directionCard: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 64,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: 'rgba(15,23,42,0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#475569',
    zIndex: 9,
    elevation: 9,
  },
  directionTextWrap: { flex: 1, minWidth: 0 },
  directionInstruction: { color: '#fff', fontSize: 14, fontWeight: '700' },
  directionDistance: { color: '#cbd5e1', fontSize: 11, marginTop: 2 },
  startChoiceRow: { flexDirection: 'row', gap: 6 },
  startChoice: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  startChoiceActive: { backgroundColor: '#1d4ed8', borderColor: '#60a5fa' },
  startChoiceText: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.92)', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
  },
  goBtn: { backgroundColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  goTxt: { color: '#fff', fontWeight: '700' },
  side: { position: 'absolute', right: 10, gap: 8 },
  sideTop: { top: 64 },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(15,23,42,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  voiceAlertsEnabled: { backgroundColor: '#1d4ed8', borderWidth: 1, borderColor: '#60a5fa' },
  roundTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  busy: { position: 'absolute', top: 64, left: 10, backgroundColor: 'rgba(15,23,42,0.92)', borderRadius: 12, padding: 8 },
  panel: {
    position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: 16, padding: 12,
  },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1, marginRight: 8 },
  clear: { color: '#f87171', fontWeight: '700' },
  chip: {
    borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, marginRight: 8,
  },
  chipOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipTxt: { color: '#e2e8f0', fontWeight: '700', fontSize: 13 },
  chipSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  chipTxtOn: { color: '#fff' },
  note: { color: '#cbd5e1', fontSize: 12 },
  err: { color: '#fca5a5', fontSize: 12, marginBottom: 4 },
});
