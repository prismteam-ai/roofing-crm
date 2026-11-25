import {
  DEFAULT_COUNTY,
  MAX_RADIUS_MILES,
  type Point,
  type Signal,
  type Sort,
} from '@roofing-crm/shared';
import { useCallback, useEffect, useId, useState } from 'react';
import { roundCoord } from '../lib/geo.js';
import { PLACES } from '../lib/places.js';
import {
  clampRadius,
  inCounty,
  MIN_OPEN_YEAR_CHOICES,
  MIN_RADIUS_MILES,
  type PermitStatus,
  type SearchFilters,
} from '../lib/urlState.js';
import { NumberField, SelectField } from './fields.js';

export interface SearchControlsProps {
  pin: Point | null;
  radiusMiles: number;
  filters: SearchFilters;
  locating: boolean;
  searching: boolean;
  onPin: (point: Point) => void;
  onRadius: (miles: number) => void;
  onFilters: (patch: Partial<SearchFilters>) => void;
  onUseLocation: () => void;
  onSearch: () => void;
  onReset: () => void;
  /** True while any box holds a value that cannot be searched with. */
  onValidity: (invalid: boolean) => void;
}

const SIGNALS: readonly { value: Signal; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'aged_roof', label: 'Aged roof' },
  { value: 'open_permit', label: 'Open roofing permit' },
  { value: 'both', label: 'Both' },
];

