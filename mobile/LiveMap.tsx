import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

type Pt = { lat: number; lng: number };
type Hazard = { id: string; incident_type: string; severity: string; lat: number; lng: number; radius_m: number };
type RawRoute = { points: Pt[]; distance_m: number; duration_s: number };

type Props = {
  apiUrl: string;
  style?: ViewStyle;
  dark?: boolean;
  initialCenter?: Pt;
  destination?: Pt | null;
  onDestinationChange?: (p: Pt, name?: string) => void;
  showSearch?: boolean;
  showRoutePanel?: boolean;
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

/* ---------- route sources ---------- */
async function osrmRoutes(a: Pt, b: Pt): Promise<RawRoute[]> {
  const url =
    'https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat +
    '?overview=full&geometries=geojson&alternatives=3';
  const r = await fetch(url);
  if (!r.ok) throw new Error('osrm');
  const j = await r.json();
  if (j.code !== 'Ok' || !Array.isArray(j.routes) || j.routes.length === 0) {
    throw new Error('OSRM returned no routes');
  }
  return j.routes.map((x: any) => ({
    points: x.geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })),
    distance_m: x.distance,
    duration_s: x.duration,
  }));
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
    };
  });
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
.me{width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.3)}
.pin{width:22px;height:22px;border-radius:50% 50% 50% 0;background:#ef4444;border:2px solid #fff;transform:rotate(-45deg)}
</style></head><body><div id="map"></div><script>
var map=L.map('map').setView([12.9716,77.5946],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:'abcd',attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
var layer=L.layerGroup().addTo(map),userMk=null,centered=false,lastFocus=0,lastKey='';
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
    L.polyline(r.points,{color:'#94a3b8',weight:5,opacity:.7,dashArray:'8 8'}).addTo(layer);
  });
  if(routes[s.sel]){
    var pl=L.polyline(routes[s.sel].points,{color:'#3b82f6',weight:7}).addTo(layer);
    bounds=pl.getBounds();
  }
  if(s.dest){
    L.marker([s.dest.lat,s.dest.lng],{icon:L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[22,22],iconAnchor:[11,22]})}).addTo(layer);
  }
  if(s.user){
    if(userMk){userMk.setLatLng([s.user.lat,s.user.lng]);}
    else{userMk=L.marker([s.user.lat,s.user.lng],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[18,18]})}).addTo(map);}
    if(!centered){map.setView([s.user.lat,s.user.lng],14);centered=true;}
  }
  var key=routes.length+':'+s.sel+':'+(routes[s.sel]?routes[s.sel].points.length:0);
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
  showSearch = true,
  showRoutePanel = true,
}: Props) {
  const html = useMemo(() => buildHtml(dark), [dark]);
  const webRef = useRef<any>(null);
  const frameRef = useRef<any>(null);
  const cbRef = useRef(onDestinationChange);
  cbRef.current = onDestinationChange;

  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [user, setUser] = useState<Pt | null>(null);
  const [dest, setDest] = useState<Pt | null>(destination);
  const [destName, setDestName] = useState('');
  const [raw, setRaw] = useState<RawRoute[]>([]);
  const [sel, setSel] = useState(0);
  const [focus, setFocus] = useState(0);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const origin = user ?? initialCenter;
  const originKey = origin.lat.toFixed(4) + ',' + origin.lng.toFixed(4);

  useEffect(() => {
    if (destination) setDest(destination);
  }, [destination?.lat, destination?.lng]);

  /* GPS */
  useEffect(() => {
    (async () => {
      try {
        const p = await Location.requestForegroundPermissionsAsync();
        if (p.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({});
        setUser({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        /* no GPS: the map just uses the default centre */
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

  /* fetch road routes when the destination changes */
  useEffect(() => {
    if (!dest) {
      setRaw([]);
      return;
    }
    let cancel = false;
    setBusy(true);
    setError('');
    (async () => {
      try {
        let r: RawRoute[];
        try {
          r = await osrmRoutes(origin, dest);
        } catch {
          r = await backendRoutes(apiUrl, origin, dest);
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
  }, [dest?.lat, dest?.lng, originKey, apiUrl]);

  /* score every route against the active hazards; safest first */
  const routes = useMemo(
    () =>
      raw
        .map((r) => {
          const a = analyse(r.points, hazards);
          const safety = a.total ? Math.round(100 * (1 - a.exposed / a.total)) : 100;
          return { ...r, safety, hit: a.hit };
        })
        .sort((x, y) => y.safety - x.safety || x.duration_s - y.duration_s),
    [raw, hazards],
  );
  const cur = Math.min(sel, Math.max(0, routes.length - 1));
  const chosen = routes[cur];

  const note = useMemo(() => {
    if (!chosen) return '';
    const fastest = [...routes].sort((a, b) => a.duration_s - b.duration_s)[0];
    if (chosen.hit.length === 0) {
      if (fastest !== chosen && fastest.hit.length) {
        const extra = Math.max(0, Math.round((chosen.duration_s - fastest.duration_s) / 60));
        return 'Avoids ' + fastest.hit.join(', ') + ' on the fastest route (+' + extra + ' min).';
      }
      return hazards.length ? 'No active hazard zones on this route.' : 'No active hazards reported.';
    }
    return 'Passes through ' + chosen.hit.join(', ') + '. No safer road alternative was found.';
  }, [chosen, routes, hazards.length]);

  /* send state to the map */
  const mapState = useMemo(
    () => ({
      hazards,
      user,
      dest,
      routes: routes.map((r) => ({ points: r.points.map((p) => [p.lat, p.lng]), safety: r.safety })),
      sel: cur,
      focus,
    }),
    [hazards, user, dest, routes, cur, focus],
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
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=' + encodeURIComponent(query),
      );
      const j = await r.json();
      if (!j.length) {
        setError('Place not found.');
        return;
      }
      const p = { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
      const name = String(j[0].display_name).split(',').slice(0, 2).join(',');
      setDest(p);
      setDestName(name);
      cbRef.current?.(p, name);
    } catch {
      setError('Search failed. Check your internet connection.');
    } finally {
      setBusy(false);
    }
  }

  function clearRoute() {
    setDest(null);
    setDestName('');
    setRaw([]);
    setQuery('');
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

      {showSearch && (
        <View style={st.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            placeholder="Search a place, or tap the map"
            placeholderTextColor="#94a3b8"
            style={st.input}
            returnKeyType="search"
          />
          <Pressable style={st.goBtn} onPress={search}>
            <Text style={st.goTxt}>Go</Text>
          </Pressable>
        </View>
      )}

      <View style={st.side}>
        <Pressable style={st.roundBtn} onPress={() => setFocus((f) => f + 1)}>
          <Text style={st.roundTxt}>Me</Text>
        </Pressable>
        <Pressable style={st.roundBtn} onPress={loadHazards}>
          <Text style={st.roundTxt}>Sync</Text>
        </Pressable>
      </View>

      {busy && (
        <View style={st.busy}>
          <ActivityIndicator color="#fff" />
        </View>
      )}

      {showRoutePanel && (error || chosen) ? (
        <View style={st.panel}>
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
                {routes.map((r, i) => (
                  <Pressable key={i} onPress={() => setSel(i)} style={[st.chip, i === cur && st.chipOn]}>
                    <Text style={[st.chipTxt, i === cur && st.chipTxtOn]}>
                      {(i === 0 ? 'Recommended' : 'Option ' + (i + 1)) + ': ' + fmtDur(r.duration_s)}
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
  web: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  searchRow: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.92)', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
  },
  goBtn: { backgroundColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  goTxt: { color: '#fff', fontWeight: '700' },
  side: { position: 'absolute', right: 10, top: 64, gap: 8 },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(15,23,42,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
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
