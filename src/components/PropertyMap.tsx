"use client";

import { useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression, LeafletMouseEvent, PathOptions } from "leaflet";
import L from "leaflet";
import type { MapClientProps, ParcelMapPoint, SearchCenter } from "./MapClient";

const SANTA_CLARA_CENTER: LatLngExpression = [37.35, -121.95];

const PARCEL_DOT_STYLES = {
  match: {
    color: "#1e3a8a",
    fillColor: "#2563eb",
    fillOpacity: 0.95,
    weight: 2,
  },
  longOpen: {
    color: "#9a3412",
    fillColor: "#f59e0b",
    fillOpacity: 0.95,
    weight: 2,
  },
  rest: {
    color: "#64748b",
    fillColor: "#e2e8f0",
    fillOpacity: 0.95,
    weight: 2,
  },
} satisfies Record<ParcelMapPoint["markerKind"], PathOptions>;

const RADIUS_STYLE: PathOptions = {
  color: "#111820",
  fillColor: "#111820",
  fillOpacity: 0.08,
  weight: 2,
};

const pinIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: #111820;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,.28);
    "></div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function isParcelDotClick(event: LeafletMouseEvent) {
  const target = event.originalEvent.target;
  return target instanceof Element && Boolean(target.closest(".parcel-dot"));
}

function PinController({
  onPin,
}: {
  onPin: (center: SearchCenter) => void;
}) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      if (isParcelDotClick(event)) return;

      onPin({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function RecenterMap({
  searchCenter,
  radiusMeters,
}: {
  searchCenter: SearchCenter | null;
  radiusMeters: number;
}) {
  const map = useMap();
  const latitude = searchCenter?.lat;
  const longitude = searchCenter?.lng;

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) {
      return;
    }

    const circleBounds = L.latLng(latitude, longitude).toBounds(radiusMeters * 2);
    map.flyToBounds(circleBounds, { padding: [28, 28] });
  }, [map, latitude, longitude, radiusMeters]);

  return null;
}

function SearchOverlay({
  searchCenter,
  radiusMeters,
}: {
  searchCenter: SearchCenter;
  radiusMeters: number;
}) {
  const position = useMemo<LatLngExpression>(
    () => [searchCenter.lat, searchCenter.lng],
    [searchCenter.lat, searchCenter.lng]
  );

  return (
    <>
      <Marker position={position} icon={pinIcon} />
      <Circle
        center={position}
        radius={radiusMeters}
        pathOptions={RADIUS_STYLE}
      />
    </>
  );
}

function ParcelDot({
  parcel,
  selected,
  onSelect,
}: {
  parcel: ParcelMapPoint;
  selected: boolean;
  onSelect: (objectId: string) => void;
}) {
  const latitude = parcel.latitude;
  const longitude = parcel.longitude;
  const position = useMemo<LatLngExpression | null>(() => {
    if (latitude === null || longitude === null) {
      return null;
    }

    return [latitude, longitude];
  }, [latitude, longitude]);

  if (!position) {
    return null;
  }

  const dotStyle = PARCEL_DOT_STYLES[parcel.markerKind];

  return (
    <CircleMarker
      center={position}
      radius={selected ? 8 : 6}
      pathOptions={{
        ...dotStyle,
        className: `parcel-dot parcel-dot-${parcel.markerKind}`,
        color: selected ? "#111820" : dotStyle.color,
        weight: selected ? 3 : dotStyle.weight,
      }}
      eventHandlers={{
        click(event) {
          L.DomEvent.stop(event);
          onSelect(parcel.objectId);
        },
      }}
    >
      <Tooltip>
        <strong>APN {parcel.apn}</strong>
        <br />
        {parcel.address || "Address unavailable"}
        <br />
        {parcel.roofAgeSentence}
      </Tooltip>
    </CircleMarker>
  );
}

export default function PropertyMap({
  radiusMiles,
  searchCenter,
  parcels,
  selectedObjectId,
  onSearchCenterChange,
  onParcelSelect,
}: MapClientProps) {
  const radiusMeters = radiusMiles * 1609.344;

  return (
    <div
      style={{
        height: "390px",
        width: "100%",
        overflow: "hidden",
        borderRadius: "10px",
      }}
    >
      <MapContainer
        center={SANTA_CLARA_CENTER}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <PinController onPin={onSearchCenterChange} />
        <RecenterMap searchCenter={searchCenter} radiusMeters={radiusMeters} />

        {searchCenter ? (
          <SearchOverlay
            searchCenter={searchCenter}
            radiusMeters={radiusMeters}
          />
        ) : null}

        {parcels.map((parcel) => (
          <ParcelDot
            key={`${parcel.objectId}-${parcel.markerKind}`}
            parcel={parcel}
            selected={parcel.objectId === selectedObjectId}
            onSelect={onParcelSelect}
          />
        ))}
      </MapContainer>
    </div>
  );
}