const STATUS_OPTIONS: readonly { value: PermitStatus; label: string }[] = [
  { value: 'any', label: 'Any status' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

const SORT_OPTIONS: readonly { value: Sort; label: string }[] = [
  { value: 'score', label: 'Lead score' },
  { value: 'distance', label: 'Distance' },
  { value: 'roof_age', label: 'Roof age' },
  { value: 'open_days', label: 'Open duration' },
];

const OPEN_YEAR_OPTIONS = MIN_OPEN_YEAR_CHOICES.map((years) => ({
  value: String(years),
  label: years === 0 ? 'Any length' : `${String(years)}+ yrs`,
}));

function parseCoord(text: string, limit: number): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function coordError(text: string, limit: number, name: string): string | null {
  if (text.trim() === '') return null;
  return parseCoord(text, limit) === null
    ? `${name} must be a number from -${String(limit)} to ${String(limit)}.`
    : null;
}

const COUNTY = DEFAULT_COUNTY.name.replace(/, [A-Z]{2}$/, '');
const { bbox: BOX } = DEFAULT_COUNTY;

/**
 * Latitude and longitude boxes: a third way to place the pin, usable from the keyboard alone.
 * A value that cannot be used is explained next to the box and never moves the pin.
 */
function LatLonFields({
  pin,
  onPin,
  onValidity,
}: {
  pin: Point | null;
  onPin: (point: Point) => void;
  onValidity: (invalid: boolean) => void;
}) {
  const latId = useId();
  const lonId = useId();
  const errorId = useId();
  const [lat, setLat] = useState(pin ? String(pin.lat) : '');
  const [lon, setLon] = useState(pin ? String(pin.lon) : '');

  useEffect(() => {
    if (!pin) return;
    setLat((current) => (parseCoord(current, 90) === pin.lat ? current : String(pin.lat)));
    setLon((current) => (parseCoord(current, 180) === pin.lon ? current : String(pin.lon)));
  }, [pin]);

  const a = parseCoord(lat, 90);
  const b = parseCoord(lon, 180);
  const latError =
    coordError(lat, 90, 'Latitude') ?? (pin && lat.trim() === '' ? 'Enter a latitude.' : null);
  const lonError =
    coordError(lon, 180, 'Longitude') ?? (pin && lon.trim() === '' ? 'Enter a longitude.' : null);
  const outside = a !== null && b !== null && !inCounty({ lat: a, lon: b });
  const error =
    latError ??
    lonError ??
    (outside
      ? `That point is outside ${COUNTY} (latitude ${String(BOX.minLat)} to ${String(BOX.maxLat)}, longitude ${String(BOX.minLon)} to ${String(BOX.maxLon)}). The pin was not moved.`
      : null);
  const invalid = error !== null;

  useEffect(() => {
    onValidity(invalid);
  }, [invalid, onValidity]);

  const commit = (nextLat: string, nextLon: string): void => {
    const y = parseCoord(nextLat, 90);
    const x = parseCoord(nextLon, 180);
    if (y === null || x === null) return;
    const point = { lat: roundCoord(y), lon: roundCoord(x) };
    if (inCounty(point)) onPin(point);
  };

  return (
    <>
      <div className="field field-coord">
        <label htmlFor={latId} className="field-label">
          Latitude
        </label>
        <input
          id={latId}
          type="number"
          inputMode="decimal"
          step="any"
          placeholder="32.7157"
          value={lat}
          aria-invalid={latError !== null || outside || undefined}
          aria-describedby={invalid ? errorId : undefined}
          data-testid="lat-input"
          onChange={(event) => {
            setLat(event.target.value);
            commit(event.target.value, lon);
          }}
        />
        {error && (
          <span className="field-error" id={errorId} role="alert" data-testid="latlon-error">
            {error}
          </span>
        )}
      </div>
      <div className="field field-coord">
        <label htmlFor={lonId} className="field-label">
          Longitude
        </label>
        <input
          id={lonId}
          type="number"
          inputMode="decimal"
          step="any"
          placeholder="-117.1611"
          value={lon}
          aria-invalid={lonError !== null || outside || undefined}
          aria-describedby={invalid ? errorId : undefined}
          data-testid="lon-input"
          onChange={(event) => {
            setLon(event.target.value);
            commit(lat, event.target.value);
          }}
        />
      </div>
    </>
  );
}

/** Where to search (pin, radius) and what counts as a lead (signal, thresholds, order). */
export function SearchControls(props: SearchControlsProps) {
  const { pin, radiusMiles, filters } = props;
  const sliderId = useId();
  const [badFields, setBadFields] = useState<ReadonlySet<string>>(new Set());
  const { onValidity } = props;
  const mark = useCallback((field: string, invalid: boolean) => {
    setBadFields((current) => {
      if (current.has(field) === invalid) return current;
      const next = new Set(current);
      if (invalid) next.add(field);
      else next.delete(field);
      return next;
    });
  }, []);
  const markCoords = useCallback(
    (invalid: boolean) => {
      mark('coords', invalid);
    },
    [mark],
  );
  const markRadius = useCallback(
    (invalid: boolean) => {
      mark('radius', invalid);
    },
    [mark],
  );
  const markAge = useCallback(
    (invalid: boolean) => {
      mark('age', invalid);
    },
    [mark],
  );
  const anyInvalid = badFields.size > 0;
  useEffect(() => {
    onValidity(anyInvalid);
  }, [anyInvalid, onValidity]);
  const activePlace = pin
    ? PLACES.find((place) => place.lat === pin.lat && place.lon === pin.lon)?.id
    : undefined;

  return (
    <form
      className="controls"
      aria-label="Search area and filters"
      data-testid="search-controls"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch();
      }}
    >
      <div className="controls-row">
        <button
          type="button"
          className="btn"
          data-testid="use-location"
          disabled={props.locating}
          onClick={props.onUseLocation}
        >
          <span aria-hidden="true">&#8982;</span> {props.locating ? 'Locating…' : 'Use my location'}
        </button>
        <div className="jump" role="group" aria-label="Jump to a place">
          <span className="field-label">Jump to</span>
          <div className="chips">
            {PLACES.map((place) => (
              <button
                key={place.id}
                type="button"
                className="chip-btn"
                aria-pressed={activePlace === place.id}
                data-testid={`jump-${place.id}`}
                onClick={() => {
                  props.onPin({ lat: place.lat, lon: place.lon });
                }}
              >
                {place.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="controls-row">
        <LatLonFields pin={pin} onPin={props.onPin} onValidity={markCoords} />

        <div className="field field-radius">
          <label htmlFor={sliderId} className="field-label">
            Radius (miles)
          </label>
          <div className="field-row">
            <input
              id={sliderId}
              type="range"
              min={MIN_RADIUS_MILES}
              max={MAX_RADIUS_MILES}
              step={0.25}
              value={radiusMiles}
              data-testid="radius-slider"
              onChange={(event) => {
                props.onRadius(clampRadius(Number(event.target.value)));
              }}
            />
            <NumberField
              label="Radius in miles, exact"
              className="field-inline"
              value={radiusMiles}
              min={MIN_RADIUS_MILES}
              max={MAX_RADIUS_MILES}
              step={0.25}
              testId="radius-input"
              onValidity={markRadius}
              onCommit={(value) => {
                if (value !== null) props.onRadius(clampRadius(value));
              }}
            />
          </div>
        </div>

        <fieldset className="field segmented" data-testid="signal-group">
          <legend className="field-label">Signal</legend>
          <div className="segmented-row">
            {SIGNALS.map((signal) => (
              <label key={signal.value} className="segment">
                <input
                  type="radio"
                  name="signal"
                  value={signal.value}
                  checked={filters.signal === signal.value}
                  data-testid={`signal-${signal.value}`}
                  onChange={() => {
                    props.onFilters({ signal: signal.value });
                  }}
                />
                <span>{signal.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="controls-row">
        <NumberField
          label="Roof age at least"
          className="field-narrow"
          value={filters.minRoofAgeYears}
          min={0}
          max={150}
          step={1}
          integer
          suffix="yrs"
          testId="roof-age-input"
          onValidity={markAge}
          onCommit={(value) => {
            if (value !== null) props.onFilters({ minRoofAgeYears: value });
          }}
        />
        <SelectField
          label="Permit open at least"
          value={String(filters.minOpenYears)}
          options={OPEN_YEAR_OPTIONS}
          testId="min-open-years"
          onChange={(value) => {
            props.onFilters({ minOpenYears: Number(value) });
          }}
        />
        <SelectField
          label="Permit status"
          value={filters.permitStatus}
          options={STATUS_OPTIONS}
          testId="permit-status"
          onChange={(permitStatus) => {
            props.onFilters({ permitStatus });
          }}
        />
        <SelectField
          label="Sort by"
          value={filters.sort}
          options={SORT_OPTIONS}
          testId="sort-select"
          onChange={(sort) => {
            props.onFilters({ sort });
          }}
        />

        <div className="controls-actions">
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="search-button"
            disabled={!pin || anyInvalid}
            title={
              anyInvalid ? 'Fix the highlighted input first' : pin ? undefined : 'Drop a pin first'
            }
          >
            {props.searching ? 'Searching…' : 'Search this area'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            data-testid="reset-filters"
            onClick={props.onReset}
          >
            Reset filters
          </button>
        </div>
      </div>
    </form>
  );
}
