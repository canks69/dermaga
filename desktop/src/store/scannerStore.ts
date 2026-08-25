import { create } from 'zustand';
import { api } from '../services/api';
import { useToastStore } from './toastStore';
import { onNotify } from '../services/ipc';
import type { ScannerStatus, ScanSummary, VulnerabilityReport } from '../types';

interface ScannerState {
  status: ScannerStatus | null;
  /**
   * How every scanned image came out. Filled for all of them on opening, and
   * it is what every list showing severity counts reads.
   */
  summaries: Record<string, ScanSummary>;
  /**
   * Last full report per image reference, so reopening a tab is instant. Only
   * for images somebody has actually opened: the findings are thousands of
   * rows each, and asking for all of them at once is what used to take the
   * connection down.
   */
  reports: Record<string, VulnerabilityReport>;
  setStatus: (status: ScannerStatus) => void;
  setSummaries: (summaries: Record<string, ScanSummary>) => void;
  setReport: (reference: string, report: VulnerabilityReport) => void;
  clearReports: () => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  status: null,
  summaries: {},
  reports: {},
  setStatus: (status) => set({ status }),
  setSummaries: (summaries) =>
    set((state) => ({ summaries: { ...state.summaries, ...summaries } })),
  setReport: (reference, report) =>
    set((state) => ({
      reports: { ...state.reports, [reference]: report },
      // A report answers the counted question as well, so a scan that finishes
      // while its image is open updates the list behind it without a second
      // round trip.
      summaries: { ...state.summaries, [reference]: report },
    })),
  clearReports: () => set({ summaries: {}, reports: {} }),
}));

/**
 * The agent installs the scanner, refreshes its database and runs scans on its
 * own goroutine, pushing where it has got to. Nothing here polls. Called once,
 * from the app root.
 */
export function subscribeToScanner(): () => void {
  const { setStatus, setSummaries, setReport } = useScannerStore.getState();

  // The agent may have finished its startup checks -- and a whole sweep of
  // scans -- before this window existed, so take what it already has.
  void api
    .getScannerStatus()
    .then(setStatus)
    .catch(() => {});

  // Counts, not findings. Every image at once, which is why it has to be the
  // small half of a report.
  void api
    .getScanSummaries()
    .then(setSummaries)
    .catch(() => {});

  return onNotify((message) => {
    // Reports arrive on their own channel: a sweep never returns to idle
    // between images, so waiting for that would only ever catch the last one.
    if (message.method === 'scanner.result') {
      const report = message.params as VulnerabilityReport;
      if (report?.reference) setReport(report.reference, report);
      return;
    }

    if (message.method === 'scanner.status') {
      const next = message.params as ScannerStatus;
      const previous = useScannerStore.getState().status;

      // Said once, when it happens. The scanner used to report itself along the
      // title bar, which meant a failure sat there until something replaced it;
      // with that gone, this is the only thing that would otherwise pass in
      // silence -- and it is the only scanner state anybody needs telling about.
      if (next?.state === 'failed' && previous?.state !== 'failed') {
        useToastStore
          .getState()
          .push(next.detail || next.error || 'An image could not be scanned', 'error');
      }

      setStatus(next);
    }
  });
}
