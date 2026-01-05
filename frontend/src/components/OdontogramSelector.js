import React from 'react';

// Tooth shapes as SVG paths
const ToothIcon = ({ number, isSelected }) => {
  // Determine tooth type based on FDI number
  const n = parseInt(number);
  
  // Upper Right (1x): 11-18
  // Upper Left (2x): 21-28
  // Lower Left (3x): 31-38
  // Lower Right (4x): 41-48
  
  const isUpper = n < 30; // 1x or 2x
  const pos = n % 10; // 1-8
  
  // 1,2: Incisor
  // 3: Canine
  // 4,5: Premolar
  // 6,7,8: Molar
  
  // Base SVG props
  const strokeColor = isSelected ? "#FFFFFF" : "#4B5563"; // white or gray-600
  const fillColor = isSelected ? "#3B82F6" : "none"; // blue-500 or none
  const strokeWidth = "1.5";
  
  // Define paths (designed upright, then flipped if lower)
  let path = "";
  let viewbox = "0 0 30 50";
  
  // Note: Paths are drawn as simple outlines approximating the clinical crown + root
  
  if (pos === 1 || pos === 2) {
    // Incisor: Smooth rounded rectangle for crown, tapered root
    // Crown: 8,18 to 22,18 with bezier top. Root down to 15,46.
    path = "M8,18 C8,8 22,8 22,18 C22,21 21,23 21,23 L19,40 C18,46 12,46 11,40 L9,23 C9,23 8,21 8,18 Z M10,18 C10,12 20,12 20,18";
  } else if (pos === 3) {
    // Canine: Pointed crown, long root
    path = "M8,18 C8,12 15,2 22,18 C22,21 21,23 21,23 L19,44 C18,49 12,49 11,44 L9,23 C9,23 8,21 8,18 Z M11,18 C13,10 17,10 19,18";
  } else if (pos === 4 || pos === 5) {
    // Premolar: Bicuspid look
    path = "M5,20 C5,12 10,10 15,12 C20,10 25,12 25,20 C25,23 23,25 23,25 L20,38 C19,42 11,42 10,38 L7,25 C7,25 5,23 5,20 Z M10,20 C12,15 18,15 20,20";
  } else {
    // Molar: Wide, multiple roots
    path = "M2,22 C2,12 8,10 15,12 C22,10 28,12 28,22 C28,25 26,27 26,27 L24,40 C23,45 19,45 18,40 L15,32 L12,40 C11,45 7,45 6,40 L4,27 C4,27 2,25 2,22 Z M8,22 C10,15 20,15 22,22";
  }
  
  // Transform for upper/lower distinction
  // Upper teeth (1x, 2x): Roots should point UP. My paths are drawn with root DOWN (y=50).
  // So Upper teeth need 180 deg rotation?
  // Usually in odontogram:
  // Upper Row: Roots UP, Crown DOWN (Occlusal surface at bottom)
  // Lower Row: Roots DOWN, Crown UP (Occlusal surface at top)
  
  // My paths have Root at bottom (high Y) and Crown at top (low Y).
  // Wait, let's re-check my path logic.
  // Incisor: M8,20 (Neck) ... Q8,45 15,48 (Root tip). So Root is at Bottom. Crown is at Top (Y=5).
  
  // Desired:
  // Upper Teeth: Root UP (Y=0), Crown DOWN (Y=50).
  // Lower Teeth: Root DOWN (Y=50), Crown UP (Y=0).
  
  // So:
  // Upper (1x, 2x): Rotate 180.
  // Lower (3x, 4x): Keep as is (Root DOWN).
  
  const transform = isUpper ? "rotate(180 15 25)" : "";

  return (
    <svg viewBox="0 0 30 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <g transform={transform}>
        <path 
          d={path} 
          stroke={strokeColor} 
          strokeWidth={strokeWidth} 
          fill={fillColor}
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

const OdontogramSelector = ({ selectedTeeth = [], onToggle, readOnly = false }) => {
  const quadrants = {
    upperRight: [18, 17, 16, 15, 14, 13, 12, 11],
    upperLeft: [21, 22, 23, 24, 25, 26, 27, 28],
    lowerRight: [48, 47, 46, 45, 44, 43, 42, 41],
    lowerLeft: [31, 32, 33, 34, 35, 36, 37, 38]
  };

  const ToothButton = ({ number }) => {
    const isSelected = selectedTeeth.includes(String(number));
    
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={(e) => {
          if (e) {
             e.stopPropagation();
             e.preventDefault();
             if (e.nativeEvent) {
               if (typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                 e.nativeEvent.stopImmediatePropagation();
               }
               // Hack para evitar erro de DataCloneError com SVGs em ferramentas de gravação
               Object.defineProperty(e, 'target', { value: null, writable: true });
             }
          }
          onToggle(String(number));
        }}
        className={`
          flex flex-col items-center justify-center p-0.5 sm:p-1 rounded transition-colors
          w-6 h-10 sm:w-8 sm:h-14
          ${isSelected 
            ? 'bg-blue-600 text-white shadow-md' 
            : 'bg-white hover:bg-gray-50 border border-transparent hover:border-gray-200'}
          ${readOnly ? 'cursor-default' : 'cursor-pointer'}
        `}
      >
        <div className="w-full h-full flex-1">
            <ToothIcon number={number} isSelected={isSelected} />
        </div>
        <span className={`text-[10px] sm:text-xs font-bold mt-0.5 sm:mt-1 ${isSelected ? 'text-white' : 'text-gray-600'}`}>
          {number}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-6 bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto w-full">
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-12 min-w-fit">
        {/* Upper Arch */}
        <div className="flex gap-4 sm:gap-12">
            <div className="flex gap-0.5 sm:gap-1">
            {quadrants.upperRight.map(n => <ToothButton key={n} number={n} />)}
            </div>
            <div className="flex gap-0.5 sm:gap-1">
            {quadrants.upperLeft.map(n => <ToothButton key={n} number={n} />)}
            </div>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-12 min-w-fit border-t border-dashed border-gray-200 pt-4 sm:pt-6">
        {/* Lower Arch */}
        <div className="flex gap-4 sm:gap-12">
            <div className="flex gap-0.5 sm:gap-1">
            {quadrants.lowerRight.map(n => <ToothButton key={n} number={n} />)}
            </div>
            <div className="flex gap-0.5 sm:gap-1">
            {quadrants.lowerLeft.map(n => <ToothButton key={n} number={n} />)}
            </div>
        </div>
      </div>
      
      {!readOnly && (
          <div className="text-center text-xs text-gray-400 mt-2 sm:mt-4 font-medium uppercase tracking-wide">
            Selecione os dentes afetados
          </div>
      )}
    </div>
  );
};

export default OdontogramSelector;
