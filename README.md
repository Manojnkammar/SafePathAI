# SafePath AI

**A Smart Emergency and Intelligent Navigation Platform**

SafePath AI is a mobile safety platform that detects hazards, dispatches SOS alerts, reroutes users around danger zones, and gives step-by-step emergency guidance in plain language. A user opens one app and gets the whole emergency lifecycle: detection, dispatch, safe routing, advisory and community alerts. The system fuses camera and sensor data, community reports and agency feeds into one live hazard picture, and uses GPT-4o to write advice grounded in that picture.

Example: a user near a flooded underpass taps SOS. The app captures GPS, time and incident context, alerts the nearest emergency services, draws a safe alternative route that avoids the flood polygon, and the advisory chat explains what to do next and why that route was chosen.

## Contents
1. Key features
2. System architecture
3. How it works
4. The six modules in detail
5. Use cases
6. Technology stack
7. Requirements
8. Evaluation
9. Limitations
10. Future scope

---

## 1. Key features

| Feature | What it does |
|---|---|
| One-tap SOS | Single interaction captures GPS, timestamp and incident context and starts dispatch. |
| Real-time hazard detection | Classifies accidents, floods, fires and road blockages from camera and sensor data. |
| Hazard-aware routing | Computes safe alternative paths that avoid live hazard zones using weighted Dijkstra. |
| Grounded AI advisory | GPT-4o sees live location, hazards, routes and SOS status before it answers. |
| Community Alert Network | Users report hazards; an AI credibility score filters noise before broadcast. |
| Real-time sync | Firebase pushes hazard updates to all active users in under a second. |
| Offline resilience | TensorFlow Lite runs detection and SOS on the device without network. |
| Explainable routes | Every route recommendation names the hazard it avoids, in plain language. |

---

## 2. System architecture

### 2.1 High-level architecture

```mermaid
flowchart TB
    subgraph CLIENT["Mobile App (React Native)"]
        UI["Map + Hazard Overlays"]
        SOSBTN["One-Tap SOS Button"]
        CHAT["AI Advisory Chat"]
        REPORT["Hazard Report Form"]
        TFL["TensorFlow Lite<br/>On-device Detection"]
    end

    subgraph BACKEND["FastAPI Backend (async orchestration)"]
        M1["Module 1<br/>Incident Detection"]
        M2["Module 2<br/>SOS Dispatch"]
        M3["Module 3<br/>Safe Route Engine"]
        M4["Module 4<br/>Real-Time Data Fusion"]
        M5["Module 5<br/>AI Advisory"]
        M6["Module 6<br/>Community Alert Network"]
    end

    subgraph EXT["External Services"]
        GMAPS["Google Maps Platform / OSM"]
        GPT["GPT-4o (OpenAI)"]
        AGENCY["Emergency Agencies<br/>Police / Ambulance / Fire"]
        FEEDS["Govt Feeds, Traffic and Weather APIs"]
    end

    subgraph DATA["Real-Time Data Layer"]
        FB[("Firebase Realtime DB")]
        FBS[("Firebase Storage<br/>Incident Media")]
    end

    TFL --> M1
    SOSBTN --> M2
    CHAT --> M5
    REPORT --> M6
    UI <--> FB

    M1 --> M2
    M1 --> M3
    M1 --> M4
    M2 --> AGENCY
    M3 <--> GMAPS
    M3 --> M5
    M4 <--> FB
    FEEDS --> M4
    M6 --> M4
    M6 --> FBS
    M5 <--> GPT
    M2 --> M5
```

**How to read it:** the phone captures input (camera, SOS tap, chat, reports). FastAPI runs the six modules. Firebase is the shared live state that every phone reads from. External services supply maps, language intelligence and the emergency agencies.

### 2.2 Components

