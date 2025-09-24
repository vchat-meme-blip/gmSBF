/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React from 'react';

const Spinner: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={`animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-gray-900 ${className}`} role="status" aria-label="Loading...">
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;