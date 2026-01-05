import React, { useState } from 'react';

// Region definitions with refined organic paths for a female face
// Optimized for a 300x400 viewbox where the face is centered
export const faceRegions = [
  { 
    id: 'forehead', 
    name: 'Testa', 
    path: "M 108 100 C 108 85 125 80 150 80 C 175 80 192 85 192 100 C 192 115 175 120 150 120 C 125 120 108 115 108 100 Z" 
  },
  { 
    id: 'glabella', 
    name: 'Glabela', 
    path: "M 138 125 C 142 122 158 122 162 125 L 158 140 C 150 143 150 143 142 140 Z" 
  },
  { 
    id: 'temple_left', 
    name: 'Têmpora Esq.', 
    path: "M 102 115 C 108 110 115 115 115 125 C 115 135 108 130 102 125 C 98 120 98 118 102 115 Z" 
  },
  { 
    id: 'temple_right', 
    name: 'Têmpora Dir.', 
    path: "M 198 115 C 192 110 185 115 185 125 C 185 135 192 130 198 125 C 202 120 202 118 198 115 Z" 
  },
  { 
    id: 'eye_left', 
    name: 'Olheira Esq.', 
    path: "M 105 155 C 112 152 125 152 130 155 C 130 162 124 165 115 165 C 108 165 105 160 105 155 Z" 
  },
  { 
    id: 'eye_right', 
    name: 'Olheira Dir.', 
    path: "M 170 155 C 175 152 188 152 195 155 C 195 162 192 165 185 165 C 176 165 170 160 170 155 Z" 
  },
  { 
    id: 'cheek_left', 
    name: 'Malar Esq.', 
    path: "M 98 180 C 105 175 118 178 118 185 C 116 195 105 192 98 188 C 95 185 95 182 98 180 Z" 
  },
  { 
    id: 'cheek_right', 
    name: 'Malar Dir.', 
    path: "M 202 180 C 195 175 182 178 182 185 C 184 195 195 192 202 188 C 205 185 205 182 202 180 Z" 
  },
  { 
    id: 'nose', 
    name: 'Nariz', 
    path: "M 142 150 C 145 150 155 150 158 150 L 160 180 C 158 187 142 187 140 180 Z" 
  },
  { 
    id: 'nasolabial_left', 
    name: 'Bigode Chinês Esq.', 
    path: "M 125 195 C 120 200 120 210 123 220 C 127 215 133 210 133 200 Z" 
  },
  { 
    id: 'nasolabial_right', 
    name: 'Bigode Chinês Dir.', 
    path: "M 175 195 C 180 200 180 210 177 220 C 173 215 167 210 167 200 Z" 
  },
  { 
    id: 'lips_upper', 
    name: 'Lábio Sup.', 
    path: "M 130 215 C 142 212 158 212 170 215 C 158 222 142 222 130 215 Z" 
  },
  { 
    id: 'lips_lower', 
    name: 'Lábio Inf.', 
    path: "M 133 222 C 142 230 158 230 167 222 C 158 235 142 235 133 222 Z" 
  },
  { 
    id: 'marionette_left', 
    name: 'Marionete Esq.', 
    path: "M 128 235 C 125 240 125 245 128 250 C 132 245 134 240 128 235 Z" 
  },
  { 
    id: 'marionette_right', 
    name: 'Marionete Dir.', 
    path: "M 172 235 C 175 240 175 245 172 250 C 168 245 166 240 172 235 Z" 
  },
  { 
    id: 'chin', 
    name: 'Queixo', 
    path: "M 138 250 C 145 248 155 248 162 250 C 162 258 155 262 150 262 C 145 262 138 258 138 250 Z" 
  },
  { 
    id: 'jaw_left', 
    name: 'Mandíbula Esq.', 
    path: "M 92 180 C 98 205 110 225 125 235 L 122 240 C 105 230 85 205 92 180 Z" 
  },
  { 
    id: 'jaw_right', 
    name: 'Mandíbula Dir.', 
    path: "M 208 180 C 202 205 190 225 175 235 L 178 240 C 195 230 215 205 208 180 Z" 
  },
  { 
    id: 'neck', 
    name: 'Pescoço', 
    path: "M 120 255 C 130 260 170 260 180 255 L 185 305 C 150 310 150 310 115 305 Z" 
  }
];

const FaceHarmonizationSelector = ({ selectedRegions = [], onToggle, readOnly = false }) => {
  const [hoveredRegion, setHoveredRegion] = useState(null);

  const handleRegionClick = (e, regionId) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault(); // Adicionado preventDefault para evitar comportamentos padrão
      // Impede que ferramentas de gravação como rrweb capturem o evento SVG que causa DataCloneError
      if (e.nativeEvent) {
         if (typeof e.nativeEvent.stopImmediatePropagation === 'function') {
           e.nativeEvent.stopImmediatePropagation();
         }
         // Hack para evitar que o rrweb acesse o target SVG diretamente se ele estiver monkey-patching eventos
         Object.defineProperty(e, 'target', { value: null, writable: true });
      }
    }
    if (readOnly) return;
    onToggle(regionId);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[300px] aspect-[3/4] drop-shadow-lg rounded-lg overflow-hidden bg-gray-50">
        <svg viewBox="0 0 300 400" style={{ width: '100%', height: '100%' }}>
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.3"/>
            </filter>
          </defs>
          
          {/* Base Image - User provided face model */}
          <image
            href="/face_model.png" 
            x="0" 
            y="0" 
            width="300" 
            height="400" 
            preserveAspectRatio="xMidYMid slice"
            style={{ opacity: 0.9 }}
          />

          {/* Interactive Regions Overlay */}
          {faceRegions.map((region) => {
            const isSelected = selectedRegions.includes(region.id);
            const isHovered = hoveredRegion === region.id;
            
            // Determine styles without using className on SVG elements to avoid DataCloneError in recorders
            const pathFill = isSelected ? '#ec4899' : (isHovered ? '#fbcfe8' : 'transparent');
            const pathOpacity = isSelected ? 0.7 : (isHovered ? 0.4 : 0);
            
            // Updated styles for dashed lines and visibility
            const pathStroke = isSelected ? '#be185d' : 'rgba(255, 255, 255, 0.8)';
            const strokeWidth = isSelected ? 2 : 1;
            const strokeDasharray = isSelected ? 'none' : '4 2';
            
            return (
              <g 
                key={region.id} 
                onClick={(e) => handleRegionClick(e, region.id)}
                onMouseEnter={() => !readOnly && setHoveredRegion(region.id)}
                onMouseLeave={() => !readOnly && setHoveredRegion(null)}
                style={{ 
                  cursor: !readOnly ? 'pointer' : 'default',
                  transition: 'all 300ms ease'
                }}
              >
                <path
                  d={region.path}
                  fill={pathFill}
                  fillOpacity={pathOpacity}
                  stroke={pathStroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeLinecap="round"
                >
                  <title>{region.name}</title>
                </path>
              </g>
            );
          })}
          
          {/* Helper Grid/Guide (Optional, hidden by default) */}
        </svg>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        * Selecione as áreas para o procedimento
      </p>
    </div>
  );
};

export default FaceHarmonizationSelector;