| Component | Technology | Responsibility |
|---|---|---|
| Mobile frontend | React Native 0.73+ | Map, SOS panel, route panel, advisory chat, report form |
| Backend API | FastAPI (Python 3.10+) | Asynchronous orchestration of all six modules |
| Geospatial services | Google Maps Platform, OpenStreetMap | Live traffic, geocoding, road graph, geofencing |
| Real-time layer | Firebase Realtime DB | Sub-second hazard propagation to all sessions |
| Media storage | Firebase Storage | User-submitted photos and videos |
| On-device AI | TensorFlow Lite (MobileNetV3) | Offline frame-level incident classification |
| Cloud vision | EfficientDet | Precise localisation and multi-class classification |
| Advisory LLM | GPT-4o | Conversational, situation-grounded guidance |
| Routing algorithm | Dijkstra on weighted directed graph | Top-K safe alternatives |

### 2.3 Layered view

```mermaid
flowchart LR
    A["Presentation Layer<br/>React Native UI"] --> B["Application Layer<br/>FastAPI + 6 Modules"]
    B --> C["Intelligence Layer<br/>TFLite, EfficientDet, GPT-4o, Dijkstra"]
    B --> D["Data Layer<br/>Firebase DB + Storage"]
    B --> E["Integration Layer<br/>Maps, Agency APIs, Traffic and Weather"]
```

---

## 3. How it works

### 3.1 End-to-end request flow

```mermaid
sequenceDiagram
    actor U as User
    participant APP as React Native App
    participant TFL as TFLite (on device)
    participant API as FastAPI Backend
    participant FB as Firebase
    participant AG as Emergency Services
    participant RT as Safe Route Engine
    participant LLM as GPT-4o

    U->>APP: Opens app
    APP->>FB: Subscribe to hazard overlays
    FB-->>APP: Live hazard zones

    loop Continuous
        APP->>TFL: Camera frames + sensor data
        TFL-->>APP: Incident class + confidence
    end

    U->>APP: Taps SOS (or auto-trigger on high confidence)
    APP->>API: Alert packet (GPS, type, severity, context)
    API->>AG: Prioritised alert to nearest services
    AG-->>API: Acknowledgement
    API-->>APP: Dispatch status (under 3 s)

    API->>RT: Query hazard-weighted graph
    RT-->>API: Ranked safe routes + explanation
    API->>LLM: Situation-grounded prompt
    LLM-->>API: Advisory (streamed)
    API-->>APP: Routes + advisory + status
    APP-->>U: Map, route panel, chat guidance

    API->>FB: Update hazard graph
    FB-->>APP: Overlays refresh automatically
```

### 3.2 Decision flow inside the backend

```mermaid
flowchart TD
    S(["Input received"]) --> T{"Input type?"}
    T -->|"Camera / sensor"| D1["Stage 1: MobileNetV3 on device"]
    T -->|"SOS tap"| SOS["Build alert packet"]
    T -->|"Community report"| V["AI credibility scoring"]
    T -->|"Chat question"| ADV["Build grounded prompt"]

    D1 --> F{"Incident signature?"}
    F -->|No| END1(["Keep monitoring"])
    F -->|Yes| D2["Stage 2: EfficientDet in cloud<br/>class + confidence + severity"]
    D2 --> TH{"Confidence above threshold?"}
    TH -->|No| END1
    TH -->|Yes| SOS
    TH -->|Yes| ROUTE

    SOS --> DISP["Notify nearest services<br/>police / ambulance / fire"]
    DISP --> TRACK["Track acknowledgement status"]
    TRACK --> ADV

    V --> OK{"Score above threshold?"}
    OK -->|No| DROP(["Report held back"])
    OK -->|Yes| FUSE["Add to Data Fusion Layer"]

    FUSE --> POLY["Create buffered hazard polygon"]
    POLY --> ROUTE["Recompute safe routes<br/>Dijkstra with hazard-weighted edges"]
    ROUTE --> RANK["Rank by safety score and ETA"]
    RANK --> ADV
    ADV --> LLM["GPT-4o with chain-of-thought"]
    LLM --> OUT(["Numbered steps, hazard explanation,<br/>emergency contacts, help status"])
```

