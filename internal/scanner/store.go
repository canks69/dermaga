package scanner

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Scans are kept beside the settings, in ~/.dermaga, so a result survives
// closing the app: rescanning every image on every launch would mean exporting
// gigabytes and waiting minutes for something that has not changed.
const storeFile = "scans.json"

type stored struct {
	// Keyed by image reference.
	Reports map[string]Report `json:"reports"`
}

func storePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	return filepath.Join(home, ".dermaga", storeFile)
}

// load reads previous results. A missing or damaged file is not an error worth
// reporting: the worst case is that images are scanned again.
func (m *Manager) load() {
	path := storePath()
	if path == "" {
		return
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}

	var data stored
	if err := json.Unmarshal(raw, &data); err != nil {
		m.logger.Warn("Ignoring unreadable scan results", "path", path, "error", err)
		return
	}

	m.mu.Lock()
	for reference, report := range data.Reports {
		m.reports[reference] = report
	}
	m.mu.Unlock()
}

func (m *Manager) save() {
	path := storePath()
	if path == "" {
		return
	}

	m.mu.RLock()
	data := stored{Reports: make(map[string]Report, len(m.reports))}
	for reference, report := range m.reports {
		data.Reports[reference] = report
	}
	m.mu.RUnlock()

	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		m.logger.Error("Could not encode scan results", "error", err)
		return
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		m.logger.Error("Could not create the Dermaga directory", "error", err)
		return
	}

	// Written whole and renamed, so a crash mid-write cannot leave a truncated
	// file that the next launch refuses to read.
	temp := path + ".tmp"
	if err := os.WriteFile(temp, raw, 0o644); err != nil {
		m.logger.Error("Could not write scan results", "error", err)
		return
	}

	if err := os.Rename(temp, path); err != nil {
		m.logger.Error("Could not replace scan results", "error", err)
	}
}

// Reports is every result held, for the UI to summarise in a list.
func (m *Manager) Reports() map[string]Report {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make(map[string]Report, len(m.reports))
	for reference, report := range m.reports {
		out[reference] = report
	}

	return out
}

func (m *Manager) hasRetried(reference string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.retried[reference]
}

func (m *Manager) markRetried(reference string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.retried[reference] = true
}
