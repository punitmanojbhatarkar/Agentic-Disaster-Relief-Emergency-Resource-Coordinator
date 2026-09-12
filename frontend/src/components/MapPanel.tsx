"use client";
import { useRef, useEffect, useState } from "react";

interface MapPanelProps {
  apiBase: string;
  onMapClick?: (coords: {lat: number, lon: number}) => void;
  isAdmin?: boolean;
}

// Real GPS coordinates for Indian cities used in demo
const CITY_COORDS: Record<string, {lat: number, lon: number}> = {
  // Assam
  "jorhat":           { lat: 26.75, lon: 94.21 },
  "silchar":          { lat: 24.83, lon: 92.79 },
  "guwahati":         { lat: 26.14, lon: 91.74 },
  "dibrugarh":        { lat: 27.48, lon: 94.91 },
  "dhubri":           { lat: 26.02, lon: 89.97 },
  "barpeta":          { lat: 26.32, lon: 90.99 },
  "kaziranga":        { lat: 26.58, lon: 93.37 },
  "tezpur":           { lat: 26.63, lon: 92.80 },
  "nagaon":           { lat: 26.35, lon: 92.68 },
  "lakhimpur":        { lat: 27.23, lon: 94.10 },
  // Maharashtra
  "mumbai":           { lat: 19.07, lon: 72.88 },
  "andheri":          { lat: 19.11, lon: 72.87 },
  "pune":             { lat: 18.52, lon: 73.86 },
  "nagpur":           { lat: 21.15, lon: 79.09 },
  // Delhi / NCR
  "delhi":            { lat: 28.61, lon: 77.21 },
  "new delhi":        { lat: 28.61, lon: 77.21 },
  "connaught":        { lat: 28.63, lon: 77.22 },
  "noida":            { lat: 28.54, lon: 77.39 },
  "gurugram":         { lat: 28.46, lon: 77.03 },
  // South India
  "chennai":          { lat: 13.08, lon: 80.27 },
  "bangalore":        { lat: 12.97, lon: 77.59 },
  "bengaluru":        { lat: 12.97, lon: 77.59 },
  "hyderabad":        { lat: 17.38, lon: 78.49 },
  "kochi":            { lat: 9.93, lon: 76.27 },
  "visakhapatnam":    { lat: 17.69, lon: 83.22 },
  "bhubaneswar":      { lat: 20.30, lon: 85.84 },
  // North India
  "patna":            { lat: 25.59, lon: 85.14 },
  "lucknow":          { lat: 26.85, lon: 80.95 },
  "kanpur":           { lat: 26.45, lon: 80.33 },
  "varanasi":         { lat: 25.32, lon: 82.97 },
  "kolkata":          { lat: 22.57, lon: 88.36 },
  "jaipur":           { lat: 26.91, lon: 75.79 },
  "ahmedabad":        { lat: 23.02, lon: 72.57 },
  "surat":            { lat: 21.17, lon: 72.83 },
  "indore":           { lat: 22.72, lon: 75.86 },
  "bhopal":           { lat: 23.26, lon: 77.41 },
  "chandigarh":       { lat: 30.74, lon: 76.79 },
  "amritsar":         { lat: 31.63, lon: 74.87 },
  // Disaster-prone zones
  "kedarnath":        { lat: 30.73, lon: 79.07 },
  "uttarkashi":       { lat: 30.73, lon: 78.44 },
  "leh":              { lat: 34.16, lon: 77.58 },
  "srinagar":         { lat: 34.08, lon: 74.79 },
};

function getCoordsForZone(zone: any): {lat: number, lon: number} | null {
  // 1. Explicit lat/lon fields (set by map click or Satellite Intel Agent)
  if (zone.lat && zone.lon && (Math.abs(zone.lat) > 0.01 || Math.abs(zone.lon) > 0.01)) {
    return { lat: zone.lat, lon: zone.lon };
  }
  // 2. Partial city name matching — handles "Kaziranga National Park, Assam" -> "kaziranga"
  if (zone.location) {
    const locLower = zone.location.toLowerCase();
    // Check each known city key as a substring of the location string
    for (const [cityKey, coords] of Object.entries(CITY_COORDS)) {
      if (locLower.includes(cityKey)) {
        return coords;
      }
    }
  }
  return null;
}