### 3.3 Step by step

1. **Open the app.** The map loads with live hazard overlays from Firebase.
2. **Monitor continuously.** The on-device TFLite model analyses camera frames and sensor data (GPS, accelerometer, barometer) for incident signatures.
3. **Trigger.** A high-confidence detection or a manual SOS tap sends a structured alert to FastAPI.
4. **Dispatch.** The backend finds the nearest relevant services and forwards location and incident context.
5. **Reroute.** The Safe Route Engine queries the hazard-weighted graph and returns ranked safe alternatives.
6. **Advise.** The AI Advisory Module builds a situation-grounded prompt and calls GPT-4o.
7. **Stream.** The response streams back through FastAPI into the chat panel token by token.
8. **Community.** User reports are validated by the credibility model and broadcast through Firebase to nearby users.
9. **Fuse.** The Data Fusion Layer keeps updating the hazard graph as new data arrives.
10. **Refresh.** Map overlays and route recommendations update automatically.

### 3.4 Key parameters and targets

| Parameter | Value | Module |
|---|---|---|
| SOS alert latency target | under 3 s | SOS Dispatch |
| Route recomputation target | under 2 s | Safe Route Engine |
| Detection precision target | at least 85% | Incident Detection |
| Severity levels | low, medium, high, critical | Incident Detection |
| Detection classes | accident, flood, fire, blockage | Incident Detection |
| Edge weight tunables | alpha, beta, gamma | Safe Route Engine |
| Hazard buffer | configurable safety radius | Safe Route Engine |
| Detection confidence threshold | configurable | Incident Detection |

---

## 4. The six modules in detail

### 4.1 Module 1: Incident Detection

Takes camera frames and sensor streams and produces a classified incident with confidence and severity. It runs in two stages so the phone can work offline while the cloud adds precision.

```mermaid
flowchart LR
    CAM["Camera frames"] --> S1
    SEN["GPS + accelerometer + barometer"] --> S1
    S1["Stage 1<br/>MobileNetV3 on TFLite<br/>frame-level scene classifier"] -->|"flagged frames"| S2
    S1 -->|"nothing flagged"| X(["Discard"])
    S2["Stage 2<br/>EfficientDet in cloud<br/>localisation + multi-class"] --> LBL["Label:<br/>class + confidence + severity"]
    LBL --> G{"Above threshold?"}
    G -->|Yes| OUT["Forward to SOS Dispatch<br/>and Safe Route Engine"]
    G -->|No| X
```

### 4.2 Module 2: SOS Dispatch

Triggered automatically on a high-confidence detection or manually by the one-tap button.

```mermaid
flowchart TD
    TRG{"Trigger"} -->|"Auto: detection"| CAP
    TRG -->|"Manual: SOS tap"| CAP
    CAP["Capture GPS, timestamp,<br/>incident class, severity, context summary"] --> PKT["Prioritised alert packet"]
    PKT --> API["FastAPI backend"]
    API --> SEL["Select nearest relevant agencies"]
    SEL --> P["Police"]
    SEL --> A["Ambulance"]
    SEL --> F["Fire brigade"]
    P --> ACK["Acknowledgements tracked"]
    A --> ACK
    F --> ACK
    ACK --> UI["Live status tracker in app<br/>confirmation time, units, ETA"]
```

### 4.3 Module 3: Safe Route Engine

The road network is a weighted directed graph G = (V, E, W). Each road segment gets a composite cost:

```
W(e) = alpha * t(e) + beta * h(e) + gamma * c(e)
```

- `t(e)` is estimated travel time.
- `h(e)` is the hazard penalty for edges inside or next to an active hazard zone.
- `c(e)` is the congestion factor from live traffic.
- `alpha`, `beta`, `gamma` are tunable weights that trade speed against safety.

