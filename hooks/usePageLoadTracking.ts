/**
 * usePageLoadTracking — emits a `page_load` analytics event on mount with
 * the elapsed time from hook start to the next paint frame.
 *
 * @module hooks/usePageLoadTracking
 */

import { useEffect } from 'react';
import { trackEvent } from '../services/analytics';

export const usePageLoadTracking = (pageName: string): void => {
  useEffect(() => {
    const startTime = performance.now();
    const raf = requestAnimationFrame(() => {
      const loadTime = Math.round(performance.now() - startTime);
      trackEvent.pageLoad(pageName, loadTime);
    });
    return () => cancelAnimationFrame(raf);
  }, [pageName]);
};
