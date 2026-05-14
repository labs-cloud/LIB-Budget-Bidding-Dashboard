'use client';

import { useEffect } from 'react';

/** Adds `embed` class to <body> when ?embed=1 is set so chrome can collapse. */
export function EmbedClass({ embed }: { embed: boolean }) {
  useEffect(() => {
    if (embed) document.body.classList.add('embed');
    else document.body.classList.remove('embed');
  }, [embed]);
  return null;
}
