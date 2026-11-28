"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { Search, Loader2, X, User, Phone, Hash, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PatientSearchResult {
  id: string;
  uhid: string;
  name: string;
  phone: string;
  age?: number;
  gender?: string;
  dob?: string | Date | null;
  bloodGroup?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export interface PatientAutocompleteProps {
  id?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  selectedPatient?: PatientSearchResult | null;
  initialPatients?: PatientSearchResult[];
  onSelect: (patient: PatientSearchResult | null) => void;
  onNavigateOnSelect?: (patient: PatientSearchResult) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  minChars?: number;
  debounceMs?: number;
  showDetailsCard?: boolean;
  /** Keep the input populated (with the patient's name) after a selection. */
  keepQueryOnSelect?: boolean;
  /** Submit the closest form after a patient is picked (filter-style inputs). */
  submitFormOnSelect?: boolean;
  /** Mirror the typed text into the hidden input instead of a patient id. */
  hiddenFromQuery?: boolean;
}

const EMPTY_PATIENTS: PatientSearchResult[] = [];

export default function PatientAutocomplete({
  id,
  name,
  placeholder = "Search patient by name, UHID, or phone…",
  defaultValue = "",
  selectedPatient = null,
  initialPatients = EMPTY_PATIENTS,
  onSelect,
  onNavigateOnSelect,
  required = false,
  disabled = false,
  className,
  inputClassName,
  autoFocus = false,
  minChars = 1,
  debounceMs = 250,
  showDetailsCard = true,
  keepQueryOnSelect = false,
  submitFormOnSelect = false,
  hiddenFromQuery = false,
}: PatientAutocompleteProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep the server-provided fallback list in a ref: depending on the array
  // identity in the fetch callback caused a fresh search on every render.
  const initialPatientsRef = useRef(initialPatients);
  useEffect(() => {
    initialPatientsRef.current = initialPatients;
  }, [initialPatients]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch search results with debounce and abort controller
  const performSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      if (trimmed.length < minChars) {
        const fallback = initialPatientsRef.current;
        setResults(fallback.length > 0 ? fallback.slice(0, 8) : []);
        setLoading(false);
        setHasSearched(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setHasSearched(true);

      try {
        const res = await fetch(
          `/api/patients/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.patients ?? []);
        setHighlightedIndex(-1);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [minChars]
  );

  // Debounced input change handler (250 ms by default)
  useEffect(() => {
    if (selectedPatient && !query) {
      // Don't search if patient is already chosen and input is clear
      return;
    }
    const timer = setTimeout(() => {
      const trimmed = query.trim();
      if (trimmed.length >= minChars) {
        performSearch(query);
      } else if (trimmed.length === 0) {
        const fallback = initialPatientsRef.current;
        setResults(fallback.length > 0 ? fallback.slice(0, 8) : []);
        setHasSearched(false);
      } else {
        setResults([]);
        setHasSearched(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, minChars, debounceMs, performSearch, selectedPatient]);

  // Keep highlighted item visible when scrolling via arrow keys
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  function handleSelect(patient: PatientSearchResult) {
    onSelect(patient);
    if (onNavigateOnSelect) {
      onNavigateOnSelect(patient);
    }
    setQuery(keepQueryOnSelect ? patient.name : "");
    setIsOpen(false);
    setHighlightedIndex(-1);
    setHasSearched(false);
    if (submitFormOnSelect) {
      // Let React commit the new value before the form is submitted.
      setTimeout(() => inputRef.current?.form?.requestSubmit(), 0);
    }
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setResults(initialPatients.length > 0 ? initialPatients.slice(0, 8) : []);
    setHasSearched(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex]);
      } else if (results.length === 1) {
        handleSelect(results[0]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Hidden input to preserve standard form submission compatibility */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={
            selectedPatient
              ? selectedPatient.id
              : hiddenFromQuery
                ? query.trim()
                : ""
          }
          required={required}
        />
      )}

      {/* When a patient is selected and showDetailsCard is true, show the selected pill/card */}
      {selectedPatient && showDetailsCard ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-medical/40 bg-medical/5 px-3 py-2 text-xs transition-all shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-medical text-white font-semibold text-[11px]">
              {selectedPatient.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-navy truncate">
                  {selectedPatient.name}
                </span>
                <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                  {selectedPatient.uhid}
                </span>
                {selectedPatient.gender && (
                  <span className="text-[11px] text-muted-foreground">
                    {selectedPatient.age && selectedPatient.age !== 30 ? `${selectedPatient.age}y ` : ""}
                    {selectedPatient.gender.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-slate-400" />
                  {selectedPatient.phone || "No phone"}
                </span>
                {selectedPatient.bloodGroup && (
                  <span className="font-semibold text-rose-600">
                    {selectedPatient.bloodGroup}
                  </span>
                )}
              </div>
            </div>
          </div>

          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-danger transition-colors shrink-0"
              title="Change patient"
            >
              <X className="h-3 w-3" />
              Change
            </button>
          )}
        </div>
      ) : (
        /* Autocomplete search input */
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-medical" />
            ) : (
              <Search className="h-4 w-4 text-slate-400" />
            )}
          </div>

          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            disabled={disabled}
            autoFocus={autoFocus}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={`${inputId}-results`}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length >= minChars || (initialPatients.length > 0 && results.length > 0)) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "input w-full pl-9 pr-8 text-xs placeholder:text-slate-400 transition-all",
              isOpen && results.length > 0 && "rounded-b-none border-b-transparent",
              inputClassName
            )}
          />

          {query && !disabled && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setHasSearched(false);
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Clear input"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Autocomplete Suggestions Dropdown */}
          {isOpen && (
            <div
              id={`${inputId}-results`}
              className="absolute left-0 right-0 top-full z-50 max-h-72 overflow-y-auto rounded-b-lg border border-slate-200 bg-white shadow-xl dark:bg-slate-900 dark:border-slate-800"
            >
              {loading && results.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-medical" />
                  <span>Searching patients…</span>
                </div>
              ) : results.length > 0 ? (
                <ul ref={listRef} className="divide-y divide-slate-100 dark:divide-slate-800 py-1" role="listbox">
                  {results.map((patient, index) => {
                    const isHighlighted = highlightedIndex === index;
                    return (
                      <li
                        key={patient.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onMouseDown={(e) => {
                          e.preventDefault(); // prevents blur before click fires
                          handleSelect(patient);
                        }}
                        className={cn(
                          "cursor-pointer px-3.5 py-2.5 text-xs transition-colors flex items-center justify-between gap-3",
                          isHighlighted
                            ? "bg-medical/10 text-medical dark:bg-medical/20"
                            : "hover:bg-slate-50 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-navy dark:text-slate-100 truncate">
                              {patient.name}
                            </span>
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-400">
                              {patient.uhid}
                            </span>
                            {patient.gender && (
                              <span className="text-[10px] text-muted-foreground">
                                {patient.age && patient.age !== 30 ? `${patient.age}y ` : ""}
                                {patient.gender.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {patient.phone || "No phone"}
                            </span>
                            {patient.bloodGroup && (
                              <span className="font-medium text-rose-500">
                                {patient.bloodGroup}
                              </span>
                            )}
                            {patient.address && (
                              <span className="truncate text-slate-400 max-w-[160px]">
                                {patient.address}
                              </span>
                            )}
                          </div>
                        </div>

                        {selectedPatient?.id === patient.id && (
                          <Check className="h-4 w-4 text-medical shrink-0" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : query.trim().length >= minChars && hasSearched && !loading ? (
                <div className="px-4 py-4 text-center text-xs text-muted-foreground">
                  <p className="font-medium text-slate-600 dark:text-slate-300">No patients found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    No records match &quot;{query}&quot; by name, UHID or phone.
                  </p>
                </div>
              ) : query.trim().length > 0 && query.trim().length < minChars ? (
                <div className="px-4 py-3 text-center text-xs text-slate-400">
                  Type at least {minChars} characters to search…
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