function getSeverityColor(Cesium: any, severity: number) {
  if (severity >= 8) return Cesium.Color.fromCssColorString("#ef4444"); // red
  if (severity >= 6) return Cesium.Color.fromCssColorString("#f97316"); // orange
  if (severity >= 4) return Cesium.Color.fromCssColorString("#eab308"); // yellow
  return Cesium.Color.fromCssColorString("#22c55e"); // green
}

const INDIA_CENTER: [number, number] = [22.5, 82.0];

export default function MapPanel({ apiBase, onMapClick, isAdmin }: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [cesiumReady, setCesiumReady] = useState(false);
  const entitiesRef = useRef<{ [key: string]: any }>({});
  const pendingEntitiesRef = useRef<{ [key: string]: any }>({});
  const facilityEntitiesRef = useRef<any[]>([]);
  const pendingFacilityEntitiesRef = useRef<any[]>([]);

  // Wait for Cesium to load from CDN
  useEffect(() => {
    console.log("Checking for Cesium readiness...");
    const checkCesium = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).Cesium) {
        setCesiumReady(true);
        clearInterval(checkCesium);
      }
    }, 100);
    return () => clearInterval(checkCesium);
  }, []);

  // Initialize Cesium Map
  useEffect(() => {
    if (!cesiumReady || !mapContainerRef.current || viewerRef.current) return;

    const Cesium = (window as any).Cesium;
    Cesium.Ion.defaultAccessToken = "";

    const osmProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      subdomains: ["a", "b", "c"],
      maximumLevel: 19
    });

    const viewer = new Cesium.Viewer(mapContainerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      baseLayer: new Cesium.ImageryLayer(osmProvider)
    });

    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showWaterEffect = true;
    viewer.cesiumWidget.creditContainer.style.display = "none";

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(INDIA_CENTER[1], INDIA_CENTER[0], 3500000.0)
    });

    // Map click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const ray = viewer.camera.getPickRay(click.position);
      const position = viewer.scene.globe.pick(ray, viewer.scene);
      if (position && onMapClick) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        onMapClick({ lat, lon });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [cesiumReady]);

  // Function to render zones onto Cesium map
  const renderZones = (zonesDict: Record<string, any>) => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    // zones from backend is a dict: { "Zone A": {...}, "Zone B": {...} }
    const zones = Object.values(zonesDict);
    const currentIds = new Set(zones.map((z: any) => z.zone_id));

    // Remove stale entities
    Object.keys(entitiesRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        viewer.entities.remove(entitiesRef.current[id]);
        delete entitiesRef.current[id];
      }
    });

    // Remove old facility markers to redraw
    facilityEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    facilityEntitiesRef.current = [];

    // Add or update entities
    zones.forEach((zone: any) => {
      const coords = getCoordsForZone(zone);
      if (!coords) return; // can't plot without coordinates

      const severity = zone.severity_final ?? zone.severity_reported ?? 5;
      const color = getSeverityColor(Cesium, severity);
      const radiusMeters = zone.gee_area_km2
        ? Math.sqrt(zone.gee_area_km2 / Math.PI) * 1000
        : 15000; // default 15km radius

      const labelText = `${zone.zone_id}\n${zone.location}\nSeverity: ${severity}/10`;

      if (!entitiesRef.current[zone.zone_id]) {
        const entityConfig: any = {
          position: Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat),
          point: {
            pixelSize: 12,
            color: Cesium.Color.WHITE,
            outlineColor: color,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: labelText,
            font: 'bold 12pt sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -18),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            showBackground: false
          }
        };
        
        if (zone.geojson && zone.geojson.features && zone.geojson.features[0].geometry.coordinates) {
          try {
            const coordsList = zone.geojson.features[0].geometry.coordinates[0];
            const flatCoords = coordsList.flat();
            entityConfig.polygon = {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
              material: color.withAlpha(0.35),
              outline: true,
              outlineColor: color,
              outlineWidth: 3,
            };
          } catch (e) {
            console.error("GeoJSON parse error", e);
          }
        } else {
          entityConfig.ellipse = {
            semiMinorAxis: radiusMeters,
            semiMajorAxis: radiusMeters,
            material: color.withAlpha(0.18),
            outline: true,
            outlineColor: color,
            outlineWidth: 2,
          };
        }

        const entity = viewer.entities.add(entityConfig);
        entitiesRef.current[zone.zone_id] = entity;
      } else {
        // Update existing entity
        const entity = entitiesRef.current[zone.zone_id];
        entity.point.outlineColor = color;
        entity.label.text = labelText;
        entity.label.fillColor = Cesium.Color.WHITE;
        entity.label.outlineColor = Cesium.Color.BLACK;
        entity.label.outlineWidth = 3;
        entity.label.showBackground = false;
        
        if (zone.geojson && zone.geojson.features && zone.geojson.features[0].geometry.coordinates) {
          try {
            const coordsList = zone.geojson.features[0].geometry.coordinates[0];
            const flatCoords = coordsList.flat();
            
            // If it was an ellipse before, remove the ellipse
            if (entity.ellipse) {
              entity.ellipse = undefined;
            }
            
            if (entity.polygon) {
              entity.polygon.hierarchy = new Cesium.ConstantProperty(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flatCoords)));
              entity.polygon.material = color.withAlpha(0.35);
              entity.polygon.outlineColor = color;
            } else {
              entity.polygon = new Cesium.PolygonGraphics({
                hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
                material: color.withAlpha(0.35),
                outline: true,
                outlineColor: color,
                outlineWidth: 3,
              });
            }
          } catch (err) {
             console.error(err);
          }
        } else {
          // If no geojson, ensure ellipse exists and polygon is removed
          if (entity.polygon) {
            entity.polygon = undefined;
          }
          if (entity.ellipse) {
            entity.ellipse.material = color.withAlpha(0.35);
            entity.ellipse.outlineColor = color;
          } else {
            entity.ellipse = new Cesium.EllipseGraphics({
              semiMinorAxis: radiusMeters,
              semiMajorAxis: radiusMeters,
              material: color.withAlpha(0.35),
              outline: true,
              outlineColor: color,
              outlineWidth: 2,
            });
          }
        }
        if (entity.ellipse) {
          entity.ellipse.semiMinorAxis = radiusMeters;
          entity.ellipse.semiMajorAxis = radiusMeters;
        }
      }
    });

    // Draw facility markers for all zones that have them
    zones.forEach((zone: any) => {
      const facilities = zone.nearest_facilities || [];
      if (!facilities.length) return;
      const zoneCoords = getCoordsForZone(zone);
      if (!zoneCoords) return;

      facilities.forEach((f: any) => {
        try {
          const fColor = Cesium.Color.fromCssColorString(f.color || '#38bdf8');
          const etaText = f.eta_minutes < 60 ? `${f.eta_minutes}min` : `${(f.eta_minutes/60).toFixed(1)}h`;
          const iconChar = f.icon === 'hospital' ? '🏥' : f.icon === 'military' ? '⚔' : f.icon === 'fire' ? '🚒' : '🍱';

          // Facility pin
          const pin = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat),
            point: {
              pixelSize: 8,
              color: fColor,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `${f.name}\n${f.type} · ${f.dist_km ? f.dist_km.toFixed(1) : '?'} km · ${etaText} ETA`,
              font: '9pt sans-serif',
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: fColor.withAlpha(0.75),
              backgroundPadding: new Cesium.Cartesian2(4, 2),
              show: true, 
            },
            // Draw a dashed line from zone center to this facility
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray([
                zoneCoords.lon, zoneCoords.lat,
                f.lon, f.lat
              ]),
              width: 3,
              material: new Cesium.PolylineDashMaterialProperty({
                color: fColor,
                dashLength: 20.0
              }),
              clampToGround: true,
            }
          });
          facilityEntitiesRef.current.push(pin);

          // Add a distance label at the midpoint
          if (f.dist_km) {
            const midLon = (zoneCoords.lon + f.lon) / 2;
            const midLat = (zoneCoords.lat + f.lat) / 2;
            const distLabel = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(midLon, midLat),
              label: {
                text: `${f.dist_km.toFixed(1)} km`,
                font: 'bold 9pt sans-serif',
                fillColor: Cesium.Color.WHITE,
                showBackground: true,
                backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
                backgroundPadding: new Cesium.Cartesian2(6, 4),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                pixelOffset: new Cesium.Cartesian2(0, 0),
              }
            });
            facilityEntitiesRef.current.push(distLabel);
          }
        } catch (e) {
          // Skip bad facility coords
        }
      });
    });
  };

  // Render pending zones (admin only) — shown as yellow dashed circles with ⏳ label
  const renderPendingZones = (pendingDict: Record<string, any>) => {
    if (!viewerRef.current || !cesiumReady) return;
    const Cesium = (window as any).Cesium;
    const viewer = viewerRef.current;

    const pending = Object.values(pendingDict);
    const currentIds = new Set(pending.map((z: any) => z.zone_id));

    // Remove stale pending markers
    Object.keys(pendingEntitiesRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        viewer.entities.remove(pendingEntitiesRef.current[id]);
        delete pendingEntitiesRef.current[id];
      }
    });

    pending.forEach((zone: any) => {
      if (pendingEntitiesRef.current[zone.zone_id]) return; // already drawn
      const coords = getCoordsForZone(zone);
      if (!coords) return;

      const severity = zone.severity_final ?? zone.severity_reported ?? 5;
      const radiusMeters = zone.gee_area_km2
        ? Math.sqrt(zone.gee_area_km2 / Math.PI) * 1000
        : 15000;

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat),
        point: {
          pixelSize: 10,
          color: Cesium.Color.YELLOW.withAlpha(0.9),
          outlineColor: Cesium.Color.fromCssColorString('#facc15'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `⏳ PENDING\n${zone.zone_id}\n${zone.location}\nSeverity: ${severity}/10`,
          font: 'bold 11pt sans-serif',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.fromCssColorString('#facc15'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#1a1a00').withAlpha(0.75),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
        },
        ellipse: {
          semiMinorAxis: radiusMeters,
          semiMajorAxis: radiusMeters,
          material: Cesium.Color.fromCssColorString('#facc15').withAlpha(0.12),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#facc15').withAlpha(0.7),
          outlineWidth: 2,
        }
      });
      pendingEntitiesRef.current[zone.zone_id] = entity;
    });

    // Draw facility markers for pending zones
    pendingFacilityEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    pendingFacilityEntitiesRef.current = [];

    pending.forEach((zone: any) => {
      const facilities = zone.nearest_facilities || [];
      if (!facilities.length) return;
      const zoneCoords = getCoordsForZone(zone);
      if (!zoneCoords) return;

      facilities.forEach((f: any) => {
        try {
          const fColor = Cesium.Color.fromCssColorString(f.color || '#38bdf8');
          const etaText = f.eta_minutes < 60 ? `${f.eta_minutes}min` : `${(f.eta_minutes/60).toFixed(1)}h`;
          const iconChar = f.icon === 'hospital' ? '🏥' : f.icon === 'military' ? '⚔' : f.icon === 'fire' ? '🚒' : '🍱';

          const pin = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat),
            point: {
              pixelSize: 8,
              color: fColor,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `${f.name}\n${f.type} · ${f.dist_km ? f.dist_km.toFixed(1) : '?'} km · ${etaText} ETA`,
              font: '9pt sans-serif',
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: fColor.withAlpha(0.75),
              backgroundPadding: new Cesium.Cartesian2(4, 2),
              show: true, 
            },
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray([
                zoneCoords.lon, zoneCoords.lat,
                f.lon, f.lat
              ]),
              width: 3,
              material: new Cesium.PolylineDashMaterialProperty({
                color: fColor,
                dashLength: 20.0
              }),
              clampToGround: true,
            }
          });
          pendingFacilityEntitiesRef.current.push(pin);

          // Add a distance label at the midpoint
          if (f.dist_km) {
            const midLon = (zoneCoords.lon + f.lon) / 2;
            const midLat = (zoneCoords.lat + f.lat) / 2;
            const distLabel = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(midLon, midLat),
              label: {
                text: `${f.dist_km.toFixed(1)} km`,
                font: 'bold 9pt sans-serif',
                fillColor: Cesium.Color.WHITE,
                showBackground: true,
                backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
                backgroundPadding: new Cesium.Cartesian2(6, 4),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                pixelOffset: new Cesium.Cartesian2(0, 0),
              }
            });
            pendingFacilityEntitiesRef.current.push(distLabel);
          }
        } catch (e) { }
      });
    });
  };

  // Poll REST on load AND listen to WebSocket for updates
  useEffect(() => {
    if (!cesiumReady) return;

    const fetchAll = () => {
      // Always fetch active zones
      fetch(`${apiBase}/api/zones`)
        .then(r => r.json())
        .then(zones => renderZones(zones))
        .catch(() => {});

      // Admin: also fetch and render pending zones
      if (isAdmin) {
        fetch(`${apiBase}/api/zones/pending`)
          .then(r => r.json())
          .then(pending => renderPendingZones(pending))
          .catch(() => {});
      }
    };

    fetchAll();

    // WebSocket for live updates
    const wsUrl = apiBase.replace(/^http/, "ws") + "/api/ws";
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "state_update") {
          if (data.zones) renderZones(data.zones);
          if (isAdmin && data.pending_zones) renderPendingZones(data.pending_zones);
        }
      } catch (err) {
        console.error("MapPanel WS parse error:", err);
      }
    };

    ws.onerror = () => {};

    // Fallback polling every 4 seconds
    const pollInterval = setInterval(fetchAll, 4000);

    return () => {
      ws.close();
      clearInterval(pollInterval);
    };
  }, [cesiumReady, apiBase, isAdmin]);

  // Listen for flyToZone events from CommandDashboard
  useEffect(() => {
    const handleFlyTo = (e: any) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const { lat, lon } = e.detail;
      const Cesium = (window as any).Cesium;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 2500.0), // 2500m height for street level
        duration: 2.0
      });
    };
    
    window.addEventListener('flyToZone', handleFlyTo);
    return () => window.removeEventListener('flyToZone', handleFlyTo);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0,0,0,0.35)",
        pointerEvents: "none"
      }} />
      
      {/* Zoom Controls */}
      <div style={{
        position: "absolute",
        top: 80,
        right: isAdmin ? 360 : 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 100
      }}>
        <button 
          onClick={() => {
            if (viewerRef.current) {
              const viewer = viewerRef.current;
              // Zoom in by taking camera closer to its current target
              viewer.camera.moveForward(viewer.camera.positionCartographic.height * 0.4);
            }
          }}
          style={{
            width: 40, height: 40, borderRadius: 8, background: "var(--bg-deep)", border: "1px solid var(--border)", 
            color: "var(--text-1)", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
          }}
        >
          +
        </button>
        <button 
          onClick={() => {
            if (viewerRef.current) {
              const viewer = viewerRef.current;
              // Zoom out
              viewer.camera.moveBackward(viewer.camera.positionCartographic.height * 0.4);
            }
          }}
          style={{
            width: 40, height: 40, borderRadius: 8, background: "var(--bg-deep)", border: "1px solid var(--border)", 
            color: "var(--text-1)", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
          }}
        >
          -
        </button>
      </div>
    </div>
  );
}