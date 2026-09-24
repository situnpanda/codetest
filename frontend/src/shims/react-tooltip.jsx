import React from 'react';

// Modern replacement for react-tooltip. The old usage renders a standalone
// floating <Tooltip id="..."/> anchored via data attributes; MUI handles
// tooltips inline, so this standalone element renders nothing (no-op) to avoid
// breaking pages that mount it separately.
export function Tooltip() {
  return null;
}

export default Tooltip;
