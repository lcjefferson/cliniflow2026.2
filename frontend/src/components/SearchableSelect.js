import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function SearchableSelect({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Selecione...",
  className = "",
  labelKey = "name",
  valueKey = "id",
  searchKeys = ["name"]
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(option => {
    const search = searchTerm.toLowerCase();
    return searchKeys.some(key => {
        const val = option[key];
        return val && String(val).toLowerCase().includes(search);
    });
  });

  const selectedOption = options.find(o => o[valueKey] === value);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 transition-all duration-200 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectedOption ? (
           <span className="text-gray-900 leading-tight">{selectedOption[labelKey]}</span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronsUpDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Nenhuma opção encontrada
              </div>
            ) : (
              <ul className="py-1">
                {filteredOptions.map((option) => (
                  <li
                    key={option[valueKey]}
                    onClick={() => handleSelect(option[valueKey])}
                    className={`
                      relative cursor-pointer select-none py-2.5 pl-4 pr-9 hover:bg-gray-50
                      ${option[valueKey] === value ? "bg-blue-50 text-blue-700" : "text-gray-900"}
                    `}
                  >
                    <span className="block truncate font-medium">
                      {option[labelKey]}
                    </span>
                    {option[valueKey] === value && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
