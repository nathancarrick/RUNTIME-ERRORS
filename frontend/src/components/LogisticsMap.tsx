import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

/* =========================================================
   TYPES
========================================================= */

interface LogisticsMapProps {
  origin?: string;
  destination?: string;
  currentLocation?: string;
  recommendedRoute?: string;
  alternateRoute?: string;
  disruptionType?: string;
  vehicleType?: string;

  onRouteSelect?: (
    route:
      | "RECOMMENDED"
      | "ALTERNATIVE_1"
      | "ALTERNATIVE_2"
  ) => void;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface OsrmRoute {
  geometry: {
    coordinates: [number, number][];
  };
  distance: number;
  duration: number;
}

interface RouteData {
  id: string;
  name: string;

  coordinates: [number, number][];

  distanceKm: number;
  durationMinutes: number;

  extraDistanceKm: number;
  extraTimeMinutes: number;

  score: number;

  routeType:
    | "ORIGINAL"
    | "RECOVERY";
}

/* =========================================================
   LEAFLET ICONS
========================================================= */

const vehicleIcon = L.divIcon({
  className: "logiaid-vehicle-marker",
  html: `
    <div style="
      width:44px;
      height:44px;
      border-radius:50%;
      background:#06b6d4;
      border:4px solid white;
      box-shadow:
        0 0 0 6px rgba(6,182,212,.20),
        0 0 25px rgba(6,182,212,.65);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:21px;
    ">
      🚚
    </div>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
});

const destinationIcon = L.divIcon({
  className: "logiaid-destination-marker",
  html: `
    <div style="
      width:44px;
      height:44px;
      border-radius:50%;
      background:#10b981;
      border:4px solid white;
      box-shadow:
        0 0 0 6px rgba(16,185,129,.20),
        0 0 25px rgba(16,185,129,.65);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:20px;
    ">
      🏁
    </div>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
});

const disruptionIcon = L.divIcon({
  className: "logiaid-disruption-marker",
  html: `
    <div style="
      width:46px;
      height:46px;
      border-radius:50%;
      background:#ef4444;
      border:4px solid white;
      box-shadow:
        0 0 0 7px rgba(239,68,68,.20),
        0 0 30px rgba(239,68,68,.75);
      display:flex;
      align-items:center;
      justify-content:center;
      color:white;
      font-size:21px;
      font-weight:900;
    ">
      !
    </div>
  `,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
  popupAnchor: [0, -23],
});

/* =========================================================
   KNOWN LOCATIONS
   These are ONLY geocoding shortcuts.
   They are NEVER shown as destinations.
========================================================= */

const KNOWN_LOCATIONS: Record<
  string,
  Coordinates
> = {
  coimbatore: {
    lat: 11.0168,
    lng: 76.9558,
  },

  chennai: {
    lat: 13.0827,
    lng: 80.2707,
  },

  erode: {
    lat: 11.341,
    lng: 77.7172,
  },

  salem: {
    lat: 11.6643,
    lng: 78.146,
  },

  tiruppur: {
    lat: 11.1085,
    lng: 77.3411,
  },

  karur: {
    lat: 10.9601,
    lng: 78.0766,
  },

  namakkal: {
    lat: 11.2194,
    lng: 78.1677,
  },

  madurai: {
    lat: 9.9252,
    lng: 78.1198,
  },

  trichy: {
    lat: 10.7905,
    lng: 78.7047,
  },

  tiruchirappalli: {
    lat: 10.7905,
    lng: 78.7047,
  },

  bangalore: {
    lat: 12.9716,
    lng: 77.5946,
  },

  bengaluru: {
    lat: 12.9716,
    lng: 77.5946,
  },

  kochi: {
    lat: 9.9312,
    lng: 76.2673,
  },

  hyderabad: {
    lat: 17.385,
    lng: 78.4867,
  },

  dharmapuri: {
    lat: 12.1277,
    lng: 78.1579,
  },
};

/* =========================================================
   HELPERS
========================================================= */

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTime(
  minutes: number
): string {
  const total = Math.max(
    0,
    Math.round(minutes)
  );

  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

function calculateDistance(
  a: Coordinates,
  b: Coordinates
): number {
  const R = 6371;

  const lat1 =
    (a.lat * Math.PI) / 180;

  const lat2 =
    (b.lat * Math.PI) / 180;

  const dLat =
    ((b.lat - a.lat) * Math.PI) /
    180;

  const dLng =
    ((b.lng - a.lng) * Math.PI) /
    180;

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    );

  return R * c;
}

/* =========================================================
   GEOCODING
========================================================= */

async function geocode(
  place: string
): Promise<Coordinates | null> {
  const normalized = normalize(place);

  if (!normalized) {
    return null;
  }

  /* Known location shortcut */
  for (const [
    name,
    coordinates,
  ] of Object.entries(KNOWN_LOCATIONS)) {
    if (
      normalized === name ||
      normalized.includes(name)
    ) {
      return coordinates;
    }
  }

  /* OpenStreetMap Nominatim */
  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(
        place
      )}`;

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (
      !Array.isArray(data) ||
      data.length === 0
    ) {
      return null;
    }

    const lat = Number(data[0]?.lat);
    const lng = Number(data[0]?.lon);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return null;
    }

    return {
      lat,
      lng,
    };
  } catch (error) {
    console.error(
      "Geocoding failed:",
      error
    );

    return null;
  }
}

/* =========================================================
   OSRM
========================================================= */

async function getOsrmRoutes(
  start: Coordinates,
  end: Coordinates
): Promise<OsrmRoute[]> {
  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${start.lng},${start.lat};${end.lng},${end.lat}` +
    "?overview=full" +
    "&geometries=geojson" +
    "&steps=true" +
    "&alternatives=true";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Routing service returned ${response.status}`
    );
  }

  const data = await response.json();

  if (
    data?.code !== "Ok" ||
    !Array.isArray(data?.routes) ||
    data.routes.length === 0
  ) {
    throw new Error(
      "No road route was found."
    );
  }

  return data.routes as OsrmRoute[];
}

/* =========================================================
   WAYPOINT ROUTING
   IMPORTANT:
   Waypoint is ONLY used internally to force a
   different road corridor.

   START -> WAYPOINT -> SAME FINAL DESTINATION

   The waypoint is NEVER shown as destination.
========================================================= */

function createDetourPoint(
  start: Coordinates,
  end: Coordinates,
  side: "LEFT" | "RIGHT"
): Coordinates {
  const dLat = end.lat - start.lat;
  const dLng = end.lng - start.lng;

  const length = Math.sqrt(
    dLat * dLat + dLng * dLng
  );

  if (length === 0) {
    return start;
  }

  const perpendicularLat =
    -dLng / length;

  const perpendicularLng =
    dLat / length;

  const distanceKm =
    calculateDistance(
      start,
      end
    );

  /*
   * Keep the detour controlled.
   * It is not a destination.
   */
  const offset = Math.min(
    0.55,
    Math.max(
      0.10,
      distanceKm / 800
    )
  );

  const direction =
    side === "LEFT" ? 1 : -1;

  const progress = 0.42;

  return {
    lat:
      start.lat +
      dLat * progress +
      perpendicularLat *
        offset *
        direction,

    lng:
      start.lng +
      dLng * progress +
      perpendicularLng *
        offset *
        direction,
  };
}

async function getWaypointRoute(
  start: Coordinates,
  waypoint: Coordinates,
  end: Coordinates
): Promise<OsrmRoute | null> {
  try {
    const url =
      "https://router.project-osrm.org/route/v1/driving/" +
      `${start.lng},${start.lat};` +
      `${waypoint.lng},${waypoint.lat};` +
      `${end.lng},${end.lat}` +
      "?overview=full" +
      "&geometries=geojson" +
      "&steps=true";

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (
      data?.code !== "Ok" ||
      !Array.isArray(data?.routes) ||
      data.routes.length === 0
    ) {
      return null;
    }

    return data.routes[0] as OsrmRoute;
  } catch {
    return null;
  }
}

/* =========================================================
   CONVERT OSRM ROUTE
========================================================= */

function convertRoute(
  route: OsrmRoute,
  id: string,
  routeType:
    | "ORIGINAL"
    | "RECOVERY"
): RouteData {
  const coordinates: [
    number,
    number
  ][] =
    route.geometry.coordinates.map(
      ([lng, lat]) => [
        lat,
        lng,
      ]
    );

  return {
    id,

    name:
      routeType === "ORIGINAL"
        ? "Original Route"
        : "Recovery Route",

    coordinates,

    distanceKm:
      route.distance / 1000,

    durationMinutes:
      route.duration / 60,

    extraDistanceKm: 0,
    extraTimeMinutes: 0,

    score: 0,

    routeType,
  };
}

/* =========================================================
   DUPLICATE FILTER
========================================================= */

function removeDuplicateRoutes(
  routes: RouteData[]
): RouteData[] {
  const result: RouteData[] = [];

  for (const route of routes) {
    const duplicate =
      result.some(
        (existing) =>
          Math.abs(
            existing.distanceKm -
              route.distanceKm
          ) < 1.5 &&
          Math.abs(
            existing.durationMinutes -
              route.durationMinutes
          ) < 5
      );

    if (!duplicate) {
      result.push(route);
    }
  }

  return result;
}

/* =========================================================
   SCORE
========================================================= */

function calculateScore(
  route: RouteData,
  original: RouteData
): number {
  const distanceRatio =
    original.distanceKm > 0
      ? route.distanceKm /
        original.distanceKm
      : 1;

  const timeRatio =
    original.durationMinutes > 0
      ? route.durationMinutes /
        original.durationMinutes
      : 1;

  /*
   * Lower is better.
   * Time has slightly higher weight.
   */
  return Math.round(
    distanceRatio * 40 +
      timeRatio * 60
  );
}

/* =========================================================
   MAP RESIZE
========================================================= */

function MapResizeFix() {
  const map = useMap();

  useEffect(() => {
    const timers = [
      window.setTimeout(
        () => map.invalidateSize(),
        100
      ),

      window.setTimeout(
        () => map.invalidateSize(),
        500
      ),

      window.setTimeout(
        () => map.invalidateSize(),
        1000
      ),
    ];

    return () => {
      timers.forEach((timer) =>
        window.clearTimeout(timer)
      );
    };
  }, [map]);

  return null;
}

/* =========================================================
   FIT MAP
========================================================= */

function FitMap({
  routes,
}: {
  routes: RouteData[];
}) {
  const map = useMap();

  useEffect(() => {
    if (routes.length === 0) {
      return;
    }

    const allPoints: [
      number,
      number
    ][] = [];

    routes.forEach((route) => {
      route.coordinates.forEach(
        (point) => {
          allPoints.push(point);
        }
      );
    });

    if (allPoints.length < 2) {
      return;
    }

    const bounds =
      L.latLngBounds(allPoints);

    map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 10,
    });
  }, [map, routes]);

  return null;
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function LogisticsMap({
  origin,
  destination,
  currentLocation,
  disruptionType = "ROAD_BLOCK",
  vehicleType = "Delivery Truck",
  onRouteSelect,
}: LogisticsMapProps) {
  const [start, setStart] =
    useState<Coordinates | null>(null);

  const [end, setEnd] =
    useState<Coordinates | null>(null);

  const [routes, setRoutes] =
    useState<RouteData[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    selectedRoute,
    setSelectedRoute,
  ] = useState<
    | "RECOMMENDED"
    | "ALTERNATIVE_1"
    | "ALTERNATIVE_2"
  >("RECOMMENDED");

  /*
   * IMPORTANT:
   * Current = vehicle's actual current location.
   * If backend doesn't provide it,
   * origin is used.
   */
  const currentPlace =
    currentLocation?.trim() ||
    origin?.trim() ||
    "";

  /*
   * FINAL DESTINATION.
   * This is NEVER changed by recovery routing.
   */
  const finalPlace =
    destination?.trim() ||
    "";

  /* =======================================================
     RESOLVE LOCATIONS
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function resolveLocations() {
      setLoading(true);
      setError("");
      setRoutes([]);
      setStart(null);
      setEnd(null);

      if (!currentPlace) {
        setError(
          "Current location is missing."
        );

        setLoading(false);
        return;
      }

      if (!finalPlace) {
        setError(
          "Final destination is missing."
        );

        setLoading(false);
        return;
      }

      try {
        const [
          startPoint,
          endPoint,
        ] = await Promise.all([
          geocode(currentPlace),
          geocode(finalPlace),
        ]);

        if (cancelled) {
          return;
        }

        if (!startPoint) {
          setError(
            `Could not locate "${currentPlace}".`
          );

          setLoading(false);
          return;
        }

        if (!endPoint) {
          setError(
            `Could not locate "${finalPlace}".`
          );

          setLoading(false);
          return;
        }

        setStart(startPoint);
        setEnd(endPoint);
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setError(
            "Unable to locate route points."
          );

          setLoading(false);
        }
      }
    }

    resolveLocations();

    return () => {
      cancelled = true;
    };
  }, [currentPlace, finalPlace]);

  /* =======================================================
     CALCULATE ROUTES
  ======================================================= */

  useEffect(() => {
    if (!start || !end) {
      return;
    }

    /*
     * Explicit non-null values.
     * Fixes TypeScript Coordinates | null error.
     */
    const routeStart: Coordinates =
      start;

    const routeEnd: Coordinates =
      end;

    let cancelled = false;

    async function calculateRoutes() {
      setLoading(true);
      setError("");
      setRoutes([]);

      try {
        /*
         * ---------------------------------------------------
         * ORIGINAL + NATIVE ALTERNATIVES
         * ---------------------------------------------------
         */

        const osrmRoutes =
          await getOsrmRoutes(
            routeStart,
            routeEnd
          );

        if (cancelled) {
          return;
        }

        const original =
          convertRoute(
            osrmRoutes[0],
            "original",
            "ORIGINAL"
          );

        let recoveryRoutes: RouteData[] =
          osrmRoutes
            .slice(1)
            .map(
              (route, index) =>
                convertRoute(
                  route,
                  `native-${index}`,
                  "RECOVERY"
                )
            );

        /*
         * ---------------------------------------------------
         * FORCE MORE ALTERNATIVE ROADS
         * ---------------------------------------------------
         *
         * If OSRM gives fewer alternatives,
         * calculate routes through internal waypoints.
         *
         * The final endpoint is ALWAYS routeEnd.
         */

        if (recoveryRoutes.length < 2) {
          const leftWaypoint =
            createDetourPoint(
              routeStart,
              routeEnd,
              "LEFT"
            );

          const rightWaypoint =
            createDetourPoint(
              routeStart,
              routeEnd,
              "RIGHT"
            );

          const [
            leftRoute,
            rightRoute,
          ] = await Promise.all([
            getWaypointRoute(
              routeStart,
              leftWaypoint,
              routeEnd
            ),

            getWaypointRoute(
              routeStart,
              rightWaypoint,
              routeEnd
            ),
          ]);

          if (leftRoute) {
            recoveryRoutes.push(
              convertRoute(
                leftRoute,
                "left-recovery",
                "RECOVERY"
              )
            );
          }

          if (rightRoute) {
            recoveryRoutes.push(
              convertRoute(
                rightRoute,
                "right-recovery",
                "RECOVERY"
              )
            );
          }
        }

        if (cancelled) {
          return;
        }

        /*
         * Remove duplicate routes.
         */
        recoveryRoutes =
          removeDuplicateRoutes(
            recoveryRoutes
          );

        /*
         * Calculate additional distance/time.
         */
        recoveryRoutes =
          recoveryRoutes.map(
            (route) => ({
              ...route,

              extraDistanceKm:
                Math.max(
                  0,
                  route.distanceKm -
                    original.distanceKm
                ),

              extraTimeMinutes:
                Math.max(
                  0,
                  Math.round(
                    route.durationMinutes -
                      original.durationMinutes
                  )
                ),

              score:
                calculateScore(
                  route,
                  original
                ),
            })
          );

        /*
         * Fastest practical alternative first.
         */
        recoveryRoutes.sort(
          (a, b) => {
            if (
              Math.abs(
                a.durationMinutes -
                  b.durationMinutes
              ) > 3
            ) {
              return (
                a.durationMinutes -
                b.durationMinutes
              );
            }

            return (
              a.distanceKm -
              b.distanceKm
            );
          }
        );

        /*
         * Maximum 3 alternatives.
         */
        recoveryRoutes =
          recoveryRoutes
            .slice(0, 3)
            .map(
              (route, index) => ({
                ...route,

                id:
                  index === 0
                    ? "recommended"
                    : `alternative-${index}`,

                name:
                  index === 0
                    ? "Recommended Recovery"
                    : `Alternative ${index}`,
              })
            );

        /*
         * FINAL ROUTE LIST.
         *
         * Every route:
         *
         * CURRENT LOCATION
         *       ↓
         * DIFFERENT ROAD
         *       ↓
         * SAME FINAL DESTINATION
         */
        setRoutes([
          original,
          ...recoveryRoutes,
        ]);

        setSelectedRoute(
          "RECOMMENDED"
        );
      } catch (error) {
        console.error(
          "LOGIAID routing error:",
          error
        );

        if (!cancelled) {
          setError(
            "Unable to calculate road routes. Please check your internet connection."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    calculateRoutes();

    return () => {
      cancelled = true;
    };
  }, [start, end]);

  /* =======================================================
     ROUTE DATA
  ======================================================= */

  const original = useMemo(
    () =>
      routes.find(
        (route) =>
          route.routeType ===
          "ORIGINAL"
      ),
    [routes]
  );

  const recoveryRoutes = useMemo(
    () =>
      routes.filter(
        (route) =>
          route.routeType ===
          "RECOVERY"
      ),
    [routes]
  );

  const recommended =
    recoveryRoutes[0];

  const alternative1 =
    recoveryRoutes[1];

  const alternative2 =
    recoveryRoutes[2];

  /*
   * Only for visualizing the affected portion
   * of the original route.
   */
  const affectedRoad =
    original?.coordinates.slice(
      0,
      Math.max(
        5,
        Math.floor(
          original.coordinates.length *
            0.14
        )
      )
    ) || [];

  const severeRoad =
    affectedRoad.slice(
      0,
      Math.max(
        3,
        Math.floor(
          affectedRoad.length *
            0.65
        )
      )
    );

  /* =======================================================
     SELECT ROUTE
  ======================================================= */

  function selectRoute(
    route:
      | "RECOMMENDED"
      | "ALTERNATIVE_1"
      | "ALTERNATIVE_2"
  ) {
    setSelectedRoute(route);

    onRouteSelect?.(route);
  }

  /* =======================================================
     MAP CENTER
  ======================================================= */

  const mapCenter: [
    number,
    number
  ] = start
    ? [start.lat, start.lng]
    : [11.0168, 76.9558];

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
      {/* =================================================
          HEADER
      ================================================= */}

      <div className="border-b border-slate-800 bg-slate-900 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-xl">
                🛰️
              </div>

              <div>
                <h2 className="text-lg font-bold text-white">
                  LOGIAID Route Intelligence
                </h2>

                <p className="text-xs text-slate-500">
                  Same destination • intelligent
                  recovery road
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-300">
              ⚪ Original
            </span>

            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-400">
              🔴 Disruption
            </span>

            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-400">
              🟢 Recommended
            </span>

            <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1.5 text-yellow-400">
              🟡 Alt 1
            </span>

            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-sky-400">
              🔵 Alt 2
            </span>
          </div>
        </div>
      </div>

      {/* =================================================
          FROM → DISRUPTION → TO
      ================================================= */}

      <div className="border-b border-slate-800 bg-slate-950 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* FROM */}
          <div className="flex-1 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              FROM
            </p>

            <p className="mt-1 text-base font-bold text-cyan-300">
              🚚 {currentPlace || "—"}
            </p>

            <p className="mt-1 text-[11px] text-slate-500">
              Vehicle current location
            </p>
          </div>

          <div className="hidden text-xl text-slate-600 lg:block">
            →
          </div>

          {/* DISRUPTION */}
          <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              DISRUPTION
            </p>

            <p className="mt-1 text-base font-bold text-red-400">
              🚨 {disruptionType}
            </p>

            <p className="mt-1 text-[11px] text-slate-500">
              Affected road avoided
            </p>
          </div>

          <div className="hidden text-xl text-slate-600 lg:block">
            →
          </div>

          {/* TO */}
          <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              TO
            </p>

            <p className="mt-1 text-base font-bold text-emerald-300">
              🏁 {finalPlace || "—"}
            </p>

            <p className="mt-1 text-[11px] text-slate-500">
              Final shipment destination
            </p>
          </div>
        </div>
      </div>

      {/* =================================================
          MAP
      ================================================= */}

      <div
        className="relative w-full"
        style={{
          height: "560px",
          minHeight: "560px",
        }}
      >
        <MapContainer
          center={mapCenter}
          zoom={7}
          scrollWheelZoom={true}
          zoomControl={true}
          preferCanvas={true}
          style={{
            width: "100%",
            height: "560px",
            minHeight: "560px",
            background: "#020617",
          }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapResizeFix />

          <FitMap routes={routes} />

          {/* CURRENT LOCATION */}
          {start && (
            <Marker
              position={[
                start.lat,
                start.lng,
              ]}
              icon={vehicleIcon}
            >
              <Popup>
                <div>
                  <strong>
                    🚚 CURRENT LOCATION
                  </strong>

                  <br />

                  {currentPlace}

                  <br />

                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "12px",
                    }}
                  >
                    Vehicle: {vehicleType}
                  </span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* FINAL DESTINATION */}
          {end && (
            <Marker
              position={[
                end.lat,
                end.lng,
              ]}
              icon={destinationIcon}
            >
              <Popup>
                <div>
                  <strong>
                    🏁 FINAL DESTINATION
                  </strong>

                  <br />

                  {finalPlace}

                  <br />

                  <span
                    style={{
                      color: "#10b981",
                      fontSize: "12px",
                    }}
                  >
                    Every recovery route ends here.
                  </span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ORIGINAL ROUTE */}
          {original && (
            <Polyline
              positions={
                original.coordinates
              }
              pathOptions={{
                color: "#64748b",
                weight: 7,
                opacity: 0.40,
              }}
            />
          )}

          {/* AFFECTED ROAD */}
          {affectedRoad.length >
            1 && (
            <Polyline
              positions={
                affectedRoad
              }
              pathOptions={{
                color: "#f97316",
                weight: 17,
                opacity: 0.70,
              }}
            />
          )}

          {/* SEVERE DISRUPTION ROAD */}
          {severeRoad.length >
            1 && (
            <Polyline
              positions={severeRoad}
              pathOptions={{
                color: "#ef4444",
                weight: 9,
                opacity: 1,
                dashArray: "12 8",
              }}
            />
          )}

          {/* DISRUPTION ZONE */}
          {start && (
            <Circle
              center={[
                start.lat,
                start.lng,
              ]}
              radius={3500}
              pathOptions={{
                color: "#ef4444",
                fillColor: "#ef4444",
                fillOpacity: 0.05,
                weight: 2,
                dashArray: "8 8",
              }}
            />
          )}

          {/* DISRUPTION MARKER */}
          {start && (
            <Marker
              position={[
                start.lat,
                start.lng,
              ]}
              icon={disruptionIcon}
            >
              <Popup>
                <strong>
                  🚨 {disruptionType}
                </strong>

                <br />

                Affected road corridor

                <br />

                <span
                  style={{
                    color: "#ef4444",
                    fontSize: "12px",
                  }}
                >
                  Recovery route avoids this
                  corridor.
                </span>
              </Popup>
            </Marker>
          )}

          {/* =================================================
              RECOMMENDED ROUTE
              SAME FROM + SAME TO
          ================================================= */}

          {recommended && (
            <Polyline
              positions={
                recommended.coordinates
              }
              pathOptions={{
                color: "#10b981",
                weight:
                  selectedRoute ===
                  "RECOMMENDED"
                    ? 10
                    : 6,
                opacity:
                  selectedRoute ===
                  "RECOMMENDED"
                    ? 1
                    : 0.45,
              }}
            />
          )}

          {/* =================================================
              ALTERNATIVE 1
              SAME FROM + SAME TO
          ================================================= */}

          {alternative1 && (
            <Polyline
              positions={
                alternative1.coordinates
              }
              pathOptions={{
                color: "#facc15",
                weight:
                  selectedRoute ===
                  "ALTERNATIVE_1"
                    ? 9
                    : 5,
                opacity:
                  selectedRoute ===
                  "ALTERNATIVE_1"
                    ? 1
                    : 0.40,
                dashArray: "12 8",
              }}
            />
          )}

          {/* =================================================
              ALTERNATIVE 2
              SAME FROM + SAME TO
          ================================================= */}

          {alternative2 && (
            <Polyline
              positions={
                alternative2.coordinates
              }
              pathOptions={{
                color: "#38bdf8",
                weight:
                  selectedRoute ===
                  "ALTERNATIVE_2"
                    ? 9
                    : 5,
                opacity:
                  selectedRoute ===
                  "ALTERNATIVE_2"
                    ? 1
                    : 0.40,
                dashArray: "8 8",
              }}
            />
          )}
        </MapContainer>

        {/* LOADING */}
        {loading && (
          <div className="absolute left-1/2 top-5 z-[1000] -translate-x-1/2 rounded-xl border border-cyan-500/30 bg-slate-950/95 px-5 py-3 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />

              <div>
                <p className="text-sm font-bold text-cyan-300">
                  Calculating recovery routes...
                </p>

                <p className="text-[11px] text-slate-500">
                  {currentPlace} →{" "}
                  {finalPlace}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="absolute left-1/2 top-5 z-[1000] w-[92%] max-w-lg -translate-x-1/2 rounded-xl border border-red-500/30 bg-slate-950/95 p-4 shadow-xl">
            <p className="text-sm font-bold text-red-400">
              ⚠️ Route Error
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              {error}
            </p>
          </div>
        )}

        {/* MAP STATUS */}
        {!loading &&
          !error &&
          routes.length > 0 && (
            <div className="absolute bottom-5 left-5 z-[1000] rounded-xl border border-slate-700 bg-slate-950/95 px-4 py-3 shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                ROUTING STATUS
              </p>

              <p className="mt-1 text-sm font-bold text-emerald-400">
                ● REAL ROAD ROUTES LOADED
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {recoveryRoutes.length} recovery route
                {recoveryRoutes.length !== 1
                  ? "s"
                  : ""}{" "}
                available
              </p>
            </div>
          )}
      </div>

      {/* =================================================
          ROUTE CARDS
      ================================================= */}

      <div className="border-t border-slate-800 bg-slate-950 p-5">
        <div>
          <h3 className="text-base font-bold text-white">
            Alternative Routes
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            Every route starts from the current vehicle
            location and ends at the same final
            destination.
          </p>
        </div>

        {/* ROUTE FLOW */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-col items-center justify-center gap-2 text-center sm:flex-row">
            <span className="rounded-lg bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300">
              🚚 {currentPlace || "Current"}
            </span>

            <span className="text-slate-500">
              →
            </span>

            <span className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300">
              🔀 CHOOSE BEST ROAD
            </span>

            <span className="text-slate-500">
              →
            </span>

            <span className="rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300">
              🏁 {finalPlace || "Destination"}
            </span>
          </div>
        </div>

        {/* CARDS */}
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* RECOMMENDED */}
          {recommended && (
            <div
              className={`rounded-2xl border p-5 transition ${
                selectedRoute ===
                "RECOMMENDED"
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                  🟢 RECOMMENDED
                </span>

                <span className="text-[10px] font-bold text-slate-500">
                  SCORE {recommended.score}
                </span>
              </div>

              <p className="mt-4 text-sm font-bold text-white">
                Fastest Practical Road
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {currentPlace} →{" "}
                {finalPlace}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    DISTANCE
                  </p>

                  <p className="mt-1 text-lg font-bold text-emerald-300">
                    {recommended.distanceKm.toFixed(
                      1
                    )}{" "}
                    km
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    ETA
                  </p>

                  <p className="mt-1 text-lg font-bold text-emerald-300">
                    {formatTime(
                      recommended.durationMinutes
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    EXTRA DISTANCE
                  </p>

                  <p className="mt-1 text-sm font-bold text-slate-300">
                    +
                    {recommended.extraDistanceKm.toFixed(
                      1
                    )}{" "}
                    km
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    EXTRA TIME
                  </p>

                  <p className="mt-1 text-sm font-bold text-slate-300">
                    +
                    {formatTime(
                      recommended.extraTimeMinutes
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  selectRoute(
                    "RECOMMENDED"
                  )
                }
                className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300"
              >
                {selectedRoute ===
                "RECOMMENDED"
                  ? "✓ SELECTED"
                  : "SELECT ROUTE"}
              </button>
            </div>
          )}

          {/* ALTERNATIVE 1 */}
          {alternative1 && (
            <div
              className={`rounded-2xl border p-5 transition ${
                selectedRoute ===
                "ALTERNATIVE_1"
                  ? "border-yellow-400 bg-yellow-500/10"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-bold text-yellow-400">
                  🟡 ALTERNATIVE 1
                </span>

                <span className="text-[10px] font-bold text-slate-500">
                  SCORE {alternative1.score}
                </span>
              </div>

              <p className="mt-4 text-sm font-bold text-white">
                Alternate Road
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {currentPlace} →{" "}
                {finalPlace}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    DISTANCE
                  </p>

                  <p className="mt-1 text-lg font-bold text-yellow-300">
                    {alternative1.distanceKm.toFixed(
                      1
                    )}{" "}
                    km
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    ETA
                  </p>

                  <p className="mt-1 text-lg font-bold text-yellow-300">
                    {formatTime(
                      alternative1.durationMinutes
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-slate-950 p-3">
                <p className="text-[10px] uppercase text-slate-500">
                  EXTRA TIME
                </p>

                <p className="mt-1 text-sm font-bold text-slate-300">
                  +
                  {formatTime(
                    alternative1.extraTimeMinutes
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  selectRoute(
                    "ALTERNATIVE_1"
                  )
                }
                className="mt-5 w-full rounded-xl border border-yellow-500/30 px-4 py-3 text-sm font-bold text-yellow-400 hover:bg-yellow-500/10"
              >
                {selectedRoute ===
                "ALTERNATIVE_1"
                  ? "✓ SELECTED"
                  : "SELECT ROUTE"}
              </button>
            </div>
          )}

          {/* ALTERNATIVE 2 */}
          {alternative2 && (
            <div
              className={`rounded-2xl border p-5 transition ${
                selectedRoute ===
                "ALTERNATIVE_2"
                  ? "border-sky-400 bg-sky-500/10"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-400">
                  🔵 ALTERNATIVE 2
                </span>

                <span className="text-[10px] font-bold text-slate-500">
                  SCORE {alternative2.score}
                </span>
              </div>

              <p className="mt-4 text-sm font-bold text-white">
                Secondary Recovery Road
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {currentPlace} →{" "}
                {finalPlace}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    DISTANCE
                  </p>

                  <p className="mt-1 text-lg font-bold text-sky-300">
                    {alternative2.distanceKm.toFixed(
                      1
                    )}{" "}
                    km
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-[10px] uppercase text-slate-500">
                    ETA
                  </p>

                  <p className="mt-1 text-lg font-bold text-sky-300">
                    {formatTime(
                      alternative2.durationMinutes
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-slate-950 p-3">
                <p className="text-[10px] uppercase text-slate-500">
                  EXTRA TIME
                </p>

                <p className="mt-1 text-sm font-bold text-slate-300">
                  +
                  {formatTime(
                    alternative2.extraTimeMinutes
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  selectRoute(
                    "ALTERNATIVE_2"
                  )
                }
                className="mt-5 w-full rounded-xl border border-sky-500/30 px-4 py-3 text-sm font-bold text-sky-400 hover:bg-sky-500/10"
              >
                {selectedRoute ===
                "ALTERNATIVE_2"
                  ? "✓ SELECTED"
                  : "SELECT ROUTE"}
              </button>
            </div>
          )}
        </div>

        {/* =================================================
            FINAL DECISION
        ================================================= */}

        {recommended && (
          <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400">
              LOGIAID RECOVERY DECISION
            </p>

            <div className="mt-3 flex flex-col gap-2 text-sm font-bold text-white md:flex-row md:items-center">
              <span className="text-cyan-300">
                🚚 {currentPlace}
              </span>

              <span className="text-slate-600">
                →
              </span>

              <span className="text-red-400">
                🚨 {disruptionType}
              </span>

              <span className="text-slate-600">
                →
              </span>

              <span className="text-emerald-400">
                🔀 Recovery Road
              </span>

              <span className="text-slate-600">
                →
              </span>

              <span className="text-emerald-300">
                🏁 {finalPlace}
              </span>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              The vehicle starts from{" "}
              <strong className="text-slate-300">
                {currentPlace}
              </strong>{" "}
              and every recovery option finishes at{" "}
              <strong className="text-slate-300">
                {finalPlace}
              </strong>
              . Only the road/corridor changes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}