```mermaid
flowchart TD
    H1["Confirmed incidents"] --> POLY
    H2["Disaster boundary feeds"] --> POLY
    H3["Validated community reports"] --> POLY
    POLY["Geo-fenced hazard polygons<br/>buffered to safety radius"] --> PEN["Compute hazard penalty h(e)<br/>for affected edges"]
    TR["Live traffic"] --> CON["Congestion factor c(e)"]
    TT["Travel time"] --> TE["t(e)"]
    PEN --> W["Edge weight W(e)"]
    CON --> W
    TE --> W
    W --> DJ["Dijkstra, top-K paths"]
    DJ --> RK["Rank by safety score (0-100) and ETA"]
    RK --> EX["Plain-language explanation<br/>of hazard avoided"]
    EX --> OUT["Route polyline, ETA, distance delta,<br/>turn-by-turn list"]
```

### 4.4 Module 4: Real-Time Data Fusion Layer

```mermaid
flowchart LR
    A["On-device detections"] --> FUSE
    B["Community reports<br/>after AI validation"] --> FUSE
    C["Government and agency feeds"] --> FUSE
    D["Traffic and weather APIs"] --> FUSE
    FUSE{{"Data Fusion Layer"}} --> FB[("Firebase Realtime DB")]
    FB --> U1["User 1"]
    FB --> U2["User 2"]
    FB --> U3["User N"]
```

Every active session reads the same hazard picture, so all users see consistent overlays and route advice.

### 4.5 Module 5: AI Advisory

The LLM never answers in a vacuum. The prompt is built from live context so advice is specific to the user's situation.

```mermaid
flowchart TD
    SYS["System prompt<br/>advisor role, format, safety constraints"] --> PROMPT
    LOC["User GPS + nearest hazards + distances"] --> PROMPT
    RTE["Safe routes with hazards avoided"] --> PROMPT
    DSP["SOS dispatch status"] --> PROMPT
    COT["Chain-of-thought instruction"] --> PROMPT
    FMT["Output format specification"] --> PROMPT
    Q["User question"] --> PROMPT
    PROMPT["Situation-grounded prompt"] --> LLM["GPT-4o"]
    LLM --> RESP["1. Numbered action steps<br/>2. Hazard and proximity explanation<br/>3. Emergency contact numbers<br/>4. Is help in transit?"]
    RESP --> STR["Streamed token by token to chat"]
```

### 4.6 Module 6: Community Alert Network

```mermaid
flowchart TD
    R["User submits geo-tagged report<br/>type + severity + optional photo or video"] --> VAL
    subgraph VAL["AI credibility scoring"]
        V1["Location plausibility"]
        V2["Type consistency with sensor data"]
        V3["Agreement with nearby reports"]
    end
    VAL --> SC{"Score above threshold?"}
    SC -->|Yes| BC["Broadcast marker via Firebase<br/>to users in affected area"]
    SC -->|No| HOLD["Not broadcast"]
    BC --> FUS["Feeds Data Fusion and Safe Route Engine"]
```

---

## 5. Use cases

| Use case | Scenario | Behaviour |
|---|---|---|
| Road accident | User witnesses or is in a crash | Detects, auto or manual SOS, ambulance and police notified, advisory guides first steps |
| Flood | Flash flood on the planned route | Polygon created, route recalculated around it, explanation names the flood |
| Fire | Fire near the user's location | Fire brigade alerted, evacuation route shown, advisory lists actions |
| Road blockage | Blocked road ahead | Rerouted with ETA and distance delta |
| Crowd report | A user spots a hazard no sensor sees | Report scored, validated, broadcast to nearby users |
| Low connectivity | Network drops | On-device detection and SOS keep working in degraded mode |

---

