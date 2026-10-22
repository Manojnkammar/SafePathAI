import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  StyleSheet,
  BackHandler,
} from 'react-native';

const C = {
  bg: '#090D20',
  panel: '#151B32',
  panel2: '#202844',
  blue: '#4854E8',
  blueLight: '#737EFF',
  red: '#F04452',
  orange: '#FF9B57',
  green: '#48D6A0',
  white: '#F5F6FF',
  muted: '#A1A9C5',
  border: '#303955',
};

const screens = [
  'Loading Screen',
  'Login / Welcome',
  'Home Dashboard',
  'Navigation GPS Map 1',
  'Navigation GPS Map 2',
  'Trip Planner',
  'Emergency SOS',
  'Communication',
  'Nearby Services',
  'Offline Maps',
  'Route Details',
  'Profile',
  'Accident Detected',
  'Community Reports',
  'Settings',
  'Emergency User Details',
];

const nextScreen: Record<number, number> = {
  0: 1,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 3,
  6: 7,
  7: 2,
  8: 2,
  9: 2,
  10: 3,
  11: 14,
  12: 6,
  13: 2,
  14: 11,
  15: 6,
};

export default function App() {
  const [screen, setScreen] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [destination, setDestination] = useState('Mysuru, Karnataka');
  const [name, setName] = useState('Rohan Kumar');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [vehicle, setVehicle] = useState('Car');
  const [route, setRoute] = useState('Safest');
  const [reportType, setReportType] = useState('Accident');
  const [sosActive, setSosActive] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(true);
  const [mapDownloaded, setMapDownloaded] = useState(false);
  const [accidentCountdown, setAccidentCountdown] = useState(false);

  function goTo(index: number) {
    if (index < 0 || index >= screens.length || index === screen) return;
    setHistory((old) => [...old, screen]);
    setScreen(index);
  }

  function goBack() {
    if (history.length > 0) {
      const previous = history[history.length - 1];
      setHistory((old) => old.slice(0, -1));
      setScreen(previous);
    } else {
      setScreen(2);
    }
  }

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen !== 0) {
          goBack();
          return true;
        }
        return false;
      },
    );

    return () => subscription.remove();
  }, [screen, history]);

  function Button({
    title,
    onPress,
    color = C.blue,
    outline = false,
  }: {
    title: string;
    onPress: () => void;
    color?: string;
    outline?: boolean;
  }) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        style={[
          styles.button,
          {
            backgroundColor: outline ? 'transparent' : color,
            borderColor: outline ? C.border : color,
            borderWidth: outline ? 1 : 0,
          },
        ]}
      >
        <Text style={styles.buttonText}>{title}</Text>
      </TouchableOpacity>
    );
  }

  function Card({
    title,
    subtitle,
    onPress,
    icon = 'â—ˆ',
  }: {
    title: string;
    subtitle?: string;
    onPress?: () => void;
    icon?: string;
  }) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={styles.card}
      >
        <Text style={styles.cardIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && (
            <Text style={styles.muted}>{subtitle}</Text>
          )}
        </View>
        <Text style={styles.arrow}>â€º</Text>
      </TouchableOpacity>
    );
  }

  function Field({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
  }: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    keyboardType?: 'default' | 'phone-pad' | 'email-address';
  }) {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || label}
          placeholderTextColor={C.muted}
          keyboardType={keyboardType || 'default'}
          autoCapitalize="none"
          style={styles.input}
        />
      </View>
    );
  }

  function Header() {
    return (
      <View style={styles.header}>
        {screen !== 0 && screen !== 2 && (
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backText}>â€¹</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{screens[screen]}</Text>
          <Text style={styles.headerSubtitle}>SafePath AI</Text>
        </View>
        {screen === 2 && (
          <TouchableOpacity onPress={() => goTo(14)}>
            <Text style={styles.headerIcon}>âš™ï¸</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function BottomNav() {
    if ([0, 1, 12, 15].includes(screen)) return null;

    const items = [
      { label: 'Home', icon: 'âŒ‚', target: 2 },
      { label: 'Navigate', icon: 'âŒ–', target: 3 },
      { label: 'Trips', icon: 'â–£', target: 5 },
      { label: 'Alerts', icon: 'â™§', target: 13 },
      { label: 'Profile', icon: 'â—Ž', target: 11 },
    ];

    return (
      <View style={styles.bottomNav}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.label}
            onPress={() => goTo(item.target)}
            style={styles.navItem}
          >
            <Text
              style={[
                styles.navIcon,
                screen === item.target && { color: C.blueLight },
              ]}
            >
              {item.icon}
            </Text>
            <Text
              style={[
                styles.navLabel,
                screen === item.target && { color: C.blueLight },
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function MapPanel({ hazards = false }: { hazards?: boolean }) {
    return (
      <View style={styles.mapPanel}>
        <View style={styles.mapRoad1} />
        <View style={styles.mapRoad2} />
        <View style={styles.mapRoad3} />
        <View style={styles.mapRoad4} />

        <View style={styles.mapRoute} />

        <View style={styles.mapPinStart}>
          <Text style={{ color: C.white, fontSize: 18 }}>â–²</Text>
        </View>

        <Text style={[styles.mapMarker, { top: 35, left: '25%' }]}>
          ðŸ“
        </Text>
        <Text style={[styles.mapMarker, { top: 100, right: '22%' }]}>
          ðŸ“
        </Text>

        {hazards && (
          <>
            <View style={[styles.hazard, { top: 70, left: '48%' }]}>
              <Text style={styles.hazardText}>!</Text>
            </View>
            <View style={[styles.hazard, { top: 150, right: '18%' }]}>
              <Text style={styles.hazardText}>!</Text>
            </View>
            <View style={styles.hazardLegend}>
              <Text style={styles.smallText}>âš ï¸ Accident reported</Text>
              <Text style={styles.smallText}>âš ï¸ Traffic congestion</Text>
            </View>
          </>
        )}

        <View style={styles.mapLocationLabel}>
          <Text style={styles.whiteText}>Current location</Text>
        </View>
      </View>
    );
  }

  function HomeScreen() {
    return (
      <>
        <Text style={styles.greeting}>Hello, {name} ðŸ‘‹</Text>
        <Text style={styles.muted}>Drive Safe, Stay Safe</Text>

        <TouchableOpacity
          onPress={() => goTo(3)}
          style={styles.searchBox}
        >
          <Text style={styles.muted}>âŒ•  Where do you want to go?</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>AI Safety Recommendation</Text>
          <Text style={styles.heroSubtitle}>
            A safer route is available for your journey.
          </Text>
          <Button title="Explore Route" onPress={() => goTo(3)} />
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>
          {[
            { title: 'Navigation', icon: 'âŒ–', target: 3 },
            { title: 'Trip Planner', icon: 'â–£', target: 5 },
            { title: 'Nearby Services', icon: 'âœš', target: 8 },
            { title: 'Communication', icon: 'â—‰', target: 7 },
          ].map((item) => (
            <TouchableOpacity
              key={item.title}
              onPress={() => goTo(item.target)}
              style={styles.quickItem}
            >
              <Text style={styles.quickIcon}>{item.icon}</Text>
              <Text style={styles.quickLabel}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Card
          title="Emergency SOS"
          subtitle="Tap to access emergency assistance"
          icon="ðŸ†˜"
          onPress={() => goTo(6)}
        />
        <Card
          title="Recent Trips"
          subtitle="Bengaluru â†’ Mysuru"
          icon="ðŸš—"
          onPress={() => goTo(10)}
        />
        <Card
          title="Community Reports"
          subtitle="Check nearby hazards"
          icon="âš ï¸"
          onPress={() => goTo(13)}
        />
      </>
    );
  }

  function renderScreen() {
    switch (screen) {
      case 0:
        return (
          <View style={styles.center}>
            <Text style={styles.logo}>â¬¡</Text>
            <Text style={styles.brand}>SafePath AI</Text>
            <Text style={styles.subtitle}>
              Smart Emergency & Intelligent Navigation
            </Text>
            <Text style={styles.muted}>Your Safety, Our Priority</Text>
            <View style={{ height: 35 }} />
            <Button
              title="Get Started"
              onPress={() => goTo(1)}
            />
          </View>
        );

      case 1:
        return (
          <>
            <View style={styles.center}>
              <Text style={styles.logo}>â¬¡</Text>
              <Text style={styles.title}>Welcome Back!</Text>
              <Text style={styles.muted}>Login to continue</Text>
            </View>
            <Field
              label="Email or Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field
              label="Password"
              value=""
              onChangeText={() => {}}
              placeholder="Enter your password"
            />
            <Button title="Login" onPress={() => goTo(2)} />
            <Button
              title="Continue as Guest"
              outline
              onPress={() => goTo(2)}
            />
            <Text style={styles.note}>
              Demo mode: authentication is not connected yet.
            </Text>
          </>
        );

      case 2:
        return <HomeScreen />;

      case 3:
        return (
          <>
            <Field
              label="Destination"
              value={destination}
              onChangeText={setDestination}
            />
            <MapPanel />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>2h 45m</Text>
                <Text style={styles.muted}>Estimated time</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>120 km</Text>
                <Text style={styles.muted}>Distance</Text>
              </View>
            </View>
            <Button
              title="Show Hazards"
              onPress={() => goTo(4)}
            />
            <Button
              title="Route Details"
              outline
              onPress={() => goTo(10)}
            />
            <Button
              title="Trip Planner"
              outline
              onPress={() => goTo(5)}
            />
          </>
        );

      case 4:
        return (
          <>
            <MapPanel hazards />
            <Text style={styles.sectionTitle}>Active Road Alerts</Text>
            <Card
              title="Accident"
              subtitle="Reported ahead Â· Exercise caution"
              icon="âš ï¸"
            />
            <Card
              title="Traffic Jam"
              subtitle="Congestion reported on the current road"
              icon="ðŸš—"
            />
            <Button
              title="Recalculate Safe Route"
              onPress={() => goTo(10)}
            />
            <Button
              title="Back to Navigation"
              outline
              onPress={() => goTo(3)}
            />
          </>
        );

      case 5:
        return (
          <>
            <Text style={styles.sectionTitle}>Plan Your Trip</Text>
            <Field
              label="Starting Point"
              value="Bengaluru, Karnataka"
              onChangeText={() => {}}
            />
            <Field
              label="Destination"
              value={destination}
              onChangeText={setDestination}
            />
            <Text style={styles.label}>Vehicle Type</Text>
            <View style={styles.chipRow}>
              {['Bike', 'Car', 'EV', 'Bus'].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setVehicle(v)}
                  style={[
                    styles.chip,
                    vehicle === v && styles.selectedChip,
                  ]}
                >
                  <Text style={styles.whiteText}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Route Preference</Text>
            <View style={styles.chipRow}>
              {['Fastest', 'Safest', 'Fuel Saver'].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRoute(r)}
                  style={[
                    styles.chip,
                    route === r && styles.selectedChip,
                  ]}
                >
                  <Text style={styles.whiteText}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button
              title="Generate Route"
              onPress={() => goTo(3)}
            />
            <Card
              title="Selected Preferences"
              subtitle={`${vehicle} Â· ${route}`}
              icon="âœ“"
            />
          </>
        );

      case 6:
        return (
          <View style={styles.center}>
            <Text style={styles.title}>Emergency SOS</Text>
            <Text style={styles.muted}>
              Tap below to simulate an emergency alert.
            </Text>
            <TouchableOpacity
              onPress={() => setSosActive(!sosActive)}
              style={[
                styles.sosCircle,
                sosActive && { backgroundColor: '#8F1F34' },
              ]}
            >
              <Text style={styles.sosText}>
                {sosActive ? 'ACTIVE' : 'SOS'}
              </Text>
              <Text style={styles.sosCaption}>
                {sosActive ? 'Alert simulated' : 'Tap to Activate'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.muted}>
              {sosActive
                ? 'Demo alert enabled. No emergency services have been contacted.'
                : 'Location sharing requires device permissions and backend integration.'}
            </Text>
            <Button
              title="Emergency User Details"
              onPress={() => goTo(15)}
            />
            <Button
              title="Communication"
              outline
              onPress={() => goTo(7)}
            />
            {sosActive && (
              <Button
                title="Cancel Demo Alert"
                color={C.red}
                onPress={() => setSosActive(false)}
              />
            )}
          </View>
        );

      case 7:
        return (
          <>
            <Card
              title="Mesh Network"
              subtitle="Demo network status Â· Not connected to real peers"
              icon="â—‰"
            />
            <Card
              title="Connection Status"
              subtitle="Local interface demo"
              icon="âŒ"
            />
            <Text style={styles.sectionTitle}>Send a Message</Text>
            <Field
              label="Message"
              value={message}
              onChangeText={setMessage}
              placeholder="Type a message"
            />
            <Button
              title="Send"
              onPress={() => {
                if (message.trim()) {
                  setMessages((old) => [...old, message.trim()]);
                  setMessage('');
                }
              }}
            />
            {messages.map((m, i) => (
              <Card
                key={`${m}-${i}`}
                title={m}
                subtitle="Local demo message"
                icon="â†—ï¸"
              />
            ))}
            <Button
              title="Return Home"
              outline
              onPress={() => goTo(2)}
            />
          </>
        );

      case 8:
        return (
          <>
            <Text style={styles.sectionTitle}>Nearby Services</Text>
            <View style={styles.grid}>
              {[
                'Hospitals',
                'Fuel',
                'Hotels',
                'Restaurants',
                'Medical',
                'Police',
                'ATM',
                'More',
              ].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.quickItem}
                  onPress={() => setReportType(s)}
                >
                  <Text style={styles.quickIcon}>âœš</Text>
                  <Text style={styles.quickLabel}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Card
              title={`${reportType} services`}
              subtitle="Search results require a location-services integration"
              icon="ðŸ“"
            />
            <Card
              title="Emergency Contacts"
              subtitle="Manage emergency contact details"
              icon="â˜Žï¸"
              onPress={() => goTo(15)}
            />
            <Button
              title="Open Navigation"
              onPress={() => goTo(3)}
            />
          </>
        );

      case 9:
        return (
          <>
            <Text style={styles.sectionTitle}>Downloaded Maps</Text>
            <Card
              title="Bengaluru City"
              subtitle="Offline map demo"
              icon="â–¦"
            />
            <Card
              title="Mysuru District"
              subtitle="Offline map demo"
              icon="â–¦"
            />
            <Card
              title="Karnataka State"
              subtitle="Offline map demo"
              icon="â–¦"
            />
            <Button
              title={mapDownloaded ? 'Demo Map Saved' : 'Download Demo Map'}
              onPress={() => setMapDownloaded(true)}
            />
            <Text style={styles.note}>
              This button simulates a download. Real offline maps require a
              map provider and local storage implementation.
            </Text>
          </>
        );

      case 10:
        return (
          <>
            <Text style={styles.sectionTitle}>Route Overview</Text>
            <MapPanel hazards />
            <Card title="Total Distance" subtitle="120 km" icon="â—Ž" />
            <Card title="Estimated Time" subtitle="2h 45m" icon="â—·" />
            <Card title="Fuel Estimation" subtitle="â‚¹650 (estimated)" icon="â‚¹" />
            <Card title="Safety Score" subtitle="Demo score: 92/100" icon="âœ“" />
            <Card
              title="Hazards Avoided"
              subtitle="Route comparison is simulated"
              icon="âš ï¸"
            />
            <Button
              title="Start Navigation"
              onPress={() => goTo(3)}
            />
            <Button
              title="Download Route"
              outline
              onPress={() => goTo(9)}
            />
          </>
        );

      case 11:
        return (
          <>
            <View style={styles.center}>
              <Text style={styles.avatar}>ðŸ‘¤</Text>
              <Text style={styles.title}>{name}</Text>
              <Text style={styles.muted}>{phone}</Text>
            </View>
            <Card
              title="My Vehicle"
              subtitle={vehicle}
              icon="ðŸš—"
            />
            <Card
              title="Emergency Contacts"
              subtitle="View or edit emergency details"
              icon="â˜Žï¸"
              onPress={() => goTo(15)}
            />
            <Card
              title="Route History"
              subtitle="Recent journey details"
              icon="âŒ–"
              onPress={() => goTo(10)}
            />
            <Card
              title="Settings"
              subtitle="Preferences and privacy"
              icon="âš™ï¸"
              onPress={() => goTo(14)}
            />
            <Button
              title="Logout"
              color={C.red}
              onPress={() => {
                setHistory([]);
                setScreen(1);
              }}
            />
          </>
        );

      case 12:
        return (
          <View style={styles.center}>
            <Text style={styles.title}>Accident Detected</Text>
            <Text style={styles.muted}>
              Simulated accident detection
            </Text>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdown}>
                {accidentCountdown ? 'SOS' : '05'}
              </Text>
              <Text style={styles.sosCaption}>
                {accidentCountdown ? 'Demo alert active' : 'Seconds'}
              </Text>
            </View>
            <Button
              title="I Need Help"
              color={C.red}
              onPress={() => {
                setSosActive(true);
                goTo(6);
              }}
            />
            <Button
              title="I'm Fine, Cancel"
              outline
              onPress={() => {
                setAccidentCountdown(true);
                goTo(2);
              }}
            />
            <Text style={styles.note}>
              No automatic accident detection or real SOS dispatch is
              enabled in this prototype.
            </Text>
          </View>
        );

      case 13:
        return (
          <>
            <Text style={styles.sectionTitle}>Community Reports</Text>
            <View style={styles.chipRow}>
              {['All', 'Hazards', 'Traffic', 'Accidents'].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setReportType(r)}
                  style={[
                    styles.chip,
                    reportType === r && styles.selectedChip,
                  ]}
                >
                  <Text style={styles.whiteText}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Card
              title="Road Accident"
              subtitle="Example community report"
              icon="âš ï¸"
            />
            <Card
              title="Traffic Jam"
              subtitle="Example congestion report"
              icon="ðŸš—"
            />
            <Card
              title="Flooded Road"
              subtitle="Example road hazard report"
              icon="ðŸŒ§ï¸"
            />
            <Button
              title="Report an Incident"
              onPress={() => {
                setReportType('New Incident');
                goTo(4);
              }}
            />
          </>
        );

      case 14:
        return (
          <>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <Card
              title="Dark Mode"
              subtitle={darkMode ? 'Enabled' : 'Disabled'}
              icon="â—"
              onPress={() => setDarkMode(!darkMode)}
            />
            <Text style={styles.note}>
              Theme selection is a demo preference; the current screen
              remains in the dark theme.
            </Text>
            <Text style={styles.sectionTitle}>Preferences</Text>
            <Card
              title="Communication"
              subtitle="Mesh network settings"
              icon="â—‰"
              onPress={() => goTo(7)}
            />
            <Card
              title="Offline Maps"
              subtitle="Manage downloaded maps"
              icon="â–¦"
              onPress={() => goTo(9)}
            />
            <Card
              title="Navigation"
              subtitle="Route preferences"
              icon="âŒ–"
              onPress={() => goTo(5)}
            />
            <Card
              title="Emergency SOS"
              subtitle="Emergency contact details"
              icon="ðŸ†˜"
              onPress={() => goTo(15)}
            />
            <Card
              title="Privacy & Security"
              subtitle="Review application settings"
              icon="â—†"
            />
          </>
        );

      case 15:
        return (
          <>
            <Text style={styles.sectionTitle}>
              Emergency User Details
            </Text>
            <Text style={styles.muted}>
              Enter the details you would want to share during an
              emergency.
            </Text>
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field
              label="Blood Group (Optional)"
              value=""
              onChangeText={() => {}}
              placeholder="Enter blood group"
            />
            <Field
              label="Medical Notes (Optional)"
              value=""
              onChangeText={() => {}}
              placeholder="Enter relevant notes"
            />
            <Button
              title="Save Details"
              onPress={() => goTo(11)}
            />
            <Text style={styles.note}>
              Details are currently held only in app state. They are not
              saved to a server or sent to emergency contacts.
            </Text>
          </>
        );

      default:
        return (
          <Button
            title="Return Home"
            onPress={() => goTo(2)}
          />
        );
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <Header />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderScreen()}

        {screen !== 0 && screen !== 1 && (
          <View style={styles.footerLinks}>
            <Text style={styles.muted}>Quick navigation</Text>
            <View style={styles.chipRow}>
              {screens.map((label, index) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => goTo(index)}
                  style={[
                    styles.chip,
                    screen === index && styles.selectedChip,
                  ]}
                >
                  <Text style={styles.whiteText}>{index + 1}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    minHeight: 66,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    marginRight: 10,
  },
  backText: {
    color: C.white,
    fontSize: 34,
  },
  headerTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },
  headerIcon: {
    color: C.white,
    fontSize: 24,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 28,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
  },
  logo: {
    fontSize: 76,
    color: C.blueLight,
    marginBottom: 10,
  },
  brand: {
    color: C.white,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  title: {
    color: C.white,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 8,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 10,
  },
  greeting: {
    color: C.white,
    fontSize: 23,
    fontWeight: '700',
    marginTop: 6,
  },
  muted: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 4,
  },
  whiteText: {
    color: C.white,
    fontSize: 12,
  },
  sectionTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 12,
  },
  card: {
    backgroundColor: C.panel,
    borderRadius: 13,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  cardIcon: {
    color: C.blueLight,
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  cardTitle: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
  arrow: {
    color: C.muted,
    fontSize: 24,
  },
  button: {
    borderRadius: 11,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
  fieldWrap: {
    marginTop: 16,
  },
  label: {
    color: C.muted,
    fontSize: 12,
    marginBottom: 7,
  },
  input: {
    color: C.white,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
  },
  searchBox: {
    backgroundColor: C.panel,
    padding: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 18,
  },
  hero: {
    backgroundColor: '#292E74',
    borderRadius: 16,
    padding: 17,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#444DAD',
  },
  heroTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: '#D7DBFF',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 19,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  quickItem: {
    width: '48%',
    minHeight: 92,
    backgroundColor: C.panel,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.border,
    padding: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickIcon: {
    color: C.blueLight,
    fontSize: 26,
    marginBottom: 8,
  },
  quickLabel: {
    color: C.white,
    fontSize: 12,
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: 9,
    paddingBottom: 10,
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    minWidth: 48,
  },
  navIcon: {
    color: C.muted,
    fontSize: 21,
  },
  navLabel: {
    color: C.muted,
    fontSize: 10,
    marginTop: 3,
  },
  mapPanel: {
    height: 320,
    backgroundColor: '#151D35',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  mapRoad1: {
    position: 'absolute',
    width: '150%',
    height: 2,
    top: '35%',
    left: '-20%',
    backgroundColor: '#38415B',
    transform: [{ rotate: '35deg' }],
  },
  mapRoad2: {
    position: 'absolute',
    width: '150%',
    height: 2,
    top: '60%',
    left: '-20%',
    backgroundColor: '#38415B',
    transform: [{ rotate: '-30deg' }],
  },
  mapRoad3: {
    position: 'absolute',
    width: '120%',
    height: 2,
    top: '50%',
    left: '-10%',
    backgroundColor: '#38415B',
    transform: [{ rotate: '75deg' }],
  },
  mapRoad4: {
    position: 'absolute',
    width: '120%',
    height: 2,
    top: '50%',
    left: '-10%',
    backgroundColor: '#38415B',
    transform: [{ rotate: '-65deg' }],
  },
  mapRoute: {
    position: 'absolute',
    width: 5,
    height: 190,
    backgroundColor: C.blueLight,
    left: '48%',
    top: 65,
    borderRadius: 5,
    transform: [{ rotate: '24deg' }],
  },
  mapPinStart: {
    position: 'absolute',
    left: '44%',
    top: '65%',
    backgroundColor: C.blue,
    borderRadius: 25,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#A8B1FF',
  },
  mapMarker: {
    position: 'absolute',
    fontSize: 23,
  },
  mapLocationLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: C.panel,
    padding: 10,
    borderRadius: 9,
  },
  hazard: {
    position: 'absolute',
    backgroundColor: C.red,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardText: {
    color: C.white,
    fontSize: 18,
    fontWeight: '800',
  },
  hazardLegend: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: C.panel,
    borderRadius: 9,
    padding: 9,
    gap: 5,
  },
  smallText: {
    color: C.white,
    fontSize: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    backgroundColor: C.panel,
    borderRadius: 12,
    padding: 14,
  },
  statValue: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 10,
  },
  chip: {
    backgroundColor: C.panel2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectedChip: {
    backgroundColor: C.blue,
    borderColor: C.blueLight,
  },
  sosCircle: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: '#81263C',
    marginVertical: 28,
    elevation: 8,
  },
  sosText: {
    color: C.white,
    fontSize: 40,
    fontWeight: '800',
  },
  sosCaption: {
    color: C.white,
    fontSize: 12,
    marginTop: 4,
  },
  avatar: {
    fontSize: 65,
    marginBottom: 10,
  },
  countdownCircle: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: C.red,
    backgroundColor: '#351927',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 28,
  },
  countdown: {
    color: C.red,
    fontSize: 50,
    fontWeight: '800',
  },
  note: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  footerLinks: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 25,
    paddingTop: 15,
  },
});

