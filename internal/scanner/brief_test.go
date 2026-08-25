package scanner

import (
	"encoding/json"
	"strings"
	"testing"
)

// A report the window would once have been sent in full, on the list that asks
// for every one of them at once.
func report() Report {
	findings := make([]Finding, 0, 3000)
	for i := 0; i < 3000; i++ {
		findings = append(findings, Finding{ID: "CVE-2026-0001", Package: "openssl", Severity: "HIGH"})
	}

	return Report{
		Reference: "docker.io/library/node:22",
		Format:    reportFormat,
		ScannedAt: "2026-08-25T02:44:51Z",
		OS:        "debian 12.15",
		Targets:   2,
		Summary:   map[string]int{"CRITICAL": 33, "HIGH": 376},
		Findings:  findings,
		Packages:  []Package{{Name: "openssl"}},
		Layers:    []Layer{{Digest: "sha256:0000", SizeInBytes: 4096}},
	}
}

// What the list is drawn from has to survive, or a row that says how many
// criticals an image has cannot say it.
func TestBriefKeepsWhatTheListShows(t *testing.T) {
	brief := report().brief()

	if brief.Reference != "docker.io/library/node:22" {
		t.Errorf("reference = %q", brief.Reference)
	}
	if brief.ScannedAt != "2026-08-25T02:44:51Z" {
		t.Errorf("scannedAt = %q", brief.ScannedAt)
	}
	if brief.OS != "debian 12.15" {
		t.Errorf("os = %q", brief.OS)
	}
	if brief.Targets != 2 {
		t.Errorf("targets = %d", brief.Targets)
	}
	if brief.Summary["CRITICAL"] != 33 || brief.Summary["HIGH"] != 376 {
		t.Errorf("summary = %v", brief.Summary)
	}
}

// The point of the whole thing. Two images with three thousand findings each
// came to a single answer of 16.7 MB, which is more than the window will read
// in one message -- so the connection went down on the way in, and the window
// reported an agent that was still running.
func TestBriefLeavesTheDetailBehind(t *testing.T) {
	full, err := json.Marshal(report())
	if err != nil {
		t.Fatal(err)
	}

	brief, err := json.Marshal(report().brief())
	if err != nil {
		t.Fatal(err)
	}

	for _, key := range []string{"findings", "packages", "layers"} {
		if strings.Contains(string(brief), `"`+key+`"`) {
			t.Errorf("a brief still carries %q", key)
		}
	}

	if len(brief) > len(full)/100 {
		t.Errorf("a brief is %d bytes against a report's %d, which is not the saving this exists for",
			len(brief), len(full))
	}
}

// Every result held, and none of them carrying its findings.
func TestBriefsAnswerForEveryReport(t *testing.T) {
	m := &Manager{reports: map[string]Report{
		"docker.io/library/node:22": report(),
		"dashboard-api:latest":      report(),
	}}

	briefs := m.Briefs()
	if len(briefs) != 2 {
		t.Fatalf("got %d briefs, want 2", len(briefs))
	}

	encoded, err := json.Marshal(briefs)
	if err != nil {
		t.Fatal(err)
	}

	if strings.Contains(string(encoded), "CVE-2026-0001") {
		t.Error("the findings travelled with the list after all")
	}
}
