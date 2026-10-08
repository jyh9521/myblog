'use client';
import { useEffect } from 'react';
import { installExternalLinkPolicy } from '../lib/external-links';

export default function ExternalLinks() {
  useEffect(() => installExternalLinkPolicy(document, window.location.href), []);
  return null;
}
