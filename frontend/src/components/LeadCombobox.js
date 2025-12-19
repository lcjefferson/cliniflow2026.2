import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LeadCombobox({ 
  leads = [], 
  value, 
  onChange, 
  onCreateNew,
  placeholder = "Selecione um lead...",
  className = ""
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtra leads baseado no termo de busca
  const filteredLeads = leads.filter(lead => {
    const search = searchTerm.toLowerCase();
    return (
      lead.name.toLowerCase().includes(search) ||
      (lead.email && lead.email.toLowerCase().includes(search)) ||
      (lead.phone && lead.phone.includes(search))
    );
  });

  // Encontra o lead selecionado
  const selectedLead = leads.find(l => l.id === value);

  const handleSelect = (leadId) => {
    onChange(leadId);
    setOpen(false);
    setSearchTerm("");
  };

  const handleCreateNew = () => {
    setOpen(false);
    if (onCreateNew) onCreateNew();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 transition-all duration-200 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectedLead ? (
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 leading-tight">{selectedLead.name}</p>
            {selectedLead.phone && (
              <p className="text-gray-500 text-sm leading-tight">{selectedLead.phone}</p>
            )}
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronsUpDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-hidden">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Digite para buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-64 overflow-y-auto">
            {filteredLeads.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <p className="mb-2">
                  {searchTerm ? "Nenhum lead encontrado" : "Nenhum lead cadastrado"}
                </p>
                {onCreateNew && (
                  <Button
                    type="button"
                    onClick={handleCreateNew}
                    variant="outline"
                    size="sm"
                    className="mx-auto"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Criar Novo Lead
                  </Button>
                )}
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const isSelected = value === lead.id;
                
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => handleSelect(lead.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-50 ${
                      isSelected ? "bg-blue-100" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {lead.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-sm text-gray-600">
                        <span className="truncate">{lead.phone}</span>
                        {lead.email && (
                          <>
                            <span>•</span>
                            <span className="truncate">{lead.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-blue-600 flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Create New Button (footer) */}
          {onCreateNew && filteredLeads.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <Button
                type="button"
                onClick={handleCreateNew}
                variant="outline"
                className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Criar Novo Lead
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