## 6. Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Mobile | React Native v0.73+ | Cross-platform iOS and Android app |
| Backend | FastAPI, Python 3.10+ | Async API and AI pipeline orchestration |
| Maps | Google Maps Platform, OpenStreetMap | Routing, traffic, geocoding, geofencing |
| Real-time DB | Firebase Realtime Database | Sub-second alert propagation |
| Storage | Firebase Storage | Incident media |
| On-device AI | TensorFlow Lite, MobileNetV3 | Offline classification |
| Cloud vision | EfficientDet | Localisation and multi-class detection |
| LLM | GPT-4o (OpenAI) | Advisory generation |
| Tools | Git/GitHub, Postman/Swagger UI, VS Code, Android Studio | Development and testing |

---

## 7. Requirements

### 7.1 Functional

| ID | Requirement |
|---|---|
| FR01 | One-tap SOS with auto-captured GPS, timestamp and context |
| FR02 | Automated dispatch to nearest police, ambulance, fire |
| FR03 | Real-time hazard detection from camera and sensors |
| FR04 | Safe route computation avoiding live hazard zones |
| FR05 | Geo-tagged community hazard reports with optional media |
| FR06 | AI credibility scoring before broadcast |
| FR07 | Live hazard map overlay |
| FR08 | AI advisory chat grounded in live context |
| FR09 | Offline on-device detection |
| FR10 | Multi-agency alert coordination with status tracking |

### 7.2 Non-functional

| ID | Requirement | Target |
|---|---|---|
| NFR01 | Alert latency | under 3 s |
| NFR02 | Route computation | under 2 s |
| NFR03 | Detection precision | at least 85% |
| NFR04 | Availability | Async concurrent request handling |
| NFR05 | Offline resilience | Core SOS and detection work offline |
| NFR06 | Scalability | City-scale users via Firebase scaling |
| NFR07 | Usability under stress | Single tap, no forms |
| NFR08 | Explainability | Plain-language reason for every route |

### 7.3 Hardware

- Development machine: 16 GB RAM, hexa-core CPU, 100 GB free storage
- Phone: Android 10+ or iOS 14+ with GPS, camera and accelerometer (GPS only for minimal SOS)
- Network: 4G/LTE in production, graceful degradation to 3G
- Server: cloud host with Python 3.10+ and GPU access for model serving

---

## 8. Evaluation

| Test | Result | Target |
|---|---|---|
| Detection precision (2,000 test images, 4 classes) | 87.3% | at least 85% |
| Detection recall | 84.6% | n/a |
| Best class: road accidents | 91.2% precision | n/a |
| Weakest class: road blockages | 82.1% precision | n/a |
| Route computation after hazard update | 1.4 s average | under 2 s |
| Route quality (50 simulated hazard scenarios) | All alternatives avoided the hazard | 100% |
| SOS latency on 4G | 1.8 s average | under 3 s |
| Community report validation (300 synthetic reports) | 92% genuine reports validated | n/a |
| False-positive broadcast rate | below 6% | n/a |
| Functional testing | All six modules passed end to end | n/a |

---

## 9. Limitations

- **Generalisation.** The detection model may underperform on incident types or environments missing from the training data.
- **LLM latency.** GPT-4o adds 2 to 4 seconds, which matters in the most urgent moments.
- **Network dependency.** SOS and on-device detection work offline, but safe routing and community broadcasting need connectivity.
- **Agency integration.** Fully automated dispatch needs formal API agreements with emergency agencies, still pending approval.
- **Synthetic validation data.** Community report validation was tested on synthetic reports, not live traffic.

---

## 10. Future scope

- Wearable integration (smartwatches and fitness bands) for hands-free detection
- Drone-assisted hazard confirmation and search and rescue
- Predictive hazard modelling for floods, fires and congestion
- Multilingual advisory: Kannada, Hindi, Tamil, Telugu
- Integration with NDMA, state disaster authorities and traffic control
- Standardised benchmarks for end-to-end response time and route safety
