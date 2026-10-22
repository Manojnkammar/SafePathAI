import type { ReactNode } from "react";
import {
  ArrowLeft, Bell, Search, Mail, Lock, Eye, Phone, Navigation, Map, Settings2, Wifi, Home, Car,
  User, CornerUpLeft, CornerUpRight, Volume2, VolumeX, Minus, Share2, CircleSlash, Route, Layers,
  ChevronRight, Plus, Bike, Zap, Bus, MapPin, Shield, Siren, Ambulance, Hospital, Fuel, Hotel,
  Utensils, Cross, Landmark, MoreHorizontal, Star, Download, Clock, Gauge, ShieldCheck, TrafficCone,
  Activity, History, LogOut, Bookmark, Locate, TriangleAlert, Info, ShieldAlert, Moon, Waves, Send,
  ClipboardList, Users,
} from "lucide-react";
import carImg from "@/assets/car.jpg";
import avatarImg from "@/assets/avatar.jpg";
import cityImg from "@/assets/city.jpg";

/* ---------- shared bits ---------- */
function Header({ title }: { title: string }) {
  return (
    <div className="relative flex h-11 shrink-0 items-center justify-center px-3">
      <ArrowLeft className="absolute left-3 h-4 w-4" />
      <span className="text-[13px] font-medium">{title}</span>
    </div>
  );
}
function TabBar({ active = 0 }: { active?: number }) {
  const icons = [Home, Map, ClipboardList, Bell, User];
  const labels = ["Home", "Map", "Trips", "Alerts", "Profile"];
  return (
    <div className="mt-auto flex h-11 shrink-0 items-center justify-around border-t border-border bg-screen">
      {icons.map((I, i) => (
        <div key={i} className={`flex flex-col items-center gap-0.5 rounded-full p-1 ${i === active ? "bg-surface-2 text-foreground" : "text-muted-foreground"}`}>
          <I className="h-4 w-4" />
          <span className="text-[6px]">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg bg-surface ${className}`}>{children}</div>
);
const Field = ({ icon, text, right }: { icon?: ReactNode; text: string; right?: ReactNode }) => (
  <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[10px] text-muted-foreground">
    {icon}<span className="flex-1">{text}</span>{right}
  </div>
);
const Btn = ({ children, variant = "primary", className = "" }: { children: ReactNode; variant?: "primary" | "outline" | "sos"; className?: string }) => {
  const v = { primary: "bg-primary text-primary-foreground", outline: "border border-border bg-surface text-foreground", sos: "bg-sos text-destructive-foreground" }[variant];
  return <div className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium ${v} ${className}`}>{children}</div>;
};
function Pin({ x, y, tone = "sos" }: { x: number; y: number; tone?: "sos" | "warning" | "orange" | "accent" }) {
  const c = { sos: "text-sos", warning: "text-warning", orange: "text-orange", accent: "text-accent" }[tone];
  return <MapPin className={`absolute h-5 w-5 fill-current ${c}`} style={{ left: x, top: y }} strokeWidth={1.5} stroke="var(--screen)" />;
}
function MapBg({ route }: { route: string }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 250 530" preserveAspectRatio="none">
      <rect width="250" height="530" fill="var(--map)" />
      {Array.from({ length: 14 }).map((_, i) => (
        <line key={"a" + i} x1={-40 + i * 30} y1="0" x2={20 + i * 30} y2="530" stroke="var(--road)" strokeWidth={i % 3 ? 2 : 5} />
      ))}
      {Array.from({ length: 16 }).map((_, i) => (
        <line key={"b" + i} x1="0" y1={i * 36} x2="250" y2={i * 36 - 50} stroke="var(--road)" strokeWidth={i % 4 ? 2 : 5} />
      ))}
      <path d={route} fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
function NavBottom() {
  const items: [typeof Route, string][] = [[Route, "Route info"], [Car, "Maps"], [Share2, "Share"], [CircleSlash, "Stop"]];
  return (
    <div className="absolute inset-x-0 bottom-0 bg-screen/95 p-2">
      <div className="mb-2 flex items-center gap-3 rounded-lg bg-surface p-2">
        <div><div className="text-[15px] font-medium">2h 45m</div><div className="text-[9px] text-muted-foreground">120 km</div></div>
        <div className="h-7 w-px bg-border" />
        <div><div className="text-[15px] font-medium">10:30 <span className="text-[8px]">AM</span></div><div className="text-[9px] text-muted-foreground">Arrival</div></div>
        <Btn variant="sos" className="ml-auto h-7 w-10 text-[10px]">Exit</Btn>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map(([I, l], i) => (
          <div key={l} className="flex flex-col items-center gap-0.5 rounded-md bg-surface py-1.5 text-[8px]">
            <I className={`h-4 w-4 ${i === 3 ? "text-sos" : ""}`} />{l}
          </div>
        ))}
      </div>
    </div>
  );
}
const Dot = ({ className }: { className: string }) => <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />;

/* ---------- 1 Loading ---------- */
export function LoadingScreen() {
  return (
    <div className="phone">
      <img src={cityImg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" width={576} height={1152} />
      <div className="absolute inset-0 bg-gradient-to-b from-screen/40 via-transparent to-screen/70" />
      <div className="relative flex flex-1 flex-col items-center pt-20 text-center">
        <div className="relative grid h-24 w-24 place-items-center">
          <Shield className="absolute h-24 w-24 text-primary" strokeWidth={1.2} />
          <Shield className="h-14 w-14 fill-orange text-foreground" strokeWidth={1.5} />
        </div>
        <h1 className="mt-6 font-display text-[26px] font-medium">SafePath AI</h1>
        <p className="mt-1 text-[13px] leading-tight">Smart Emergency &amp;<br />Intelligent Navigation</p>
        <p className="mt-3 text-[11px]">Your Safety, Our Priority</p>
        <div className="mt-auto mb-6 flex h-1 w-20 overflow-hidden rounded-full bg-surface-2">
          <div className="w-1/4 bg-foreground" />
        </div>
      </div>
    </div>
  );
}

/* ---------- 2 Login ---------- */
export function LoginScreen() {
  return (
    <div className="phone px-4">
      <ArrowLeft className="mt-4 h-4 w-4" />
      <Shield className="mx-auto mt-4 h-10 w-10 text-primary" />
      <h2 className="mt-3 text-center text-[16px]">Welcome Back!</h2>
      <p className="text-center text-[10px] text-muted-foreground">Login to continue</p>
      <div className="mt-6 space-y-3">
        <Field icon={<Mail className="h-3 w-3" />} text="Email or Phone" />
        <Field icon={<Lock className="h-3 w-3" />} text="Password" right={<Eye className="h-3 w-3" />} />
      </div>
      <p className="mt-2 text-right text-[8px] text-primary">Forgot Password?</p>
      <Btn className="mt-4">Login</Btn>
      <div className="my-5 flex items-center gap-2 text-[9px] text-muted-foreground"><div className="h-px flex-1 bg-border" />or continue with<div className="h-px flex-1 bg-border" /></div>
      <div className="grid grid-cols-2 gap-3">
        <Btn variant="outline"><span className="font-bold text-orange">G</span>Google</Btn>
        <Btn variant="outline"><Phone className="h-3 w-3" />Phone</Btn>
      </div>
      <p className="mt-auto mb-10 text-center text-[9px] text-muted-foreground">Don't Have an account? <span className="text-primary">Sign Up</span></p>
    </div>
  );
}

/* ---------- 3 Home ---------- */
export function HomeScreen() {
  return (
    <div className="phone">
      <div className="flex-1 overflow-hidden px-2.5 pt-3">
        <div className="flex items-start justify-between">
          <div><div className="text-[12px]">Hello, Rohan 😊</div><div className="text-[8px] text-muted-foreground">Drive Safe, Stay Safe</div></div>
          <Bell className="h-4 w-4" />
        </div>
        <div className="mt-3"><Field icon={<Search className="h-3 w-3" />} text="Where do you want to go?" /></div>
        <div className="relative mt-2 h-24 overflow-hidden rounded-lg bg-gradient-primary p-2.5">
          <div className="text-[10px] font-semibold">AI Recommendation</div>
          <div className="text-[8px] opacity-80">Safest route available</div>
          <div className="mt-1 text-[9px]">Bengaluru → Mysuru</div>
          <div className="mt-1.5 inline-block rounded bg-foreground px-2 py-0.5 text-[8px] text-primary">View</div>
          <img src={carImg} alt="" className="absolute -right-3 bottom-0 w-28 mix-blend-lighten" width={992} height={672} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([[Navigation, "Navigation"], [ClipboardList, "Trip Planner"], [Settings2, "Nearby services"]] as const).map(([I, l]) => (
            <Card key={l} className="flex flex-col items-center gap-1.5 py-2.5"><I className="h-6 w-6" /><span className="text-[7px]">{l}</span></Card>
          ))}
        </div>
        <Card className="mt-2 flex items-center gap-3 p-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-primary"><Wifi className="h-4 w-4" /></div>
          <div className="flex-1 text-[9px]"><div className="text-[10px]">Communication</div><div className="text-muted-foreground">Connected</div><div className="text-muted-foreground">6 Peers Nearby</div></div>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-orange"><Wifi className="h-4 w-4" /></div>
        </Card>
        <div className="mt-3 text-[9px]">Recent Trips</div>
        {[["Bengaluru → Mysuru", "Today", "120 km · 2h 45m"], ["College → Home", "Yesterday", "32 km · 1h 10m"]].map(([t, d, s]) => (
          <Card key={t} className="mt-1.5 flex justify-between p-2 text-[8px]"><div><div>• {t}</div><div className="text-[6px] text-muted-foreground">{s}</div></div><span className="text-muted-foreground">{d}</span></Card>
        ))}
      </div>
      <TabBar active={0} />
    </div>
  );
}

/* ---------- 4 Nav 1 ---------- */
export function Nav1Screen() {
  return (
    <div className="phone">
      <MapBg route="M70 110 Q120 130 110 220 T135 300" />
      <div className="absolute inset-x-2 top-2 flex items-center gap-3 rounded-lg bg-screen/95 p-2.5">
        <CornerUpLeft className="h-6 w-6" /><div className="text-[14px] leading-tight">Turn Left<br />200 m</div>
      </div>
      <Pin x={40} y={88} tone="warning" /><Pin x={88} y={84} /><Pin x={186} y={114} tone="orange" /><Pin x={138} y={180} /><Pin x={26} y={210} tone="orange" />
      <div className="absolute left-[80px] top-[108px] h-3 w-3 rounded-full border-2 border-foreground bg-primary" />
      <div className="absolute left-[120px] top-[285px] grid h-9 w-9 place-items-center rounded-full bg-primary/40"><Navigation className="h-5 w-5 fill-foreground" /></div>
      <div className="absolute right-3 top-[220px] space-y-2">
        {[Volume2, VolumeX, Minus].map((I, i) => <div key={i} className="grid h-7 w-7 place-items-center rounded-full bg-screen"><I className="h-3.5 w-3.5" /></div>)}
      </div>
      <NavBottom />
    </div>
  );
}

/* ---------- 5 Nav 2 ---------- */
export function Nav2Screen() {
  const alerts = [["Pothole", "250 m ahead"], ["Accident", "160 m ahead"], ["Traffic Jam", ""]];
  return (
    <div className="phone">
      <MapBg route="M115 310 L150 250 L190 175" />
      <div className="absolute left-2 top-2 flex items-center gap-2 rounded-lg bg-screen/95 p-2.5">
        <CornerUpRight className="h-7 w-7" /><div className="text-[12px] leading-tight">100 m<br />Turn Right</div>
      </div>
      <Wifi className="absolute right-3 top-3 h-6 w-6 text-orange" />
      <div className="absolute right-3 top-12 grid h-7 w-7 place-items-center rounded-full bg-screen"><Settings2 className="h-4 w-4" /></div>
      <div className="absolute left-2 top-[115px] space-y-1.5">
        {alerts.map(([t, s]) => (
          <div key={t} className="flex w-24 items-center gap-1.5 rounded-md bg-screen/95 p-1.5 text-[8px]">
            <TriangleAlert className="h-4 w-4 text-sos" /><div>{t}<div className="text-muted-foreground">{s}</div></div>
          </div>
        ))}
      </div>
      <Pin x={55} y={86} /><Pin x={155} y={100} /><Pin x={130} y={168} tone="orange" /><Pin x={170} y={250} tone="orange" /><Pin x={110} y={220} tone="accent" />
      <div className="absolute left-[180px] top-[170px] h-4 w-4 rounded-full border-2 border-foreground bg-accent" />
      <div className="absolute left-[103px] top-[296px] grid h-8 w-8 place-items-center rounded-full bg-primary/40"><Navigation className="h-5 w-5 fill-foreground" /></div>
      <div className="absolute left-3 top-[312px] grid h-9 w-9 place-items-center rounded-full border border-foreground bg-screen text-[12px] leading-none">46<span className="text-[5px]">km/h</span></div>
      <div className="absolute right-3 top-[312px] grid h-7 w-7 place-items-center rounded-full bg-screen"><Layers className="h-4 w-4" /></div>
      <NavBottom />
    </div>
  );
}

/* ---------- 6 Trip Planner ---------- */
export function TripPlannerScreen() {
  const stops: [string, string][] = [["Bengaluru, Kamataka", "bg-primary"], ["Ramanagara", "bg-orange"], ["Mandya", "bg-warning"], ["Mysuru, Kamataka", "bg-sos"]];
  return (
    <div className="phone px-2.5">
      <Header title="Trip Planner" />
      <div className="space-y-1.5">
        {stops.map(([s, c]) => <Card key={s} className="flex items-center gap-2 p-2 text-[9px]"><Dot className={c} /><span className="flex-1">{s}</span><ChevronRight className="h-3 w-3" /></Card>)}
        <Card className="flex items-center justify-center gap-1 p-2 text-[9px] text-primary"><Plus className="h-3 w-3" />Add Destination</Card>
      </div>
      <div className="mt-3 text-[9px]">Vehicle Type</div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {([[Bike, "Bike"], [Car, "Car"], [Zap, "EV"], [Bus, "Bus"]] as const).map(([I, l], i) => (
          <Card key={l} className={`flex flex-col items-center gap-1 py-2 text-[8px] ${i === 1 ? "ring-1 ring-primary" : ""}`}><I className={`h-4 w-4 ${i === 1 ? "text-primary" : ""}`} />{l}</Card>
        ))}
      </div>
      <div className="mt-3 text-[9px]">Route Preference</div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[7px]">
        {["Best", "Safest", "Fuel Saver", "Less Traffic"].map((l, i) => <div key={l} className={`rounded py-1.5 text-center ${i === 1 ? "bg-primary" : "bg-surface"}`}>{l}</div>)}
      </div>
      <Btn className="mt-3">Generate Route</Btn>
      <Card className="mt-3 grid grid-cols-3 p-2">
        {[["Total Distance", "120 km"], ["Est.Time", "2h 45m"], ["Est.Fuel", "₹650"]].map(([a, b]) => <div key={a}><div className="text-[6px] text-muted-foreground">{a}</div><div className="text-[12px]">{b}</div></div>)}
      </Card>
    </div>
  );
}

/* ---------- 7 SOS ---------- */
export function SosScreen() {
  return (
    <div className="phone px-2.5">
      <Header title="Emergency SOS" />
      <div className="mx-auto mt-1 grid h-36 w-36 place-items-center rounded-full sos-ring">
        <div className="text-center"><div className="text-[28px] leading-none">SOS</div><div className="text-[8px]">Tap to Activate</div></div>
      </div>
      <p className="mt-3 text-center text-[8px] text-muted-foreground">Share live location and<br />alert your contacts</p>
      <Card className="mt-3 p-2 text-[8px]">
        <div className="flex justify-between"><span>Battery Level</span><span className="text-warning">65%</span></div>
        <div className="mt-2 flex gap-2"><MapPin className="h-4 w-4" /><div><div className="text-[9px]">Live Location Sharing</div><div className="text-[6px] text-muted-foreground">Live location will be shared continuously while battery is 20% - 45%</div></div></div>
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2"><img src={avatarImg} alt="" className="h-5 w-5 rounded-full" width={816} height={816} /><span className="flex-1">Taal</span><Phone className="h-3 w-3 text-sos" /><ChevronRight className="h-3 w-3" /></div>
        <div className="mt-2 text-primary">+ Add Contact</div>
      </Card>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {([[Hospital, "Emergency Contacts"], [Siren, "Police station"], [Ambulance, "Ambulance"]] as const).map(([I, l]) => (
          <Card key={l} className="flex flex-col items-center gap-1 py-2 text-[7px]"><I className="h-6 w-6 text-sos" />{l}</Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- 8 Communication ---------- */
export function CommunicationScreen() {
  const peers: [string, string, string, string][] = [["Rohit's Phone", "120 m", "Strong", "text-sos"], ["Anita's Phone", "200 m", "Strong", "text-sos"], ["Vikram's Phone", "250 m", "Medium", "text-warning"], ["Sneha's Phone", "400 m", "Weak", "text-orange"]];
  return (
    <div className="phone">
      <div className="flex-1 px-2.5">
        <Header title="Communication" />
        <Card className="flex items-center gap-3 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary"><Wifi className="h-5 w-5" /></div>
          <div className="flex-1 text-[8px]"><div className="text-[10px]">Mesh Network</div><div className="text-muted-foreground">Connected</div><div className="text-muted-foreground">5 Peers Nearby</div></div>
          <Wifi className="h-6 w-6 text-orange" />
        </Card>
        <Card className="mt-2 p-2 text-[9px]"><div>My Status</div><div className="flex justify-between"><span className="text-orange">● Online</span><span className="text-muted-foreground">Battery: 78%</span></div></Card>
        <div className="mt-3 text-[9px]">Nearby Peers</div>
        <div className="mt-1.5 space-y-1.5">
          {peers.map(([n, d, s, c]) => (
            <Card key={n} className="flex items-center gap-2 p-2 text-[9px]"><MapPin className={`h-3.5 w-3.5 fill-current ${c}`} /><div className="flex-1">{n}<div className="text-[7px] text-muted-foreground">{d}</div></div><span className={`text-[7px] ${c}`}>{s}</span></Card>
          ))}
        </div>
        <Btn className="mt-3">Broadcast Message</Btn>
      </div>
      <TabBar active={0} />
    </div>
  );
}

/* ---------- 9 Nearby ---------- */
export function NearbyScreen() {
  const cats = [[Hospital, "Hospitals", "text-orange"], [Fuel, "Fuel", "text-primary"], [Hotel, "Hotels", "text-accent"], [Utensils, "Restaurants", "text-sos"], [Cross, "Medical", "text-sos"], [Shield, "Police", "text-primary"], [Landmark, "ATM", "text-primary"], [MoreHorizontal, "More", "text-foreground"]] as const;
  const rest = [["Green Leaf Restaurant", "Veg / 0.6 km", "4.2"], ["Spicy Hub Restaurant", "Non-Veg / 0.8 km", "4.1"], ["Food Corner", "Veg / 1.6 km", "4.5"]];
  return (
    <div className="phone">
      <div className="flex-1 px-2.5">
        <Header title="Nearby Services" />
        <Field icon={<Search className="h-3 w-3" />} text="Search services" />
        <div className="mt-3 grid grid-cols-4 gap-y-3">
          {cats.map(([I, l, c]) => <div key={l} className="flex flex-col items-center gap-1 text-[7px]"><div className="grid h-7 w-7 place-items-center rounded-full bg-surface"><I className={`h-3.5 w-3.5 ${c}`} /></div>{l}</div>)}
        </div>
        <div className="mt-4 text-[10px]">Restaurants</div>
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[8px]">
          <div className="rounded bg-orange py-1 text-center">✓ Veg Only</div>
          <div className="rounded border border-sos py-1 text-center text-sos">▲ Non-Veg Only</div>
        </div>
        <div className="mt-2 space-y-1.5">
          {rest.map(([n, s, r]) => (
            <Card key={n} className="flex items-center gap-2 p-2 text-[9px]"><div className="h-6 w-6 rounded-full bg-orange/70" /><div className="flex-1">{n}<div className="text-[7px] text-muted-foreground">{s}</div></div><Star className="h-2.5 w-2.5 fill-warning text-warning" /><span className="text-[8px]">{r}</span></Card>
          ))}
        </div>
      </div>
      <TabBar active={1} />
    </div>
  );
}

/* ---------- 10 Offline Maps ---------- */
export function OfflineMapsScreen() {
  return (
    <div className="phone px-2.5">
      <Header title="Offline Maps" />
      <div className="flex items-center justify-between text-[10px]">Downloaded Maps<div className="h-3.5 w-7 rounded-full bg-sos p-0.5"><div className="h-2.5 w-2.5 rounded-full bg-foreground" /></div></div>
      <div className="mt-2 space-y-1.5">
        {[["Bengaluru City", "450 MB"], ["Mysuru District", "220 MB"]].map(([n, s]) => (
          <Card key={n} className="flex items-center gap-2 p-2.5 text-[9px]"><Map className="h-4 w-4 text-orange" /><div className="flex-1">{n}<div className="text-[7px] text-muted-foreground">{s}</div></div><span className="rounded border border-primary px-2 py-0.5 text-[8px] text-primary">Open</span></Card>
        ))}
        <Card className="p-2.5 text-[9px]">
          <div className="flex items-center gap-2"><Map className="h-4 w-4 text-orange" /><div className="flex-1">Karnataka State<div className="text-[7px] text-muted-foreground">0.1 GB</div></div><span className="text-[7px] text-muted-foreground">Downloading.. 45%</span></div>
          <div className="mt-1.5 ml-6 h-1 rounded bg-surface-2"><div className="h-full w-[45%] rounded bg-primary" /></div>
        </Card>
      </div>
      <div className="mt-4 text-[10px]">Download New Map</div>
      <div className="mt-2"><Field icon={<Search className="h-3 w-3" />} text="Search in the field to maps" /></div>
      <div className="mt-2 space-y-1.5">
        {[["Hassan District", "310 MB"], ["Chikmagalur District", "260 MB"]].map(([n, s]) => (
          <Card key={n} className="flex items-center gap-2 p-2.5 text-[9px]"><Map className="h-4 w-4 text-muted-foreground" /><div className="flex-1">{n}<div className="text-[7px] text-muted-foreground">{s}</div></div><span className="rounded border border-primary px-2 py-0.5 text-[7px] text-primary">Download</span></Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- 11 Route Details ---------- */
export function RouteDetailsScreen() {
  const rows = [[Activity, "Total Distance", "120 km", ""], [Clock, "Estimated Time", "2h 45m", ""], [Fuel, "Fuel Estimation", "₹650 (6.5 L)", ""], [ShieldCheck, "Safety Score", "4.6 / 5", "text-warning"], [TrafficCone, "Traffic Status", "Moderate", "text-warning"], [Gauge, "Road Quality", "Good", "text-warning"]] as const;
  return (
    <div className="phone px-2.5">
      <Header title="Route Details" />
      <div className="flex gap-4 border-b border-border px-1 pb-1.5 text-[10px]">
        {["Overview", "Steps", "Traffic", "Reviews"].map((t, i) => <span key={t} className={i === 0 ? "text-primary" : ""}>{t}</span>)}
      </div>
      <Card className="mt-3 divide-y divide-border">
        {rows.map(([I, l, v, c], i) => (
          <div key={l} className="flex items-center gap-2.5 px-2.5 py-3 text-[10px]"><I className={`h-4 w-4 ${i === 3 ? "text-warning" : i === 4 ? "text-sos" : "text-muted-foreground"}`} /><span className="flex-1">{l}</span><span className={c}>{v}</span></div>
        ))}
      </Card>
      <div className="mt-auto mb-4 grid grid-cols-2 gap-2.5">
        <Btn variant="outline" className="h-9 text-primary">Save Route</Btn><Btn className="h-9">Download</Btn>
      </div>
    </div>
  );
}

/* ---------- 12 Profile ---------- */
export function ProfileScreen() {
  const rows = [[Car, "My Vehicle", "KA 01 AB 1234"], [Phone, "Emergency Contacts", "3 Contacts"], [Bookmark, "Saved Places", "12 Places"], [History, "Route History", "8 Trips"], [Settings2, "Settings", ""], [LogOut, "Logout", ""]] as const;
  return (
    <div className="phone">
      <div className="flex-1 px-2.5">
        <Header title="Profile" />
        <img src={avatarImg} alt="Rohan Kumar" className="mx-auto mt-1 h-14 w-14 rounded-full object-cover" width={816} height={816} />
        <div className="mt-2 text-center text-[13px]">Rohan Kumar</div>
        <div className="text-center text-[8px] text-muted-foreground">rohan.kumar@gmail.com</div>
        <Card className="mt-3 divide-y divide-border">
          {rows.map(([I, l, v]) => <div key={l} className="flex items-center gap-2 px-2.5 py-2.5 text-[9px]"><I className="h-3.5 w-3.5" /><span className="flex-1">{l}</span><span className="text-[8px] text-muted-foreground">{v}</span><ChevronRight className="h-3 w-3" /></div>)}
        </Card>
      </div>
      <TabBar active={4} />
    </div>
  );
}

/* ---------- 13 Accident ---------- */
export function AccidentScreen() {
  return (
    <div className="phone danger-bg px-5 text-center">
      <h2 className="mt-5 text-[15px]">Accident Detected</h2>
      <p className="mt-2 text-[8px] text-muted-foreground">We've detected a possible accident. Are you okay?</p>
      <div className="mx-auto mt-6 grid h-32 w-32 place-items-center rounded-full border border-sos/40 ring-8 ring-sos/10">
        <div><div className="text-[36px] leading-none text-sos">05</div><div className="text-[10px] text-sos">Seconds</div></div>
      </div>
      <Btn variant="sos" className="mt-8 h-10 rounded-full text-[12px]">I Need Help</Btn>
      <Btn variant="outline" className="mt-3 h-10 rounded-full bg-transparent text-[12px]">I'm Fine, Cancel</Btn>
      <div className="mt-auto mb-12 flex items-center gap-2 text-left text-[9px] text-muted-foreground"><Locate className="h-4 w-4" />Your location will be shared with emergency contacts.</div>
    </div>
  );
}

/* ---------- 14 Community ---------- */
export function CommunityScreen() {
  const items = [[TriangleAlert, "Pothole", "Hosur Road, Bengaluru", "2 min ago"], [Car, "Traffic Jam", "Nice Road, Bengaluru", "50 min ago"], [TriangleAlert, "Accident", "Mysuru Road", "25 min ago"], [Waves, "Flooded Road", "Mandya, Karnataka", "80 min ago"]] as const;
  return (
    <div className="phone">
      <div className="relative flex-1 px-2.5">
        <Header title="Community Reports" />
        <div className="flex gap-1.5 text-[8px]">
          {["All", "Hazards", "Traffic", "Accidents"].map((t, i) => <span key={t} className={`rounded px-2.5 py-1 ${i === 0 ? "bg-primary" : "bg-surface"}`}>{t}</span>)}
        </div>
        <div className="mt-2 space-y-1.5">
          {items.map(([I, t, l, a]) => (
            <Card key={t} className="flex items-center gap-2.5 p-2.5 text-[10px]"><I className="h-7 w-7 text-sos" /><div className="flex-1">{t}<div className="text-[7px] text-muted-foreground">{l}</div><div className="text-[7px] text-muted-foreground">{a}</div></div><TriangleAlert className="h-3.5 w-3.5 fill-sos text-sos" /></Card>
          ))}
        </div>
        <div className="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[10px]"><Plus className="h-3 w-3 rounded-full border" />Report</div>
      </div>
      <TabBar active={3} />
    </div>
  );
}

/* ---------- 15 Settings ---------- */
export function SettingsScreen() {
  const rows: [string, string, string][] = [["Communication", "Mesh, Wi-Fi Direct", "bg-primary"], ["Offline Maps", "Manage maps", "bg-orange"], ["Navigation", "Route preferences", "bg-primary"], ["Emergency SOS", "Contacts", "bg-sos"], ["Notifications", "Alerts & Updates", "bg-warning"], ["Privacy & Security", "", "bg-accent"]];
  return (
    <div className="phone">
      <div className="flex-1 px-2.5">
        <Header title="Settings" />
        <Card className="p-2 text-[9px]">
          <div className="flex justify-between"><span className="flex items-center gap-1"><Moon className="h-3 w-3" />Dark Mode</span><ChevronRight className="h-3 w-3" /></div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[8px]">{["Off", "on", "System"].map((t, i) => <span key={t} className={`rounded py-1 ${i === 2 ? "bg-primary" : "border border-border"}`}>{t}</span>)}</div>
        </Card>
        <Card className="mt-2 divide-y divide-border">
          {rows.map(([l, v, c]) => <div key={l} className="flex items-center gap-2 px-2 py-2.5 text-[9px]"><Dot className={c} /><span className="flex-1">{l}</span><span className="text-[8px] text-muted-foreground">{v}</span><ChevronRight className="h-3 w-3" /></div>)}
        </Card>
        <Card className="mt-2 divide-y divide-border">
          <div className="flex items-center gap-2 px-2 py-2.5 text-[9px]"><Info className="h-3 w-3 text-primary" /><span className="flex-1">About SafePath AI</span><span className="text-[8px] text-muted-foreground">Version 2.0.0</span><ChevronRight className="h-3 w-3" /></div>
          <div className="flex items-center gap-2 px-2 py-2.5 text-[9px]"><LogOut className="h-3 w-3 text-primary" /><span className="flex-1">Logout</span><ChevronRight className="h-3 w-3" /></div>
        </Card>
      </div>
      <TabBar active={4} />
    </div>
  );
}

/* ---------- 16 Emergency details ---------- */
export function EmergencyDetailsScreen() {
  return (
    <div className="phone px-2.5">
      <Header title="Emergency User Details" />
      <p className="text-center text-[10px] text-muted-foreground">Fill only if you want to share<br />during emergency</p>
      <div className="mt-4 text-[9px]">Name</div><div className="mt-1"><Field text="Rohan Kumar" /></div>
      <div className="mt-3 text-[9px]">Phone</div><div className="mt-1"><Field text="+91 98765 43210" /></div>
      <div className="mt-3 text-[9px]">Blood Group <span className="text-muted-foreground">(Optional)</span></div>
      <div className="mt-1 flex gap-2"><div className="h-8 flex-1 rounded-md border border-primary bg-surface" /><Btn variant="outline" className="w-12 text-[9px]">Skip</Btn></div>
      <div className="mt-3 text-[9px]">Medical Notes <span className="text-muted-foreground">(Optional)</span></div>
      <div className="mt-1 h-12 rounded-md border border-border bg-surface p-2 text-[9px]">Allergic to peanuts<br />Asthma</div>
      <Card className="mt-3 flex items-center p-2 text-[9px]"><span className="flex-1">Share this info with<br />emergency contacts</span><div className="h-4 w-8 rounded-full bg-warning p-0.5"><div className="ml-auto h-3 w-3 rounded-full bg-foreground" /></div></Card>
      <Btn className="mt-3 h-9">Save</Btn>
    </div>
  );
}

export const SCREENS = [
  ["Loading Screen", LoadingScreen], ["Login/Welcome Back Screen", LoginScreen], ["Home Dashboard", HomeScreen],
  ["Navigation GPS Map 1", Nav1Screen], ["Navigation GPS Map 2", Nav2Screen], ["Trip Planner", TripPlannerScreen],
  ["Emergency SOS", SosScreen], ["Communication Screen", CommunicationScreen], ["Nearby Services", NearbyScreen],
  ["Offline Maps", OfflineMapsScreen], ["Route Details", RouteDetailsScreen], ["Profile Screen", ProfileScreen],
  ["Accident Detected Screen", AccidentScreen], ["Community Reports", CommunityScreen], ["Settings Screen", SettingsScreen],
  ["Emergency User Details", EmergencyDetailsScreen],
] as const;
// unused icon guards
void [ShieldAlert, Send, Users];
