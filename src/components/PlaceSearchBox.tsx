import React, {useCallback, useRef, useState} from 'react';
import {MapPin, Search, X} from 'lucide-react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {useAutocompleteSuggestions} from '../hooks/useAutocompleteSuggestions';

interface PlaceSearchBoxProps {
  onSelectLocation: (loc: {lat: number; lng: number; label: string}) => void;
}

export const PlaceSearchBox: React.FC<PlaceSearchBoxProps> = ({
  onSelectLocation,
}) => {
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const {suggestions, isLoading, resetSession} = useAutocompleteSuggestions(query);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        if (place.location) {
          const lat = place.location.lat();
          const lng = place.location.lng();
          const label =
            place.displayName ||
            place.formattedAddress ||
            suggestion.placePrediction.text.text;
          onSelectLocation({lat, lng, label});
          setQuery(label);
        }
        setOpen(false);
        resetSession();
      } catch (err) {
        const msg = String(err ?? '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    },
    [placesLib, onSelectLocation, resetSession]
  );

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-sm">
      <div className="relative flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
        <Search className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="ค้นหาถนน ซอย หรือสถานที่..."
          aria-label="ค้นหาสถานที่บนแผนที่"
          className="w-full bg-transparent px-2.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              resetSession();
              setOpen(false);
            }}
            aria-label="ล้างคำค้นหา"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && query.trim().length > 0 && (suggestions.length > 0 || isLoading) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-30">
          {isLoading && suggestions.length === 0 ? (
            <div className="px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              กำลังค้นหาสถานที่...
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {suggestions.map((suggestion, idx) => {
                const text = suggestion.placePrediction?.text.text || '';
                return (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => handleSelect(suggestion)}
                      className="w-full text-left px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white flex items-start gap-2.5 transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
                      <span className="leading-snug">{text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
